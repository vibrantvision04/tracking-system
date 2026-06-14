package geofence

import (
	"context"
	"encoding/json"
	"fmt"
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

func parseGeoJSONToPoints(polygonData []byte) ([]Point, error) {
	// 0. Try parsing as FeatureCollection
	var fc struct {
		Type     string `json:"type"`
		Features []struct {
			Geometry struct {
				Type        string        `json:"type"`
				Coordinates [][][]float64 `json:"coordinates"`
			} `json:"geometry"`
		} `json:"features"`
	}
	if err := json.Unmarshal(polygonData, &fc); err == nil && fc.Type == "FeatureCollection" && len(fc.Features) > 0 {
		for _, f := range fc.Features {
			if f.Geometry.Type == "Polygon" && len(f.Geometry.Coordinates) > 0 {
				var points []Point
				for _, coords := range f.Geometry.Coordinates[0] {
					if len(coords) >= 2 {
						points = append(points, Point{Lat: coords[1], Lng: coords[0]})
					}
				}
				return points, nil
			}
		}
	}

	// 1. Try parsing as Feature (geometry.coordinates)
	var feature struct {
		Geometry struct {
			Type        string        `json:"type"`
			Coordinates [][][]float64 `json:"coordinates"`
		} `json:"geometry"`
	}
	if err := json.Unmarshal(polygonData, &feature); err == nil && feature.Geometry.Type == "Polygon" && len(feature.Geometry.Coordinates) > 0 {
		var points []Point
		for _, coords := range feature.Geometry.Coordinates[0] {
			if len(coords) >= 2 {
				points = append(points, Point{Lat: coords[1], Lng: coords[0]})
			}
		}
		return points, nil
	}

	// 2. Try parsing as raw Geometry (coordinates directly)
	var geom struct {
		Type        string        `json:"type"`
		Coordinates [][][]float64 `json:"coordinates"`
	}
	if err := json.Unmarshal(polygonData, &geom); err == nil && geom.Type == "Polygon" && len(geom.Coordinates) > 0 {
		var points []Point
		for _, coords := range geom.Coordinates[0] {
			if len(coords) >= 2 {
				points = append(points, Point{Lat: coords[1], Lng: coords[0]})
			}
		}
		return points, nil
	}

	// 3. Fallback to parsing directly as []Point
	var points []Point
	if err := json.Unmarshal(polygonData, &points); err == nil {
		return points, nil
	}

	return nil, fmt.Errorf("failed to parse geofence coordinates")
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
		points, err := parseGeoJSONToPoints(g.Polygon)
		if err != nil {
			log.Warn().Int("id", g.ID).Err(err).Msg("Failed to parse geofence polygon")
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
