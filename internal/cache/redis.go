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
		opts, err = redis.ParseURL(cfg.RedisURL)
		if err != nil {
			return nil, err
		}
	} else {
		opts = &redis.Options{
			Addr:     cfg.RedisAddr,
			Password: cfg.RedisPassword,
			DB:       0,
		}
		// Fallback TLS for Upstash if needed
		if cfg.RedisPassword != "" {
			opts.TLSConfig = &tls.Config{InsecureSkipVerify: true}
		}
	}

	rdb := redis.NewClient(opts)

	err = rdb.Ping(context.Background()).Err()
	if err != nil {
		return nil, err
	}

	log.Info().Msg("Successfully connected to Redis")
	return rdb, nil
}
