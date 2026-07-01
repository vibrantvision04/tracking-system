package api

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/utils"
)

type earlyVehicleInfo struct {
	id          int
	regNo       string
	vehicleType string
	zone        string
	ward        string
}

type EarlyDepartureRow struct {
	VehicleID               int     `json:"vehicle_id"`
	RegistrationNo          string  `json:"registration_no"`
	VehicleType             string  `json:"vehicle_type"`
	DriverName              string  `json:"driver_name"`
	Zone                    string  `json:"zone"`
	Ward                    string  `json:"ward"`
	AssignedShift           string  `json:"assigned_shift"`
	ShiftStart              string  `json:"shift_start"`
	ShiftEnd                string  `json:"shift_end"`
	ConfiguredThreshold     string  `json:"configured_threshold"`
	LastMeaningfulIgnOff    string  `json:"last_meaningful_ign_off"`
	LastMeaningfulIgnOn     string  `json:"last_meaningful_ign_on"`
	DistanceAfterRestart    float64 `json:"distance_after_restart"`
	IgnitionOnAfterRestart  string  `json:"ignition_on_after_restart"`
	MovementDurationAfter   string  `json:"movement_duration_after"`
	IsEarlyDeparture        bool    `json:"is_early_departure"`
	Status                  string  `json:"status"`
	Remarks                 string  `json:"remarks"`
	ReasonCode              string  `json:"reason_code"`
	DistanceAfterRestartKm  float64 `json:"distance_after_restart_km"`
	IgnitionAfterRestartSec int     `json:"ignition_after_restart_sec"`
	MovementAfterRestartSec int     `json:"movement_after_restart_sec"`
}

type ignitionSession struct {
	start         time.Time
	end           time.Time
	lastPoint     decoder.AVLData
	ignitionOnSec float64
	distanceKm    float64
	maxSpeed      float64
}

