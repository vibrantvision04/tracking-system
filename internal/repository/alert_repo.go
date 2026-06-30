package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AlertRepository provides persistence for the unified vehicle-alert feed and
// per-user read state. It backs the mobile alert handlers (tasks 13.2/13.3/13.4)
// but contains persistence only — no HTTP/scoping logic lives here.
type AlertRepository struct {
	db *pgxpool.Pool
}

func NewAlertRepository(db *pgxpool.Pool) *AlertRepository {
	return &AlertRepository{db: db}
}

// VehicleAlert mirrors a row in the vehicle_alerts table (manual alerts and, if
// ever needed, persisted automatic alerts). Nullable columns use pointers.
type VehicleAlert struct {
	ID            int64     `json:"id"`
	Type          string    `json:"type"`
	Source        string    `json:"source"` // 'automatic' | 'manual'
	Message       string    `json:"message"`
	Severity      string    `json:"severity"`
	VehicleID     *int      `json:"vehicle_id,omitempty"`
	RecipientRole *string   `json:"recipient_role,omitempty"`
	RecipientID   *int      `json:"recipient_id,omitempty"`
	SenderRole    *string   `json:"sender_role,omitempty"`
	SenderUserID  *int      `json:"sender_user_id,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

// InsertManualAlert persists a manual alert and returns the generated id.
func (r *AlertRepository) InsertManualAlert(ctx context.Context, a VehicleAlert) (int64, error) {
	const q = `
		INSERT INTO vehicle_alerts
			(type, source, message, severity, vehicle_id, recipient_role, recipient_id, sender_role, sender_user_id)
		VALUES ($1, 'manual', $2, $3, $4, $5, $6, $7, $8)
		RETURNING id`
	var id int64
	err := r.db.QueryRow(ctx, q,
		a.Type, a.Message, a.Severity, a.VehicleID,
		a.RecipientRole, a.RecipientID, a.SenderRole, a.SenderUserID,
	).Scan(&id)
	return id, err
}

// MarkAlertRead records that a user has read a feed item identified by its
// composite feed id (e.g. "auto-123" / "manual-45"). Idempotent: opening an
// already-read alert leaves the original read_at untouched.
func (r *AlertRepository) MarkAlertRead(ctx context.Context, userID int, alertID string) error {
	const q = `
		INSERT INTO alert_reads (user_id, alert_id, read_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (user_id, alert_id) DO NOTHING`
	_, err := r.db.Exec(ctx, q, userID, alertID)
	return err
}

// ReadAlertIDs returns the set of feed ids the user has already read, for
// computing per-alert read state and the unread count.
func (r *AlertRepository) ReadAlertIDs(ctx context.Context, userID int) (map[string]bool, error) {
	const q = `SELECT alert_id FROM alert_reads WHERE user_id = $1`
	rows, err := r.db.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	read := make(map[string]bool)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		read[id] = true
	}
	return read, rows.Err()
}
