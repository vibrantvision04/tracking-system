package utils

import (
	"gps-tracking-system/internal/decoder"
	"math"
)

// Haversine calculates the distance between two GPS coordinates in kilometers.
func Haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0 // Earth radius in km
	dLat := (lat2 - lat1) * (math.Pi / 180)
	dLon := (lon2 - lon1) * (math.Pi / 180)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*(math.Pi/180))*math.Cos(lat2*(math.Pi/180))*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

// MinDriftThresholdMeters is the threshold in meters to filter out stationary GPS drift.
// Tweak this value directly in code to tune distance calculation sensitivity (e.g. 5.0, 8.0, 10.0, 15.0).
var MinDriftThresholdMeters = 1.0

// IsValidGPSTransition checks whether a GPS point transition is physically plausible.
// Rejects GPS jumps, drift, and impossible speeds to ensure accurate distance calculation.
func IsValidGPSTransition(prev, curr decoder.AVLData) bool {
	distKm := Haversine(prev.Lat, prev.Lng, curr.Lat, curr.Lng)
	timeDelta := curr.Time.Sub(prev.Time).Seconds()

	if timeDelta <= 0 {
		return false
	}

	// 1. Reject impossible speed: > 120 km/h for municipal/garbage vehicles
	impliedSpeedKmh := (distKm / timeDelta) * 3600
	if impliedSpeedKmh > 120 {
		return false
	}

	// 2. Reject GPS drift while stationary: small movements (< MinDriftThresholdMeters) when
	//    both points report low speed (<= 3.0 km/h). Stationary GPS devices commonly drift
	//    10-50m with fluctuating speed reports of 1-3 km/h, which adds fake distance.
	if prev.Speed <= 4.0 && curr.Speed <= 4.0 && distKm < (MinDriftThresholdMeters/1000.0) {
		return false
	}

	// 3. Reject teleportation: > 0.5 km in under 2 seconds (device glitch)
	if timeDelta < 2 && distKm > 0.5 {
		return false
	}

	return true
}
