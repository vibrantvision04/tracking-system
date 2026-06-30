package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gps-tracking-system/internal/utils"

	"github.com/go-chi/chi/v5"
)

// =============================================================================
// WEB ADMIN: Sweeping Routes CRUD
// =============================================================================

func (h *Handler) GetSweepingRoutes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()
	page, pageSize := parsePagination(r)

	var total int
	_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM sweeping_routes`).Scan(&total)

	rows, err := db.Query(ctx, `
		SELECT sr.id, sr.route_code, sr.ward_id, COALESCE(r.region_name, ''), sr.name,
		       sr.polyline, sr.point_a, sr.point_b, sr.point_a_radius_m, sr.point_b_radius_m,
		       sr.length_m, sr.direction, sr.status, sr.version, sr.created_at, sr.updated_at
		FROM sweeping_routes sr
		LEFT JOIN regions r ON r.id = sr.ward_id
		ORDER BY sr.id DESC
		LIMIT $1 OFFSET $2
	`, pageSize, (page-1)*pageSize)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	items := []map[string]interface{}{}
	for rows.Next() {
		var id, radiusA, radiusB, version int
		var code, wardName, name, direction, status string
		var wardID int
		var polyline, pointA, pointB []byte
		var lengthM *float64
		var createdAt, updatedAt time.Time

		if err := rows.Scan(&id, &code, &wardID, &wardName, &name,
			&polyline, &pointA, &pointB, &radiusA, &radiusB,
			&lengthM, &direction, &status, &version, &createdAt, &updatedAt); err != nil {
			continue
		}

		var polylineData interface{} = []interface{}{}
		if len(polyline) > 0 {
			json.Unmarshal(polyline, &polylineData)
		}
		var pointAData, pointBData interface{} = map[string]interface{}{}, map[string]interface{}{}
		if len(pointA) > 0 {
			json.Unmarshal(pointA, &pointAData)
		}
		if len(pointB) > 0 {
			json.Unmarshal(pointB, &pointBData)
		}

		items = append(items, map[string]interface{}{
			"id":               id,
			"route_code":       code,
			"ward_id":          wardID,
			"ward_name":        wardName,
			"name":             name,
			"polyline":         polylineData,
			"point_a":          pointAData,
			"point_b":          pointBData,
			"point_a_radius_m": radiusA,
			"point_b_radius_m": radiusB,
			"length_m":         lengthM,
			"direction":        direction,
			"status":           status,
			"version":          version,
			"created_at":       createdAt.Format(time.RFC3339),
			"updated_at":       updatedAt.Format(time.RFC3339),
		})
	}

	totalPages := (total + pageSize - 1) / pageSize
	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"data":        items,
		"total":       total,
		"page":        page,
		"page_size":   pageSize,
		"total_pages": totalPages,
	})
}

func (h *Handler) CreateSweepingRoute(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req struct {
		RouteCode     string          `json:"route_code"`
		WardID        int             `json:"ward_id"`
		Name          string          `json:"name"`
		Polyline      json.RawMessage `json:"polyline"`
		PointA        json.RawMessage `json:"point_a"`
		PointB        json.RawMessage `json:"point_b"`
		PointARadius  int             `json:"point_a_radius_m"`
		PointBRadius  int             `json:"point_b_radius_m"`
		LengthM       *float64        `json:"length_m"`
		Direction     string          `json:"direction"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}
	if req.RouteCode == "" || req.Name == "" || req.WardID == 0 {
		RespondWithError(w, http.StatusBadRequest, "route_code, name, and ward_id are required")
		return
	}
	if req.PointARadius <= 0 {
		req.PointARadius = 20
	}
	if req.PointBRadius <= 0 {
		req.PointBRadius = 20
	}
	if req.Direction == "" {
		req.Direction = "ONE_WAY"
	}

	claims := GetClaims(r)
	userID := 0
	if claims != nil {
		userID = claims.UserID
	}

	db := h.gpsRepo.Pool()
	var id int
	err := db.QueryRow(ctx, `
		INSERT INTO sweeping_routes (route_code, ward_id, name, polyline, point_a, point_b,
		                             point_a_radius_m, point_b_radius_m, length_m, direction, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id
	`, req.RouteCode, req.WardID, req.Name, req.Polyline, req.PointA, req.PointB,
		req.PointARadius, req.PointBRadius, req.LengthM, req.Direction, userID).Scan(&id)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to create route: "+err.Error())
		return
	}

	RespondWithJSON(w, http.StatusCreated, map[string]interface{}{"id": id, "message": "Sweeping route created"})
}

