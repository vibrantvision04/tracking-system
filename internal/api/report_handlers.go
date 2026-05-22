package api

import (
	"context"
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"

	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/utils"

	"github.com/rs/zerolog/log"
)

func (h *Handler) GetD2DRouteCoverageReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	fromDateStr := r.URL.Query().Get("from_date")
	toDateStr := r.URL.Query().Get("to_date")

	fromDate, err := time.Parse("2006-01-02", fromDateStr)
	if err != nil {
		fromDate = time.Now()
	}
	toDate, err := time.Parse("2006-01-02", toDateStr)
	if err != nil {
		toDate = time.Now()
	}

	// Fetch all assignments for the date range
	assignments, err := h.routeRepo.GetD2DAssignments(ctx, fromDate, toDate)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch assignments: " + err.Error()})
		return
	}

	// Parse optional filters
	filterZoneID, _ := strconv.Atoi(r.URL.Query().Get("zone_id"))
	filterWardID, _ := strconv.Atoi(r.URL.Query().Get("ward_id"))
	filterShiftID, _ := strconv.Atoi(r.URL.Query().Get("shift_id"))
	filterRouteTypeID, _ := strconv.Atoi(r.URL.Query().Get("route_type_id"))
	filterRouteID, _ := strconv.Atoi(r.URL.Query().Get("route_id"))

	var filtered []interface{}
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, a := range assignments {
		// Apply filters
		if filterZoneID > 0 && a.ZoneID != filterZoneID {
			continue
		}
		if filterWardID > 0 && a.WardID != filterWardID {
			continue
		}
		if filterShiftID > 0 && a.ShiftID != filterShiftID {
			continue
		}
		if filterRouteTypeID > 0 && a.RouteTypeID != filterRouteTypeID {
			continue
		}
		if filterRouteID > 0 && a.RouteID != filterRouteID {
			continue
		}

		wg.Add(1)
		go func(a repository.CoverageReportRow) {
			defer wg.Done()

			// Calculate Coverage
			cps, err := h.routeRepo.GetCheckpointsByRoute(ctx, a.RouteID)
			if err != nil {
				return
			}

			a.TotalCheckpoints = len(cps)
			if a.TotalCheckpoints == 0 {
				a.CoveredPercentage = 0
				a.InOrderPercentage = 0
				mu.Lock()
				filtered = append(filtered, a)
				mu.Unlock()
				return
			}

			// Check existing logs first
			logs, err := h.routeRepo.GetCoverageHitLogs(ctx, a.VehicleID, a.RouteID, a.Date)
			if err == nil {
				uniqueHits := make(map[int]bool)
				for _, log := range logs {
					uniqueHits[log.CheckpointID] = true
				}
				
				// If we already have 100% coverage, completely skip the heavy recalculation step!
				if len(uniqueHits) == a.TotalCheckpoints {
					a.CoveredPercentage = 100
					inOrderHits := 0
					lastSeq := -1
					for _, log := range logs {
						if log.SequenceOrder > lastSeq {
							inOrderHits++
							lastSeq = log.SequenceOrder
						}
					}
					if inOrderHits > a.TotalCheckpoints {
						inOrderHits = a.TotalCheckpoints
					}
					a.InOrderPercentage = math.Round((float64(inOrderHits) / float64(a.TotalCheckpoints)) * 100)
					
					mu.Lock()
					filtered = append(filtered, a)
					mu.Unlock()
					return
				}
			}

			// --- Retroactively calculate missing coverage if not 100% ---
			recalculateCoverage(ctx, h.gpsRepo, h.routeRepo, a.VehicleID, a.RouteID, a.Date)
			// -------------------------------------------------------------------

			logs, err = h.routeRepo.GetCoverageHitLogs(ctx, a.VehicleID, a.RouteID, a.Date)
			if err != nil {
				return
			}

			uniqueHits := make(map[int]bool)
			for _, log := range logs {
				uniqueHits[log.CheckpointID] = true
			}
			a.CoveredPercentage = math.Round((float64(len(uniqueHits)) / float64(a.TotalCheckpoints)) * 100)

			// Calculate In-Order coverage
			inOrderHits := 0
			lastSeq := -1

			for _, log := range logs {
				if log.SequenceOrder > lastSeq {
					inOrderHits++
					lastSeq = log.SequenceOrder
				}
			}

			if inOrderHits > a.TotalCheckpoints {
				inOrderHits = a.TotalCheckpoints
			}

			a.InOrderPercentage = math.Round((float64(inOrderHits) / float64(a.TotalCheckpoints)) * 100)
			
			mu.Lock()
			filtered = append(filtered, a)
			mu.Unlock()
		}(a)
	}

	wg.Wait()

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    filtered,
	})
}

func recalculateCoverage(ctx context.Context, gpsRepo *repository.GPSRepository, routeRepo *repository.RouteRepository, vehicleID int, routeID int, dateStr string) {
	// Parse date
	dayStart, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return
	}
	dayEnd := dayStart.Add(24 * time.Hour)

	// Fetch historical GPS data
	gpsData, err := gpsRepo.GetByVehicle(ctx, vehicleID, dayStart, dayEnd)
	if err != nil || len(gpsData) == 0 {
		return
	}

	// Fetch checkpoints
	checkpoints, err := routeRepo.GetCheckpointsByRoute(ctx, routeID)
	if err != nil || len(checkpoints) == 0 {
		return
	}

	visited := make(map[int]bool)

	// To optimize DB calls, we first check what was already hit
	existingLogs, _ := routeRepo.GetCoverageHitLogs(ctx, vehicleID, routeID, dateStr)
	for _, l := range existingLogs {
		visited[l.CheckpointID] = true
	}

	// Iterate through GPS points chronologically
	for _, pt := range gpsData {
		for _, cp := range checkpoints {
			if visited[cp.ID] {
				continue
			}

			distKm := utils.Haversine(pt.Lat, pt.Lng, cp.Latitude, cp.Longitude)
			distMeters := distKm * 1000.0

			// Force exactly 10 meters radius tolerance
			tolerance := 10.0
			if distMeters <= tolerance {
				visited[cp.ID] = true
				err := routeRepo.LogCheckpointHit(ctx, vehicleID, routeID, cp.ID, pt.Time)
				if err != nil {
					log.Error().Err(err).Msg("Failed to backfill checkpoint hit")
				}
			}
		}
	}
}
