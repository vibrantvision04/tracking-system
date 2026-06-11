package service

import (
	"context"
	"math"
	"sync"
	"time"

	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/utils"

	"github.com/rs/zerolog/log"
)

type RouteEngine struct {
	routeRepo   *repository.RouteRepository
	vehicleRepo *repository.VehicleRepository

	RequireSequentialCheckpoints bool
	MaxCheckpointSpeedKmh        float64

	// In-memory cache for fast geofence lookups to avoid DB hit per GPS ping
	mu               sync.RWMutex
	shifts           []repository.Shift                   // cache of all shifts
	assignments      map[int]int                          // compositeKey (vehicleID * 1000 + shiftID) -> routeID
	routeCheckpoints map[int][]repository.RouteCheckpoint // routeID -> checkpoints
	visited          map[int]map[int]bool                 // vehicleID -> checkpointID -> visited today
	onRoute          map[int]bool                         // vehicleID -> is currently actively on route
	lastPositions    map[int]decoder.AVLData              // vehicleID -> last processed coordinate
	imeiVehicles     map[string]*repository.Vehicle       // imei -> vehicle metadata cache (nil indicates unassigned/unknown device)

	lastRefresh time.Time
}

func NewRouteEngine(routeRepo *repository.RouteRepository, vehicleRepo *repository.VehicleRepository, requireSequentialCheckpoints bool, maxCheckpointSpeedKmh float64) *RouteEngine {
	return &RouteEngine{
		routeRepo:                    routeRepo,
		vehicleRepo:                  vehicleRepo,
		RequireSequentialCheckpoints: requireSequentialCheckpoints,
		MaxCheckpointSpeedKmh:        maxCheckpointSpeedKmh,
		assignments:                  make(map[int]int),
		routeCheckpoints:             make(map[int][]repository.RouteCheckpoint),
		visited:                      make(map[int]map[int]bool),
		onRoute:                      make(map[int]bool),
		lastPositions:                make(map[int]decoder.AVLData),
		imeiVehicles:                 make(map[string]*repository.Vehicle),
		lastRefresh:                  time.Now(),
	}
}

func (e *RouteEngine) getShiftIDForTime(t time.Time) int {
	localTimeStr := t.In(utils.IndianLocation).Format("15:04:05")
	e.mu.RLock()
	shiftsCopy := make([]repository.Shift, len(e.shifts))
	copy(shiftsCopy, e.shifts)
	e.mu.RUnlock()

	for _, s := range shiftsCopy {
		if !s.IsActive {
			continue
		}
		start := s.StartTime
		end := s.EndTime
		if start == "" || end == "" {
			continue
		}
		if start <= end {
			if localTimeStr >= start && localTimeStr <= end {
				return s.ID
			}
		} else {
			if localTimeStr >= start || localTimeStr <= end {
				return s.ID
			}
		}
	}
	return 0
}