func (h *Handler) UpdateSweepingRoute(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid route id")
		return
	}

	var req struct {
		RouteCode    string          `json:"route_code"`
		WardID       int             `json:"ward_id"`
		Name         string          `json:"name"`
		Polyline     json.RawMessage `json:"polyline"`
		PointA       json.RawMessage `json:"point_a"`
		PointB       json.RawMessage `json:"point_b"`
		PointARadius *int            `json:"point_a_radius_m"`
		PointBRadius *int            `json:"point_b_radius_m"`
		LengthM      *float64        `json:"length_m"`
		Direction    *string         `json:"direction"`
		Status       *string         `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	db := h.gpsRepo.Pool()
	_, err = db.Exec(ctx, `
		UPDATE sweeping_routes SET
			route_code = COALESCE(NULLIF($1, ''), route_code),
			ward_id = CASE WHEN $2 > 0 THEN $2 ELSE ward_id END,
			name = COALESCE(NULLIF($3, ''), name),
			polyline = CASE WHEN $4 IS NOT NULL THEN $4 ELSE polyline END,
			point_a = CASE WHEN $5 IS NOT NULL THEN $5 ELSE point_a END,
			point_b = CASE WHEN $6 IS NOT NULL THEN $6 ELSE point_b END,
			point_a_radius_m = CASE WHEN $7 IS NOT NULL THEN $7 ELSE point_a_radius_m END,
			point_b_radius_m = CASE WHEN $8 IS NOT NULL THEN $8 ELSE point_b_radius_m END,
			length_m = CASE WHEN $9 IS NOT NULL THEN $9 ELSE length_m END,
			direction = COALESCE(NULLIF($10, ''), direction),
			status = COALESCE(NULLIF($11, ''), status),
			version = version + 1,
			updated_at = NOW()
		WHERE id = $12
	`, req.RouteCode, req.WardID, req.Name, req.Polyline, req.PointA, req.PointB,
		req.PointARadius, req.PointBRadius, req.LengthM, req.Direction, req.Status, id)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to update route: "+err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Sweeping route updated"})
}

func (h *Handler) DeleteSweepingRoute(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid route id")
		return
	}

	db := h.gpsRepo.Pool()
	_, err = db.Exec(ctx, `DELETE FROM sweeping_routes WHERE id = $1`, id)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to delete route: "+err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Sweeping route deleted"})
}

// =============================================================================
// WEB ADMIN: Sweeping Assignments CRUD
// =============================================================================

func (h *Handler) GetSweepingAssignments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()
	page, pageSize := parsePagination(r)

	var total int
	_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM sweeping_assignments WHERE is_active = true`).Scan(&total)

	rows, err := db.Query(ctx, `
		SELECT sa.id, sa.employee_id, COALESCE(e.first_name || ' ' || e.last_name, ''), e.employee_id,
		       sa.route_id, sr.name, sr.route_code,
		       sa.ward_id, COALESCE(r.region_name, ''),
		       sa.valid_from, sa.valid_to, sa.created_at
		FROM sweeping_assignments sa
		JOIN employees e ON e.id = sa.employee_id
		JOIN sweeping_routes sr ON sr.id = sa.route_id
		LEFT JOIN regions r ON r.id = sa.ward_id
		WHERE sa.is_active = true
		ORDER BY sa.id DESC
		LIMIT $1 OFFSET $2
	`, pageSize, (page-1)*pageSize)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	items := []map[string]interface{}{}
	for rows.Next() {
		var id, empID, routeID, wardID int
		var empName, empCode, routeName, routeCode, wardName string
		var validFrom time.Time
		var validTo *time.Time
		var createdAt time.Time

		if err := rows.Scan(&id, &empID, &empName, &empCode,
			&routeID, &routeName, &routeCode,
			&wardID, &wardName, &validFrom, &validTo, &createdAt); err != nil {
			continue
		}

		items = append(items, map[string]interface{}{
			"id":                id,
			"employee_id":       empID,
			"employee_name":     empName,
			"employee_code":     empCode,
			"route_id":          routeID,
			"route_name":        routeName,
			"route_code":        routeCode,
			"ward_id":           wardID,
			"ward_name":         wardName,
			"valid_from":        validFrom.Format("2006-01-02"),
			"valid_to":          optionalTimeStr(validTo, "2006-01-02"),
			"created_at":        createdAt.Format(time.RFC3339),
		})
	}

	totalPages := (total + pageSize - 1) / pageSize
	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"data":        items,
		"total":       total,
		"page":        page,
		"page_size":   pageSize,
		"total_pages": totalPages,
	})
}

