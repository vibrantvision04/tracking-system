package api

import (
	"gps-tracking-system/internal/repository"
)

// NewTestHandler creates a minimal Handler for integration tests.
// It only wires up gpsRepo and routeRepo — sufficient for unified employee
// handlers and other endpoints that only need database access.
func NewTestHandler(gpsRepo *repository.GPSRepository, routeRepo *repository.RouteRepository) *Handler {
	return &Handler{
		gpsRepo:           gpsRepo,
		routeRepo:         routeRepo,
		zoneVehiclesCache: make(map[string][]map[string]interface{}),
		resolvedAlerts:    make(map[int]ResolvedDetails),
	}
}
