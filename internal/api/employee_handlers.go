package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
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

// GetEmployees returns all active employees from the database.
func (h *Handler) GetEmployees(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT 
			id, first_name, COALESCE(middle_name, ''), last_name, employee_id, 
			COALESCE(email, ''), aadhaar_no, contact_no, COALESCE(alt_contact_no, ''), 
			address, COALESCE(other_details, ''), COALESCE(document_file_type, ''), 
			COALESCE(document_file_path, ''), COALESCE(is_active, true), 
			TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')
		FROM employees
		ORDER BY id ASC
	`)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query employees: " + err.Error()})
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

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    list,
	})
}

// CreateEmployee inserts a new employee.
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
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	if req.FirstName == "" || req.LastName == "" || req.EmployeeID == "" || req.AadhaarNo == "" || req.ContactNo == "" || req.Address == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing required fields"})
		return
	}

	var empID int
	err := db.QueryRow(ctx, `
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
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}

	if req.FirstName == "" || req.LastName == "" || req.EmployeeID == "" || req.AadhaarNo == "" || req.ContactNo == "" || req.Address == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing required fields"})
		return
	}

	_, err = db.Exec(ctx, `
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

	_, err = db.Exec(ctx, "DELETE FROM employees WHERE id = $1", id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete employee: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
