package cron

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

type TokenCleanupJob struct {
	db *pgxpool.Pool
}

func NewTokenCleanupJob(db *pgxpool.Pool) *TokenCleanupJob {
	return &TokenCleanupJob{db: db}
}

func (j *TokenCleanupJob) Run() {
	result, err := j.db.Exec(context.Background(), `DELETE FROM refresh_tokens WHERE expires_at < NOW()`)
	if err != nil {
		log.Error().Err(err).Msg("Token cleanup job failed")
		return
	}
	if n := result.RowsAffected(); n > 0 {
		log.Info().Int64("deleted", n).Msg("Cleaned up expired refresh tokens")
	}
}
