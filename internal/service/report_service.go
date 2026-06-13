package service

import (
	"context"
	"encoding/json"
	"fmt"
	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/utils"
	"time"
)

type ReportService struct {
	repo  *repository.ReportRepository
	gRepo *repository.GPSRepository
	vRepo *repository.VehicleRepository
}

func NewReportService(repo *repository.ReportRepository, gRepo *repository.GPSRepository, vRepo *repository.VehicleRepository) *ReportService {
	return &ReportService{
		repo:  repo,
		gRepo: gRepo,
		vRepo: vRepo,
	}
}


type geofencePoint struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

func pointInPolygon(lat, lng float64, polygon []geofencePoint) bool {
	if len(polygon) == 0 {
		return false
	}
	isInside := false
	for i, j := 0, len(polygon)-1; i < len(polygon); j, i = i, i+1 {
		if ((polygon[i].Lat > lat) != (polygon[j].Lat > lat)) &&
			(lng < (polygon[j].Lng-polygon[i].Lng)*(lat-polygon[i].Lat)/(polygon[j].Lat-polygon[i].Lat)+polygon[i].Lng) {
			isInside = !isInside
		}
	}
	return isInside
}

func pointInAnyPolygon(lat, lng float64, polygons [][]geofencePoint) bool {
	for _, poly := range polygons {
		if pointInPolygon(lat, lng, poly) {
			return true
		}
	}
	return false
}

func parseGeoJSONPolygons(geoJSONStr string) [][]geofencePoint {
	if geoJSONStr == "" {
		return nil
	}

	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(geoJSONStr), &raw); err != nil {
		return nil
	}

	var polygons [][]geofencePoint

	var parseCoordinates = func(coordsI interface{}, geomType string) {
		if geomType == "Polygon" {
			rings, ok := coordsI.([]interface{})
			if !ok || len(rings) == 0 {
				return
			}
			outerRing, ok := rings[0].([]interface{})
			if !ok {
				return
			}
			var poly []geofencePoint
			for _, ptI := range outerRing {
				pt, ok := ptI.([]interface{})
				if ok && len(pt) >= 2 {
					lng, ok1 := pt[0].(float64)
					lat, ok2 := pt[1].(float64)
					if ok1 && ok2 {
						poly = append(poly, geofencePoint{Lat: lat, Lng: lng})
					}
				}
			}
			if len(poly) > 0 {
				polygons = append(polygons, poly)
			}
		} else if geomType == "MultiPolygon" {
			polys, ok := coordsI.([]interface{})
			if !ok {
				return
			}
			for _, polyI := range polys {
				rings, ok := polyI.([]interface{})
				if !ok || len(rings) == 0 {
					continue
				}
				outerRing, ok := rings[0].([]interface{})
				if !ok {
					continue
				}
				var poly []geofencePoint
				for _, ptI := range outerRing {
					pt, ok := ptI.([]interface{})
					if ok && len(pt) >= 2 {
						lng, ok1 := pt[0].(float64)
						lat, ok2 := pt[1].(float64)
						if ok1 && ok2 {
							poly = append(poly, geofencePoint{Lat: lat, Lng: lng})
						}
					}
				}
				if len(poly) > 0 {
					polygons = append(polygons, poly)
				}
			}
		}
	}

	t, _ := raw["type"].(string)
	if t == "FeatureCollection" {
		features, ok := raw["features"].([]interface{})
		if ok {
			for _, fI := range features {
				f, ok := fI.(map[string]interface{})
				if ok {
					geomI, ok := f["geometry"].(map[string]interface{})
					if ok {
						geomType, _ := geomI["type"].(string)
						parseCoordinates(geomI["coordinates"], geomType)
					}
				}
			}
		}
	} else {
		parseCoordinates(raw["coordinates"], t)
	}

	return polygons
}