func (h *Handler) CreateSweepingAssignment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req struct {
		EmployeeID int    `json:"employee_id"`
		RouteID    int    `json:"route_id"`
		WardID     int    `json:"ward_id"`
		ValidFrom  string `json:"valid_from"`
		ValidTo    string `json:"valid_to,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}
	if req.EmployeeID == 0 || req.RouteID == 0 || req.WardID == 0 || req.ValidFrom == "" {
		RespondWithError(w, http.StatusBadRequest, "employee_id, route_id, ward_id, and valid_from are required")
		return
	}

	validFrom, err := time.Parse("2006-01-02", req.ValidFrom)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "valid_from must be YYYY-MM-DD")
		return
	}

	var validTo *time.Time
	if req.ValidTo != "" {
		t, err := time.Parse("2006-01-02", req.ValidTo)
		if err != nil {
			RespondWithError(w, http.StatusBadRequest, "valid_to must be YYYY-MM-DD")
			return
		}
		validTo = &t
	}

	claims := GetClaims(r)
	userID := 0
	if claims != nil {
		userID = claims.UserID
	}

	db := h.gpsRepo.Pool()
	var id int
	err = db.QueryRow(ctx, `
		INSERT INTO sweeping_assignments (employee_id, route_id, ward_id, valid_from, valid_to, created_by)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, req.EmployeeID, req.RouteID, req.WardID, validFrom, validTo, userID).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			RespondWithError(w, http.StatusConflict, "Assignment already exists for this employee and route")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, "Failed to create assignment: "+err.Error())
		return
	}

	RespondWithJSON(w, http.StatusCreated, map[string]interface{}{"id": id, "message": "Sweeping assignment created"})
}

func (h *Handler) DeleteSweepingAssignment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid assignment id")
		return
	}

	db := h.gpsRepo.Pool()
	_, err = db.Exec(ctx, `UPDATE sweeping_assignments SET is_active = false, updated_at = NOW() WHERE id = $1`, id)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to remove assignment: "+err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Assignment removed"})
}

// =============================================================================
// WEB ADMIN: Cleaning Tasks + Review
// =============================================================================

func (h *Handler) GetCleaningTasks(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()
	page, pageSize := parsePagination(r)

	where := []string{"TRUE"}
	args := []interface{}{}

	if status := strings.TrimSpace(r.URL.Query().Get("status")); status != "" {
		args = append(args, status)
		where = append(where, fmt.Sprintf("ct.approval_status = $%d", len(args)))
	}
	if empIDStr := strings.TrimSpace(r.URL.Query().Get("employee_id")); empIDStr != "" {
		if v, err := strconv.Atoi(empIDStr); err == nil {
			args = append(args, v)
			where = append(where, fmt.Sprintf("ct.employee_id = $%d", len(args)))
		}
	}
	if date := strings.TrimSpace(r.URL.Query().Get("date")); date != "" {
		if _, err := time.Parse("2006-01-02", date); err == nil {
			args = append(args, date)
			where = append(where, fmt.Sprintf("ct.operational_date = $%d::date", len(args)))
		}
	}

	whereSQL := strings.Join(where, " AND ")

	var total int
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM cleaning_tasks ct WHERE %s`, whereSQL)
	_ = db.QueryRow(ctx, countQuery, args...).Scan(&total)

	query := fmt.Sprintf(`
		SELECT ct.id, ct.employee_id, COALESCE(e.first_name || ' ' || e.last_name, ''),
		       ct.route_id, sr.name, sr.route_code,
		       ct.attendance_id, ct.before_image_url, ct.before_lat, ct.before_lng,
		       ct.before_timestamp, ct.after_image_url, ct.after_lat, ct.after_lng,
		       ct.after_timestamp, ct.coverage_pct, ct.covered_segments, ct.total_segments,
		       ct.approval_status, ct.rejection_reason, ct.reviewed_at, ct.operational_date, ct.created_at
		FROM cleaning_tasks ct
		JOIN employees e ON e.id = ct.employee_id
		JOIN sweeping_routes sr ON sr.id = ct.route_id
		WHERE %s
		ORDER BY ct.id DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, len(args)+1, len(args)+2)

	pageArgs := append(append([]interface{}{}, args...), pageSize, (page-1)*pageSize)
	rows, err := db.Query(ctx, query, pageArgs...)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	items := []map[string]interface{}{}
	for rows.Next() {
		var id, empID, routeID, coveredSegs, totalSegs int
		var empName, routeName, routeCode, beforeImg, afterImg, status, opDate string
		var attID, rejection *string
		var beforeLat, beforeLng, afterLat, afterLng *float64
		var beforeTS, createdAt time.Time
		var afterTS, reviewedAt *time.Time
		var coveragePct *float64

		if err := rows.Scan(&id, &empID, &empName, &routeID, &routeName, &routeCode,
			&attID, &beforeImg, &beforeLat, &beforeLng, &beforeTS,
			&afterImg, &afterLat, &afterLng, &afterTS,
			&coveragePct, &coveredSegs, &totalSegs, &status, &rejection, &reviewedAt,
			&opDate, &createdAt); err != nil {
			continue
		}

		items = append(items, map[string]interface{}{
			"id":               id,
			"employee_id":      empID,
			"employee_name":    empName,
			"route_id":         routeID,
			"route_name":       routeName,
			"route_code":       routeCode,
			"attendance_id":    attID,
			"before_image_url": beforeImg,
			"before_lat":       beforeLat,
			"before_lng":       beforeLng,
			"before_timestamp": beforeTS.Format(time.RFC3339),
			"after_image_url":  afterImg,
			"after_lat":        afterLat,
			"after_lng":        afterLng,
			"after_timestamp":  optionalTimeStr(afterTS, time.RFC3339),
			"coverage_pct":     coveragePct,
			"covered_segments": coveredSegs,
			"total_segments":   totalSegs,
			"approval_status":  status,
			"rejection_reason": rejection,
			"reviewed_at":      optionalTimeStr(reviewedAt, time.RFC3339),
			"operational_date": opDate,
			"created_at":       createdAt.Format(time.RFC3339),
		})
	}

	totalPages := (total + pageSize - 1) / pageSize
	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"data":        items,
		"total":       total,
		"page":        page,
		"page_size":   pageSize,
		"total_pages": totalPages,
	})
}

