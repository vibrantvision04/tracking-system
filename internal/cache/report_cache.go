package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type ReportCache struct {
	rdb *redis.Client
}

func NewReportCache(rdb *redis.Client) *ReportCache {
	return &ReportCache{rdb: rdb}
}

func (c *ReportCache) SetMovementReport(ctx context.Context, vehicleID int, date string, data interface{}) error {
	key := fmt.Sprintf("report:movement:%d:%s", vehicleID, date)
	val, err := json.Marshal(data)
	if err != nil {
		return err
	}
	// 24h TTL
	return c.rdb.Set(ctx, key, val, 24*time.Hour).Err()
}

func (c *ReportCache) GetMovementReport(ctx context.Context, vehicleID int, date string) (string, error) {
	key := fmt.Sprintf("report:movement:%d:%s", vehicleID, date)
	return c.rdb.Get(ctx, key).Result()
}
