package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// AdminGetOpenDepotSubmissions lists mobile open depot submissions with worker and depot info
func (h *Handler) AdminGetOpenDepotSubmissions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	statusFilter := r.URL.Query().Get("status") // Pending, Approved, Rejected, or empty for all

	query := `
		SELECT
			s.id::text,
			s.depot_id,
			COALESCE(d.name, 'Unknown') AS depot_name,
			s.operator_id,
			COALESCE(e.first_name || ' ' || e.last_name, 'Unknown') AS worker_name,
			COALESCE(e.employee_id, '') AS worker_employee_id,
			s.photo_path,
			s.gps_lat,
			s.gps_lng,
			s.shift,
			s.operational_date,
			s.submitted_at,
			s.location_validated,
			s.device_id,
			s.app_version,
			s.approval_status,
			COALESCE(ab.first_name || ' ' || ab.last_name, '') AS approved_by_name,
			s.approved_at,
			s.remarks
		FROM mobile_open_depot_submissions s
		LEFT JOIN open_depots d ON d.id = s.depot_id
		LEFT JOIN employees e ON e.id = s.operator_id
		LEFT JOIN employees ab ON ab.id = s.approved_by
		WHERE 1=1
	`

	var args []interface{}
	argIdx := 1

	if statusFilter != "" {
		query += " AND LOWER(s.approval_status) = LOWER($" + strconv.Itoa(argIdx) + ")"
		args = append(args, statusFilter)
		argIdx++
	}

	query += " ORDER BY s.submitted_at DESC LIMIT 200"

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type Submission struct {
		ID               string    `json:"id"`
		DepotID          int       `json:"depot_id"`
		DepotName        string    `json:"depot_name"`
		OperatorID       int       `json:"operator_id"`
		WorkerName       string    `json:"worker_name"`
		WorkerEmployeeID string    `json:"worker_employee_id"`
		PhotoPath        string    `json:"photo_path"`
		GpsLat           float64   `json:"gps_lat"`
		GpsLng           float64   `json:"gps_lng"`
		Shift            string    `json:"shift"`
		OperationalDate  time.Time `json:"operational_date"`
		SubmittedAt      time.Time `json:"submitted_at"`
		LocationValidated bool     `json:"location_validated"`
		DeviceID         string    `json:"device_id"`
		AppVersion       string    `json:"app_version"`
		ApprovalStatus   string    `json:"approval_status"`
		ApprovedByName   string    `json:"approved_by_name"`
		ApprovedAt       *time.Time `json:"approved_at"`
		Remarks          string    `json:"remarks"`
	}

	var list []Submission
	for rows.Next() {
		var s Submission
		var deviceID, appVersion, approvedByName, remarks *string
		var approvedAt *time.Time

		err := rows.Scan(
			&s.ID, &s.DepotID, &s.DepotName,
			&s.OperatorID, &s.WorkerName, &s.WorkerEmployeeID,
			&s.PhotoPath,
			&s.GpsLat, &s.GpsLng,
			&s.Shift, &s.OperationalDate, &s.SubmittedAt,
			&s.LocationValidated,
			&deviceID, &appVersion,
			&s.ApprovalStatus,
			&approvedByName, &approvedAt, &remarks,
		)
		if err != nil {
			continue
		}
		if deviceID != nil {
			s.DeviceID = *deviceID
		}
		if appVersion != nil {
			s.AppVersion = *appVersion
		}
		if approvedByName != nil {
			s.ApprovedByName = *approvedByName
		}
		if approvedAt != nil {
			s.ApprovedAt = approvedAt
		}
		if remarks != nil {
			s.Remarks = *remarks
		}
		list = append(list, s)
	}

	RespondWithJSON(w, http.StatusOK, list)
}

// AdminReviewOpenDepotSubmission approves or rejects a mobile open depot submission
func (h *Handler) AdminReviewOpenDepotSubmission(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	submissionID := chi.URLParam(r, "id")
	if submissionID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing submission ID")
		return
	}

	var req struct {
		ApprovalStatus string `json:"approval_status"`
		Remarks        string `json:"remarks"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	status := strings.ToLower(strings.TrimSpace(req.ApprovalStatus))
	if status != "approved" && status != "rejected" {
		RespondWithError(w, http.StatusBadRequest, "approval_status must be 'approved' or 'rejected'")
		return
	}

	if status == "rejected" && strings.TrimSpace(req.Remarks) == "" {
		RespondWithError(w, http.StatusBadRequest, "Remarks are required when rejecting")
		return
	}

	db := h.gpsRepo.Pool()

	// Get the admin's employee ID
	localPart := strings.Split(claims.Email, "@")[0]
	var adminEmpID int
	_ = db.QueryRow(ctx, "SELECT id FROM employees WHERE employee_id = $1 OR contact_no = $1 LIMIT 1", localPart).Scan(&adminEmpID)

	approvedStatus := "Approved"
	if status == "rejected" {
		approvedStatus = "Rejected"
	}

	var approvedBy interface{}
	if adminEmpID > 0 {
		approvedBy = adminEmpID
	}
	var remarks interface{}
	if strings.TrimSpace(req.Remarks) != "" {
		remarks = strings.TrimSpace(req.Remarks)
	}

	_, err := db.Exec(ctx, `
		UPDATE mobile_open_depot_submissions
		SET approval_status = $1,
		    approved_by = $2,
		    approved_at = NOW(),
		    remarks = $3
		WHERE id::text = $4
	`, approvedStatus, approvedBy, remarks, submissionID)

	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{
		"message": "Submission " + approvedStatus + " successfully",
	})
}
