package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"gps-tracking-system/internal/auth"
)

type EmployeeResponse struct {
	ID               int    `json:"id"`
	FirstName        string `json:"first_name"`
	MiddleName       string `json:"middle_name"`
	LastName         string `json:"last_name"`
	EmployeeID       string `json:"employee_id"`
	Email            string `json:"email"`
	AadhaarNo        string `json:"aadhaar_no"`
	ContactNo        string `json:"contact_no"`
	AltContactNo     string `json:"alt_contact_no"`
	Address          string `json:"address"`
	OtherDetails     string `json:"other_details"`
	DocumentFileType string `json:"document_file_type"`
	DocumentFilePath string `json:"document_file_path"`
	IsActive         bool   `json:"is_active"`
	CreatedAt        string `json:"created_at"`
}

// GetEmployees returns a paginated list of employees.
func (h *Handler) GetEmployees(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	isAll := r.URL.Query().Get("all") == "true" || r.URL.Query().Get("page_size") == "-1"

	var total int
	err := db.QueryRow(ctx, `SELECT COUNT(*) FROM employees`).Scan(&total)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to count employees: " + err.Error()})
		return
	}

	var rows pgx.Rows
	var qerr error

	if isAll {
		rows, qerr = db.Query(ctx, `
			SELECT 
				id, first_name, COALESCE(middle_name, ''), last_name, employee_id, 
				COALESCE(email, ''), aadhaar_no, contact_no, COALESCE(alt_contact_no, ''), 
				address, COALESCE(other_details, ''), COALESCE(document_file_type, ''), 
				COALESCE(document_file_path, ''), COALESCE(is_active, true), 
				TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')
			FROM employees
			ORDER BY id ASC
		`)
	} else {
		page, pageSize := parsePagination(r)
		offset := (page - 1) * pageSize
		rows, qerr = db.Query(ctx, `
			SELECT 
				id, first_name, COALESCE(middle_name, ''), last_name, employee_id, 
				COALESCE(email, ''), aadhaar_no, contact_no, COALESCE(alt_contact_no, ''), 
				address, COALESCE(other_details, ''), COALESCE(document_file_type, ''), 
				COALESCE(document_file_path, ''), COALESCE(is_active, true), 
				TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')
			FROM employees
			ORDER BY id ASC
			LIMIT $1 OFFSET $2
		`, pageSize, offset)
	}

	if qerr != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query employees: " + qerr.Error()})
		return
	}
	defer rows.Close()

	var list []EmployeeResponse = []EmployeeResponse{}
	for rows.Next() {
		var emp EmployeeResponse
		err := rows.Scan(
			&emp.ID, &emp.FirstName, &emp.MiddleName, &emp.LastName, &emp.EmployeeID,
			&emp.Email, &emp.AadhaarNo, &emp.ContactNo, &emp.AltContactNo,
			&emp.Address, &emp.OtherDetails, &emp.DocumentFileType,
			&emp.DocumentFilePath, &emp.IsActive, &emp.CreatedAt,
		)
		if err == nil {
			list = append(list, emp)
		}
	}

	if isAll {
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success":     true,
			"data":        list,
			"total":       total,
			"page":        1,
			"page_size":   total,
			"total_pages": 1,
		})
	} else {
		page, pageSize := parsePagination(r)
		totalPages := (total + pageSize - 1) / pageSize
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success":     true,
			"data":        list,
			"total":       total,
			"page":        page,
			"page_size":   pageSize,
			"total_pages": totalPages,
		})
	}
}

