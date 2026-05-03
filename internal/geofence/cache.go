package geofence

import (
	"context"
	"encoding/json"
	"gps-tracking-system/internal/repository"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

type GeofenceData struct {
	ID      int
	Name    string
	Type    string
	Points  []Point
}

type Cache struct {
	repo      *repository.GeofenceRepository
	geofences []GeofenceData
	mu        sync.RWMutex
}

func NewCache(repo *repository.GeofenceRepository) *Cache {
	c := &Cache{repo: repo}
	go c.refreshLoop()
	return c
}

func (c *Cache) refreshLoop() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	c.refresh()
	for range ticker.C {
		c.refresh()
	}
}

func (c *Cache) refresh() {
	ctx := context.Background()
	dbGeofences, err := c.repo.GetAll(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to refresh geofence cache")
		return
	}

	newData := make([]GeofenceData, 0, len(dbGeofences))
	for _, g := range dbGeofences {
		var points []Point
		if err := json.Unmarshal(g.Polygon, &points); err != nil {
			log.Warn().Int("id", g.ID).Msg("Failed to parse geofence polygon")
			continue
		}
		newData = append(newData, GeofenceData{
			ID:     g.ID,
			Name:   g.Name,
			Type:   g.Type,
			Points: points,
		})
	}

	c.mu.Lock()
	c.geofences = newData
	c.mu.Unlock()
	log.Debug().Int("count", len(newData)).Msg("Geofence cache refreshed")
}

func (c *Cache) GetActive() []GeofenceData {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.geofences
}
