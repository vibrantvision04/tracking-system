package main

import (
	"context"
	"gps-tracking-system/internal/api"
	"gps-tracking-system/internal/auth"
	"gps-tracking-system/internal/cache"
	"gps-tracking-system/internal/config"
	"gps-tracking-system/internal/cron"
	"gps-tracking-system/internal/geofence"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/service"
	"gps-tracking-system/internal/tcp"
	"gps-tracking-system/internal/ultimatereport"
	"gps-tracking-system/internal/vision"
	"gps-tracking-system/internal/worker"
	"gps-tracking-system/internal/ws"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
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


	// 12. Start Servers
	handler := api.NewHandler(vRepo, gpsRepo, rService, rdb, routeRepo, routeEngine, openDepotRepo, cfg.JWTAccessSecret, cfg.JWTRefreshSecret, cfg.AllowHistoricalRecalculation)

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
