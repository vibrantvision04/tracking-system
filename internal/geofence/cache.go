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
	types     map[int]int // geofence_id -> region_type_id (2 for Zone, 3 for Ward)
	mu        sync.RWMutex
}

func parseGeometryToPoints(geomType string, rawCoords json.RawMessage) ([]Point, error) {
	if geomType == "Polygon" {
		var coords [][][]float64
		if err := json.Unmarshal(rawCoords, &coords); err == nil && len(coords) > 0 {
			var points []Point
			for _, coord := range coords[0] {
				if len(coord) >= 2 {
					points = append(points, Point{Lat: coord[1], Lng: coord[0]})
				}
			}
			return points, nil
		}
	} else if geomType == "MultiPolygon" {
		var coords [][][][]float64
		if err := json.Unmarshal(rawCoords, &coords); err == nil && len(coords) > 0 && len(coords[0]) > 0 {
			var points []Point
			// Take the first polygon's outer ring
			for _, coord := range coords[0][0] {
				if len(coord) >= 2 {
					points = append(points, Point{Lat: coord[1], Lng: coord[0]})
				}
			}
			return points, nil
		}
	}
	return nil, fmt.Errorf("unsupported or invalid geometry type: %s", geomType)
}

func parseGeoJSONToPoints(polygonData []byte) ([]Point, error) {
	// 0. Try parsing as FeatureCollection
	var fc struct {
		Type     string `json:"type"`
		Features []struct {
			Geometry struct {
				Type        string          `json:"type"`
				Coordinates json.RawMessage `json:"coordinates"`
			} `json:"geometry"`
		} `json:"features"`
	}
	if err := json.Unmarshal(polygonData, &fc); err == nil && fc.Type == "FeatureCollection" && len(fc.Features) > 0 {
		for _, f := range fc.Features {
			pts, err := parseGeometryToPoints(f.Geometry.Type, f.Geometry.Coordinates)
			if err == nil && len(pts) > 0 {
				return pts, nil
			}
		}
	}

	// 1. Try parsing as Feature (geometry.coordinates)
	var feature struct {
		Geometry struct {
			Type        string          `json:"type"`
			Coordinates json.RawMessage `json:"coordinates"`
		} `json:"geometry"`
	}
	if err := json.Unmarshal(polygonData, &feature); err == nil {
		pts, err := parseGeometryToPoints(feature.Geometry.Type, feature.Geometry.Coordinates)
		if err == nil && len(pts) > 0 {
			return pts, nil
		}
	}

	// 2. Try parsing as raw Geometry (coordinates directly)
	var geom struct {
		Type        string          `json:"type"`
		Coordinates json.RawMessage `json:"coordinates"`
	}
	if err := json.Unmarshal(polygonData, &geom); err == nil {
		pts, err := parseGeometryToPoints(geom.Type, geom.Coordinates)
		if err == nil && len(pts) > 0 {
			return pts, nil
		}
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

	dbTypes, err := c.repo.GetGeofenceTypes(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to refresh geofence types in cache")
		dbTypes = make(map[int]int)
	}

	newData := make([]GeofenceData, 0, len(dbGeofences))
	for _, g := range dbGeofences {
		if g.Type != "polygon" {
			continue
		}
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
	c.types = dbTypes
	c.mu.Unlock()
	log.Debug().Int("count", len(newData)).Msg("Geofence cache refreshed")
}

func (c *Cache) GetActive() []GeofenceData {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.geofences
}

func (c *Cache) GetGeofenceType(gID int) int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.types == nil {
		return 0
	}
	return c.types[gID]
}
