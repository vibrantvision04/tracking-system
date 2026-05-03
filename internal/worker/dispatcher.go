package worker

import (
	"context"
	"encoding/json"
	"gps-tracking-system/internal/decoder"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

type Dispatcher struct {
	rdb *redis.Client
	// Add geofence engine here later
}

func NewDispatcher(rdb *redis.Client) *Dispatcher {
	return &Dispatcher{rdb: rdb}
}

func (d *Dispatcher) Dispatch(ctx context.Context, data decoder.AVLData) {
	// 1. Broadcast to Redis Pub/Sub for WebSockets
	// Channel name: gps:live:{imei}
	payload := map[string]interface{}{
		"type": "gps_update",
		"imei": data.IMEI,
		"lat":  data.Lat,
		"lng":  data.Lng,
		"speed": data.Speed,
		"timestamp": data.Time,
	}
	jsonData, _ := json.Marshal(payload)
	err := d.rdb.Publish(ctx, "gps:live:"+data.IMEI, jsonData).Err()
	if err != nil {
		log.Error().Err(err).Str("imei", data.IMEI).Msg("Failed to publish to Redis PubSub")
	}

	// 2. Geofence check (To be implemented in Phase 4)
	// d.geofenceEngine.Check(data)
	
	// 3. Trip detection (To be implemented in Phase 4)
	// d.tripService.Process(data)
}
