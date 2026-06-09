package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type OpenDepot struct {
	ID                 int        `json:"id"`
	Name               string     `json:"name"`
	ZoneID             int        `json:"zone_id"`
	WardID             int        `json:"ward_id"`
	Latitude           float64    `json:"latitude"`
	Longitude          float64    `json:"longitude"`
	Radius             float64    `json:"radius"`
	Status             string     `json:"status"`
	CleaningPercentage float64    `json:"cleaning_percentage"`
	LastCleanedAt      *time.Time `json:"last_cleaned_at"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	TotalSubmissions   int        `json:"total_submissions"`
	TotalApproved      int        `json:"total_approved"`
	TotalRejected      int        `json:"total_rejected"`
	LastCleaningStatus *string    `json:"last_cleaning_status"`
	// Extra fields from regions join
	ZoneName           string     `json:"zone_name,omitempty"`
	WardName           string     `json:"ward_name,omitempty"`
}

type OpenDepotCleaning struct {
	ID                 int        `json:"id"`
	OpenDepotID        int        `json:"open_depot_id"`
	ImageUrl           string     `json:"image_url"`
	UploadedBy         string     `json:"uploaded_by"`
	UploadedLatitude   float64    `json:"uploaded_latitude"`
	UploadedLongitude  float64    `json:"uploaded_longitude"`
	UploadTime         time.Time  `json:"upload_time"`
	VerificationStatus string     `json:"verification_status"`
	ApprovalStatus     string     `json:"approval_status"`
	JhalliPattiUsed    *bool      `json:"jhalli_patti_used"`
	ApprovedBy         *string    `json:"approved_by"`
	ApprovedTime       *time.Time `json:"approved_time"`
	Remarks            *string    `json:"remarks"`
	DistanceFromDepot  float64    `json:"distance_from_depot"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	// Extra fields for frontend display
	OpenDepotName      string     `json:"open_depot_name,omitempty"`
	ZoneName           string     `json:"zone_name,omitempty"`
	WardName           string     `json:"ward_name,omitempty"`
}

type OpenDepotRepository struct {
	db *pgxpool.Pool
}

func NewOpenDepotRepository(db *pgxpool.Pool) *OpenDepotRepository {
	return &OpenDepotRepository{db: db}
}

func (r *OpenDepotRepository) Pool() *pgxpool.Pool {
	return r.db
}

func (r *OpenDepotRepository) Create(ctx context.Context, d *OpenDepot) error {
	query := `
		INSERT INTO open_depots (name, zone_id, ward_id, latitude, longitude, radius, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, updated_at
	`
	if d.Status == "" {
		d.Status = "Active"
	}
	return r.db.QueryRow(ctx, query, d.Name, d.ZoneID, d.WardID, d.Latitude, d.Longitude, d.Radius, d.Status).
		Scan(&d.ID, &d.CreatedAt, &d.UpdatedAt)
}

