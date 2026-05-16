package service

import (
	"context"
	"encoding/json"
	"fmt"
	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/utils"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

type TripService struct {
	repo  *repository.TripRepository
	vRepo *repository.VehicleRepository
	gRepo *repository.GPSRepository
	rdb   *redis.Client
}

func NewTripService(repo *repository.TripRepository, vRepo *repository.VehicleRepository, gRepo *repository.GPSRepository, rdb *redis.Client) *TripService {
	return &TripService{
		repo:  repo,
		vRepo: vRepo,
		gRepo: gRepo,
		rdb:   rdb,
	}
}

func (s *TripService) Process(ctx context.Context, data decoder.AVLData) {
	stateKey := fmt.Sprintf("trip:state:%s", data.IMEI)
	lastPointKey := fmt.Sprintf("trip:last_point:%s", data.IMEI)
	distKey := fmt.Sprintf("trip:distance:%s", data.IMEI)
	maxSpeedKey := fmt.Sprintf("trip:max_speed:%s", data.IMEI)
	
	// Get previous ignition state
	prevIgnition, _ := s.rdb.Get(ctx, stateKey).Bool()

	if data.Ignition && !prevIgnition {
		// Trip Start
		s.handleTripStart(ctx, data)
		s.rdb.Set(ctx, distKey, 0, 24*time.Hour)
		s.rdb.Set(ctx, maxSpeedKey, data.Speed, 24*time.Hour)
	} else if !data.Ignition && prevIgnition {
		// Trip End
		s.handleTripEnd(ctx, data)
	} else if data.Ignition && prevIgnition {
		// Ongoing trip: accumulate distance
		val, err := s.rdb.Get(ctx, lastPointKey).Result()
		if err == nil {
			var prevPoint decoder.AVLData
			if err := json.Unmarshal([]byte(val), &prevPoint); err == nil {
				if utils.IsValidGPSTransition(prevPoint, data) {
					dist := utils.Haversine(prevPoint.Lat, prevPoint.Lng, data.Lat, data.Lng)
					s.rdb.IncrByFloat(ctx, distKey, dist)
				}
			}
		}

		// Update max speed
		currentMax, _ := s.rdb.Get(ctx, maxSpeedKey).Float64()
		if data.Speed > currentMax {
			s.rdb.Set(ctx, maxSpeedKey, data.Speed, 24*time.Hour)
		}
	}
	
	// Update last point and state
	lastPointVal, _ := json.Marshal(data)
	s.rdb.Set(ctx, lastPointKey, lastPointVal, 24*time.Hour)
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
	
	// 1. Fetch accumulated distance and max speed from Redis
	dist, _ := s.rdb.Get(ctx, fmt.Sprintf("trip:distance:%s", data.IMEI)).Float64()
	maxSpeed, _ := s.rdb.Get(ctx, fmt.Sprintf("trip:max_speed:%s", data.IMEI)).Float64()
	
	trip.Distance = dist
	trip.MaxSpeed = maxSpeed
	
	// 2. Calculate average speed (distance / duration)
	duration := trip.EndTime.Sub(trip.StartTime).Hours()
	if duration > 0 {
		trip.AvgSpeed = trip.Distance / duration
	}

	// 3. Fetch path from DB
	points, err := s.gRepo.GetByVehicle(ctx, trip.VehicleID, trip.StartTime, *trip.EndTime)
	if err == nil {
		pathData := make([]map[string]float64, 0, len(points))
		for _, p := range points {
			pathData = append(pathData, map[string]float64{"lat": p.Lat, "lng": p.Lng})
		}
		trip.Path, _ = json.Marshal(pathData)
	}
	
	if err := s.repo.Create(ctx, &trip); err != nil {
		log.Error().Err(err).Msg("Failed to save trip")
	}
	
	// Cleanup Redis
	s.rdb.Del(ctx, "trip:active:"+data.IMEI)
	s.rdb.Del(ctx, fmt.Sprintf("trip:distance:%s", data.IMEI))
	s.rdb.Del(ctx, fmt.Sprintf("trip:max_speed:%s", data.IMEI))
	s.rdb.Del(ctx, fmt.Sprintf("trip:last_point:%s", data.IMEI))
	
	log.Info().Str("imei", data.IMEI).Float64("distance", dist).Msg("Trip ended and saved")
}