// Process checks a new GPS point against assigned route checkpoints
func (e *RouteEngine) Process(data decoder.AVLData) {
	if data.Lat == 0.0 || data.Lng == 0.0 {
		return // Ignore invalid coordinates
	}
	if data.Speed > 120.0 {
		return // Ignore extreme outlier jumps
	}

	// 1. Look up Vehicle ID in memory cache first
	e.mu.RLock()
	vehicle, hasVehicle := e.imeiVehicles[data.IMEI]
	e.mu.RUnlock()

	if !hasVehicle {
		// Cache miss: Load from DB once
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		var err error
		vehicle, err = e.vehicleRepo.GetByIMEI(ctx, data.IMEI)
		if err != nil {
			log.Error().Err(err).Str("imei", data.IMEI).Msg("Failed to fetch vehicle by IMEI inside RouteEngine")
		}
		
		e.mu.Lock()
		// Cache the result even if nil to prevent database query stampede for unrecognized/unassigned IMEIs
		e.imeiVehicles[data.IMEI] = vehicle
		e.mu.Unlock()
	}

	if vehicle == nil {
		return // Unknown vehicle or unassigned device, bypass geofence check safely!
	}
	vehicleID := vehicle.ID

	// Find current shift based on packet time
	shiftID := e.getShiftIDForTime(data.Time)
	if shiftID == 0 {
		shiftID = 1 // default/fallback to shift 1
	}
	compositeKey := vehicleID*1000 + shiftID

	// 2. Look up assigned route in cache (0 indicates no route assigned today)
	e.mu.RLock()
	routeID, hasAssignedRoute := e.assignments[compositeKey]
	e.mu.RUnlock()

	if !hasAssignedRoute {
		// Try fetching from DB once if missing
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		today := time.Now().Truncate(24 * time.Hour)
		assignment, err := e.routeRepo.GetAssignedRoute(ctx, vehicleID, today, &shiftID, nil)
		
		e.mu.Lock()
		if err != nil || assignment == nil {
			// Cache the negative result (0) to avoid hitting database on every subsequent ping today
			e.assignments[compositeKey] = 0
			e.mu.Unlock()
			return
		}

		routeID = assignment.RouteID
		e.assignments[compositeKey] = routeID

		// Load checkpoints
		checkpoints, _ := e.routeRepo.GetCheckpointsByRoute(ctx, routeID)
		e.routeCheckpoints[routeID] = checkpoints

		// Load visited
		visitedIDs, _ := e.routeRepo.GetVisitedCheckpoints(ctx, vehicleID, routeID, today)
		visitedMap := make(map[int]bool)
		for _, vid := range visitedIDs {
			visitedMap[vid] = true
		}
		e.visited[vehicleID] = visitedMap
		e.mu.Unlock()
	}

	if routeID == 0 {
		return // Vehicle has no active route assigned today, bypass geofence check!
	}

	e.mu.RLock()
	routeCheckpoints := e.routeCheckpoints[routeID]
	visitedMap := e.visited[vehicleID]
	isActive := e.onRoute[vehicleID]
	lastPos, hasLastPos := e.lastPositions[vehicleID]
	e.mu.RUnlock()

	if len(routeCheckpoints) == 0 {
		return
	}

	minDist := 9999999.0
	anyHitNow := false

	// Determine the next expected checkpoint in sequence
	var nextExpectedCP *repository.RouteCheckpoint
	for i := range routeCheckpoints {
		if !visitedMap[routeCheckpoints[i].ID] {
			nextExpectedCP = &routeCheckpoints[i]
			break
		}
	}

	for _, cp := range routeCheckpoints {
		// Haversine returns distance in km, convert to meters
		distKm := utils.Haversine(data.Lat, data.Lng, cp.Latitude, cp.Longitude)
		distMetersPoint := distKm * 1000.0

		// Segment based matching if we have a previous ping from today
		distMeters := distMetersPoint
		if hasLastPos {
			timeDiffSec := data.Time.Sub(lastPos.Time).Seconds()
			distBetweenPings := utils.Haversine(lastPos.Lat, lastPos.Lng, data.Lat, data.Lng) * 1000.0

			// Only check segment if pings are close in time (60s) and space (200m) to avoid ghost jumps
			if timeDiffSec <= 60.0 && distBetweenPings <= 200.0 {
				distMeters = distanceToSegment(cp.Latitude, cp.Longitude, lastPos.Lat, lastPos.Lng, data.Lat, data.Lng)
			}
		}

		if distMeters < minDist {
			minDist = distMeters
		}

		// Use the actual checkpoint radius
		tolerance := 10.0 // Always 10 meters for all checkpoints
		if distMeters <= tolerance {
			anyHitNow = true
			if !visitedMap[cp.ID] {
				// Speed validation: must be <= MaxCheckpointSpeedKmh
				if data.Speed > e.MaxCheckpointSpeedKmh {
					log.Warn().
						Int("vehicle_id", vehicleID).
						Int("checkpoint_id", cp.ID).
						Float64("speed", data.Speed).
						Msgf("Checkpoint skipped: Speed Limit Exceeded ( > %f km/h)", e.MaxCheckpointSpeedKmh)
					continue
				}

				// Sequential validation: must be the next expected checkpoint if enabled
				if e.RequireSequentialCheckpoints && nextExpectedCP != nil && cp.ID != nextExpectedCP.ID {
					log.Warn().
						Int("vehicle_id", vehicleID).
						Int("checkpoint_id", cp.ID).
						Int("expected_checkpoint_id", nextExpectedCP.ID).
						Msg("Checkpoint skipped: Out of sequence")
					continue
				}

				// Hit!
				log.Info().Int("vehicle_id", vehicleID).Int("checkpoint_id", cp.ID).Msg("Checkpoint hit!")

				// Save to DB asynchronously
				go func(vID, rID, cID int, t time.Time) {
					ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
					defer cancel()
					if err := e.routeRepo.LogCheckpointHit(ctx, vID, rID, cID, t); err != nil {
						log.Error().Err(err).Msg("Failed to log checkpoint hit")
					}
				}(vehicleID, routeID, cp.ID, data.Time)

				// Update in-memory
				e.mu.Lock()
				if e.visited[vehicleID] == nil {
					e.visited[vehicleID] = make(map[int]bool)
				}
				e.visited[vehicleID][cp.ID] = true
				e.mu.Unlock()
				
				// Since we hit the expected one, we could advance nextExpectedCP,
				// but breaking/continuing is fine since we only want one hit per GPS ping anyway.
				nextExpectedCP = nil // Prevent hitting multiple in one ping just in case
			}
		}
	}

	// Update on-route status
	newActiveStatus := isActive
	if anyHitNow {
		newActiveStatus = true
	} else if minDist > 100.0 {
		newActiveStatus = false
	}

	if newActiveStatus != isActive {
		e.mu.Lock()
		e.onRoute[vehicleID] = newActiveStatus
		e.mu.Unlock()
	}

	// Update last position processed
	e.mu.Lock()
	e.lastPositions[vehicleID] = data
	e.mu.Unlock()
}

