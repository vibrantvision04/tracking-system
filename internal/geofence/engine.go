package geofence

import (
	"encoding/json"
	"gps-tracking-system/internal/repository"
)

type Point struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type Geofence struct {
	ID       int
	Name     string
	Type     string // 'Ward', 'Zone', 'Parking'
	Polygon  []Point
}

type Engine struct {
	fences []Geofence
}

func NewEngine() *Engine {
	return &Engine{
		fences: make([]Geofence, 0),
	}
}

func (e *Engine) LoadFromDB(repo *repository.GeofenceRepository) error {
	// Implementation to load all active geofences from DB
	// This would fetch from regions and parking_lots tables
	return nil
}

func (e *Engine) Check(lat, lng float64) []Geofence {
	var inside []Geofence
	p := Point{Lat: lat, Lng: lng}
	for _, f := range e.fences {
		if PointInPolygon(p, f.Polygon) {
			inside = append(inside, f)
		}
	}
	return inside
}

func PointInPolygon(p Point, polygon []Point) bool {
	// Ray-casting algorithm
	isInside := false
	for i, j := 0, len(polygon)-1; i < len(polygon); j, i = i, i+1 {
		if ((polygon[i].Lat > p.Lat) != (polygon[j].Lat > p.Lat)) &&
			(p.Lng < (polygon[j].Lng-polygon[i].Lng)*(p.Lat-polygon[i].Lat)/(polygon[j].Lat-polygon[i].Lat)+polygon[i].Lng) {
			isInside = !isInside
		}
	}
	return isInside
}

// GeoJSON parsing helper
func ParsePolygon(geoJSON string) ([][]float64, error) {
	var feature struct {
		Geometry struct {
			Type        string        `json:"type"`
			Coordinates [][][]float64 `json:"coordinates"`
		} `json:"geometry"`
	}
	if err := json.Unmarshal([]byte(geoJSON), &feature); err != nil {
		return nil, err
	}
	if feature.Geometry.Type == "Polygon" {
		return feature.Geometry.Coordinates[0], nil
	}
	return nil, nil
}
