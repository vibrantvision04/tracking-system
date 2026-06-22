package service

import (
	"context"
	"encoding/json"
	"math"
	"time"

	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/utils"
)

type AIReconstructionService struct {
	routeRepo *repository.RouteRepository
}

func NewAIReconstructionService(routeRepo *repository.RouteRepository) *AIReconstructionService {
	return &AIReconstructionService{routeRepo: routeRepo}
}

type GPSPoint struct {
	Lat       float64   `json:"lat"`
	Lng       float64   `json:"lng"`
	Time      time.Time `json:"time"`
	Speed     float64   `json:"speed"`
	Ignition  *bool     `json:"ignition"`
}

type ReconstructedPoint struct {
	Lat        float64   `json:"lat"`
	Lng        float64   `json:"lng"`
	Time       time.Time `json:"time"`
	Speed      float64   `json:"speed"`
	Ignition   *bool     `json:"ignition"`
	RouteIndex int       `json:"route_index"`
}

type Candidate struct {
	Index int     // index in roadCoords
	Dist  float64 // distance to GPS point in meters
}

// ReconstructRoute calculates the optimal map-matched route using Viterbi HMM.
func (s *AIReconstructionService) ReconstructRoute(ctx context.Context, routeID int, gpsPoints []GPSPoint) ([]ReconstructedPoint, float64, error) {
	if len(gpsPoints) == 0 {
		return []ReconstructedPoint{}, 100.0, nil
	}

	// 1. Fetch route details & planned coordinates
	route, err := s.routeRepo.GetRouteByID(ctx, routeID)
	if err != nil {
		return nil, 0, err
	}

	roadCoords := s.extractAndDensifyRoadCoords(route.GeoJSON)
	if len(roadCoords) == 0 {
		// Fallback to raw GPS points if route geometry is empty
		out := make([]ReconstructedPoint, len(gpsPoints))
		for i, p := range gpsPoints {
			out[i] = ReconstructedPoint{
				Lat:        p.Lat,
				Lng:        p.Lng,
				Time:       p.Time,
				Speed:      p.Speed,
				Ignition:   p.Ignition,
				RouteIndex: -1,
			}
		}
		return out, 100.0, nil
	}

	corridor := route.CorridorMeters
	if corridor <= 0 {
		corridor = 18.0 // default snaps to 18m corridor
	}
	if route.AggressiveSnapping {
		corridor = math.Max(corridor*2.0, 35.0)
	}

	sigma := 20.0 // noise variance
	beta := 10.0  // transition decay parameter

	switch route.GpsQualityMode {
	case "poor":
		sigma = 35.0
		beta = 20.0
	case "extremely_poor":
		sigma = 50.0
		beta = 35.0
	}

	// 2. Viterbi HMM setup

	// For each GPS point, find candidates in roadCoords
	lattice := make([][]Candidate, len(gpsPoints))
	for t, p := range gpsPoints {
		var candidates []Candidate
		var closestIdx int = -1
		closestDist := math.MaxFloat64

		for i, rc := range roadCoords {
			d := utils.Haversine(p.Lat, p.Lng, rc[0], rc[1]) * 1000.0
			if d < closestDist {
				closestDist = d
				closestIdx = i
			}
		}

		if closestDist <= corridor {
			for i, rc := range roadCoords {
				d := utils.Haversine(p.Lat, p.Lng, rc[0], rc[1]) * 1000.0
				if d <= corridor {
					candidates = append(candidates, Candidate{Index: i, Dist: d})
				}
			}
			// Fallback to closest point if no candidate falls in corridor
			if len(candidates) == 0 && closestIdx != -1 {
				candidates = []Candidate{{Index: closestIdx, Dist: closestDist}}
			}
			// Always include off-route candidate as a fallback option with a penalty distance.
			// This allows the HMM to stay off-route if the transition probability to on-route is poor.
			candidates = append(candidates, Candidate{Index: -1, Dist: corridor * 1.2})
		} else {
			// Vehicle went outside the corridor (outer route) -> do not snap, keep raw coordinate (Index = -1)
			// Consistently apply the off-route penalty distance to avoid free-pass bias.
			candidates = []Candidate{{Index: -1, Dist: corridor * 0.5}}
		}
		lattice[t] = candidates
	}

	// 4. Run Viterbi in bi-directional mode using road distance HMM transition matching
	optPathIdx, _ := s.runViterbi(gpsPoints, roadCoords, lattice, sigma, beta)

	// 5. Construct corrected trail and compute confidence
	reconstructed := make([]ReconstructedPoint, len(gpsPoints))
	var sumConfidence float64 = 0.0

	for t, p := range gpsPoints {
		matchedCandidate := lattice[t][optPathIdx[t]]
		var lat, lng float64
		if matchedCandidate.Index >= 0 {
			rc := roadCoords[matchedCandidate.Index]
			lat = rc[0]
			lng = rc[1]
		} else {
			lat = p.Lat
			lng = p.Lng
		}

		// Confidence = exp(-dist / 20.0) * 100
		confidence := math.Exp(-matchedCandidate.Dist/20.0) * 100.0
		sumConfidence += confidence

		reconstructed[t] = ReconstructedPoint{
			Lat:        lat,
			Lng:        lng,
			Time:       p.Time,
			Speed:      p.Speed,
			Ignition:   p.Ignition,
			RouteIndex: matchedCandidate.Index,
		}
	}

	avgConfidence := sumConfidence / float64(len(gpsPoints))
	return reconstructed, avgConfidence, nil
}

