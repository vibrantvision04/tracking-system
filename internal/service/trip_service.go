package service

import (
	"context"
	"encoding/json"
	"fmt"
	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/repository"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

type TripService struct {
	repo  *repository.TripRepository
	vRepo *repository.VehicleRepository
	rdb   *redis.Client
}

func NewTripService(repo *repository.TripRepository, vRepo *repository.VehicleRepository, rdb *redis.Client) *TripService {
	return &TripService{
		repo:  repo,
		vRepo: vRepo,
		rdb:   rdb,
	}
}

func (s *TripService) Process(ctx context.Context, data decoder.AVLData) {
	stateKey := fmt.Sprintf("trip:state:%s", data.IMEI)
	
	// Get previous ignition state
	prevIgnition, _ := s.rdb.Get(ctx, stateKey).Bool()

	if data.Ignition && !prevIgnition {
		// Trip Start
		s.handleTripStart(ctx, data)
	} else if !data.Ignition && prevIgnition {
		// Trip End
		s.handleTripEnd(ctx, data)
	}
	
	s.rdb.Set(ctx, stateKey, data.Ignition, 0)
}

func (s *TripService) handleTripStart(ctx context.Context, data decoder.AVLData) {
	v, err := s.vRepo.GetByIMEI(ctx, data.IMEI)
	if err != nil {
		return
	}

	trip := repository.Trip{
		VehicleID: v.ID,
		IMEI:      data.IMEI,
		StartTime: data.Time,
		StartLat:  data.Lat,
		StartLng:  data.Lng,
	}
	
	val, _ := json.Marshal(trip)
	s.rdb.Set(ctx, "trip:active:"+data.IMEI, val, 24*time.Hour)
	log.Info().Str("imei", data.IMEI).Msg("Trip started")
}

func (s *TripService) handleTripEnd(ctx context.Context, data decoder.AVLData) {
	val, err := s.rdb.Get(ctx, "trip:active:"+data.IMEI).Result()
	if err != nil {
		return
	}

	var trip repository.Trip
	json.Unmarshal([]byte(val), &trip)
	
	trip.EndTime = &data.Time
	trip.EndLat = data.Lat
	trip.EndLng = data.Lng
	
	// In a real system, we would calculate distance and avg speed here
	// and fetch the path from DB to downsample and store in JSON.
	
	if err := s.repo.Create(ctx, &trip); err != nil {
		log.Error().Err(err).Msg("Failed to save trip")
	}
	
	s.rdb.Del(ctx, "trip:active:"+data.IMEI)
	log.Info().Str("imei", data.IMEI).Msg("Trip ended")
}
