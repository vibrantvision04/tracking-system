package cron

import (
	"gps-tracking-system/internal/config"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/service"

	"github.com/robfig/cron/v3"
	"github.com/rs/zerolog/log"
)

func StartScheduler(cfg *config.Config, rService *service.ReportService, vRepo *repository.VehicleRepository) {
	c := cron.New()
	
	job := NewReportJob(vRepo, rService)
	
	_, err := c.AddFunc(cfg.ReportCron, func() {
		log.Info().Msg("Running nightly movement report job")
		job.Run()
	})

	if err != nil {
		log.Error().Err(err).Msg("Failed to start cron scheduler")
		return
	}

	c.Start()
	log.Info().Msg("Cron scheduler started")
}
