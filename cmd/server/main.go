package main

import (
	"context"
	"gps-tracking-system/internal/api"
	"gps-tracking-system/internal/cache"
	"gps-tracking-system/internal/config"
	"gps-tracking-system/internal/cron"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/service"
	"gps-tracking-system/internal/tcp"
	"gps-tracking-system/internal/worker"
	"gps-tracking-system/internal/ws"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	cron_lib "github.com/robfig/cron/v3"
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

	log.Info().Msg("Starting ISWM Jaipur Heritage Tracking System...")

	// 3. Initialize Databases
	db, err := repository.InitDB(cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize DB")
	}
	defer db.Close()

	rdb, err := cache.InitRedis(cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize Redis")
	}
	defer rdb.Close()

	// 4. Initialize Repositories
	gpsRepo := repository.NewGPSRepository(db)
	vRepo := repository.NewVehicleRepository(db)
	rRepo := repository.NewReportRepository(db)

	// 5. Initialize Caches
	locCache := cache.NewLocationCache(rdb)

	// 6. Initialize Services
	rService := service.NewReportService(rRepo, gpsRepo, vRepo)

	// 7. Initialize Ingestion Pipeline
	batchWriter := worker.NewBatchWriter(gpsRepo, cfg.BatchSize, time.Duration(cfg.BatchTimeoutMS)*time.Millisecond)
	dispatcher := worker.NewDispatcher(rdb)
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
	reportJob := cron.NewReportJob(vRepo, rService)
	c := cron_lib.New()
	c.AddFunc("30 23 * * *", reportJob.Run)
	c.Start()

	// 11. Start API Clients (Removed as per blueprint optimization)


	// 12. Start Servers
	handler := api.NewHandler(vRepo, gpsRepo, rService, rdb)
	router := api.SetupRouter(handler, hub)

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
