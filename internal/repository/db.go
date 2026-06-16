package repository

import (
	"context"
	"gps-tracking-system/internal/config"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

func InitDB(cfg *config.Config) (*pgxpool.Pool, error) {
	dbConfig, err := pgxpool.ParseConfig(cfg.DBDSN)
	if err != nil {
		return nil, err
	}

	dbConfig.MaxConns = 50
	dbConfig.MinConns = 10

	if dbConfig.ConnConfig.RuntimeParams == nil {
		dbConfig.ConnConfig.RuntimeParams = make(map[string]string)
	}
	dbConfig.ConnConfig.RuntimeParams["plan_cache_mode"] = "force_custom_plan"

	pool, err := pgxpool.NewWithConfig(context.Background(), dbConfig)
	if err != nil {
		return nil, err
	}

	// Test connection
	err = pool.Ping(context.Background())
	if err != nil {
		return nil, err
	}

	log.Info().Msg("Successfully connected to PostgreSQL")
	return pool, nil
}