func (r *OpenDepotRepository) GetByID(ctx context.Context, id int) (*OpenDepot, error) {
	query := `
		SELECT 
			d.id, d.name, d.zone_id, d.ward_id, d.latitude, d.longitude, d.radius, d.status,
			d.cleaning_percentage, d.last_cleaned_at, d.created_at, d.updated_at,
			d.total_submissions, d.total_approved, d.total_rejected, d.last_cleaning_status,
			COALESCE(z.region_name, '') as zone_name,
			COALESCE(w.region_name, '') as ward_name
		FROM open_depots d
		LEFT JOIN regions z ON d.zone_id = z.id
		LEFT JOIN regions w ON d.ward_id = w.id
		WHERE d.id = $1
	`
	var d OpenDepot
	err := r.db.QueryRow(ctx, query, id).Scan(
		&d.ID, &d.Name, &d.ZoneID, &d.WardID, &d.Latitude, &d.Longitude, &d.Radius, &d.Status,
		&d.CleaningPercentage, &d.LastCleanedAt, &d.CreatedAt, &d.UpdatedAt,
		&d.TotalSubmissions, &d.TotalApproved, &d.TotalRejected, &d.LastCleaningStatus,
		&d.ZoneName, &d.WardName,
	)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *OpenDepotRepository) GetAll(ctx context.Context) ([]OpenDepot, error) {
	query := `
		SELECT 
			d.id, d.name, d.zone_id, d.ward_id, d.latitude, d.longitude, d.radius, d.status,
			d.cleaning_percentage, d.last_cleaned_at, d.created_at, d.updated_at,
			d.total_submissions, d.total_approved, d.total_rejected, d.last_cleaning_status,
			COALESCE(z.region_name, '') as zone_name,
			COALESCE(w.region_name, '') as ward_name
		FROM open_depots d
		LEFT JOIN regions z ON d.zone_id = z.id
		LEFT JOIN regions w ON d.ward_id = w.id
		ORDER BY d.id DESC
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []OpenDepot
	for rows.Next() {
		var d OpenDepot
		err := rows.Scan(
			&d.ID, &d.Name, &d.ZoneID, &d.WardID, &d.Latitude, &d.Longitude, &d.Radius, &d.Status,
			&d.CleaningPercentage, &d.LastCleanedAt, &d.CreatedAt, &d.UpdatedAt,
			&d.TotalSubmissions, &d.TotalApproved, &d.TotalRejected, &d.LastCleaningStatus,
			&d.ZoneName, &d.WardName,
		)
		if err == nil {
			list = append(list, d)
		}
	}
	return list, nil
}

func (r *OpenDepotRepository) Update(ctx context.Context, d *OpenDepot) error {
	query := `
		UPDATE open_depots
		SET name = $1, zone_id = $2, ward_id = $3, latitude = $4, longitude = $5, radius = $6, status = $7, updated_at = NOW()
		WHERE id = $8
		RETURNING updated_at
	`
	if d.Status == "" {
		d.Status = "Active"
	}
	return r.db.QueryRow(ctx, query, d.Name, d.ZoneID, d.WardID, d.Latitude, d.Longitude, d.Radius, d.Status, d.ID).
		Scan(&d.UpdatedAt)
}

func (r *OpenDepotRepository) Delete(ctx context.Context, id int) error {
	_, err := r.db.Exec(ctx, "DELETE FROM open_depots WHERE id = $1", id)
	return err
}

func (r *OpenDepotRepository) CreateCleaning(ctx context.Context, c *OpenDepotCleaning) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// 1. Insert cleaning submission
	query := `
		INSERT INTO open_depot_cleanings (
			open_depot_id, image_url, uploaded_by, uploaded_latitude, uploaded_longitude, 
			verification_status, approval_status, distance_from_depot
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, upload_time, created_at, updated_at
	`
	if c.ApprovalStatus == "" {
		c.ApprovalStatus = "Pending"
	}
	err = tx.QueryRow(ctx, query, 
		c.OpenDepotID, c.ImageUrl, c.UploadedBy, c.UploadedLatitude, c.UploadedLongitude,
		c.VerificationStatus, c.ApprovalStatus, c.DistanceFromDepot,
	).Scan(&c.ID, &c.UploadTime, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return err
	}

	// 2. Update depot metrics
	updateQuery := `
		UPDATE open_depots
		SET total_submissions = total_submissions + 1,
		    last_cleaning_status = 'Pending Review',
		    updated_at = NOW()
		WHERE id = $1
	`
	_, err = tx.Exec(ctx, updateQuery, c.OpenDepotID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *OpenDepotRepository) ReviewCleaning(ctx context.Context, id int, status string, jhalliPattiUsed *bool, approvedBy string, remarks string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// 1. Get current cleaning log to know depot ID
	var depotID int
	err = tx.QueryRow(ctx, "SELECT open_depot_id FROM open_depot_cleanings WHERE id = $1", id).Scan(&depotID)
	if err != nil {
		return err
	}

	// 2. Update cleaning log
	query := `
		UPDATE open_depot_cleanings
		SET approval_status = $1,
			jhalli_patti_used = $2,
			approved_by = $3,
			approved_time = NOW(),
			remarks = $4,
			updated_at = NOW()
		WHERE id = $5
	`
	_, err = tx.Exec(ctx, query, status, jhalliPattiUsed, approvedBy, remarks, id)
	if err != nil {
		return err
	}

	// 3. Re-calculate metrics for the open depot
	var totalApproved, totalRejected, totalSubmissions int
	err = tx.QueryRow(ctx, `
		SELECT 
			COUNT(*),
			COUNT(CASE WHEN approval_status = 'Approved' THEN 1 END),
			COUNT(CASE WHEN approval_status = 'Rejected' THEN 1 END)
		FROM open_depot_cleanings
		WHERE open_depot_id = $1
	`, depotID).Scan(&totalSubmissions, &totalApproved, &totalRejected)
	if err != nil {
		return err
	}

	// Determine new last_cleaning_status
	var lastStatus string
	if status == "Approved" {
		if jhalliPattiUsed != nil && *jhalliPattiUsed {
			lastStatus = "CLEANED_USING_JHALLI_PATTI"
		} else {
			lastStatus = "CLEANED_NOT_USING_JHALLI_PATTI"
		}
	} else if status == "Rejected" {
		lastStatus = "REJECTED"
	} else {
		lastStatus = "Pending Review"
	}

	// Get last cleaned time (latest approved cleaning upload_time)
	var lastCleanedAt *time.Time
	err = tx.QueryRow(ctx, `
		SELECT MAX(upload_time)
		FROM open_depot_cleanings
		WHERE open_depot_id = $1 AND approval_status = 'Approved'
	`, depotID).Scan(&lastCleanedAt)
	if err != nil {
		lastCleanedAt = nil
	}

	// Calculate cleaning percentage: (totalApproved / totalSubmissions) * 100
	cleaningPercentage := 0.0
	if totalSubmissions > 0 {
		cleaningPercentage = (float64(totalApproved) / float64(totalSubmissions)) * 100.0
	}

	// Update the open_depot table
	updateDepotQuery := `
		UPDATE open_depots
		SET total_submissions = $1,
			total_approved = $2,
			total_rejected = $3,
			last_cleaning_status = $4,
			last_cleaned_at = $5,
			cleaning_percentage = $6,
			updated_at = NOW()
		WHERE id = $7
	`
	_, err = tx.Exec(ctx, updateDepotQuery, totalSubmissions, totalApproved, totalRejected, lastStatus, lastCleanedAt, cleaningPercentage, depotID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *OpenDepotRepository) GetCleaningsReport(ctx context.Context, filters map[string]interface{}) ([]OpenDepotCleaning, error) {
	query := `
		SELECT 
			c.id, c.open_depot_id, c.image_url, c.uploaded_by, c.uploaded_latitude, c.uploaded_longitude, 
			c.upload_time, c.verification_status, c.approval_status, c.jhalli_patti_used, 
			c.approved_by, c.approved_time, c.remarks, c.distance_from_depot, c.created_at, c.updated_at,
			COALESCE(d.name, '') as open_depot_name,
			COALESCE(z.region_name, '') as zone_name,
			COALESCE(w.region_name, '') as ward_name
		FROM open_depot_cleanings c
		LEFT JOIN open_depots d ON c.open_depot_id = d.id
		LEFT JOIN regions z ON d.zone_id = z.id
		LEFT JOIN regions w ON d.ward_id = w.id
		WHERE 1=1
	`
	var args []interface{}
	argCount := 1

	if val, ok := filters["open_depot_id"]; ok && val != nil {
		query += fmt.Sprintf(" AND c.open_depot_id = $%d", argCount)
		args = append(args, val)
		argCount++
	}
	if val, ok := filters["zone_id"]; ok && val != nil {
		query += fmt.Sprintf(" AND d.zone_id = $%d", argCount)
		args = append(args, val)
		argCount++
	}
	if val, ok := filters["ward_id"]; ok && val != nil {
		query += fmt.Sprintf(" AND d.ward_id = $%d", argCount)
		args = append(args, val)
		argCount++
	}
	if val, ok := filters["approval_status"]; ok && val != nil && val != "" {
		query += fmt.Sprintf(" AND c.approval_status = $%d", argCount)
		args = append(args, val)
		argCount++
	}
	if val, ok := filters["start_date"]; ok && val != nil && val != "" {
		query += fmt.Sprintf(" AND c.upload_time >= $%d", argCount)
		args = append(args, val)
		argCount++
	}
	if val, ok := filters["end_date"]; ok && val != nil && val != "" {
		query += fmt.Sprintf(" AND c.upload_time <= $%d", argCount)
		args = append(args, val)
		argCount++
	}

	query += " ORDER BY c.id DESC"

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []OpenDepotCleaning
	for rows.Next() {
		var c OpenDepotCleaning
		err := rows.Scan(
			&c.ID, &c.OpenDepotID, &c.ImageUrl, &c.UploadedBy, &c.UploadedLatitude, &c.UploadedLongitude,
			&c.UploadTime, &c.VerificationStatus, &c.ApprovalStatus, &c.JhalliPattiUsed,
			&c.ApprovedBy, &c.ApprovedTime, &c.Remarks, &c.DistanceFromDepot, &c.CreatedAt, &c.UpdatedAt,
			&c.OpenDepotName, &c.ZoneName, &c.WardName,
		)
		if err == nil {
			list = append(list, c)
		}
	}
	return list, nil
}

func (r *OpenDepotRepository) GetAnalytics(ctx context.Context) (map[string]interface{}, error) {
	var totalDepots int
	err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM open_depots").Scan(&totalDepots)
	if err != nil {
		return nil, err
	}

	var totalCleaned int
	err = r.db.QueryRow(ctx, `
		SELECT COUNT(DISTINCT open_depot_id) 
		FROM open_depot_cleanings 
		WHERE approval_status = 'Approved'
	`).Scan(&totalCleaned)
	if err != nil {
		return nil, err
	}

	var totalPending int
	err = r.db.QueryRow(ctx, `
		SELECT COUNT(DISTINCT open_depot_id) 
		FROM open_depot_cleanings 
		WHERE approval_status = 'Pending'
	`).Scan(&totalPending)
	if err != nil {
		return nil, err
	}

	var totalRejected int
	err = r.db.QueryRow(ctx, `
		SELECT COUNT(*) 
		FROM open_depot_cleanings 
		WHERE approval_status = 'Rejected'
	`).Scan(&totalRejected)
	if err != nil {
		return nil, err
	}

	cleaningPercentage := 0.0
	if totalDepots > 0 {
		cleaningPercentage = (float64(totalCleaned) / float64(totalDepots)) * 100.0
	}

	jhalliPattiUsagePercentage := 0.0
	var totalApprovedJhalli, totalApprovedCleanings int
	err = r.db.QueryRow(ctx, `
		SELECT 
			COUNT(CASE WHEN jhalli_patti_used = true THEN 1 END),
			COUNT(*)
		FROM open_depot_cleanings
		WHERE approval_status = 'Approved'
	`).Scan(&totalApprovedJhalli, &totalApprovedCleanings)
	if err == nil && totalApprovedCleanings > 0 {
		jhalliPattiUsagePercentage = (float64(totalApprovedJhalli) / float64(totalApprovedCleanings)) * 100.0
	}

	zoneRows, err := r.db.Query(ctx, `
		SELECT 
			z.id, 
			z.region_name,
			COUNT(d.id) as total,
			COUNT(CASE WHEN d.cleaning_percentage > 0 OR EXISTS (
				SELECT 1 FROM open_depot_cleanings c 
				WHERE c.open_depot_id = d.id AND c.approval_status = 'Approved'
			) THEN 1 END) as cleaned
		FROM regions z
		LEFT JOIN open_depots d ON d.zone_id = z.id
		WHERE z.region_type_id = 2
		GROUP BY z.id, z.region_name
		ORDER BY z.region_name ASC
	`)
	var zoneStats []map[string]interface{}
	if err == nil {
		defer zoneRows.Close()
		for zoneRows.Next() {
			var id int
			var name string
			var total, cleaned int
			if err := zoneRows.Scan(&id, &name, &total, &cleaned); err == nil {
				pct := 0.0
				if total > 0 {
					pct = (float64(cleaned) / float64(total)) * 100.0
				}
				zoneStats = append(zoneStats, map[string]interface{}{
					"zone_id":             id,
					"zone_name":           name,
					"total_depots":        total,
					"cleaned_depots":      cleaned,
					"cleaning_percentage": pct,
				})
			}
		}
	}

	wardRows, err := r.db.Query(ctx, `
		SELECT 
			w.id, 
			w.region_name,
			w.parent_id as zone_id,
			COUNT(d.id) as total,
			COUNT(CASE WHEN d.cleaning_percentage > 0 OR EXISTS (
				SELECT 1 FROM open_depot_cleanings c 
				WHERE c.open_depot_id = d.id AND c.approval_status = 'Approved'
			) THEN 1 END) as cleaned
		FROM regions w
		LEFT JOIN open_depots d ON d.ward_id = w.id
		WHERE w.region_type_id = 3
		GROUP BY w.id, w.region_name, w.parent_id
		ORDER BY w.region_name ASC
		LIMIT 100
	`)
	var wardStats []map[string]interface{}
	if err == nil {
		defer wardRows.Close()
		for wardRows.Next() {
			var id int
			var name string
			var zoneID *int
			var total, cleaned int
			if err := wardRows.Scan(&id, &name, &zoneID, &total, &cleaned); err == nil {
				pct := 0.0
				if total > 0 {
					pct = (float64(cleaned) / float64(total)) * 100.0
				}
				wardStats = append(wardStats, map[string]interface{}{
					"ward_id":             id,
					"ward_name":           name,
					"zone_id":             zoneID,
					"total_depots":        total,
					"cleaned_depots":      cleaned,
					"cleaning_percentage": pct,
				})
			}
		}
	}

	monthlyRows, err := r.db.Query(ctx, `
		SELECT 
			TO_CHAR(upload_time, 'YYYY-MM') as month,
			COUNT(*) as total,
			COUNT(CASE WHEN approval_status = 'Approved' THEN 1 END) as approved,
			COUNT(CASE WHEN approval_status = 'Pending' THEN 1 END) as pending,
			COUNT(CASE WHEN approval_status = 'Rejected' THEN 1 END) as rejected
		FROM open_depot_cleanings
		GROUP BY TO_CHAR(upload_time, 'YYYY-MM')
		ORDER BY month DESC
		LIMIT 12
	`)
	var monthlyStats []map[string]interface{}
	if err == nil {
		defer monthlyRows.Close()
		for monthlyRows.Next() {
			var month string
			var total, approved, pending, rejected int
			if err := monthlyRows.Scan(&month, &total, &approved, &pending, &rejected); err == nil {
				monthlyStats = append(monthlyStats, map[string]interface{}{
					"month":    month,
					"total":    total,
					"approved": approved,
					"pending":  pending,
					"rejected": rejected,
				})
			}
		}
	}

	return map[string]interface{}{
		"total_open_depots":              totalDepots,
		"cleaned_open_depots":            totalCleaned,
		"pending_open_depots":            totalPending,
		"rejected_cleanings":             totalRejected,
		"cleaning_percentage":            cleaningPercentage,
		"jhalli_patti_usage_percentage":  jhalliPattiUsagePercentage,
		"zone_wise_statistics":          zoneStats,
		"ward_wise_statistics":          wardStats,
		"monthly_statistics":            monthlyStats,
	}, nil
}
