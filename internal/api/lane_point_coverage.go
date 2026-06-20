package api

import (
	"context"
	"math"
	"time"

	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/utils"
)

type LanePointStatus string

const (
	StatusPending  LanePointStatus = "pending"
	StatusAchieved LanePointStatus = "achieved"
	StatusMissed   LanePointStatus = "missed"
)

type LanePoint struct {
	ID             int     `json:"id"`
	RouteID        int     `json:"route_id"`
	SequenceNumber int     `json:"sequence_number"`
	Latitude       float64 `json:"latitude"`
	Longitude      float64 `json:"longitude"`
}

type GPSCoord struct {
	Lat  float64   `json:"lat"`
	Lng  float64   `json:"lng"`
	Time time.Time `json:"time"`
}

type CoverageState struct {
	Points            []LanePoint       `json:"points"`
	Statuses          []LanePointStatus `json:"statuses"`
	LastAchievedIdx   int               `json:"last_achieved_idx"`
	ViolationOccurred bool              `json:"violation_occurred"`
	HitTimes          []*time.Time      `json:"hit_times"`
}

// haversineMeters returns great-circle distance in meters between two points
func haversineMeters(lat1, lng1, lat2, lng2 float64) float64 {
	const R = 6371000 // Earth radius in meters
	phi1 := lat1 * math.Pi / 180
	phi2 := lat2 * math.Pi / 180
	dphi := (lat2 - lat1) * math.Pi / 180
	dlnd := (lng2 - lng1) * math.Pi / 180

	a := math.Sin(dphi/2)*math.Sin(dphi/2) +
		math.Cos(phi1)*math.Cos(phi2)*
			math.Sin(dlnd/2)*math.Sin(dlnd/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

// ValidateSequential runs a pure sequential validation scan of GPS path coordinates
// against the ordered lane points.
func ValidateSequential(points []LanePoint, gpsPath []GPSCoord, proximityMeters float64) CoverageState {
	statuses := make([]LanePointStatus, len(points))
	hitTimes := make([]*time.Time, len(points))
	for i := range statuses {
		statuses[i] = StatusPending
	}

	state := CoverageState{
		Points:            points,
		Statuses:          statuses,
		LastAchievedIdx:   -1,
		ViolationOccurred: false,
		HitTimes:          hitTimes,
	}

	if len(points) == 0 || len(gpsPath) == 0 {
		return state
	}

	for _, gps := range gpsPath {
		// Skip invalid coordinates
		if !math.IsNaN(gps.Lat) && !math.IsNaN(gps.Lng) && !math.IsInf(gps.Lat, 0) && !math.IsInf(gps.Lng, 0) {
			if gps.Lat == 0.0 && gps.Lng == 0.0 {
				continue
			}
		} else {
			continue
		}

		nextExpectedIdx := state.LastAchievedIdx + 1
		if nextExpectedIdx < len(points) {
			nextCp := points[nextExpectedIdx]
			dist := haversineMeters(gps.Lat, gps.Lng, nextCp.Latitude, nextCp.Longitude)
			if dist <= proximityMeters {
				state.Statuses[nextExpectedIdx] = StatusAchieved
				t := gps.Time
				state.HitTimes[nextExpectedIdx] = &t
				state.LastAchievedIdx = nextExpectedIdx
				continue
			}

			// Scan for out-of-order hits in subsequent points
			hitSubsequent := false
			for j := nextExpectedIdx + 1; j < len(points); j++ {
				cp := points[j]
				d := haversineMeters(gps.Lat, gps.Lng, cp.Latitude, cp.Longitude)
				if d <= proximityMeters {
					// Violation occurred!
					state.ViolationOccurred = true
					// Mark all skipped points as missed
					for k := nextExpectedIdx; k < j; k++ {
						state.Statuses[k] = StatusMissed
					}
					// Mark the reached point as achieved
					state.Statuses[j] = StatusAchieved
					t := gps.Time
					state.HitTimes[j] = &t
					state.LastAchievedIdx = j
					hitSubsequent = true
					break
				}
			}

			if hitSubsequent {
				continue
			}
		}
	}

	return state
}

// ValidateNonSequential runs a non-sequential validation scan of GPS path coordinates
// against the lane points, crediting hits in any order.
func ValidateNonSequential(points []LanePoint, gpsPath []GPSCoord, proximityMeters float64) CoverageState {
	statuses := make([]LanePointStatus, len(points))
	hitTimes := make([]*time.Time, len(points))
	for i := range statuses {
		statuses[i] = StatusPending
	}

	state := CoverageState{
		Points:            points,
		Statuses:          statuses,
		LastAchievedIdx:   -1,
		ViolationOccurred: false,
		HitTimes:          hitTimes,
	}

	if len(points) == 0 || len(gpsPath) == 0 {
		return state
	}

	for i, cp := range points {
		var hitTime *time.Time
		for _, gps := range gpsPath {
			if math.IsNaN(gps.Lat) || math.IsNaN(gps.Lng) || math.IsInf(gps.Lat, 0) || math.IsInf(gps.Lng, 0) || (gps.Lat == 0.0 && gps.Lng == 0.0) {
				continue
			}
			dist := haversineMeters(gps.Lat, gps.Lng, cp.Latitude, cp.Longitude)
			if dist <= proximityMeters {
				t := gps.Time
				if hitTime == nil || t.Before(*hitTime) {
					hitTime = &t
				}
			}
		}
		if hitTime != nil {
			state.Statuses[i] = StatusAchieved
			state.HitTimes[i] = hitTime
		} else {
			state.Statuses[i] = StatusMissed
		}
	}

	return state
}


// RecalculateLanePointCoverage recalculates sequential lane point coverage for a vehicle,
// route, and date and upserts the logs into the database.
func RecalculateLanePointCoverage(
	ctx context.Context,
	gpsRepo *repository.GPSRepository,
	routeRepo *repository.RouteRepository,
	vehicleID int,
	routeID int,
	dateStr string,
	proximityMeters float64,
) error {
	dayStart, err := time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation)
	if err != nil {
		return err
	}
	dayEnd := dayStart.Add(24 * time.Hour)

	// Fetch lane points
	dbPoints, err := routeRepo.GetLanePointsByRoute(ctx, routeID)
	if err != nil {
		return err
	}

	if len(dbPoints) == 0 {
		return nil
	}

	// Fetch if route is sequential
	var isSequential bool
	err = gpsRepo.Pool().QueryRow(ctx, "SELECT COALESCE(is_sequential, false) FROM routes WHERE id = $1", routeID).Scan(&isSequential)
	if err != nil {
		isSequential = false
	}


	// Map to LanePoint struct
	points := make([]LanePoint, len(dbPoints))
	for i, p := range dbPoints {
		points[i] = LanePoint{
			ID:             p.ID,
			RouteID:        p.RouteID,
			SequenceNumber: p.SequenceNumber,
			Latitude:       p.Latitude,
			Longitude:      p.Longitude,
		}
	}

	// Fetch historical GPS data
	gpsData, err := gpsRepo.GetByVehicle(ctx, vehicleID, dayStart, dayEnd)
	if err != nil {
		return err
	}

	var logs []repository.VehicleLanePointLog

	if len(gpsData) > 0 {
		// Smooth GPS data (package-visible from report_handlers.go)
		gpsData = smoothGpsData(gpsData)

		var cleanedGps []decoder.AVLData
		for _, p := range gpsData {
			if p.Lat != 0.0 && p.Lng != 0.0 {
				cleanedGps = append(cleanedGps, p)
			}
		}

		gpsPath := make([]GPSCoord, len(cleanedGps))
		for i, p := range cleanedGps {
			gpsPath[i] = GPSCoord{
				Lat:  p.Lat,
				Lng:  p.Lng,
				Time: p.Time,
			}
		}

		// Run validation based on route sequential configuration
		var state CoverageState
		if isSequential {
			state = ValidateSequential(points, gpsPath, proximityMeters)
		} else {
			state = ValidateNonSequential(points, gpsPath, proximityMeters)
		}

		// Check if completed
		var completedAt *time.Time
		if state.LastAchievedIdx == len(points)-1 && !state.ViolationOccurred {
			completedAt = state.HitTimes[len(points)-1]
		}

		logs = make([]repository.VehicleLanePointLog, len(points))
		for i := range points {
			logs[i] = repository.VehicleLanePointLog{
				VehicleID:         vehicleID,
				RouteID:           routeID,
				LanePointID:       points[i].ID,
				ReportDate:        dateStr,
				Status:            string(state.Statuses[i]),
				HitTime:           state.HitTimes[i],
				ViolationOccurred: state.ViolationOccurred,
				CompletedAt:       completedAt,
			}
		}
	} else {
		// No GPS data -> all pending
		logs = make([]repository.VehicleLanePointLog, len(points))
		for i := range points {
			logs[i] = repository.VehicleLanePointLog{
				VehicleID:         vehicleID,
				RouteID:           routeID,
				LanePointID:       points[i].ID,
				ReportDate:        dateStr,
				Status:            string(StatusPending),
				HitTime:           nil,
				ViolationOccurred: false,
				CompletedAt:       nil,
			}
		}
	}

	// Upsert to DB
	return routeRepo.UpsertVehicleLanePointLogs(ctx, logs)
}
