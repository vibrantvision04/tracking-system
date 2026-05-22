package service

import (
	"context"
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
	
	// In-memory cache for fast geofence lookups to avoid DB hit per GPS ping
	mu              sync.RWMutex
	assignments     map[int]int // vehicleID -> routeID
	routeCheckpoints map[int][]repository.RouteCheckpoint // routeID -> checkpoints
	visited         map[int]map[int]bool // vehicleID -> checkpointID -> visited today
	onRoute         map[int]bool         // vehicleID -> is currently actively on route
	
	lastRefresh time.Time
}

func NewRouteEngine(routeRepo *repository.RouteRepository, vehicleRepo *repository.VehicleRepository) *RouteEngine {
	return &RouteEngine{
		routeRepo:        routeRepo,
		vehicleRepo:      vehicleRepo,
		assignments:      make(map[int]int),
		routeCheckpoints: make(map[int][]repository.RouteCheckpoint),
		visited:          make(map[int]map[int]bool),
		onRoute:          make(map[int]bool),
		lastRefresh:      time.Now(),
	}
}

// Process checks a new GPS point against assigned route checkpoints
func (e *RouteEngine) Process(data decoder.AVLData) {
	// Look up Vehicle ID first
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	
	vehicle, err := e.vehicleRepo.GetByIMEI(ctx, data.IMEI)
	if err != nil || vehicle == nil {
		return // Unknown vehicle
	}
	vehicleID := vehicle.ID
	
	// If the cache is old, this might be a new day or missed an assignment, 
	// ideally we reload the cache periodically or via pub/sub. 
	// For simplicity, let's do a basic time-based eviction or just fetch on demand if missing.
	
	e.mu.RLock()
	routeID, hasAssignedRoute := e.assignments[vehicleID]
	e.mu.RUnlock()

	if !hasAssignedRoute {
		// Try fetching from DB once if missing
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		
		today := time.Now().Truncate(24 * time.Hour)
		assignment, err := e.routeRepo.GetAssignedRoute(ctx, vehicleID, today)
		if err != nil || assignment == nil {
			return // No route assigned today
		}
		
		routeID = assignment.RouteID
		
		// Load checkpoints
		checkpoints, _ := e.routeRepo.GetCheckpointsByRoute(ctx, routeID)
		
		// Load visited
		visitedIDs, _ := e.routeRepo.GetVisitedCheckpoints(ctx, vehicleID, routeID, today)
		visitedMap := make(map[int]bool)
		for _, vid := range visitedIDs {
			visitedMap[vid] = true
		}
		
		e.mu.Lock()
		e.assignments[vehicleID] = routeID
		e.routeCheckpoints[routeID] = checkpoints
		e.visited[vehicleID] = visitedMap
		e.mu.Unlock()
	}

	e.mu.RLock()
	checkpoints := e.routeCheckpoints[routeID]
	visitedMap := e.visited[vehicleID]
	isActive := e.onRoute[vehicleID]
	e.mu.RUnlock()

	if len(checkpoints) == 0 {
		return
	}

	minDist := 9999999.0
	anyHitNow := false

	for _, cp := range checkpoints {
		// Haversine returns distance in km, convert to meters
		distKm := utils.Haversine(data.Lat, data.Lng, cp.Latitude, cp.Longitude)
		distMeters := distKm * 1000.0

		if distMeters < minDist {
			minDist = distMeters
		}

		// Hit radius is enforced at 20 meters
		if distMeters <= 20.0 {
			anyHitNow = true
			if !visitedMap[cp.ID] {
				// Hit!
				log.Info().Int("vehicle_id", vehicleID).Int("checkpoint_id", cp.ID).Msg("Checkpoint hit!")
				
				// Save to DB asynchronously
				go func(vID, rID, cID int, t time.Time) {
					ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
					defer cancel()
					if err := e.routeRepo.LogCheckpointHit(ctx, vID, rID, cID, t); err != nil {
						log.Error().Err(err).Msg("Failed to log checkpoint hit")
					}
				}(vehicleID, routeID, cp.ID, time.Now())
				
				// Update in-memory
				e.mu.Lock()
				if e.visited[vehicleID] == nil {
					e.visited[vehicleID] = make(map[int]bool)
				}
				e.visited[vehicleID][cp.ID] = true
				e.mu.Unlock()
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

	// Check for speed alert while on route (Max 3 km/h)
	if newActiveStatus && data.Speed > 3.0 {
		log.Warn().Int("vehicle_id", vehicleID).Float64("speed", data.Speed).Msg("Route Speed Limit Exceeded ( > 3 km/h)")
		// TODO: Trigger actual alert in DB or PubSub here if needed, but logging for now
	}
}

// RefreshCache can be called via API when an assignment changes
func (e *RouteEngine) RefreshCache() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.assignments = make(map[int]int)
	e.visited = make(map[int]map[int]bool)
	e.onRoute = make(map[int]bool)
}
