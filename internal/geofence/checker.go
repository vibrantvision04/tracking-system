package geofence

import (
	"context"
	"fmt"
	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/repository"
	"sync"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

type Checker struct {
	cache    *Cache
	repo     *repository.GeofenceRepository
	rdb      *redis.Client
	vRepo    *repository.VehicleRepository
	stateMu  sync.Mutex
}

func NewChecker(cache *Cache, repo *repository.GeofenceRepository, rdb *redis.Client, vRepo *repository.VehicleRepository) *Checker {
	return &Checker{
		cache: cache,
		repo:  repo,
		rdb:   rdb,
		vRepo: vRepo,
	}
}

func (c *Checker) Check(ctx context.Context, data decoder.AVLData) {
	geofences := c.cache.GetActive()
	if len(geofences) == 0 {
		return
	}

	p := Point{Lat: data.Lat, Lng: data.Lng}
	
	// Get vehicle ID for the IMEI
	v, err := c.vRepo.GetByIMEI(ctx, data.IMEI)
	if err != nil {
		return
	}

	for _, g := range geofences {
		isInside := PointInPolygon(p, g.Points)
		
		// Get previous state from Redis
		stateKey := fmt.Sprintf("geofence:state:%d:%d", v.ID, g.ID)
		prevInside, _ := c.rdb.Get(ctx, stateKey).Bool()

		if isInside && !prevInside {
			// ENTER event
			c.handleEvent(ctx, v.ID, g.ID, "enter", data)
			c.rdb.Set(ctx, stateKey, true, 0)
		} else if !isInside && prevInside {
			// EXIT event
			c.handleEvent(ctx, v.ID, g.ID, "exit", data)
			c.rdb.Set(ctx, stateKey, false, 0)
		}
	}
}

func (c *Checker) handleEvent(ctx context.Context, vID, gID int, eventType string, data decoder.AVLData) {
	event := &repository.GeofenceEvent{
		VehicleID:  vID,
		GeofenceID: gID,
		EventType:  eventType,
		Time:       data.Time,
		Lat:        data.Lat,
		Lng:        data.Lng,
	}
	
	if err := c.repo.SaveEvent(ctx, event); err != nil {
		log.Error().Err(err).Msg("Failed to save geofence event")
	}
	
	log.Info().Str("event", eventType).Int("vehicle", vID).Int("geofence", gID).Msg("Geofence alert")
}
