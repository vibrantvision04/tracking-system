package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"gps-tracking-system/internal/decoder"
	"time"

	"github.com/redis/go-redis/v9"
)

type LocationCache struct {
	rdb *redis.Client
}

func NewLocationCache(rdb *redis.Client) *LocationCache {
	return &LocationCache{rdb: rdb}
}

func (c *LocationCache) SetLatest(ctx context.Context, data decoder.AVLData) error {
	key := fmt.Sprintf("gps:latest:%s", data.IMEI)
	val, err := json.Marshal(data)
	if err != nil {
		return err
	}
	
	// Set with 1 hour TTL as per prompt
	err = c.rdb.Set(ctx, key, val, 3600*time.Second).Err()
	if err != nil {
		return err
	}

	// Also add to online set
	return c.rdb.SAdd(ctx, "gps:online", data.IMEI).Err()
}

func (c *LocationCache) GetLatest(ctx context.Context, imei string) (*decoder.AVLData, error) {
	key := fmt.Sprintf("gps:latest:%s", imei)
	val, err := c.rdb.Get(ctx, key).Result()
	if err != nil {
		return nil, err
	}

	var data decoder.AVLData
	err = json.Unmarshal([]byte(val), &data)
	if err != nil {
		return nil, err
	}
	return &data, nil
}

func (c *LocationCache) GetAllOnline(ctx context.Context) ([]string, error) {
	return c.rdb.SMembers(ctx, "gps:online").Result()
}