// CreateEmployee inserts a new employee and optionally creates a user account.
func (h *Handler) CreateEmployee(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		FirstName        string `json:"first_name"`
		MiddleName       string `json:"middle_name"`
		LastName         string `json:"last_name"`
		EmployeeID       string `json:"employee_id"`
		Email            string `json:"email"`
		AadhaarNo        string `json:"aadhaar_no"`
		ContactNo        string `json:"contact_no"`
		AltContactNo     string `json:"alt_contact_no"`
		Address          string `json:"address"`
		OtherDetails     string `json:"other_details"`
		DocumentFileType string `json:"document_file_type"`
		DocumentFilePath string `json:"document_file_path"`
		LoginPassword    string `json:"login_password"`
		LoginRole        string `json:"login_role"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	if req.FirstName == "" || req.LastName == "" || req.EmployeeID == "" || req.AadhaarNo == "" || req.ContactNo == "" || req.Address == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing required fields"})
		return
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback(ctx)

	var empID int
	err = tx.QueryRow(ctx, `
		INSERT INTO employees (
			first_name, middle_name, last_name, employee_id, email, 
			aadhaar_no, contact_no, alt_contact_no, address, other_details, 
			document_file_type, document_file_path
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id
	`, req.FirstName, req.MiddleName, req.LastName, req.EmployeeID, req.Email,
		req.AadhaarNo, req.ContactNo, req.AltContactNo, req.Address, req.OtherDetails,
		req.DocumentFileType, req.DocumentFilePath).Scan(&empID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create employee: " + err.Error()})
		return
	}

	if req.LoginPassword != "" {
		// Always derive login email from employee_id for consistent mobile login lookup
		userEmail := strings.ToLower(req.EmployeeID) + "@swift.com"
		role := req.LoginRole
		if role == "" {
			role = "USER"
		}
		hashed, err := auth.HashPassword(req.LoginPassword)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to hash password"})
			return
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO users (email, role, password_hash)
			VALUES ($1, $2, $3)
			ON CONFLICT (email) DO UPDATE SET role = $2, password_hash = $3
		`, userEmail, role, hashed)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create user: " + err.Error()})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to commit: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"id":      empID,
	})
}

// UpdateEmployee updates an employee's details.
func (h *Handler) UpdateEmployee(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	var req struct {
		FirstName        string `json:"first_name"`
		MiddleName       string `json:"middle_name"`
		LastName         string `json:"last_name"`
		EmployeeID       string `json:"employee_id"`
		Email            string `json:"email"`
		AadhaarNo        string `json:"aadhaar_no"`
		ContactNo        string `json:"contact_no"`
		AltContactNo     string `json:"alt_contact_no"`
		Address          string `json:"address"`
		OtherDetails     string `json:"other_details"`
		DocumentFileType string `json:"document_file_type"`
		DocumentFilePath string `json:"document_file_path"`
		LoginPassword    string `json:"login_password"`
		LoginRole        string `json:"login_role"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}

	if req.FirstName == "" || req.LastName == "" || req.EmployeeID == "" || req.AadhaarNo == "" || req.ContactNo == "" || req.Address == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing required fields"})
		return
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		UPDATE employees
		SET first_name = $1, middle_name = $2, last_name = $3, employee_id = $4, email = $5,
			aadhaar_no = $6, contact_no = $7, alt_contact_no = $8, address = $9, other_details = $10,
			document_file_type = $11, document_file_path = $12
		WHERE id = $13
	`, req.FirstName, req.MiddleName, req.LastName, req.EmployeeID, req.Email,
		req.AadhaarNo, req.ContactNo, req.AltContactNo, req.Address, req.OtherDetails,
		req.DocumentFileType, req.DocumentFilePath, id)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update employee: " + err.Error()})
		return
	}

	if req.LoginPassword != "" {
		userEmail := strings.ToLower(req.EmployeeID) + "@swift.com"
		role := req.LoginRole
		if role == "" {
			role = "USER"
		}
		hashed, err := auth.HashPassword(req.LoginPassword)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to hash password"})
			return
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO users (email, role, password_hash)
			VALUES ($1, $2, $3)
			ON CONFLICT (email) DO UPDATE SET role = $2, password_hash = $3
		`, userEmail, role, hashed)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create/update user: " + err.Error()})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to commit: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

// DeleteEmployee removes an employee from the database.
func (h *Handler) DeleteEmployee(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback(ctx)

	// Delete from tables that FK-reference employees without ON DELETE CASCADE
	for _, stmt := range []string{
		"DELETE FROM mobile_attendance WHERE user_id = $1",
		"DELETE FROM mobile_attendance WHERE marked_by = $1",
		"DELETE FROM mobile_blockage_reports WHERE driver_id = $1",
		"DELETE FROM mobile_blockage_reports WHERE reviewed_by = $1",
		"DELETE FROM mobile_open_depot_submissions WHERE operator_id = $1",
	} {
		if _, err := tx.Exec(ctx, stmt, id); err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete related records: " + err.Error()})
			return
		}
	}

	// Cascading tables (ON DELETE CASCADE): employee_department_designations,
	// employee_vehicle_assignments, employee_live_locations handle themselves.

	if _, err := tx.Exec(ctx, "DELETE FROM employees WHERE id = $1", id); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete employee: " + err.Error()})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to commit: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
