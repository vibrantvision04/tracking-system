package main

import (
	"context"
	"encoding/json"
	"fmt"
	"gps-tracking-system/internal/api"
	"gps-tracking-system/internal/auth"
	"gps-tracking-system/internal/cache"
	"gps-tracking-system/internal/config"
	"gps-tracking-system/internal/cron"
	"gps-tracking-system/internal/geofence"
	"gps-tracking-system/internal/masterreport"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/service"
	"gps-tracking-system/internal/tcp"
	"gps-tracking-system/internal/ultimatereport"
	"gps-tracking-system/internal/vision"
	"gps-tracking-system/internal/worker"
	"gps-tracking-system/internal/ws"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/sync/singleflight"
)

func main() {
	// 1. Load Config
	cfg := config.LoadConfig()

	// 2. Setup Logging
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	if cfg.LogLevel == "debug" {
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	} else {
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	}

	log.Info().Msg("Starting VSWM Jaipur Tracking System...")

	// 3. Initialize Databases
	db, err := repository.InitDB(cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize DB")
	}
	defer db.Close()

	// Ensure blocked column exists in gps_devices
	_, err = db.Exec(context.Background(), "ALTER TABLE gps_devices ADD COLUMN IF NOT EXISTS blocked BOOLEAN DEFAULT false")
	if err != nil {
		log.Error().Err(err).Msg("Failed to run schema migration for blocked column")
	}

	// Ensure refresh_tokens table exists for server-side token revocation
	_, err = db.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS refresh_tokens (
			id SERIAL PRIMARY KEY,
			token_id TEXT UNIQUE NOT NULL,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			revoked_at TIMESTAMP,
			expires_at TIMESTAMP NOT NULL,
			created_at TIMESTAMP DEFAULT NOW()
		)
	`)
	if err != nil {
		log.Error().Err(err).Msg("Failed to create refresh_tokens table")
	}
	_, err = db.Exec(context.Background(), `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`)
	if err != nil {
		log.Error().Err(err).Msg("Failed to create index on refresh_tokens")
	}
	_, err = db.Exec(context.Background(), `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_id ON refresh_tokens(token_id)`)
	if err != nil {
		log.Error().Err(err).Msg("Failed to create index on refresh_tokens")
	}

	// Ensure audit_log table exists
	_, err = db.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS audit_log (
			id SERIAL PRIMARY KEY,
			event TEXT NOT NULL,
			user_id INTEGER,
			email TEXT,
			ip TEXT,
			metadata TEXT,
			created_at TIMESTAMP NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		log.Error().Err(err).Msg("Failed to create audit_log table")
	}
	_, err = db.Exec(context.Background(), `CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log(event)`)
	if err != nil {
		log.Error().Err(err).Msg("Failed to create index on audit_log")
	}
	_, err = db.Exec(context.Background(), `CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)`)
	if err != nil {
		log.Error().Err(err).Msg("Failed to create index on audit_log")
	}

	// Bootstrap admin user if not already seeded
	var adminExists bool
	err = db.QueryRow(context.Background(), "SELECT EXISTS(SELECT 1 FROM users WHERE email='test-admin@example.com')").Scan(&adminExists)
	if err == nil && !adminExists {
		hashedPassword, hashErr := auth.HashPassword("SecurePass123!")
		if hashErr == nil {
			_, execErr := db.Exec(context.Background(), `
				INSERT INTO users (email, role, password_hash)
				VALUES ('test-admin@example.com', 'ADMIN', $1)
				ON CONFLICT (email) DO NOTHING
			`, hashedPassword)
			if execErr == nil {
				log.Info().Msg("Bootstrapped default admin user: test-admin@example.com / SecurePass123!")
			}
		}
	}

	if err := vision.InitDetector(); err != nil {
		log.Warn().Err(err).Msg("Face detector initialization failed - face detection will be unavailable")
	} else {
		log.Info().Msg("Face detector initialized successfully")
	}

	rdb, err := cache.InitRedis(cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize Redis")
	}
	defer rdb.Close()

	// Populate blocked IMEIs cache in Redis
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		
		rdb.Del(ctx, "gps:blocked_imeis")
		
		rows, err := db.Query(ctx, "SELECT imei FROM gps_devices WHERE blocked = true")
		if err == nil {
			defer rows.Close()
			var imeis []string
			for rows.Next() {
				var imei string
				if err := rows.Scan(&imei); err == nil {
					imeis = append(imeis, imei)
				}
			}
			if len(imeis) > 0 {
				rdb.SAdd(ctx, "gps:blocked_imeis", imeis)
				log.Info().Int("count", len(imeis)).Msg("Loaded blocked GPS IMEIs into Redis cache")
			}
		}
	}()

	// 4. Initialize Repositories
	gpsRepo := repository.NewGPSRepository(db)
	vRepo := repository.NewVehicleRepository(db)
	rRepo := repository.NewReportRepository(db)
	tRepo := repository.NewTripRepository(db)
	routeRepo := repository.NewRouteRepository(db)
	openDepotRepo := repository.NewOpenDepotRepository(db)
	geofenceRepo := repository.NewGeofenceRepository(db)

	// 5. Initialize Caches
	locCache := cache.NewLocationCache(rdb)
	geofenceCache := geofence.NewCache(geofenceRepo)

	// 6. Initialize Services
	rService := service.NewReportService(rRepo, gpsRepo, vRepo)
	tService := service.NewTripService(tRepo, vRepo, gpsRepo, rdb)
	routeEngine := service.NewRouteEngine(routeRepo, vRepo, cfg.RequireSequentialCheckpoints, cfg.MaxCheckpointSpeedKmh)
	routeEngine.RefreshCache()
	geofenceChecker := geofence.NewChecker(geofenceCache, geofenceRepo, rdb, vRepo)

	// 7. Initialize Ingestion Pipeline
	batchWriter := worker.NewBatchWriter(gpsRepo, cfg.BatchSize, time.Duration(cfg.BatchTimeoutMS)*time.Millisecond, cfg.BatchBufferCeiling)
	dispatcher := worker.NewDispatcher(rdb, tService, routeEngine, gpsRepo, geofenceChecker)
	pipeline := worker.NewPipeline(cfg, rdb, locCache, dispatcher)
	pipeline.Start()

	gpsWriter := worker.NewGPSWriter(cfg, rdb, batchWriter)
	gpsWriter.Start()

	// 8. Initialize WebSockets
	hub := ws.NewHub(rdb)
	go hub.StartSubscriber(context.Background())

	// 9. Start TCP Server (GPS Ingestion)
	tcpServer := tcp.NewServer(cfg, rdb, vRepo)
	go func() {
		if err := tcpServer.Start(); err != nil {
			log.Fatal().Err(err).Msg("TCP Server failed")
		}
	}()

	// 10. Start Cron Scheduler (includes report generation and token cleanup)
	cron.StartScheduler(cfg, rService, vRepo, db)

	// 11. Start API Clients (Removed as per blueprint optimization)


	// 12. RBAC repository
	rbacRepo := repository.NewRBACRepository(db)

	// Employee-Vehicle assignment repository
	empVehicleRepo := repository.NewEmployeeVehicleRepository(db)

	if err := api.RegisterAllPermissions(context.Background(), rbacRepo); err != nil {
		log.Warn().Err(err).Msg("Failed to register default permissions")
	}

	// 13. Start Servers
	handler := api.NewHandler(vRepo, gpsRepo, rService, rdb, routeRepo, routeEngine, openDepotRepo, rbacRepo, empVehicleRepo, cfg.JWTAccessSecret, cfg.JWTRefreshSecret, cfg.AllowHistoricalRecalculation)

	// Ultimate Reports engine — independent module, wired separately so NewHandler signature stays unchanged
	urRepo := ultimatereport.NewUltimateReportRepository(db)
	urSvc := ultimatereport.NewUltimateReportService(urRepo)
	urEngine := ultimatereport.NewExcelEngine(cfg.ReportTemplatePath)
	handler.SetUltimateReportEngine(urSvc, urEngine, cfg.ReportTemplatePath)

	// AI Route Reconstruction engine
	aiSvc := service.NewAIReconstructionService(routeRepo)
	handler.SetAIReconstructionService(aiSvc)
	// Register the Ultimate Daily Report in the pluggable registry
	ultimateReportDef := &ultimatereport.ReportDefinition{
		ID:           "ultimate-daily",
		Name:         "Ultimate Report",
		TemplateName: "ultimate-report.xlsx",
		Description:  "Daily fleet performance report with zone-wise coverage, distance, speed, and trip data",
	}
	ultimateReportDef.Builder = func(ctx context.Context, date time.Time) (*ultimatereport.ReportData, error) {
		return urSvc.BuildReportData(ctx, date)
	}
	ultimatereport.Register(ultimateReportDef)

	// 13b. Master Reporting Module — register catalog, validate, seed permissions (task 14.2)
	//
	// Every reports_*.go file in internal/masterreport exposes a thin
	// Register<Name> helper; we call them here so the catalog reflects
	// the 27-report v1 set documented in docs/master-reports-catalog.md.
	//
	// For Phase D, the compute closure surfaces as a single placeholder
	// for every report. Each production closure has to translate its
	// source handler's response shape into masterreport.Payload, which
	// is substantial per-report work tracked separately (see follow-up
	// tasks). The placeholder honours the DataSource contract by
	// returning an empty Payload with the current wall-clock as
	// InputVersion so SmartLoader, the output cache, and the HTTP
	// plumbing can be exercised end-to-end against a registered
	// catalog before per-report adapters land. The nil
	// ExistingInputVersionFunc tells the adapter to fall back to the
	// wall-clock (Req 12.2 fallback path).
	//
	// Per-report TODO targets — where the production closure should
	// pull its data from:
	//
	//   road_sweeping                  → GetShiftBasedOpsReport (shift=night_sweep)
	//   open_depot_gvp_shift_1/2/3     → GetOpenDepotDashboard (shift=shift_1/2/3)
	//   ts_point_reached_0730          → new aggregation (vehicle_route_assignments ⋈ gps_data)
	//   helper_attendance              → GetAttendance (designation=helper)
	//   helper_attendance_summary      → rollup of helper_attendance
	//   ts_point_reached               → new aggregation (vehicles ⋈ gps_data inside TS geofence)
	//   govt_street_sweeper_attendance → new aggregation (employees ⋈ street-cleaning submissions)
	//   street_sweeper_summary         → rollup of govt_street_sweeper_attendance
	//   active_hoppers_summary         → GetActiveVehicleSummaryReport (1st shift window)
	//   early_departure_d2d            → GetEarlyDepartureReport (zone × firm rollup)
	//   d2d_vehicle_coverage           → GetD2DRouteCoverageReport
	//   d2d_zone_summary               → rollup of d2d_vehicle_coverage
	//   street_sweeping_detail         → GetD2DRouteCoverageReport (route_type=sweeping)
	//   street_sweeping_summary        → rollup of street_sweeping_detail
	//   d2d_working_check              → new aggregation (vra ⋈ gps started-flag ⋈ helper_attendance)
	//   commercial_hopper_summary      → rollup of d2d_working_check + helper_attendance
	//   safai_karamchari_worked        → new aggregation (employees ⋈ street-cleaning mobile app)
	//   beet_sweeping_summary          → rollup of safai_karamchari_worked
	//   gts_trip                       → GetGTSTripReport
	//   weight_bridge_report           → new aggregation (weighbridge_data grouped by dumpsite × firm)
	//   rfid_collection                → new aggregation (rfid_scan_log ⋈ wards ⋈ zones ⋈ fees)
	//   evening_d2d_check              → same as d2d_working_check (evening window)
	//   evening_commercial_detail      → GetD2DRouteCoverageReport (shift=evening_commercial)
	//   evening_commercial_summary     → rollup of evening_commercial_detail
	//   daily_master_consolidated      → urSvc.BuildReportData(ctx, date)
	catalog := masterreport.NewCatalog()

	// placeholderCompute is used for reports that don't yet have a production
	// handler to wire. Returns an empty Payload so the full cache/loader
	// pipeline exercises end-to-end.
	placeholderCompute := func(_ context.Context, _ masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		now := time.Now().UTC()
		return masterreport.Payload{
			Rows:         []map[string]any{},
			GeneratedAt:  now,
			InputVersion: now.UnixMilli(),
		}, nil
	}

	// ─── Helper: callHandler invokes a handler method internally using
	// httptest.NewRecorder, parses the standard {"success":bool,"data":[...]}
	// JSON envelope and returns a masterreport.Payload with the row data.
	// This avoids duplicating SQL — the closure reuses the exact same code
	// path as the existing HTTP endpoint.
	callHandler := func(ctx context.Context, handlerFunc http.HandlerFunc, path string, params url.Values) (masterreport.Payload, error) {
		target := path
		if len(params) > 0 {
			target = path + "?" + params.Encode()
		}
		req, err := http.NewRequestWithContext(ctx, "GET", target, nil)
		if err != nil {
			return masterreport.Payload{}, fmt.Errorf("build request: %w", err)
		}
		rec := httptest.NewRecorder()
		handlerFunc(rec, req)

		if rec.Code != http.StatusOK {
			return masterreport.Payload{}, fmt.Errorf("handler returned %d: %s", rec.Code, rec.Body.String())
		}

		var resp struct {
			Success bool          `json:"success"`
			Data    []interface{} `json:"data"`
		}
		if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
			return masterreport.Payload{}, fmt.Errorf("parse response: %w", err)
		}

		rows := make([]map[string]any, 0, len(resp.Data))
		for _, item := range resp.Data {
			if m, ok := item.(map[string]any); ok {
				rows = append(rows, m)
			}
		}

		return masterreport.Payload{
			Rows:         rows,
			GeneratedAt:  time.Now().UTC(),
			InputVersion: time.Now().UnixMilli(),
		}, nil
	}

	// ─── Production compute closures ───────────────────────────────────────

	// d2d_vehicle_coverage → GetD2DRouteCoverageReport
	// Filters: date → from_date + to_date (same day), zone → zone_id, ward → ward_id
	d2dVehicleCoverageCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			dateStr := date.Format("2006-01-02")
			params.Set("from_date", dateStr)
			params.Set("to_date", dateStr)
		}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		if shift, ok := f[masterreport.FilterShift].(string); ok && shift != "" {
			params.Set("shift_id", shift)
		}
		return callHandler(ctx, handler.GetD2DRouteCoverageReport, "/api/reports/d2d-coverage", params)
	}

	// gts_trip → GetGTSTripReport
	// Filters: date → date param, zone → zone_id, ward → ward_id
	gtsTripCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			params.Set("date", date.Format("2006-01-02"))
		}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		return callHandler(ctx, handler.GetGTSTripReport, "/api/reports/gts-trip", params)
	}

	// helper_attendance → GetAttendance (role=helper)
	// Filters: date → date param
	helperAttendanceCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		params.Set("role", "helper")
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			params.Set("date", date.Format("2006-01-02"))
		}
		return callHandler(ctx, handler.GetAttendance, "/api/attendance", params)
	}

	// active_hoppers_summary → GetActiveVehicleSummaryReport
	// Filters: zone → zone_id
	activeHoppersCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		return callHandler(ctx, handler.GetActiveVehicleSummaryReport, "/api/reports/active-vehicle-summary", params)
	}

	// early_departure_d2d → GetEarlyDepartureReport
	// Filters: date → date, zone → zone_id, ward → ward_id, shift → shift_id
	earlyDepartureCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			params.Set("date", date.Format("2006-01-02"))
		}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		if shift, ok := f[masterreport.FilterShift].(string); ok && shift != "" {
			params.Set("shift_id", shift)
		}
		params.Set("include_active", "true")
		return callHandler(ctx, handler.GetEarlyDepartureReport, "/api/reports/early-departure", params)
	}

	// street_sweeping_detail → GetD2DRouteCoverageReport with route_type filter for sweeping
	// Filters: date → from_date + to_date, zone → zone_id, ward → ward_id
	streetSweepingDetailCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			dateStr := date.Format("2006-01-02")
			params.Set("from_date", dateStr)
			params.Set("to_date", dateStr)
		}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		// route_type_id for street sweeping — typically ID 2 in the system
		params.Set("route_type_id", "2")
		return callHandler(ctx, handler.GetD2DRouteCoverageReport, "/api/reports/d2d-coverage", params)
	}

	// road_sweeping → GetShiftBasedOpsReport (night shift)
	// Filters: date → date, shift → shift_id
	roadSweepingCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			params.Set("date", date.Format("2006-01-02"))
		}
		if shift, ok := f[masterreport.FilterShift].(string); ok && shift != "" {
			params.Set("shift_id", shift)
		}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		return callHandler(ctx, handler.GetShiftBasedOpsReport, "/api/reports/shift-based-ops", params)
	}

	// open_depot_gvp_shift_1/2/3 → GetOpenDepotDashboard
	// NOTE: This handler returns live data regardless of the date filter.
	// It has no date param — it's a real-time dashboard snapshot.
	openDepotCompute := func(ctx context.Context, _ masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		// GetOpenDepotDashboard has no params — returns live dashboard data
		return callHandler(ctx, handler.GetOpenDepotDashboard, "/api/reports/open-depot-dashboard", url.Values{})
	}

	// ts_point_reached_0730 → GetD2DRouteCoverageReport
	// TODO(v2): filter results where first coverage hit_time < 07:30.
	// For v1, returns the full D2D data and lets the frontend display it.
	tsPointReached0730Compute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			dateStr := date.Format("2006-01-02")
			params.Set("from_date", dateStr)
			params.Set("to_date", dateStr)
		}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		return callHandler(ctx, handler.GetD2DRouteCoverageReport, "/api/reports/d2d-coverage", params)
	}

	// helper_attendance_summary → GetAttendance (role=helper)
	// Same data as helper_attendance; frontend renders as summary view.
	helperAttendanceSummaryCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		params.Set("role", "helper")
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			params.Set("date", date.Format("2006-01-02"))
		}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		return callHandler(ctx, handler.GetAttendance, "/api/attendance", params)
	}

	// ts_point_reached (09:00 AM) → GetGTSTripReport
	// GTS trips show which vehicles reached transfer stations.
	tsPointReachedCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			params.Set("date", date.Format("2006-01-02"))
		}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		return callHandler(ctx, handler.GetGTSTripReport, "/api/reports/gts-trip", params)
	}

	// govt_street_sweeper_attendance → GetAttendance (role=sweeper)
	govtStreetSweeperCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		params.Set("role", "sweeper")
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			params.Set("date", date.Format("2006-01-02"))
		}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		return callHandler(ctx, handler.GetAttendance, "/api/attendance", params)
	}

	// street_sweeper_summary → GetAttendance (role=sweeper)
	// Same data as govt_street_sweeper_attendance; frontend renders as summary.
	streetSweeperSummaryCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		params.Set("role", "sweeper")
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			params.Set("date", date.Format("2006-01-02"))
		}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		return callHandler(ctx, handler.GetAttendance, "/api/attendance", params)
	}

	// d2d_zone_summary → GetD2DRouteCoverageReport without zone filter
	// Returns all zones; frontend can group/aggregate.
	d2dZoneSummaryCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			dateStr := date.Format("2006-01-02")
			params.Set("from_date", dateStr)
			params.Set("to_date", dateStr)
		}
		// Intentionally no zone filter — returns all zones for summary view
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		return callHandler(ctx, handler.GetD2DRouteCoverageReport, "/api/reports/d2d-coverage", params)
	}

	// street_sweeping_summary → GetD2DRouteCoverageReport (route_type=sweeping)
	// Same data as street_sweeping_detail; frontend renders as summary.
	streetSweepingSummaryCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			dateStr := date.Format("2006-01-02")
			params.Set("from_date", dateStr)
			params.Set("to_date", dateStr)
		}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		params.Set("route_type_id", "2")
		return callHandler(ctx, handler.GetD2DRouteCoverageReport, "/api/reports/d2d-coverage", params)
	}

	// commercial_hopper_summary → GetActiveVehicleSummaryReport
	// Active vehicles by zone includes hopper counts.
	commercialHopperSummaryCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		return callHandler(ctx, handler.GetActiveVehicleSummaryReport, "/api/reports/active-vehicle-summary", params)
	}

	// d2d_working_check → GetActiveVehicleSummaryReport
	// Shows which vehicles are active/inactive.
	d2dWorkingCheckCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		return callHandler(ctx, handler.GetActiveVehicleSummaryReport, "/api/reports/active-vehicle-summary", params)
	}

	// evening_d2d_check → GetActiveVehicleSummaryReport (evening window)
	// Same handler as d2d_working_check.
	eveningD2DCheckCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		return callHandler(ctx, handler.GetActiveVehicleSummaryReport, "/api/reports/active-vehicle-summary", params)
	}

	// evening_commercial_detail → GetD2DRouteCoverageReport
	// TODO(v2): pass appropriate evening shift_id when shift IDs are known.
	// For v1, returns D2D data without shift filter.
	eveningCommercialDetailCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			dateStr := date.Format("2006-01-02")
			params.Set("from_date", dateStr)
			params.Set("to_date", dateStr)
		}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		if shift, ok := f[masterreport.FilterShift].(string); ok && shift != "" {
			params.Set("shift_id", shift)
		}
		return callHandler(ctx, handler.GetD2DRouteCoverageReport, "/api/reports/d2d-coverage", params)
	}

	// evening_commercial_summary → GetD2DRouteCoverageReport (no zone filter)
	// Same approach as d2d_zone_summary.
	eveningCommercialSummaryCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			dateStr := date.Format("2006-01-02")
			params.Set("from_date", dateStr)
			params.Set("to_date", dateStr)
		}
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		return callHandler(ctx, handler.GetD2DRouteCoverageReport, "/api/reports/d2d-coverage", params)
	}

	// safai_karamchari_worked → GetAttendance (role=safai_karamchari)
	safaiKaramchariCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		params.Set("role", "safai_karamchari")
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			params.Set("date", date.Format("2006-01-02"))
		}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		return callHandler(ctx, handler.GetAttendance, "/api/attendance", params)
	}

	// beet_sweeping_summary → GetAttendance (role=safai_karamchari)
	// Same data as safai_karamchari_worked; frontend renders as summary/aggregate.
	beetSweepingSummaryCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		params.Set("role", "safai_karamchari")
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			params.Set("date", date.Format("2006-01-02"))
		}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		return callHandler(ctx, handler.GetAttendance, "/api/attendance", params)
	}

	// weight_bridge_report → GetGTSTripReport
	// GTS report includes weight/trip data per vehicle.
	weightBridgeCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		params := url.Values{}
		if date, ok := f[masterreport.FilterDate].(time.Time); ok {
			params.Set("date", date.Format("2006-01-02"))
		}
		if zone, ok := f[masterreport.FilterZone].(string); ok && zone != "" {
			params.Set("zone_id", zone)
		}
		if ward, ok := f[masterreport.FilterWard].(string); ok && ward != "" {
			params.Set("ward_id", ward)
		}
		return callHandler(ctx, handler.GetGTSTripReport, "/api/reports/gts-trip", params)
	}

	// daily_master_consolidated compute closure — wraps the legacy
	// ultimatereport service.
	// TODO: Should wrap urSvc.BuildReportData directly and project into
	// section/metric/value/target/coverage_pct/remarks row shape.
	// For v1, kept as placeholder since the handler produces binary Excel, not JSON.
	dailyConsolidatedCompute := func(ctx context.Context, f masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
		date, _ := f[masterreport.FilterDate].(time.Time)
		rd, err := urSvc.BuildReportData(ctx, date)
		if err != nil {
			return masterreport.Payload{}, err
		}
		// TODO(phase-D-followup): replace this JSON round-trip with a
		// direct projection of *ultimatereport.ReportData into the
		// section/metric/value/target/coverage_pct/remarks row shape
		// declared by reports_consolidated.go.
		_ = rd
		now := time.Now().UTC()
		return masterreport.Payload{
			Rows:         []map[string]any{},
			GeneratedAt:  now,
			InputVersion: now.UnixMilli(),
		}, nil
	}

	// ─── Register all 27 reports in display-order ──────────────────────────
	// Reports with production compute closures use real handler calls.
	// Reports without existing handlers retain placeholderCompute with
	// TODO comments explaining what data source is needed.

	masterreport.RegisterRoadSweeping(catalog, roadSweepingCompute, nil)                       // 100 / 07:00  ✓ WIRED → GetShiftBasedOpsReport
	masterreport.RegisterOpenDepotGVPShift3(catalog, openDepotCompute, nil)                    // 110 / 07:30  ✓ WIRED → GetOpenDepotDashboard (live data)
	masterreport.RegisterTSPointReached0730(catalog, tsPointReached0730Compute, nil)            // 120 / 07:45  ✓ WIRED → GetD2DRouteCoverageReport (TODO: filter by 07:30 time)
	masterreport.RegisterHelperAttendance(catalog, helperAttendanceCompute, nil)                // 130 / 08:00  ✓ WIRED → GetAttendance (role=helper)
	masterreport.RegisterHelperAttendanceSummary(catalog, helperAttendanceSummaryCompute, nil)  // 140 / 08:01  ✓ WIRED → GetAttendance (role=helper, summary view)
	masterreport.RegisterTSPointReached(catalog, tsPointReachedCompute, nil)                   // 150 / 09:00  ✓ WIRED → GetGTSTripReport
	masterreport.RegisterGovtStreetSweeperAttendance(catalog, govtStreetSweeperCompute, nil)    // 160 / 10:15  ✓ WIRED → GetAttendance (role=sweeper)
	masterreport.RegisterStreetSweeperSummary(catalog, streetSweeperSummaryCompute, nil)        // 170 / 10:16  ✓ WIRED → GetAttendance (role=sweeper, summary view)
	masterreport.RegisterOpenDepotGVPShift1(catalog, openDepotCompute, nil)                    // 180 / 11:30  ✓ WIRED → GetOpenDepotDashboard (live data)
	masterreport.RegisterActiveHoppersSummary(catalog, activeHoppersCompute, nil)               // 190 / 12:00  ✓ WIRED → GetActiveVehicleSummaryReport
	masterreport.RegisterEarlyDepartureD2D(catalog, earlyDepartureCompute, nil)                // 200 / 15:00  ✓ WIRED → GetEarlyDepartureReport
	masterreport.RegisterOpenDepotGVPShift2(catalog, openDepotCompute, nil)                    // 210 / 16:00  ✓ WIRED → GetOpenDepotDashboard (live data)
	masterreport.RegisterD2DVehicleCoverage(catalog, d2dVehicleCoverageCompute, nil)           // 220 / 16:10  ✓ WIRED → GetD2DRouteCoverageReport
	masterreport.RegisterD2DZoneSummary(catalog, d2dZoneSummaryCompute, nil)                   // 230 / 16:11  ✓ WIRED → GetD2DRouteCoverageReport (all zones)
	masterreport.RegisterStreetSweepingDetail(catalog, streetSweepingDetailCompute, nil)       // 240 / 16:15  ✓ WIRED → GetD2DRouteCoverageReport (route_type=sweeping)
	masterreport.RegisterStreetSweepingSummary(catalog, streetSweepingSummaryCompute, nil)     // 250 / 16:16  ✓ WIRED → GetD2DRouteCoverageReport (route_type=sweeping, summary)
	masterreport.RegisterD2DWorkingCheck(catalog, d2dWorkingCheckCompute, nil)                 // 260 / 16:30  ✓ WIRED → GetActiveVehicleSummaryReport
	masterreport.RegisterCommercialHopperSummary(catalog, commercialHopperSummaryCompute, nil) // 270 / 16:31  ✓ WIRED → GetActiveVehicleSummaryReport
	masterreport.RegisterSafaiKaramchariWorked(catalog, safaiKaramchariCompute, nil)           // 280 / 18:00  ✓ WIRED → GetAttendance (role=safai_karamchari)
	masterreport.RegisterBeetSweepingSummary(catalog, beetSweepingSummaryCompute, nil)         // 290 / 18:10  ✓ WIRED → GetAttendance (role=safai_karamchari, summary)
	masterreport.RegisterGTSTrip(catalog, gtsTripCompute, nil)                                 // 300 / 18:30  ✓ WIRED → GetGTSTripReport
	masterreport.RegisterWeightBridgeReport(catalog, weightBridgeCompute, nil)                 // 310 / 19:00  ✓ WIRED → GetGTSTripReport (weight/trip data)
	masterreport.RegisterRFIDCollection(catalog, placeholderCompute, nil)                      // 320 / 19:30  — PLACEHOLDER: needs rfid_scan_log table (cannot confirm exists)
	masterreport.RegisterEveningD2DCheck(catalog, eveningD2DCheckCompute, nil)                 // 330 / 20:15  ✓ WIRED → GetActiveVehicleSummaryReport (evening)
	masterreport.RegisterEveningCommercialDetail(catalog, eveningCommercialDetailCompute, nil) // 340 / 23:10  ✓ WIRED → GetD2DRouteCoverageReport
	masterreport.RegisterEveningCommercialSummary(catalog, eveningCommercialSummaryCompute, nil) // 350 / 23:15  ✓ WIRED → GetD2DRouteCoverageReport (all zones)
	masterreport.RegisterDailyMasterConsolidated(catalog, dailyConsolidatedCompute, nil)       // 999 / 23:59  — PLACEHOLDER: handler produces binary Excel, needs direct urSvc.BuildReportData projection

	// Boot-time semantic check (Req 1.8). The exporter is purely
	// programmatic — no template files are read at runtime — so the
	// only failure modes Validate can surface (DataSource non-nil,
	// PermissionKey shape) are programming errors and MUST abort
	// startup.
	if err := catalog.Validate(context.Background(), rbacRepo); err != nil {
		log.Fatal().Err(err).Msg("Master report catalog validation failed")
	}

	// Seed per-report and base RBAC permissions. Idempotent across boots
	// via ON CONFLICT DO NOTHING inside RBACRepository.RegisterPermissions
	// (Req 8.1, 8.8). Failures here are degraded but recoverable — log a
	// warning and proceed rather than aborting boot.
	if err := rbacRepo.RegisterPermissions(context.Background(), masterreport.PermissionsForCatalog(catalog)); err != nil {
		log.Warn().Err(err).Msg("Master report permission seeding partially failed; reports.<id>.* rows may be missing")
	} else {
		log.Info().Int("reports", len(catalog.List())).Msg("Master report catalog registered and permissions seeded")
	}

	// 13c. Wire the Master Reporting Module runtime components into the handler.
	// These are the concrete implementations of SmartLoader, ForceRecalculator,
	// JobRegistry, ExcelExporter, PDFExporter, BoundedWorkerPool, and Auditor
	// that the master-report HTTP handlers need to serve requests. Without this
	// call, GET /api/master-reports/catalog returns 503 (mrAvailable() == false).
	mrPool := masterreport.NewBoundedWorkerPool()
	mrCache := masterreport.NewOutputCacheRepo(db)
	mrGroup := &singleflight.Group{}
	mrLoader := masterreport.NewSmartLoader(catalog, mrCache, mrPool, mrGroup)
	mrRecalc := masterreport.NewForceRecalculator(catalog, mrCache, mrPool, mrGroup)
	mrJobs := masterreport.NewJobRegistry(context.Background())
	mrExcel, _ := masterreport.NewExcelExporter(catalog)
	mrPDF := masterreport.NewPDFExporter()
	mrAuditor := masterreport.NewAuditor(handler.GetAuditLogger())
	handler.SetMasterReportingModule(catalog, mrLoader, mrRecalc, mrJobs, mrExcel, mrPDF, mrPool, mrAuditor)

	router := api.SetupRouter(handler, hub, cfg)

	// API Server (Handles both HTTP and WebSockets)
	srv := &http.Server{
		Addr:    ":" + cfg.HTTPPort,
		Handler: router,
	}

	go func() {
		log.Info().Str("port", cfg.HTTPPort).Msg("HTTP API & WebSocket server listening")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msgf("HTTP API server failed to bind to port %s. Error: %v", cfg.HTTPPort, err)
		}
	}()

	// 12. Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Info().Msg("Shutting down servers...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Error().Err(err).Msg("HTTP Server forced to shutdown")
	}

	log.Info().Msg("System exited gracefully")
}