func (h *Handler) ReviewCleaningTask(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid task id")
		return
	}

	var req struct {
		Action   string `json:"action"`   // "APPROVED" or "REJECTED"
		Reason   string `json:"reason,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	action := strings.ToUpper(strings.TrimSpace(req.Action))
	if action != "APPROVED" && action != "REJECTED" {
		RespondWithError(w, http.StatusBadRequest, "action must be APPROVED or REJECTED")
		return
	}

	claims := GetClaims(r)
	userID := 0
	if claims != nil {
		userID = claims.UserID
	}

	db := h.gpsRepo.Pool()
	_, err = db.Exec(ctx, `
		UPDATE cleaning_tasks
		SET approval_status = $1, rejection_reason = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
		WHERE id = $4
	`, action, req.Reason, userID, id)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to review task: "+err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Task " + action})
}

// =============================================================================
// MOBILE: Sweeping-Specific Endpoints
// =============================================================================

func (h *Handler) MobileSweepingRoute(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	scope, err := h.resolveScope(ctx, claims)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve scope")
		return
	}
	if scope.EmployeeID == 0 {
		RespondWithError(w, http.StatusNotFound, "No employee record found")
		return
	}

	db := h.gpsRepo.Pool()

	var (
		routeID, wardID, radiusA, radiusB int
		routeName, routeCode, direction, status string
		polyline, pointA, pointB             []byte
		lengthM                              *float64
	)
	err = db.QueryRow(ctx, `
		SELECT sr.id, sr.route_code, sr.ward_id, sr.name,
		       sr.polyline, sr.point_a, sr.point_b,
		       sr.point_a_radius_m, sr.point_b_radius_m,
		       sr.length_m, sr.direction, sr.status
		FROM sweeping_routes sr
		JOIN sweeping_assignments sa ON sa.route_id = sr.id
		WHERE sa.employee_id = $1 AND sa.is_active = true
		  AND (sa.valid_to IS NULL OR sa.valid_to >= CURRENT_DATE)
		  AND sa.valid_from <= CURRENT_DATE
		  AND sr.status = 'ACTIVE'
		ORDER BY sa.id DESC
		LIMIT 1
	`, scope.EmployeeID).Scan(&routeID, &routeCode, &wardID, &routeName,
		&polyline, &pointA, &pointB,
		&radiusA, &radiusB, &lengthM, &direction, &status)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "No sweeping route assigned")
		return
	}

	var polylineData interface{} = []interface{}{}
	if len(polyline) > 0 {
		json.Unmarshal(polyline, &polylineData)
	}
	var pointAData, pointBData interface{} = map[string]interface{}{}, map[string]interface{}{}
	if len(pointA) > 0 {
		json.Unmarshal(pointA, &pointAData)
	}
	if len(pointB) > 0 {
		json.Unmarshal(pointB, &pointBData)
	}

	// Current attendance status
	var attID *string
	var punchedIn bool
	_ = db.QueryRow(ctx, `
		SELECT id::text, punch_in_at FROM mobile_attendance
		WHERE user_id = $1 AND punch_out_at IS NULL AND created_at::DATE = CURRENT_DATE
		ORDER BY created_at DESC LIMIT 1
	`, scope.EmployeeID).Scan(&attID, &punchedIn)

	// Current GPS position from employee_live_locations
	var currentLat, currentLng *float64
	_ = db.QueryRow(ctx, `
		SELECT lat, lng FROM employee_live_locations
		WHERE employee_id = $1
		ORDER BY captured_at DESC LIMIT 1
	`, scope.EmployeeID).Scan(&currentLat, &currentLng)

	// Today's cleaning task
	var taskID *int
	var taskStatus *string
	_ = db.QueryRow(ctx, `
		SELECT id, approval_status FROM cleaning_tasks
		WHERE employee_id = $1 AND operational_date = CURRENT_DATE
		ORDER BY id DESC LIMIT 1
	`, scope.EmployeeID).Scan(&taskID, &taskStatus)

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"route": map[string]interface{}{
			"id":               routeID,
			"route_code":       routeCode,
			"ward_id":          wardID,
			"name":             routeName,
			"polyline":         polylineData,
			"point_a":          pointAData,
			"point_b":          pointBData,
			"point_a_radius_m": radiusA,
			"point_b_radius_m": radiusB,
			"length_m":         lengthM,
			"direction":        direction,
		},
		"current_position": map[string]interface{}{
			"lat": currentLat,
			"lng": currentLng,
		},
		"punched_in":    attID != nil,
		"attendance_id": attID,
		"today_task": map[string]interface{}{
			"id":     taskID,
			"status": taskStatus,
		},
	})
}

// MobileSweepingBeforeImage submits the before-cleaning photo at Point A
func (h *Handler) MobileSweepingBeforeImage(w http.ResponseWriter, r *http.Request) {
	h.handleSweepingImage(false, w, r)
}

// MobileSweepingAfterImage submits the after-cleaning photo at Point B
func (h *Handler) MobileSweepingAfterImage(w http.ResponseWriter, r *http.Request) {
	h.handleSweepingImage(true, w, r)
}

func (h *Handler) handleSweepingImage(isAfter bool, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		PhotoBase64 string  `json:"photo_base64"`
		GpsLat      float64 `json:"gps_lat"`
		GpsLng      float64 `json:"gps_lng"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}
	if req.PhotoBase64 == "" {
		RespondWithError(w, http.StatusBadRequest, "photo_base64 is required")
		return
	}

	scope, err := h.resolveScope(ctx, claims)
	if err != nil || scope.EmployeeID == 0 {
		RespondWithError(w, http.StatusForbidden, "Could not resolve employee scope")
		return
	}

	db := h.gpsRepo.Pool()

	// Get the active assigned route
	var routeID, radiusA, radiusB int
	var pointA, pointB []byte
	err = db.QueryRow(ctx, `
		SELECT sr.id, sr.point_a, sr.point_b, sr.point_a_radius_m, sr.point_b_radius_m
		FROM sweeping_routes sr
		JOIN sweeping_assignments sa ON sa.route_id = sr.id
		WHERE sa.employee_id = $1 AND sa.is_active = true
		  AND (sa.valid_to IS NULL OR sa.valid_to >= CURRENT_DATE)
		  AND sa.valid_from <= CURRENT_DATE
		  AND sr.status = 'ACTIVE'
		ORDER BY sa.id DESC LIMIT 1
	`, scope.EmployeeID).Scan(&routeID, &pointA, &pointB, &radiusA, &radiusB)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "No active sweeping route assigned")
		return
	}

	// Parse the reference point
	var refPt struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	}
	var pointData []byte
	if isAfter {
		pointData = pointB
	} else {
		pointData = pointA
	}
	if err := json.Unmarshal(pointData, &refPt); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Invalid route point data")
		return
	}

	// Radius validation (Point A for before, Point B for after)
	radius := radiusA
	if isAfter {
		radius = radiusB
	}
	distance := utils.Haversine(refPt.Lat, refPt.Lng, req.GpsLat, req.GpsLng) * 1000 // convert km to m
	if distance > float64(radius) {
		RespondWithError(w, http.StatusBadRequest, fmt.Sprintf(
			"You are %.0f meters away from the required location (max %.0f m). Move closer to submit.", distance, float64(radius)))
		return
	}

	// Get active attendance
	var attID string
	err = db.QueryRow(ctx, `
		SELECT id::text FROM mobile_attendance
		WHERE user_id = $1 AND punch_out_at IS NULL AND created_at::DATE = CURRENT_DATE
		ORDER BY created_at DESC LIMIT 1
	`, scope.EmployeeID).Scan(&attID)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "You must punch in first before submitting images")
		return
	}

	photoPath, err := saveBase64Image(req.PhotoBase64, "sweeping")
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to save image")
		return
	}

	if isAfter {
		// Update existing cleaning task with after image
		result, err := db.Exec(ctx, `
			UPDATE cleaning_tasks
			SET after_image_url = $1, after_lat = $2, after_lng = $3,
			    after_timestamp = NOW(), updated_at = NOW()
			WHERE employee_id = $4 AND operational_date = CURRENT_DATE
			  AND after_image_url IS NULL
		`, photoPath, req.GpsLat, req.GpsLng, scope.EmployeeID)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, "Failed to save after image: "+err.Error())
			return
		}
		rowsAffected := result.RowsAffected()
		if rowsAffected == 0 {
			// No existing task or after already submitted — create or update
			_, err = db.Exec(ctx, `
				INSERT INTO cleaning_tasks (employee_id, route_id, attendance_id,
					before_image_url, before_lat, before_lng, before_timestamp,
					after_image_url, after_lat, after_lng, after_timestamp,
					operational_date)
				SELECT $1, $2, $3::uuid,
				       '', 0, 0, NOW(),
				       $4, $5, $6, NOW(),
				       CURRENT_DATE
				WHERE NOT EXISTS (
					SELECT 1 FROM cleaning_tasks
					WHERE employee_id = $1 AND operational_date = CURRENT_DATE AND after_image_url IS NOT NULL
				)
			`, scope.EmployeeID, routeID, attID, photoPath, req.GpsLat, req.GpsLng)
			if err != nil {
				RespondWithError(w, http.StatusInternalServerError, "Failed to save after image: "+err.Error())
				return
			}
		}
	} else {
		// Insert or update before image
		_, err = db.Exec(ctx, `
			INSERT INTO cleaning_tasks (employee_id, route_id, attendance_id,
				before_image_url, before_lat, before_lng, before_timestamp,
				operational_date)
			VALUES ($1, $2, $3::uuid, $4, $5, $6, NOW(), CURRENT_DATE)
			ON CONFLICT DO NOTHING
		`, scope.EmployeeID, routeID, attID, photoPath, req.GpsLat, req.GpsLng)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, "Failed to save before image: "+err.Error())
			return
		}
		// Update if already exists
		_, _ = db.Exec(ctx, `
			UPDATE cleaning_tasks
			SET before_image_url = $1, before_lat = $2, before_lng = $3,
			    before_timestamp = NOW(), updated_at = NOW()
			WHERE employee_id = $4 AND operational_date = CURRENT_DATE
		`, photoPath, req.GpsLat, req.GpsLng, scope.EmployeeID)
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"message":    fmt.Sprintf("%s image submitted successfully", map[bool]string{false: "Before", true: "After"}[isAfter]),
		"image_url":  photoPath,
		"gps_valid":  true,
	})
}