func (h *Handler) GetEarlyDepartureReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	dateStr := r.URL.Query().Get("date")
	if dateStr == "" {
		dateStr = utils.CurrentTimeInIndia().Format("2006-01-02")
	}
	reportDate, err := time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date"})
		return
	}

	shiftIDStr := r.URL.Query().Get("shift_id")
	zoneIDStr := r.URL.Query().Get("zone_id")
	wardIDStr := r.URL.Query().Get("ward_id")
	vehicleIDStr := r.URL.Query().Get("vehicle_id")
	statusFilter := strings.ToLower(r.URL.Query().Get("status"))
	thresholdPreset := r.URL.Query().Get("threshold_preset")
	thresholdCustom := r.URL.Query().Get("threshold")
	validationMode := r.URL.Query().Get("validation_mode")
	includeActiveStr := r.URL.Query().Get("include_active")

	minDistStr := r.URL.Query().Get("min_distance_km")
	minIgnStr := r.URL.Query().Get("min_ignition_duration_sec")
	minMovStr := r.URL.Query().Get("min_movement_duration_sec")

	includeActive := includeActiveStr == "true"

	// Resolve shift
	var shiftName string
	var actualStart, actualEnd time.Time
	if shiftIDStr != "" {
		if sid, err := strconv.Atoi(shiftIDStr); err == nil && sid > 0 {
			shiftName, actualStart, actualEnd, err = ResolveSelectedShiftTimes(ctx, db, sid, reportDate)
			if err != nil {
				sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid shift: " + err.Error()})
				return
			}
		}
	}
	if shiftName == "" {
		var shiftID int
		var opDate time.Time
		shiftID, shiftName, opDate, actualStart, actualEnd, err = ResolveActiveShift(ctx, db, "VEHICLE_MOVEMENT", reportDate)
		if err != nil || shiftID == 0 {
			shiftName = "All Day"
			actualStart = time.Date(reportDate.Year(), reportDate.Month(), reportDate.Day(), 0, 0, 0, 0, utils.IndianLocation)
			actualEnd = actualStart.Add(24 * time.Hour)
		}
		_ = opDate
	}

	// Resolve threshold from preset + optional custom time
	thresholdTime, resolvedPreset := resolveThresholdBackend(thresholdPreset, thresholdCustom, actualStart, actualEnd)

	// Parse configurable validation thresholds
	minDistKm := 0.5
	minIgnSec := 300.0
	minMovSec := 300.0
	if v, err := strconv.ParseFloat(minDistStr, 64); err == nil && v > 0 {
		minDistKm = v
	}
	if v, err := strconv.ParseFloat(minIgnStr, 64); err == nil && v > 0 {
		minIgnSec = v
	}
	if v, err := strconv.ParseFloat(minMovStr, 64); err == nil && v > 0 {
		minMovSec = v
	}
	minMovDur := time.Duration(minMovSec) * time.Second

	// Validation mode: strict (distance OR ignition+movement) vs loose (any one)
	useStrictValidation := validationMode != "loose"

	// Fetch vehicles (with optional filters)
	baseQuery := `
		SELECT v.id, COALESCE(v.registration_no, ''), COALESCE(vt.vehicle_type_name, ''),
			COALESCE(z.region_name, ''), COALESCE(w.region_name, '')
		FROM vehicles v
		LEFT JOIN vehicle_types_swift vt ON v.vehicle_type_id = vt.id
		LEFT JOIN regions z ON v.zone_id = z.id
		LEFT JOIN regions w ON v.ward_id = w.id
		WHERE v.is_active = true
	`
	var args []interface{}
	argIdx := 1
	if vehicleIDStr != "" {
		if vid, err := strconv.Atoi(vehicleIDStr); err == nil && vid > 0 {
			baseQuery += " AND v.id = $" + strconv.Itoa(argIdx)
			args = append(args, vid)
			argIdx++
		}
	}
	if zoneIDStr != "" {
		if zid, err := strconv.Atoi(zoneIDStr); err == nil && zid > 0 {
			baseQuery += " AND v.zone_id = $" + strconv.Itoa(argIdx)
			args = append(args, zid)
			argIdx++
		}
	}
	if wardIDStr != "" {
		if wid, err := strconv.Atoi(wardIDStr); err == nil && wid > 0 {
			baseQuery += " AND v.ward_id = $" + strconv.Itoa(argIdx)
			args = append(args, wid)
			argIdx++
		}
	}
	baseQuery += " ORDER BY v.id"

	vRows, err := db.Query(ctx, baseQuery, args...)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query vehicles: " + err.Error()})
		return
	}
	defer vRows.Close()

	var vehicles []earlyVehicleInfo
	for vRows.Next() {
		var vi earlyVehicleInfo
		if err := vRows.Scan(&vi.id, &vi.regNo, &vi.vehicleType, &vi.zone, &vi.ward); err == nil {
			vehicles = append(vehicles, vi)
		}
	}

	now := utils.CurrentTimeInIndia()
	isToday := dateStr == now.Format("2006-01-02")
	shiftCompleted := !isToday || now.After(actualEnd)

	type result struct {
		row EarlyDepartureRow
	}
	results := make([]result, 0)
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 10)

	for _, v := range vehicles {
		wg.Add(1)
		sem <- struct{}{}
		go func(v earlyVehicleInfo) {
			defer wg.Done()
			defer func() { <-sem }()

			row := analyzeVehicleEarlyDeparture(ctx, h, v, actualStart, actualEnd, thresholdTime,
				minDistKm, minIgnSec, minMovDur, shiftName, isToday, now, shiftCompleted, includeActive, useStrictValidation)

			if row == nil {
				return
			}
			if statusFilter != "" {
				rowStatus := "early_departed"
				if !row.IsEarlyDeparture {
					rowStatus = "normal"
				}
				if strings.Contains(strings.ToLower(row.Status), "potential") {
					rowStatus = "potential"
				}
				if statusFilter != rowStatus && !(statusFilter == "early_departed" && rowStatus == "potential") {
					return
				}
			}
			mu.Lock()
			results = append(results, result{row: *row})
			mu.Unlock()
		}(v)
	}
	wg.Wait()

	data := make([]EarlyDepartureRow, len(results))
	for i, r := range results {
		data[i] = r.row
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":               true,
		"date":                  dateStr,
		"shift_name":            shiftName,
		"shift_start":           actualStart.Format("15:04:05"),
		"shift_end":             actualEnd.Format("15:04:05"),
		"shift_completed":       shiftCompleted,
		"configured_threshold":  thresholdTime.Format("15:04:05"),
		"threshold_preset":      resolvedPreset,
		"min_distance_km":       minDistKm,
		"min_ignition_sec":      minIgnSec,
		"min_movement_sec":      minMovSec,
		"validation_mode":       map[bool]string{true: "strict", false: "loose"}[useStrictValidation],
		"data":                  data,
	})
}

