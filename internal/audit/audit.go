package audit

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

type EventType string

const (
	EventLoginSuccess EventType = "login_success"
	EventLoginFailure EventType = "login_failure"
	EventLogout       EventType = "logout"
	EventUserCreate   EventType = "user_create"
	EventUserDelete   EventType = "user_delete"
	EventUserUpdate   EventType = "user_update"
	EventRoleChange   EventType = "role_change"
	EventTokenRefresh EventType = "token_refresh"
)

type Logger struct {
	db *pgxpool.Pool
}

func NewLogger(db *pgxpool.Pool) *Logger {
	return &Logger{db: db}
}

func (l *Logger) Log(ctx context.Context, event EventType, userID int, email string, ip string, metadata map[string]interface{}) {
	go func() {
		log.Info().
			Str("audit", string(event)).
			Int("user_id", userID).
			Str("email", email).
			Str("ip", ip).
			Interface("metadata", metadata).
			Msg("audit event")

		if l.db == nil {
			return
		}

		metaStr := ""
		if metadata != nil {
			metaStr = fmt.Sprintf("%v", metadata)
		}

		_, err := l.db.Exec(context.Background(), `
			INSERT INTO audit_log (event, user_id, email, ip, metadata, created_at)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, string(event), userID, email, ip, metaStr, time.Now())
		if err != nil {
			log.Error().Err(err).Str("audit", string(event)).Msg("Failed to write audit log")
		}
	}()
}