func (s *ReportService) GenerateDailyReport(ctx context.Context, vehicleID int, date time.Time, zone, ward string) error {
	start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	end := start.Add(24 * time.Hour)

	// Resolve Zone from vehicle_regions mapping (Vehicle-Zone Assignments page)
	var zoneName string
	err := s.gRepo.Pool().QueryRow(ctx, `
		SELECT COALESCE(r.region_name, '')
		FROM vehicle_regions vr
		JOIN regions r ON vr.region_id = r.id
		WHERE vr.vehicle_id = $1
	`, vehicleID).Scan(&zoneName)
	if err != nil || zoneName == "" {
		// Fallback to vehicle's default zone_id in vehicles table
		_ = s.gRepo.Pool().QueryRow(ctx, `
			SELECT COALESCE(r.region_name, '')
			FROM vehicles v
			LEFT JOIN regions r ON v.zone_id = r.id
			WHERE v.id = $1
		`, vehicleID).Scan(&zoneName)
	}

	// Resolve Ward from vehicle_route_assignments mapping (Route to Vehicle & Shift page)
	var wardName string
	err = s.gRepo.Pool().QueryRow(ctx, `
		WITH active_assignment AS (
			SELECT route_id 
			FROM vehicle_route_assignments 
			WHERE vehicle_id = $1 AND is_active = true 
			ORDER BY assigned_date DESC LIMIT 1
		),
		assigned_route_ward AS (
			SELECT rw.ward_id 
			FROM active_assignment aa
			JOIN route_wards rw ON aa.route_id = rw.route_id
			LIMIT 1
		)
		SELECT COALESCE(r.region_name, '')
		FROM assigned_route_ward arw
		JOIN regions r ON arw.ward_id = r.id
	`, vehicleID).Scan(&wardName)
	if err != nil || wardName == "" {
		// Fallback to vehicle's default ward_id in vehicles table
		_ = s.gRepo.Pool().QueryRow(ctx, `
			SELECT COALESCE(r.region_name, '')
			FROM vehicles v
			LEFT JOIN regions r ON v.ward_id = r.id
			WHERE v.id = $1
		`, vehicleID).Scan(&wardName)
	}

	if zone == "" {
		zone = zoneName
	}
	if ward == "" {
		ward = wardName
	}

	// Fetch ward polygon GeoJSON for geofencing (resolve via route first, fallback to vehicle's default ward)
	var wardGeoJSON string
	_ = s.gRepo.Pool().QueryRow(ctx, `
		SELECT COALESCE(g.polygon::text, '')
		FROM vehicles v
		LEFT JOIN (
			SELECT route_id
			FROM vehicle_route_assignments
			WHERE vehicle_id = $1 AND is_active = true
			ORDER BY assigned_date DESC LIMIT 1
		) vra ON true
		LEFT JOIN LATERAL (SELECT ward_id FROM route_wards rw WHERE route_id = vra.route_id LIMIT 1) rw ON true
		JOIN regions w ON COALESCE(rw.ward_id, v.ward_id) = w.id
		JOIN geofences g ON w.geofence_id = g.id
		WHERE v.id = $1
	`, vehicleID).Scan(&wardGeoJSON)

	var wardPolygons [][]geofencePoint
	if wardGeoJSON != "" {
		wardPolygons = parseGeoJSONPolygons(wardGeoJSON)
	}

	// Fetch GPS data for the day
	data, err := s.gRepo.GetByVehicle(ctx, vehicleID, start, end)
	if err != nil {
		return err
	}

	// Filter out invalid GPS data
	var validData []decoder.AVLData
	for _, p := range data {
		if p.Lat != 0 && p.Lng != 0 {
			validData = append(validData, p)
		}
	}

	if len(validData) == 0 {
		return nil
	}

	// ─────────────────────────────────────────────────────────────────
	// 1. START TIME & END TIME Calculation
	// ─────────────────────────────────────────────────────────────────
	var startTime *time.Time
	var endTime *time.Time
	var startLat, startLng float64
	var endLat, endLng float64

	// Helper for virtual ignition ON
	isIgnitionOn := func(p decoder.AVLData) bool {
		return p.Ignition || p.Speed > 2
	}

	// Find first Ignition ON
	for _, p := range validData {
		if isIgnitionOn(p) {
			t := p.Time
			startTime = &t
			startLat = p.Lat
			startLng = p.Lng
			break
		}
	}

	if startTime != nil {
		var lastOff *decoder.AVLData
		// Find latest Ignition OFF transition
		for i := 1; i < len(validData); i++ {
			prevOn := isIgnitionOn(validData[i-1])
			currOn := isIgnitionOn(validData[i])
			if prevOn && !currOn {
				lastOff = &validData[i]
			}
		}

		lastP := validData[len(validData)-1]
		lastPOn := isIgnitionOn(lastP)

		if lastPOn {
			// Vehicle is currently ON / moving at the end of data
			t := lastP.Time
			endTime = &t
			endLat = lastP.Lat
			endLng = lastP.Lng
		} else if lastOff != nil {
			// Use the latest completed session OFF event
			t := lastOff.Time
			endTime = &t
			endLat = lastOff.Lat
			endLng = lastOff.Lng
		} else {
			// Fallback to the last packet's time
			t := lastP.Time
			endTime = &t
			endLat = lastP.Lat
			endLng = lastP.Lng
		}
	} else {
		// Fallback: No activity at all
		t := validData[0].Time
		startTime = &t
		startLat = validData[0].Lat
		startLng = validData[0].Lng

		tEnd := validData[len(validData)-1].Time
		endTime = &tEnd
		endLat = validData[len(validData)-1].Lat
		endLng = validData[len(validData)-1].Lng
	}

	// ─────────────────────────────────────────────────────────────────
	// 2. Operational Window Slicing
	// ─────────────────────────────────────────────────────────────────
	var opData []decoder.AVLData
	if startTime != nil && endTime != nil {
		for _, p := range validData {
			if !p.Time.Before(*startTime) && !p.Time.After(*endTime) {
				opData = append(opData, p)
			}
		}
	}

	// ─────────────────────────────────────────────────────────────────
	// 3. Stoppage Identification and Classification
	// ─────────────────────────────────────────────────────────────────
	var stoppages []repository.Stoppage
	var totalStoppageSec float64
	var minorStoppagesCount int
	var majorStoppagesCount int

	if len(opData) > 0 {
		stoppageStartIdx := -1
		for i := 0; i < len(opData); i++ {
			p := opData[i]
			isOffStationary := p.Speed == 0 && !p.Ignition

			if isOffStationary {
				if stoppageStartIdx == -1 {
					stoppageStartIdx = i
				}
			} else {
				if stoppageStartIdx != -1 {
					durSec := int(opData[i].Time.Sub(opData[stoppageStartIdx].Time).Seconds())
					if durSec > 0 {
						stoppage := repository.Stoppage{
							StartPointIndex: stoppageStartIdx,
							EndPointIndex:   i,
							StartPoint:      toRepositoryStoppagePoint(opData[stoppageStartIdx]),
							EndPoint:        toRepositoryStoppagePoint(opData[i]),
							Duration:        durSec,
						}
						stoppages = append(stoppages, stoppage)
						totalStoppageSec += float64(durSec)

						if durSec < 600 {
							minorStoppagesCount++
						} else {
							majorStoppagesCount++
						}
					}
					stoppageStartIdx = -1
				}
			}
		}
		if stoppageStartIdx != -1 && stoppageStartIdx < len(opData)-1 {
			lastIdx := len(opData) - 1
			durSec := int(opData[lastIdx].Time.Sub(opData[stoppageStartIdx].Time).Seconds())
			if durSec > 0 {
				stoppage := repository.Stoppage{
					StartPointIndex: stoppageStartIdx,
					EndPointIndex:   lastIdx,
					StartPoint:      toRepositoryStoppagePoint(opData[stoppageStartIdx]),
					EndPoint:        toRepositoryStoppagePoint(opData[lastIdx]),
					Duration:        durSec,
				}
				stoppages = append(stoppages, stoppage)
				totalStoppageSec += float64(durSec)

				if durSec < 600 {
					minorStoppagesCount++
				} else {
					majorStoppagesCount++
				}
			}
		}
	}

	// ─────────────────────────────────────────────────────────────────
	// 4. Metrics Calculations (Distance, Speed, Ignition, Idle)
	// ─────────────────────────────────────────────────────────────────
	var totalDistance float64
	var maxSpeed float64
	var actualIgnitionSec float64
	var totalIgnitionSec float64
	var idleSec float64

	// Distance, Max Speed (calculated strictly within the shift window opData)
	var lastOp *decoder.AVLData
	for i := 0; i < len(opData); i++ {
		p := opData[i]
		if p.Speed > maxSpeed {
			maxSpeed = p.Speed
		}
		if lastOp == nil {
			lastOp = &opData[i]
			continue
		}
		if utils.IsValidGPSTransition(*lastOp, p) {
			totalDistance += utils.Haversine(lastOp.Lat, lastOp.Lng, p.Lat, p.Lng)
			lastOp = &opData[i]
		}
	}

	// Actual & Total Ignition ON Durations (within opData shift window)
	for i := 1; i < len(opData); i++ {
		prev := opData[i-1]
		curr := opData[i]
		prevOn := isIgnitionOn(prev)
		currOn := isIgnitionOn(curr)
		if prevOn && currOn {
			dt := curr.Time.Sub(prev.Time).Seconds()
			if dt > 0 && dt < 3600 {
				totalIgnitionSec += dt
				inWard := len(wardPolygons) > 0 && pointInAnyPolygon(curr.Lat, curr.Lng, wardPolygons)
				if inWard {
					actualIgnitionSec += dt
				}
			}
		}
	}

	// Idle Duration: engine ON AND speed == 0 (within opData shift window)
	for i := 1; i < len(opData); i++ {
		prev := opData[i-1]
		curr := opData[i]
		currOn := isIgnitionOn(curr)
		if currOn && curr.Speed == 0 {
			dt := curr.Time.Sub(prev.Time).Seconds()
			if dt > 0 && dt < 3600 {
				idleSec += dt
			}
		}
	}

	// Active Hours: END TIME - START TIME
	var activeSec int
	if startTime != nil && endTime != nil {
		activeSec = int(endTime.Sub(*startTime).Seconds())
		if activeSec < 0 {
			activeSec = 0
		}
	}

	// Parking Duration: 24 hours - activeSec
	inParkingSec := 86400 - activeSec
	if inParkingSec < 0 {
		inParkingSec = 0
	}

	// Average Speed: totalDistance / totalActiveHours
	avgSpeed := 0.0
	if activeSec > 0 {
		avgSpeed = (totalDistance / float64(activeSec)) * 3600.0
	}

	startPoint := &repository.Coordinate{X: startLng, Y: startLat}
	endPoint := &repository.Coordinate{X: endLng, Y: endLat}

	report := &repository.MovementReport{
		VehicleID:                vehicleID,
		IMEI:                     validData[0].IMEI,
		ReportDate:               start,
		Zone:                     zone,
		Ward:                     ward,
		AverageSpeed:             avgSpeed,
		TotalDistance:            totalDistance,
		StartTime:                startTime,
		EndTime:                  endTime,
		TotalActiveDuration:      formatDuration(activeSec),
		TotalIdleDuration:        formatDuration(int(idleSec)),
		TotalStoppageDuration:    formatDuration(int(totalStoppageSec)),
		StoppagesCount:           len(stoppages),
		InParkingDuration:        formatDuration(inParkingSec),
		ActualIgnitionOnDuration: formatDuration(int(actualIgnitionSec)),
		TotalIgnitionOnDuration:  formatDuration(int(totalIgnitionSec)),
		MaxSpeed:                 maxSpeed,
		StartPoint:               startPoint,
		EndPoint:                 endPoint,
		MinorStoppages:           minorStoppagesCount,
		MajorStoppages:           majorStoppagesCount,
		Stoppages:                stoppages,
	}

	return s.repo.Upsert(ctx, report)
}

