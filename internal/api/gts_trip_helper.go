package api

import (
	"fmt"
	"time"

	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/geofence"
	"gps-tracking-system/internal/utils"
)

type TransferStationInfo struct {
	ID            int
	Name          string
	DumpZoneLat   float64
	DumpZoneLng   float64
	DumpZoneRad   float64
	EntryLat      float64
	EntryLng      float64
	ExitLat       float64
	ExitLng       float64
	PolygonPoints []geofence.Point
}

type RouteCheckpointInfo struct {
	ID             int
	Latitude       float64
	Longitude      float64
	RadiusMeters   float64
	SequenceOrder  int
}

// CalculateValidatedGTSTrips runs the chronological state-machine validation engine
// to determine the number of valid GTS (transfer station) trips from GPS data.
func CalculateValidatedGTSTrips(
	gpsData []decoder.AVLData,
	wardPolygonPoints []geofence.Point,
	checkpoints []RouteCheckpointInfo,
	transferStations []TransferStationInfo,
) (int, int, []string) {
	tripCount := 0
	rejectedCount := 0
	var rejectionReasons []string
	eligibleForDump := false
	var cooldownUntil *time.Time
	var lastInsideWardTime *time.Time
	var insideWardDuration time.Duration

	// Route activity state
	laneCheckpointsValidated := make(map[int]bool)
	routeDistanceCovered := 0.0

	// Transfer station session state
	sessionActive := false
	var sessionIgnitionOnStartTime *time.Time
	var sessionMaxContinuousIgnitionOnTime time.Duration
	var sessionMaxSpeed float64
	sessionTouchedDump := false
	sessionTSID := 0
	var sessionStartTime *time.Time

	var prevPt *decoder.AVLData

	for idx, pt := range gpsData {
		isLastPoint := idx == len(gpsData)-1
		cooldownComplete := cooldownUntil == nil || pt.Time.After(*cooldownUntil) || pt.Time.Equal(*cooldownUntil)

		// --- WARD STAY TIME VALIDATION ---
		isInsideWard := false
		if len(wardPolygonPoints) > 0 {
			isInsideWard = geofence.PointInPolygon(geofence.Point{Lat: pt.Lat, Lng: pt.Lng}, wardPolygonPoints)
		} else {
			isInsideWard = true
		}

		if isInsideWard {
			if lastInsideWardTime != nil {
				diff := pt.Time.Sub(*lastInsideWardTime)
				if diff < 15*time.Minute {
					insideWardDuration += diff
				}
			}
			t := pt.Time
			lastInsideWardTime = &t
		} else {
			lastInsideWardTime = nil
		}

		// Check if within any checkpoint
		for _, cp := range checkpoints {
			distToCP := utils.Haversine(pt.Lat, pt.Lng, cp.Latitude, cp.Longitude) * 1000.0
			if distToCP <= cp.RadiusMeters {
				laneCheckpointsValidated[cp.ID] = true
			}
		}

		// Calculate route distance covered
		if pt.Speed > 3.0 && prevPt != nil {
			dist := utils.Haversine(prevPt.Lat, prevPt.Lng, pt.Lat, pt.Lng)
			if isInsideWard {
				routeDistanceCovered += dist
			}
		}

		// --- ELIGIBILITY EVALUATION ---
		wardTimeSatisfied := insideWardDuration >= 10*time.Minute
		routeActivitySatisfied := false

		if len(checkpoints) > 0 {
			if len(laneCheckpointsValidated) >= 1 {
				routeActivitySatisfied = true
				wardTimeSatisfied = true
			} else {
				routeActivitySatisfied = routeDistanceCovered > 0
			}
		} else {
			routeActivitySatisfied = routeDistanceCovered > 0
		}

		if tripCount == 0 {
			if wardTimeSatisfied && routeActivitySatisfied {
				eligibleForDump = true
			}
		} else {
			if cooldownComplete && wardTimeSatisfied && routeActivitySatisfied {
				eligibleForDump = true
			}
		}

		// --- TRANSFER STATION SESSION TRACKING ---
		var enteredTS *TransferStationInfo
		for _, ts := range transferStations {
			if len(ts.PolygonPoints) > 0 {
				if geofence.PointInPolygon(geofence.Point{Lat: pt.Lat, Lng: pt.Lng}, ts.PolygonPoints) {
					enteredTS = &ts
					break
				}
			}
		}

		if !sessionActive && enteredTS != nil {
			sessionActive = true
			sessionMaxSpeed = pt.Speed
			sessionTouchedDump = false
			sessionMaxContinuousIgnitionOnTime = 0
			sessionTSID = enteredTS.ID
			tStart := pt.Time
			sessionStartTime = &tStart
			if pt.Ignition {
				t := pt.Time
				sessionIgnitionOnStartTime = &t
			} else {
				sessionIgnitionOnStartTime = nil
			}
		}

		if sessionActive {
			stillInTS := enteredTS != nil && enteredTS.ID == sessionTSID

			if stillInTS {
				if pt.Speed > sessionMaxSpeed {
					sessionMaxSpeed = pt.Speed
				}
				
				if pt.Ignition {
					if sessionIgnitionOnStartTime == nil {
						t := pt.Time
						sessionIgnitionOnStartTime = &t
					} else {
						currentDuration := pt.Time.Sub(*sessionIgnitionOnStartTime)
						if currentDuration > sessionMaxContinuousIgnitionOnTime {
							sessionMaxContinuousIgnitionOnTime = currentDuration
						}
					}
				} else {
					if sessionIgnitionOnStartTime != nil {
						stretchDuration := pt.Time.Sub(*sessionIgnitionOnStartTime)
						if stretchDuration > sessionMaxContinuousIgnitionOnTime {
							sessionMaxContinuousIgnitionOnTime = stretchDuration
						}
						sessionIgnitionOnStartTime = nil
					}
				}

				for _, ts := range transferStations {
					if ts.ID == sessionTSID {
						distToDump := utils.Haversine(pt.Lat, pt.Lng, ts.DumpZoneLat, ts.DumpZoneLng) * 1000.0
						if distToDump <= ts.DumpZoneRad {
							sessionTouchedDump = true
						}
						break
					}
				}
			}

			if !stillInTS || isLastPoint {
				sessionActive = false
				
				if sessionIgnitionOnStartTime != nil {
					stretchDuration := pt.Time.Sub(*sessionIgnitionOnStartTime)
					if stretchDuration > sessionMaxContinuousIgnitionOnTime {
						sessionMaxContinuousIgnitionOnTime = stretchDuration
					}
				}

				minStayPassed := sessionMaxContinuousIgnitionOnTime >= 60*time.Second
				speedValid := true
				dumpZoneValid := sessionTouchedDump

				var sessionDuration time.Duration
				if sessionStartTime != nil {
					sessionDuration = pt.Time.Sub(*sessionStartTime)
				}

				if eligibleForDump && minStayPassed && speedValid && dumpZoneValid {
					tripCount++
					cooldownEnd := pt.Time.Add(20 * time.Minute)
					cooldownUntil = &cooldownEnd
					eligibleForDump = false
					insideWardDuration = 0
					routeDistanceCovered = 0.0
				} else {
					if !dumpZoneValid && sessionDuration < 2*time.Minute {
						// Ignored
					} else {
						rejectedCount++
						reasonStr := fmt.Sprintf("[%s] Rejected: ", pt.Time.Format("15:04"))
						var rList []string
						if !eligibleForDump {
							rList = append(rList, "Not eligible (ward stay < 10m or no route activity)")
						}
						if !minStayPassed {
							rList = append(rList, fmt.Sprintf("Ignition ON < 60s (was %ds)", int(sessionMaxContinuousIgnitionOnTime.Seconds())))
						}
						if !dumpZoneValid {
							rList = append(rList, "Didn't touch dump zone radius")
						}
						if len(rList) > 0 {
							reasonStr += rList[0]
							for i := 1; i < len(rList); i++ {
								reasonStr += ", " + rList[i]
							}
						} else {
							reasonStr += "Unknown reason"
						}
						rejectionReasons = append(rejectionReasons, reasonStr)
					}
				}
			}
		}

		currPt := pt
		prevPt = &currPt
	}

	return tripCount, rejectedCount, rejectionReasons
}