// detectRunDirection determines the macro trend of the vehicle route run.
// It filters points within 150m of the route and compares the average closest index of the first 25% vs last 25%.
func (s *AIReconstructionService) detectRunDirection(roadCoords [][2]float64, gpsPoints []GPSPoint, corridor float64) string {
	n := len(gpsPoints)
	if n < 5 || len(roadCoords) < 2 {
		return "forward"
	}

	closestIndices := make([]int, n)
	validCount := 0
	for t, p := range gpsPoints {
		closestIdx := -1
		minDist := math.MaxFloat64
		for i, rc := range roadCoords {
			d := utils.Haversine(p.Lat, p.Lng, rc[0], rc[1]) * 1000.0
			if d < minDist {
				minDist = d
				closestIdx = i
			}
		}
		if minDist <= 150.0 {
			closestIndices[t] = closestIdx
			validCount++
		} else {
			closestIndices[t] = -1
		}
	}

	if validCount < 3 {
		return "forward"
	}

	var firstIndices []int
	var lastIndices []int

	for t := 0; t < n; t++ {
		if closestIndices[t] != -1 {
			if len(firstIndices) < validCount/4 || len(firstIndices) < 5 {
				firstIndices = append(firstIndices, closestIndices[t])
			}
		}
	}
	for t := n - 1; t >= 0; t-- {
		if closestIndices[t] != -1 {
			if len(lastIndices) < validCount/4 || len(lastIndices) < 5 {
				lastIndices = append([]int{closestIndices[t]}, lastIndices...)
			}
		}
	}

	if len(firstIndices) == 0 || len(lastIndices) == 0 {
		return "forward"
	}

	sumFirst := 0
	for _, idx := range firstIndices {
		sumFirst += idx
	}
	avgFirst := float64(sumFirst) / float64(len(firstIndices))

	sumLast := 0
	for _, idx := range lastIndices {
		sumLast += idx
	}
	avgLast := float64(sumLast) / float64(len(lastIndices))

	if avgLast < avgFirst {
		return "backward"
	}
	return "forward"
}

// roadDistanceForward calculates distance along route coordinate nodes from i to j (forward only).
// If j < i (backward), returns a very large distance unless it's within the 3-node slack.
func (s *AIReconstructionService) roadDistanceForward(roadCoords [][2]float64, i, j int) float64 {
	if i == j {
		return 0
	}
	if j < i {
		if i-j <= 3 {
			// Small backward step/slack - calculate bidirectional distance
			return s.roadDistance(roadCoords, j, i)
		}
		// Backward movement - return large penalty distance
		return 1e6
	}
	dist := 0.0
	for k := i; k < j; k++ {
		dist += utils.Haversine(roadCoords[k][0], roadCoords[k][1], roadCoords[k+1][0], roadCoords[k+1][1]) * 1000.0
	}
	return dist
}

// roadDistance calculates distance along route coordinate nodes (bidirectional).
func (s *AIReconstructionService) roadDistance(roadCoords [][2]float64, i, j int) float64 {
	if i == j {
		return 0
	}
	if i > j {
		i, j = j, i
	}
	dist := 0.0
	for k := i; k < j; k++ {
		dist += utils.Haversine(roadCoords[k][0], roadCoords[k][1], roadCoords[k+1][0], roadCoords[k+1][1]) * 1000.0
	}
	return dist
}