func analyzeVehicleEarlyDeparture(ctx context.Context, h *Handler, v earlyVehicleInfo,
	actualStart, actualEnd, thresholdTime time.Time,
	minDistKm, minIgnSec float64, minMovDur time.Duration,
	shiftName string, isToday bool, now time.Time,
	shiftCompleted, includeActive, useStrictValidation bool) *EarlyDepartureRow {

	// If shift is still active and we don't want to include active shifts, skip
	if !shiftCompleted && !includeActive {
		return nil
	}

	gpsData, err := h.gpsRepo.GetByVehicle(ctx, v.id, actualStart, actualEnd)
	if err != nil || len(gpsData) == 0 {
		return nil
	}

	gpsData = smoothGpsData(gpsData)
	if len(gpsData) < 2 {
		return nil
	}

	// Build ignition sessions using validated GPS transitions only
	var sessions []ignitionSession
	var current *ignitionSession
	prevIgnition := false
	for _, p := range gpsData {
		isOn := p.Ignition || p.Speed > 2.0

		if isOn {
			if current == nil {
				current = &ignitionSession{
					start:     p.Time,
					lastPoint: p,
				}
			} else {
				dt := p.Time.Sub(current.lastPoint.Time).Seconds()
				if dt > 0 && dt < 3600 {
					current.ignitionOnSec += dt
				}
				if utils.IsValidGPSTransition(current.lastPoint, p) {
					dist := utils.Haversine(current.lastPoint.Lat, current.lastPoint.Lng, p.Lat, p.Lng)
					current.distanceKm += dist
				}
				if p.Speed > current.maxSpeed {
					current.maxSpeed = p.Speed
				}
				current.lastPoint = p
			}
		}

		if !isOn && prevIgnition && current != nil {
			current.end = p.Time
			sessions = append(sessions, *current)
			current = nil
		}

		prevIgnition = isOn
	}

	// If ignition still ON at end of data
	if current != nil {
		if isToday {
			current.end = now
		} else {
			current.end = current.lastPoint.Time
		}
		sessions = append(sessions, *current)
	}

	if len(sessions) == 0 {
		return nil
	}

	// Find last meaningful session ending before or at threshold
	var lastMeaningfulBeforeThreshold *ignitionSession
	for i := range sessions {
		s := &sessions[i]
		if (s.end.Before(thresholdTime) || s.end.Equal(thresholdTime)) &&
			isMeaningful(s, minDistKm, minIgnSec, minMovDur, useStrictValidation) {
			lastMeaningfulBeforeThreshold = s
		}
	}

	if lastMeaningfulBeforeThreshold == nil {
		return nil
	}

	// Look for subsequent sessions after the last meaningful OFF
	var subsequentWork *ignitionSession
	var subsequentTamper *ignitionSession
	for i := range sessions {
		s := &sessions[i]
		if !s.start.Before(lastMeaningfulBeforeThreshold.end) {
			if isMeaningful(s, minDistKm, minIgnSec, minMovDur, useStrictValidation) {
				subsequentWork = s
				break
			}
			if subsequentTamper == nil {
				subsequentTamper = s
			}
		}
	}

	// Check if any session extends past threshold
	var hasWorkPastThreshold bool
	for i := range sessions {
		s := &sessions[i]
		if s.end.After(thresholdTime) &&
			isMeaningful(s, minDistKm, minIgnSec, minMovDur, useStrictValidation) {
			hasWorkPastThreshold = true
			break
		}
	}

	isEarlyDeparture := !hasWorkPastThreshold && subsequentWork == nil

	var status string
	var remarks string
	var reasonCode string

	if !shiftCompleted {
		status = "Potential Early Departure"
		reasonCode = "shift_active"
		remarks = fmt.Sprintf("Shift still active (ends at %s). Last meaningful ignition OFF at %s. ",
			actualEnd.Format("15:04"), lastMeaningfulBeforeThreshold.end.Format("15:04"))
		if subsequentTamper != nil {
			remarks += fmt.Sprintf("Ignition manipulation detected: %.0fm travelled, %.0fs ignition ON after threshold.",
				subsequentTamper.distanceKm*1000, subsequentTamper.ignitionOnSec)
		} else {
			remarks += "No further activity detected. Final status pending shift end."
		}
	} else if isEarlyDeparture {
		offStr := lastMeaningfulBeforeThreshold.end.Format("15:04:05")
		endStr := actualEnd.Format("15:04:05")
		if subsequentTamper != nil {
			status = "Early Departed"
			reasonCode = "ignition_manipulation"
			remarks = fmt.Sprintf("Last meaningful ignition OFF at %s. Shift ends at %s. "+
				"Ignition manipulation after threshold: %.0fm travelled, %.0fs ignition ON. No genuine work resumed.",
				offStr, endStr, subsequentTamper.distanceKm*1000, subsequentTamper.ignitionOnSec)
		} else {
			status = "Early Departed"
			reasonCode = "early_departure"
			remarks = fmt.Sprintf("Last meaningful ignition OFF at %s. Shift ends at %s. No further activity after threshold.", offStr, endStr)
		}
	} else {
		status = "Normal"
		reasonCode = "normal"
		if hasWorkPastThreshold {
			remarks = "Vehicle continued working past the configured threshold time."
		} else if subsequentWork != nil {
			remarks = fmt.Sprintf("Vehicle stopped at %s but resumed genuine work afterwards.",
				lastMeaningfulBeforeThreshold.end.Format("15:04"))
		} else {
			remarks = "Vehicle operated normally throughout the shift."
		}
	}

	var distAfter float64
	var ignOnAfterSec int
	var movDurAfterSec int
	var ignOnAfter string
	var movDurAfter string
	if subsequentWork != nil {
		distAfter = subsequentWork.distanceKm
		ignOnAfterSec = int(subsequentWork.ignitionOnSec)
		movDurAfterSec = int(subsequentWork.end.Sub(subsequentWork.start).Seconds())
		ignOnAfter = formatDuration(ignOnAfterSec)
		movDurAfter = formatDuration(movDurAfterSec)
	} else if subsequentTamper != nil {
		distAfter = subsequentTamper.distanceKm
		ignOnAfterSec = int(subsequentTamper.ignitionOnSec)
		movDurAfterSec = int(subsequentTamper.end.Sub(subsequentTamper.start).Seconds())
		ignOnAfter = formatDuration(ignOnAfterSec)
		movDurAfter = formatDuration(movDurAfterSec)
	}

	return &EarlyDepartureRow{
		VehicleID:                v.id,
		RegistrationNo:           v.regNo,
		VehicleType:              v.vehicleType,
		DriverName:               "",
		Zone:                     v.zone,
		Ward:                     v.ward,
		AssignedShift:            shiftName,
		ShiftStart:               actualStart.Format("15:04:05"),
		ShiftEnd:                 actualEnd.Format("15:04:05"),
		ConfiguredThreshold:      thresholdTime.Format("15:04:05"),
		LastMeaningfulIgnOff:     lastMeaningfulBeforeThreshold.end.Format("15:04:05"),
		LastMeaningfulIgnOn:      lastMeaningfulBeforeThreshold.start.Format("15:04:05"),
		DistanceAfterRestart:     math.Round(distAfter*1000) / 1000,
		IgnitionOnAfterRestart:   ignOnAfter,
		MovementDurationAfter:    movDurAfter,
		IsEarlyDeparture:         isEarlyDeparture,
		Status:                   status,
		Remarks:                  remarks,
		ReasonCode:               reasonCode,
		DistanceAfterRestartKm:   math.Round(distAfter*1000) / 1000,
		IgnitionAfterRestartSec:  ignOnAfterSec,
		MovementAfterRestartSec:  movDurAfterSec,
	}
}

