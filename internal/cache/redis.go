package cache

import (
	"context"
	"crypto/tls"
	"gps-tracking-system/internal/config"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

func InitRedis(cfg *config.Config) (*redis.Client, error) {
	var opts *redis.Options
	var err error

	if cfg.RedisURL != "" {
		log.Debug().Msg("Attempting to connect to Redis using REDIS_URL")
		opts, err = redis.ParseURL(cfg.RedisURL)
		if err != nil {
			log.Error().Err(err).Msg("Failed to parse REDIS_URL")
			return nil, err
		}
	} else {
		log.Debug().Str("addr", cfg.RedisAddr).Msg("Attempting to connect to Redis using Addr")
		opts = &redis.Options{
			Addr:     cfg.RedisAddr,
			Password: cfg.RedisPassword,
			DB:       0,
		}
		if cfg.RedisPassword != "" {
			opts.TLSConfig = &tls.Config{InsecureSkipVerify: true}
		}
	}

	rdb := redis.NewClient(opts)

	// Fix for Railway/Neon: Apply this BEFORE Ping, as the MISCONF error might block the Ping itself
	log.Debug().Msg("Applying Redis MISCONF fix...")
	_ = rdb.ConfigSet(context.Background(), "stop-writes-on-bgsave-error", "no").Err()
	
	// Memory optimization for 1GB RAM environment
	_ = rdb.ConfigSet(context.Background(), "maxmemory", "256mb").Err()
	_ = rdb.ConfigSet(context.Background(), "maxmemory-policy", "allkeys-lru").Err()

	err = rdb.Ping(context.Background()).Err()
	if err != nil {
		log.Error().Err(err).Msg("Redis Ping failed after attempted fix")
		return nil, err
	}

	log.Info().Msg("Successfully connected to Redis and applied optimizations")
	return rdb, nil
}