// GetReports retrieves pre-computed reports from the movement_reports table.
// Reports are generated exclusively by the nightly cron job, NOT on each API call.
// This ensures consistent, fast responses regardless of GPS data volume.
func (s *ReportService) GetReports(ctx context.Context, vehicleID int, from, to time.Time, limit, offset int) ([]repository.MovementReport, int, error) {
	return s.repo.Get(ctx, vehicleID, from, to, limit, offset)
}

func (s *ReportService) FinalizeForDate(ctx context.Context, date time.Time) error {
	return s.repo.FinalizeReportsForDate(ctx, date)
}

func (s *ReportService) UnfinalizeForDate(ctx context.Context, date time.Time, vehicleID int) error {
	return s.repo.UnfinalizeReportsForDate(ctx, date, vehicleID)
}

func formatDuration(seconds int) string {
	h := seconds / 3600
	m := (seconds % 3600) / 60
	s := seconds % 60
	return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
}

func toRepositoryStoppagePoint(p decoder.AVLData) repository.StoppagePoint {
	ign := 0
	if p.Ignition {
		ign = 1
	}
	return repository.StoppagePoint{
		Timestamp:    p.Time,
		IMEI:         p.IMEI,
		Lat:          p.Lat,
		Lng:          p.Lng,
		Speed:        p.Speed,
		Ignition:     ign,
		Datetime:     p.Time,
		DateTimeDate: p.Time.Format("2006-01-02 15:04:05"),
	}
}
