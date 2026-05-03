package cache

import (
	"context"
	"crypto/tls"
	"gps-tracking-system/internal/config"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

func InitRedis(cfg *config.Config) (*redis.Client, error) {
	opts := &redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       0,
	}

	// Always use TLS for Upstash
	opts.TLSConfig = &tls.Config{
		InsecureSkipVerify: true, // Upstash certs are usually fine but this ensures connection
	}

	rdb := redis.NewClient(opts)

	err := rdb.Ping(context.Background()).Err()
	if err != nil {
		return nil, err
	}

	log.Info().Msg("Successfully connected to Redis")
	return rdb, nil
}