// isMeaningful checks if a work session meets the validation criteria.
// strict mode: distance >= minDistKm OR (ignitionOnSec >= minIgnSec AND movDur >= minMovDur)
// loose mode:  distance >= minDistKm OR ignitionOnSec >= minIgnSec OR movDur >= minMovDur
func isMeaningful(s *ignitionSession, minDistKm, minIgnSec float64, minMovDur time.Duration, strict bool) bool {
	if s == nil {
		return false
	}
	movDur := s.end.Sub(s.start)
	if s.distanceKm >= minDistKm {
		return true
	}
	if strict {
		return s.ignitionOnSec >= minIgnSec && movDur >= minMovDur
	}
	return s.ignitionOnSec >= minIgnSec || movDur >= minMovDur
}

// resolveThresholdBackend converts threshold_preset + optional custom time into absolute threshold.
// threshold_preset can be: "1h", "2h", "3h" (relative to shift end), "custom" (uses threshold param).
// Returns the resolved threshold time and the preset label.
func resolveThresholdBackend(preset, customTime string, shiftStart, shiftEnd time.Time) (time.Time, string) {
	switch strings.TrimSpace(preset) {
	case "1h":
		return shiftEnd.Add(-1 * time.Hour), "1h"
	case "3h":
		return shiftEnd.Add(-3 * time.Hour), "3h"
	case "custom":
		if customTime != "" {
			for _, format := range []string{"15:04:05", "15:04", "3:04 PM", "3:04PM"} {
				if t, err := time.Parse(format, strings.TrimSpace(customTime)); err == nil {
					resolved := time.Date(shiftEnd.Year(), shiftEnd.Month(), shiftEnd.Day(),
						t.Hour(), t.Minute(), t.Second(), 0, shiftEnd.Location())
					return resolved, "custom"
				}
			}
		}
		// fall through to default
		fallthrough
	default:
		// Default: 2 hours before shift end
		return shiftEnd.Add(-2 * time.Hour), "2h"
	}
}
