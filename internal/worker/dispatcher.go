package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/service"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

type Dispatcher struct {
	rdb         *redis.Client
	tripService *service.TripService
	routeEngine *service.RouteEngine
	gpsRepo     *repository.GPSRepository
}

func NewDispatcher(rdb *redis.Client, ts *service.TripService, re *service.RouteEngine, gpsRepo *repository.GPSRepository) *Dispatcher {
	return &Dispatcher{rdb: rdb, tripService: ts, routeEngine: re, gpsRepo: gpsRepo}
}

func (d *Dispatcher) Dispatch(ctx context.Context, data decoder.AVLData) {
	// 1. Broadcast to Redis Pub/Sub for WebSockets
	// Channel name: gps:live:{imei}
	payload := map[string]interface{}{
		"type":      "gps_update",
		"imei":      data.IMEI,
		"lat":       data.Lat,
		"lng":       data.Lng,
		"speed":     data.Speed,
		"ignition":  data.Ignition,
		"timestamp": data.Time,
	}
	jsonData, _ := json.Marshal(payload)
	err := d.rdb.Publish(ctx, "gps:live:"+data.IMEI, jsonData).Err()
	if err != nil {
		log.Error().Err(err).Str("imei", data.IMEI).Msg("Failed to publish to Redis PubSub")
	}

	// 2. Geofence check / Route Engine Checkpoints
	d.routeEngine.Process(data)
	
	// 3. Trip detection
	d.tripService.Process(ctx, data)

	// 4. Background real-time Event-Driven Alert checks
	d.checkAlerts(ctx, data)
}

func (d *Dispatcher) checkAlerts(ctx context.Context, data decoder.AVLData) {
	// Resolve vehicle metadata from the fast in-memory RouteEngine cache
	v := d.routeEngine.GetCachedVehicle(data.IMEI)
	if v == nil {
		return // Unknown vehicle or unassigned device, do not generate alerts
	}

	// Constants for threshold limits
	const overspeedLimit = 10.10      // 10.10 km/hr
	const minStoppageDuration = 300.0 // 5 minutes (300 seconds)

	wardNo := "Unknown"
	if v.VehicleType != nil {
		wardNo = v.VehicleType.Name
	}
	driverName := "Driver-" + strconv.Itoa(v.ID)

	// A. OVERSPEED ALERT DETECTION
	activeOverspeedKey := "alert:overspeed:active:" + data.IMEI
	if data.Speed > overspeedLimit && d.routeEngine.IsOnAssignedRoute(v.ID, data) {
		exists, _ := d.rdb.Exists(ctx, activeOverspeedKey).Result()
		if exists == 0 {
			// Trigger overspeed start state in Redis and log it to PostgreSQL
			d.rdb.Set(ctx, activeOverspeedKey, "1", 2*time.Hour)
			detail := fmt.Sprintf("Speed Over %.2f Km/hr (Speed: %.2f Km/hr)", overspeedLimit, data.Speed)
			d.logAlert(ctx, "Over Speeding", data, v.ID, v.RegistrationNo, wardNo, driverName, detail)
		}
	} else {
		// Speed went back under the limit (or vehicle left its assigned route), clear active state in Redis
		d.rdb.Del(ctx, activeOverspeedKey)
	}

	// B. STOPPAGE ALERT DETECTION
	stoppageKey := "alert:stoppage:start:" + data.IMEI
	loggedKey := "alert:stoppage:logged:" + data.IMEI
	if data.Speed == 0 {
		stoppageStartStr, err := d.rdb.Get(ctx, stoppageKey).Result()
		if err == redis.Nil {
			// Record stoppage start time
			d.rdb.Set(ctx, stoppageKey, data.Time.Format(time.RFC3339), 24*time.Hour)
		} else if err == nil {
			stoppageStart, err := time.Parse(time.RFC3339, stoppageStartStr)
			if err == nil {
				durSec := data.Time.Sub(stoppageStart).Seconds()
				if durSec >= minStoppageDuration {
					// Check if we already logged this stoppage alert
					alreadyLogged, _ := d.rdb.Exists(ctx, loggedKey).Result()
					if alreadyLogged == 0 {
						// Mark logged
						d.rdb.Set(ctx, loggedKey, "1", 24*time.Hour)
						detail := fmt.Sprintf("Stoppage of more than 5:00 Min(s) (Duration: %.1f Min)", durSec/60.0)
						d.logAlert(ctx, "Stoppage", data, v.ID, v.RegistrationNo, wardNo, driverName, detail)
					}
				}
			}
		}
	} else {
		// Vehicle is moving, clear stoppage states in Redis
		d.rdb.Del(ctx, stoppageKey)
		d.rdb.Del(ctx, loggedKey)
	}

	// C. LATE STARTED ALERT DETECTION
	todayStr := time.Now().Format("2006-01-02")
	lateStartLoggedKey := "alert:late_start:logged:" + data.IMEI + ":" + todayStr
	alreadyLateLogged, _ := d.rdb.Exists(ctx, lateStartLoggedKey).Result()
	if alreadyLateLogged == 0 {
		// Check if time is after 7:00 AM
		tHour := data.Time.Hour()
		if tHour > 7 || (tHour == 7 && data.Time.Minute() > 0) {
			d.rdb.Set(ctx, lateStartLoggedKey, "1", 24*time.Hour)
			detail := "Shift started late at " + data.Time.Format("03:04 PM")
			d.logAlert(ctx, "Late Started", data, v.ID, v.RegistrationNo, wardNo, driverName, detail)
		}
	}

	// D. UNAUTHORIZED MOVEMENT DETECTION (outside 6 AM - 8 PM shift hours)
	unauthLoggedKey := "alert:unauth:logged:" + data.IMEI + ":" + todayStr
	alreadyUnauthLogged, _ := d.rdb.Exists(ctx, unauthLoggedKey).Result()
	if alreadyUnauthLogged == 0 && data.Speed > 0 {
		hVal := data.Time.Hour()
		if hVal >= 20 || hVal < 6 {
			d.rdb.Set(ctx, unauthLoggedKey, "1", 24*time.Hour)
			detail := "Unauthorized vehicle movement outside shift hours"
			d.logAlert(ctx, "Unauthorized Movement", data, v.ID, v.RegistrationNo, wardNo, driverName, detail)
		}
	}
}

func (d *Dispatcher) logAlert(ctx context.Context, alertType string, data decoder.AVLData, vehicleID int, regNo, wardNo, driver, detail string) {
	log.Warn().Str("imei", data.IMEI).Str("type", alertType).Msg("Event-Driven Alert Detected!")

	query := `
		INSERT INTO alerts (alert_type, imei, vehicle_id, registration_no, ward_no, driver, alert_detail, time_reported, status, lat, lng)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
	`
	_, err := d.gpsRepo.Pool().Exec(ctx, query,
		alertType,
		data.IMEI,
		vehicleID,
		regNo,
		wardNo,
		driver,
		detail,
		data.Time,
		data.Lat,
		data.Lng,
	)
	if err != nil {
		log.Error().Err(err).Msg("Failed to write alert to PostgreSQL alerts table")
	}
}
