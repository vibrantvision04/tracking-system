package cron

import (
	"context"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/service"
	"time"

	"github.com/rs/zerolog/log"
)

type ReportJob struct {
	vRepo    *repository.VehicleRepository
	rService *service.ReportService
}

func NewReportJob(vRepo *repository.VehicleRepository, rService *service.ReportService) *ReportJob {
	return &ReportJob{
		vRepo:    vRepo,
		rService: rService,
	}
}

func (j *ReportJob) Run() {
	log.Info().Msg("Starting nightly movement report generation")
	
	ctx := context.Background()
	vehicles, err := j.vRepo.GetAll(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to fetch vehicles for report job")
		return
	}

	// Calculate for yesterday
	yesterday := time.Now().AddDate(0, 0, -1)
	
	for _, v := range vehicles {
		log.Debug().Int("vehicle_id", v.ID).Msg("Generating report for vehicle")
		err := j.rService.GenerateDailyReport(ctx, v.ID, yesterday, "", "")
		if err != nil {
			log.Error().Err(err).Int("vehicle_id", v.ID).Msg("Failed to generate report")
		}
	}
	
	log.Info().Msg("Nightly movement report generation completed")
}