// extractAndDensifyRoadCoords parses route GeoJSON and generates points every 10 meters
func (s *AIReconstructionService) extractAndDensifyRoadCoords(geojsonStr string) [][2]float64 {
	if geojsonStr == "" {
		return nil
	}

	type Geometry struct {
		Type        string        `json:"type"`
		Coordinates []interface{} `json:"coordinates"`
	}
	type Feature struct {
		Type     string   `json:"type"`
		Geometry Geometry `json:"geometry"`
	}
	type FeatureCollection struct {
		Type     string    `json:"type"`
		Features []Feature `json:"features"`
	}

	var geom Geometry
	var feat Feature
	var fc FeatureCollection

	var coordinates []interface{}
	if err := json.Unmarshal([]byte(geojsonStr), &fc); err == nil && fc.Type == "FeatureCollection" && len(fc.Features) > 0 {
		coordinates = fc.Features[0].Geometry.Coordinates
	} else if err := json.Unmarshal([]byte(geojsonStr), &feat); err == nil && feat.Type == "Feature" {
		coordinates = feat.Geometry.Coordinates
	} else if err := json.Unmarshal([]byte(geojsonStr), &geom); err == nil {
		coordinates = geom.Coordinates
	}

	if len(coordinates) == 0 {
		return nil
	}

	// Parse coordinates to raw list of [lat, lng]
	var rawCoords [][2]float64
	for _, c := range coordinates {
		if arr, ok := c.([]interface{}); ok && len(arr) >= 2 {
			lng, _ := arr[0].(float64)
			lat, _ := arr[1].(float64)
			rawCoords = append(rawCoords, [2]float64{lat, lng})
		}
	}

	if len(rawCoords) < 2 {
		return rawCoords
	}

	// Densify coordinates every 10 meters
	var densified [][2]float64
	densified = append(densified, rawCoords[0])

	for i := 0; i < len(rawCoords)-1; i++ {
		p1 := rawCoords[i]
		p2 := rawCoords[i+1]
		dist := utils.Haversine(p1[0], p1[1], p2[0], p2[1]) * 1000.0

		if dist > 10.0 {
			steps := int(math.Ceil(dist / 10.0))
			for s := 1; s < steps; s++ {
				fraction := float64(s) / float64(steps)
				lat := p1[0] + (p2[0]-p1[0])*fraction
				lng := p1[1] + (p2[1]-p1[1])*fraction
				densified = append(densified, [2]float64{lat, lng})
			}
		}
		densified = append(densified, p2)
	}

	return densified
}

// runViterbi runs the Viterbi HMM DP solver using bi-directional road distances.
func (s *AIReconstructionService) runViterbi(
	gpsPoints []GPSPoint,
	roadCoords [][2]float64,
	lattice [][]Candidate,
	sigma, beta float64,
) ([]int, float64) {
	n := len(gpsPoints)
	V := make([][]float64, n)
	Path := make([][]int, n)

	for t := 0; t < n; t++ {
		V[t] = make([]float64, len(lattice[t]))
		Path[t] = make([]int, len(lattice[t]))
	}

	// Initialize t=0
	for cIdx, c := range lattice[0] {
		emissionLog := -(c.Dist * c.Dist) / (2 * sigma * sigma)
		V[0][cIdx] = emissionLog
	}

	// Recurrence t > 0
	for t := 1; t < n; t++ {
		pPrev := gpsPoints[t-1]
		pCurr := gpsPoints[t]
		gpsDist := utils.Haversine(pPrev.Lat, pPrev.Lng, pCurr.Lat, pCurr.Lng) * 1000.0

		for cIdx, c := range lattice[t] {
			emissionLog := -(c.Dist * c.Dist) / (2 * sigma * sigma)

			maxVal := -math.MaxFloat64
			bestPrevIdx := 0

			for prevCIdx, prevC := range lattice[t-1] {
				var roadDist float64
				if prevC.Index >= 0 && c.Index >= 0 {
					// Use bi-directional route distance to support all movements (U-turns, reverse runs, etc.)
					roadDist = s.roadDistance(roadCoords, prevC.Index, c.Index)
				} else {
					// One or both states are off-route -> skip index progression checks
					// Compute transition distance using Haversine straight-line distance
					if prevC.Index == -1 && c.Index == -1 {
						roadDist = gpsDist
					} else if prevC.Index >= 0 && c.Index == -1 {
						rcPrev := roadCoords[prevC.Index]
						roadDist = utils.Haversine(rcPrev[0], rcPrev[1], pCurr.Lat, pCurr.Lng) * 1000.0
					} else { // prevC.Index == -1 && c.Index >= 0
						rcCurr := roadCoords[c.Index]
						roadDist = utils.Haversine(pPrev.Lat, pPrev.Lng, rcCurr[0], rcCurr[1]) * 1000.0
					}
				}

				// Add a state transition penalty if switching between on-route and off-route
				stateTransitionPenalty := 0.0
				if (prevC.Index >= 0 && c.Index == -1) || (prevC.Index == -1 && c.Index >= 0) {
					stateTransitionPenalty = 20.0 // equivalent to 25 meters penalty
				}

				transitionLog := -(math.Abs(roadDist-gpsDist) + stateTransitionPenalty) / beta
				val := V[t-1][prevCIdx] + transitionLog
				if val > maxVal {
					maxVal = val
					bestPrevIdx = prevCIdx
				}
			}

			V[t][cIdx] = maxVal + emissionLog
			Path[t][cIdx] = bestPrevIdx
		}
	}

	// Backtrack to find optimal path
	bestEndIdx := 0
	maxEndVal := -math.MaxFloat64
	for cIdx, val := range V[n-1] {
		if val > maxEndVal {
			maxEndVal = val
			bestEndIdx = cIdx
		}
	}

	optPathIdx := make([]int, n)
	currIdx := bestEndIdx
	for t := n - 1; t >= 0; t-- {
		optPathIdx[t] = currIdx
		currIdx = Path[t][currIdx]
	}

	return optPathIdx, maxEndVal
}