// MobileSweepingCoverage returns the current coverage calculation for today
func (h *Handler) MobileSweepingCoverage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	scope, err := h.resolveScope(ctx, claims)
	if err != nil || scope.EmployeeID == 0 {
		RespondWithError(w, http.StatusForbidden, "Could not resolve employee scope")
		return
	}

	db := h.gpsRepo.Pool()

	// Get today's cleaning task
	var task struct {
		ID             int
		RouteID        int
		CoveragePct    *float64
		CoveredSegs    int
		TotalSegs      int
		BeforeImageURL string
		AfterImageURL  *string
		ApprovalStatus string
	}
	err = db.QueryRow(ctx, `
		SELECT ct.id, ct.route_id, ct.coverage_pct, ct.covered_segments, ct.total_segments,
		       ct.before_image_url, ct.after_image_url, ct.approval_status
		FROM cleaning_tasks ct
		WHERE ct.employee_id = $1 AND ct.operational_date = CURRENT_DATE
		ORDER BY ct.id DESC LIMIT 1
	`, scope.EmployeeID).Scan(&task.ID, &task.RouteID, &task.CoveragePct,
		&task.CoveredSegs, &task.TotalSegs, &task.BeforeImageURL, &task.AfterImageURL, &task.ApprovalStatus)
	if err != nil {
		// No task yet — compute coverage from GPS logs
		h.computeAndSaveCoverage(ctx, scope.EmployeeID)
		_ = db.QueryRow(ctx, `
			SELECT ct.id, ct.route_id, ct.coverage_pct, ct.covered_segments, ct.total_segments,
			       ct.before_image_url, ct.after_image_url, ct.approval_status
			FROM cleaning_tasks ct
			WHERE ct.employee_id = $1 AND ct.operational_date = CURRENT_DATE
			ORDER BY ct.id DESC LIMIT 1
		`, scope.EmployeeID).Scan(&task.ID, &task.RouteID, &task.CoveragePct,
			&task.CoveredSegs, &task.TotalSegs, &task.BeforeImageURL, &task.AfterImageURL, &task.ApprovalStatus)
		if err != nil {
			// Still nothing — empty coverage
			RespondWithJSON(w, http.StatusOK, map[string]interface{}{
				"coverage_pct":     0,
				"covered_segments": 0,
				"total_segments":   0,
				"route_distance_m": 0,
				"covered_distance_m": 0,
				"before_submitted":  false,
				"after_submitted":   false,
				"approval_status":   "NONE",
			})
			return
		}
	}

	// Route length
	var lengthM float64
	_ = db.QueryRow(ctx, `SELECT COALESCE(length_m, 0) FROM sweeping_routes WHERE id = $1`, task.RouteID).Scan(&lengthM)

	coveredDist := 0.0
	if task.TotalSegs > 0 && lengthM > 0 {
		coveredDist = lengthM * float64(task.CoveredSegs) / float64(task.TotalSegs)
	}

	pct := 0.0
	if task.CoveragePct != nil {
		pct = *task.CoveragePct
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"coverage_pct":      math.Round(pct*100) / 100,
		"covered_segments":  task.CoveredSegs,
		"total_segments":    task.TotalSegs,
		"route_distance_m":  lengthM,
		"covered_distance_m": math.Round(coveredDist*100) / 100,
		"before_submitted":  task.BeforeImageURL != "",
		"after_submitted":   task.AfterImageURL != nil && *task.AfterImageURL != "",
		"approval_status":   task.ApprovalStatus,
		"task_id":           task.ID,
	})
}

