package main

import (
	"context"
	"gps-tracking-system/internal/api"
	"gps-tracking-system/internal/cache"
	"gps-tracking-system/internal/config"
	"gps-tracking-system/internal/cron"
	"gps-tracking-system/internal/geofence"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/service"
	"gps-tracking-system/internal/tcp"
	"gps-tracking-system/internal/ultimatereport"
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

	log.Info().Msg("Starting VSWM Jaipur Heritage Tracking System...")

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

	// 10. Start Cron Scheduler
	cron.StartScheduler(cfg, rService, vRepo)

	// 11. Start API Clients (Removed as per blueprint optimization)


	// 12. Start Servers
	handler := api.NewHandler(vRepo, gpsRepo, rService, rdb, routeRepo, routeEngine, openDepotRepo, cfg.JWTSecret, cfg.AllowHistoricalRecalculation)

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
