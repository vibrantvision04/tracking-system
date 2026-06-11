package utils

import "time"

// IndianLocation is the time.Location representing Asia/Kolkata (IST, UTC+5:30)
var IndianLocation *time.Location

func init() {
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err == nil {
		IndianLocation = loc
	} else {
		// Fallback to a fixed timezone offset of UTC+5:30 if zoneinfo is missing
		IndianLocation = time.FixedZone("IST", 19800) // 5.5 * 3600
	}
}

// CurrentTimeInIndia returns time.Now() adjusted to India Standard Time
func CurrentTimeInIndia() time.Time {
	return time.Now().In(IndianLocation)
}