// MobileSweepingTasks returns the sweeper's cleaning tasks list
func (h *Handler) MobileSweepingTasks(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	scope, err := h.resolveScope(ctx, claims)
	if err != nil || scope.EmployeeID == 0 {
		RespondWithError(w, http.StatusForbidden, "Could not resolve employee scope")
		return
	}

	db := h.gpsRepo.Pool()
	rows, err := db.Query(ctx, `
		SELECT ct.id, sr.name, sr.route_code,
		       ct.before_image_url, ct.after_image_url,
		       ct.coverage_pct, ct.approval_status,
		       ct.created_at, ct.operational_date
		FROM cleaning_tasks ct
		JOIN sweeping_routes sr ON sr.id = ct.route_id
		WHERE ct.employee_id = $1
		ORDER BY ct.created_at DESC
		LIMIT 50
	`, scope.EmployeeID)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	items := []map[string]interface{}{}
	for rows.Next() {
		var id int
		var routeName, routeCode, beforeImg, approvalStatus, opDate string
		var afterImg *string
		var coveragePct *float64
		var createdAt time.Time

		if err := rows.Scan(&id, &routeName, &routeCode,
			&beforeImg, &afterImg, &coveragePct, &approvalStatus,
			&createdAt, &opDate); err != nil {
			continue
		}

		items = append(items, map[string]interface{}{
			"id":              id,
			"route_name":      routeName,
			"route_code":      routeCode,
			"before_image":    beforeImg,
			"after_image":     afterImg,
			"coverage_pct":    coveragePct,
			"approval_status": approvalStatus,
			"date":            opDate,
			"created_at":      createdAt.Format(time.RFC3339),
		})
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{"tasks": items})
}

