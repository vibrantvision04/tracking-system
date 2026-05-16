package cron

import (
	"context"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/service"
	"time"

	"github.com/rs/zerolog/log"
)

type ReportJob struct {
	vRepo        *repository.VehicleRepository
	rService     *service.ReportService
	vehicleZones map[string]string
	vehicleWards map[string]string
}

func NewReportJob(vRepo *repository.VehicleRepository, rService *service.ReportService) *ReportJob {
	return &ReportJob{
		vRepo:        vRepo,
		rService:     rService,
		vehicleZones: make(map[string]string),
		vehicleWards: make(map[string]string),
	}
}

// SetZoneWardMappings allows the caller to provide zone/ward name mappings
// keyed by vehicle registration number.
func (j *ReportJob) SetZoneWardMappings(zones, wards map[string]string) {
	j.vehicleZones = zones
	j.vehicleWards = wards
}

func (j *ReportJob) Run() {
	// Default nightly run is for yesterday
	yesterday := time.Now().AddDate(0, 0, -1)
	j.RunForDate(yesterday)
}

func (j *ReportJob) RunForDate(date time.Time) {
	log.Info().Str("date", date.Format("2006-01-02")).Msg("Starting movement report generation")
	
	ctx := context.Background()
	vehicles, err := j.vRepo.GetAll(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to fetch vehicles for report job")
		return
	}

	generated := 0
	for _, v := range vehicles {
		if v.GpsDevice == nil {
			continue // Skip vehicles without GPS devices
		}

		zone := j.vehicleZones[v.RegistrationNo]
		ward := j.vehicleWards[v.RegistrationNo]

		log.Debug().Int("vehicle_id", v.ID).Str("reg", v.RegistrationNo).Msg("Generating report for vehicle")
		err := j.rService.GenerateDailyReport(ctx, v.ID, date, zone, ward)
		if err != nil {
			log.Error().Err(err).Int("vehicle_id", v.ID).Msg("Failed to generate report")
		} else {
			generated++
		}
	}
	
	log.Info().Int("generated", generated).Int("total_vehicles", len(vehicles)).Str("date", date.Format("2006-01-02")).Msg("Movement report generation completed")
}
