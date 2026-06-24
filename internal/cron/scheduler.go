package cron

import (
	"gps-tracking-system/internal/config"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/service"
	"gps-tracking-system/internal/utils"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/robfig/cron/v3"
	"github.com/rs/zerolog/log"
)

func StartScheduler(cfg *config.Config, rService *service.ReportService, vRepo *repository.VehicleRepository, db *pgxpool.Pool) {
	c := cron.New()

	job := NewReportJob(vRepo, rService)

	_, err := c.AddFunc(cfg.ReportCron, func() {
		log.Info().Msg("Running nightly movement report job (Yesterday)")
		job.Run()
	})

	if err != nil {
		log.Error().Err(err).Msg("Failed to start nightly cron job")
		return
	}

	_, err = c.AddFunc("@every 15m", func() {
		log.Info().Msg("Running periodic movement report update (Today)")
		job.RunForDate(utils.CurrentTimeInIndia())
	})

	if err != nil {
		log.Error().Err(err).Msg("Failed to start periodic report job")
		return
	}

	tokenCleanup := NewTokenCleanupJob(db)
	_, err = c.AddFunc("@every 1h", func() {
		log.Info().Msg("Running expired token cleanup")
		tokenCleanup.Run()
	})

	if err != nil {
		log.Error().Err(err).Msg("Failed to start token cleanup job")
		return
	}

	c.Start()
	log.Info().Msg("Cron scheduler started")
}