// MobileSweepingGPSLog records an 8-second GPS ping during active sweeping
func (h *Handler) MobileSweepingGPSLog(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		Lat     float64 `json:"lat"`
		Lng     float64 `json:"lng"`
		SpeedKM float64 `json:"speed_kmh"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	scope, err := h.resolveScope(ctx, claims)
	if err != nil || scope.EmployeeID == 0 {
		RespondWithError(w, http.StatusForbidden, "Could not resolve employee scope")
		return
	}

	db := h.gpsRepo.Pool()

	// Get active route id
	var routeID int
	err = db.QueryRow(ctx, `
		SELECT sr.id FROM sweeping_routes sr
		JOIN sweeping_assignments sa ON sa.route_id = sr.id
		WHERE sa.employee_id = $1 AND sa.is_active = true AND sr.status = 'ACTIVE'
		ORDER BY sa.id DESC LIMIT 1
	`, scope.EmployeeID).Scan(&routeID)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "No active sweeping route")
		return
	}

	_, err = db.Exec(ctx, `
		INSERT INTO sweeping_gps_logs (employee_id, route_id, lat, lng, speed_kmh, captured_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
	`, scope.EmployeeID, routeID, req.Lat, req.Lng, req.SpeedKM)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to record GPS: "+err.Error())
		return
	}

	// Periodically recompute coverage (every 10 pings — ~80 seconds)
	var logCount int
	_ = db.QueryRow(ctx, `
		SELECT COUNT(*) FROM sweeping_gps_logs
		WHERE employee_id = $1 AND route_id = $2 AND created_at > NOW() - INTERVAL '5 minutes'
	`, scope.EmployeeID, routeID).Scan(&logCount)
	if logCount%10 == 0 {
		go h.computeAndSaveCoverage(context.Background(), scope.EmployeeID)
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// =============================================================================
// Coverage Calculation Engine
// =============================================================================

func (h *Handler) computeAndSaveCoverage(ctx context.Context, employeeID int) {
	defer func() {
		if r := recover(); r != nil {
		}
	}()

	db := h.gpsRepo.Pool()

	// Get today's route assignment
	var routeID int
	var polylineJSON []byte
	err := db.QueryRow(ctx, `
		SELECT sr.id, sr.polyline
		FROM sweeping_routes sr
		JOIN sweeping_assignments sa ON sa.route_id = sr.id
		WHERE sa.employee_id = $1 AND sa.is_active = true
		  AND (sa.valid_to IS NULL OR sa.valid_to >= CURRENT_DATE)
		  AND sa.valid_from <= CURRENT_DATE
		  AND sr.status = 'ACTIVE'
		ORDER BY sa.id DESC LIMIT 1
	`, employeeID).Scan(&routeID, &polylineJSON)
	if err != nil {
		return
	}

	// Parse polyline
	var polyline []pt
	if err := json.Unmarshal(polylineJSON, &polyline); err != nil || len(polyline) < 2 {
		return
	}

	// Generate 10m segments along the polyline
	segments := generateRouteSegments(polyline, 10.0)
	totalSegments := len(segments)
	if totalSegments == 0 {
		return
	}

	// Get GPS pings for today between sweeping speed range
	rows, err := db.Query(ctx, `
		SELECT lat, lng, speed_kmh, captured_at
		FROM sweeping_gps_logs
		WHERE employee_id = $1 AND route_id = $2
		  AND created_at::DATE = CURRENT_DATE
		ORDER BY captured_at ASC
	`, employeeID, routeID)
	if err != nil {
		return
	}
	defer rows.Close()

	type gpsPt struct {
		Lat   float64
		Lng   float64
		Speed float64
	}
	var gpsPts []gpsPt
	for rows.Next() {
		var p gpsPt
		var capturedAt time.Time
		if err := rows.Scan(&p.Lat, &p.Lng, &p.Speed, &capturedAt); err == nil {
			gpsPts = append(gpsPts, p)
		}
	}
	if len(gpsPts) < 2 {
		return
	}

	// For each segment, check if at least 2 consecutive GPS points fall within 15m
	coveredSegments := 0
	for _, s := range segments {
		midLat := (s.Start.Lat + s.End.Lat) / 2
		midLng := (s.Start.Lng + s.End.Lng) / 2
		consecutive := 0
		for _, p := range gpsPts {
			dist := utils.Haversine(midLat, midLng, p.Lat, p.Lng) * 1000
			if dist <= 15.0 && p.Speed >= 0.5 && p.Speed <= 6.0 {
				consecutive++
				if consecutive >= 2 {
					coveredSegments++
					break
				}
			} else {
				consecutive = 0
			}
		}
	}

	coveragePct := 0.0
	if totalSegments > 0 {
		coveragePct = float64(coveredSegments) / float64(totalSegments) * 100.0
	}

	// Save to cleaning_tasks or create if not exists
	_, _ = db.Exec(ctx, `
		INSERT INTO cleaning_tasks (employee_id, route_id, coverage_pct, covered_segments, total_segments, operational_date,
			before_image_url, before_lat, before_lng, before_timestamp, approval_status)
		VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, '', 0, 0, NOW(), 'PENDING')
		ON CONFLICT DO NOTHING
	`, employeeID, routeID, coveragePct, coveredSegments, totalSegments)

	_, _ = db.Exec(ctx, `
		UPDATE cleaning_tasks
		SET coverage_pct = $1, covered_segments = $2, total_segments = $3, updated_at = NOW()
		WHERE employee_id = $4 AND operational_date = CURRENT_DATE
	`, coveragePct, coveredSegments, totalSegments, employeeID)
}

type pt struct{ Lat, Lng float64 }
type segment struct{ Start, End pt }

// generateRouteSegments divides a polyline into segments of the given length in meters
func generateRouteSegments(polyline []pt, segmentLengthM float64) []segment {
	if len(polyline) < 2 {
		return nil
	}

	var segments []segment
	remaining := segmentLengthM
	current := polyline[0]

	for i := 1; i < len(polyline); i++ {
		next := polyline[i]
		dist := utils.Haversine(current.Lat, current.Lng, next.Lat, next.Lng) * 1000

		for dist > remaining {
			fraction := remaining / dist
			if fraction > 1 {
				fraction = 1
			}
			mid := pt{
				Lat: current.Lat + fraction*(next.Lat-current.Lat),
				Lng: current.Lng + fraction*(next.Lng-current.Lng),
			}
			segments = append(segments, segment{Start: current, End: mid})
			current = mid
			dist -= remaining
			remaining = segmentLengthM
		}

		remaining -= dist
		current = next
	}

	return segments
}

// =============================================================================
// Helpers
// =============================================================================

func optionalTimeStr(t *time.Time, fmt string) string {
	if t == nil {
		return ""
	}
	return t.Format(fmt)
}