// RefreshCache can be called via API when an assignment changes
func (e *RouteEngine) RefreshCache() {
	e.mu.Lock()
	e.assignments = make(map[int]int)
	e.visited = make(map[int]map[int]bool)
	e.onRoute = make(map[int]bool)
	e.lastPositions = make(map[int]decoder.AVLData)
	e.imeiVehicles = make(map[string]*repository.Vehicle)
	e.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	shifts, err := e.routeRepo.GetShifts(ctx)
	if err == nil {
		e.mu.Lock()
		e.shifts = shifts
		e.mu.Unlock()
	}
}

func distanceToSegment(pLat, pLng, aLat, aLng, bLat, bLng float64) float64 {
	if aLat == bLat && aLng == bLng {
		return utils.Haversine(pLat, pLng, aLat, aLng) * 1000.0
	}

	latMid := ((aLat + bLat) / 2.0) * math.Pi / 180.0
	kx := math.Cos(latMid)

	bx := (bLng - aLng) * kx
	by := bLat - aLat
	px := (pLng - aLng) * kx
	py := pLat - aLat

	segmentLenSq := bx*bx + by*by
	if segmentLenSq == 0 {
		return utils.Haversine(pLat, pLng, aLat, aLng) * 1000.0
	}

	t := (px*bx + py*by) / segmentLenSq
	if t < 0.0 {
		t = 0.0
	} else if t > 1.0 {
		t = 1.0
	}

	cLat := aLat + t*(bLat-aLat)
	cLng := aLng + t*(bLng-aLng)

	return utils.Haversine(pLat, pLng, cLat, cLng) * 1000.0
}

func (e *RouteEngine) GetCachedVehicle(imei string) *repository.Vehicle {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.imeiVehicles[imei]
}

func (e *RouteEngine) IsOnAssignedRoute(vehicleID int, data decoder.AVLData) bool {
	// Find current shift based on packet time
	shiftID := e.getShiftIDForTime(data.Time)
	if shiftID == 0 {
		shiftID = 1 // default fallback
	}
	compositeKey := vehicleID*1000 + shiftID

	// 1. Look up assigned route in cache
	e.mu.RLock()
	routeID, hasAssignedRoute := e.assignments[compositeKey]
	e.mu.RUnlock()

	if !hasAssignedRoute {
		// Try fetching from DB once if missing
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		today := time.Now().Truncate(24 * time.Hour)
		assignment, err := e.routeRepo.GetAssignedRoute(ctx, vehicleID, today, &shiftID, nil)
		
		e.mu.Lock()
		if err != nil || assignment == nil {
			e.assignments[compositeKey] = 0
			e.mu.Unlock()
			return false
		}
		routeID = assignment.RouteID
		e.assignments[compositeKey] = routeID

		// Load checkpoints
		checkpoints, _ := e.routeRepo.GetCheckpointsByRoute(ctx, routeID)
		e.routeCheckpoints[routeID] = checkpoints
		e.mu.Unlock()
	}

	if routeID == 0 {
		return false // No active route assigned today
	}

	e.mu.RLock()
	routeCheckpoints := e.routeCheckpoints[routeID]
	lastPos, hasLastPos := e.lastPositions[vehicleID]
	e.mu.RUnlock()

	if len(routeCheckpoints) == 0 {
		// If route is assigned but has no checkpoints, treat it as on-route to prevent false suppression
		return true
	}

	// Calculate distance to checkpoints or line segments (using 100 meters tolerance)
	for _, cp := range routeCheckpoints {
		distKm := utils.Haversine(data.Lat, data.Lng, cp.Latitude, cp.Longitude)
		if distKm*1000.0 <= 100.0 {
			return true
		}
	}

	if hasLastPos {
		for _, cp := range routeCheckpoints {
			distMeters := distanceToSegment(cp.Latitude, cp.Longitude, lastPos.Lat, lastPos.Lng, data.Lat, data.Lng)
			if distMeters <= 100.0 {
				return true
			}
		}
	}

	return false
}
