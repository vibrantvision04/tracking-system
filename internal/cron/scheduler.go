package cron

import (
	"gps-tracking-system/internal/config"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/service"
	"time"

	"github.com/robfig/cron/v3"
	"github.com/rs/zerolog/log"
)

func StartScheduler(cfg *config.Config, rService *service.ReportService, vRepo *repository.VehicleRepository) {
	c := cron.New()
	
	job := NewReportJob(vRepo, rService)
	
	_, err := c.AddFunc(cfg.ReportCron, func() {
		log.Info().Msg("Running nightly movement report job (Yesterday)")
		job.Run() // Run() defaults to yesterday
	})

	if err != nil {
		log.Error().Err(err).Msg("Failed to start nightly cron job")
		return
	}

	// Also run a periodic update for "Today" every 15 minutes
	_, err = c.AddFunc("@every 15m", func() {
		log.Info().Msg("Running periodic movement report update (Today)")
		job.RunForDate(time.Now())
	})

	if err != nil {
		log.Error().Err(err).Msg("Failed to start periodic report job")
		return
	}

	c.Start()
	log.Info().Msg("Cron scheduler started")
}
