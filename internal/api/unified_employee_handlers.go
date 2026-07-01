package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"gps-tracking-system/internal/auth"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog/log"
)

// UnifiedEmployeeRequest is the single payload for create/update of an employee
// with all related entities (user account, role, department, designation, scope).
type UnifiedEmployeeRequest struct {
	// Identity
	FirstName    string `json:"first_name"`
	MiddleName   string `json:"middle_name"`
	LastName     string `json:"last_name"`
	EmployeeID   string `json:"employee_id"`
	Email        string `json:"email"`
	AadhaarNo    string `json:"aadhaar_no"`
	ContactNo    string `json:"contact_no"`
	AltContactNo string `json:"alt_contact_no"`
	Address      string `json:"address"`
	OtherDetails string `json:"other_details"`

	// Login
	Password string `json:"password"` // required on create, optional on update

	// Organizational
	RoleID        int `json:"role_id"`
	DepartmentID  int `json:"department_id"`
	DesignationID int `json:"designation_id"`

	// Scope (dynamic based on role.scope_type)
	ZoneID  *int  `json:"zone_id"`  // for scope_type="zone"
	WardIDs []int `json:"ward_ids"` // for scope_type="ward"

	// Status
	IsActive *bool `json:"is_active"`
}

// UnifiedEmployeeResponse is the complete employee state returned by GET/POST/PUT,
// including joined data from users, roles, departments, designations, and scopes.
type UnifiedEmployeeResponse struct {
	ID              int          `json:"id"`
	FirstName       string       `json:"first_name"`
	MiddleName      string       `json:"middle_name"`
	LastName        string       `json:"last_name"`
	EmployeeID      string       `json:"employee_id"`
	Email           string       `json:"email"`
	AadhaarNo       string       `json:"aadhaar_no"`
	ContactNo       string       `json:"contact_no"`
	AltContactNo    string       `json:"alt_contact_no"`
	Address         string       `json:"address"`
	OtherDetails    string       `json:"other_details"`
	IsActive        bool         `json:"is_active"`
	CreatedAt       string       `json:"created_at"`
	UserID          int          `json:"user_id"`
	UserEmail       string       `json:"user_email"`
	RoleID          int          `json:"role_id"`
	RoleName        string       `json:"role_name"`
	DepartmentID    int          `json:"department_id"`
	DepartmentName  string       `json:"department_name"`
	DesignationID   int          `json:"designation_id"`
	DesignationName string       `json:"designation_name"`
	Scopes          []ScopeEntry `json:"scopes"`
}

// ScopeEntry represents a single zone or ward scope assignment for an employee.
type ScopeEntry struct {
	ScopeType  string `json:"scope_type"` // "zone" or "ward"
	RegionID   int    `json:"region_id"`
	RegionName string `json:"region_name"`
}

// validateCreate checks the UnifiedEmployeeRequest for required fields during employee creation.
// Returns a map of field name → error message for each missing/invalid field.
// An empty map means validation passed.
func validateCreate(req UnifiedEmployeeRequest) map[string]string {
	errors := make(map[string]string)

	if req.EmployeeID == "" {
		errors["employee_id"] = "Employee ID is required"
	}
	if req.FirstName == "" {
		errors["first_name"] = "First name is required"
	}
	if req.LastName == "" {
		errors["last_name"] = "Last name is required"
	}
	if req.ContactNo == "" {
		errors["contact_no"] = "Contact number is required"
	}
	if req.DepartmentID == 0 {
		errors["department_id"] = "Department is required"
	}
	if req.RoleID == 0 {
		errors["role_id"] = "Role is required"
	}
	if req.Password == "" {
		errors["password"] = "Password is required"
	}

	return errors
}

// validateUpdate checks the UnifiedEmployeeRequest for required fields during employee update.
// Password is optional on update — all other required fields are the same as create.
// Returns a map of field name → error message for each missing/invalid field.
// An empty map means validation passed.
func validateUpdate(req UnifiedEmployeeRequest) map[string]string {
	errors := make(map[string]string)

	if req.EmployeeID == "" {
		errors["employee_id"] = "Employee ID is required"
	}
	if req.FirstName == "" {
		errors["first_name"] = "First name is required"
	}
	if req.LastName == "" {
		errors["last_name"] = "Last name is required"
	}
	if req.ContactNo == "" {
		errors["contact_no"] = "Contact number is required"
	}
	if req.DepartmentID == 0 {
		errors["department_id"] = "Department is required"
	}
	if req.RoleID == 0 {
		errors["role_id"] = "Role is required"
	}
	// Password is NOT required on update

	return errors
}

// CreateUnifiedEmployee handles POST /api/employees
// Creates an employee with user account, role assignment, department/designation,
// and scope entries in a single atomic transaction.
func (h *Handler) CreateUnifiedEmployee(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	// Parse request body
	var req UnifiedEmployeeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid JSON payload: "+err.Error())
		return
	}

	// Validate required fields
	fieldErrors := validateCreate(req)
	if len(fieldErrors) > 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":      false,
			"error":        "Validation failed",
			"field_errors": fieldErrors,
		})
		return
	}

	// Derive email if not provided
	email := req.Email
	if email == "" {
		email = strings.ToLower(req.EmployeeID) + "@swift.com"
	}

	// Hash password
	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	// Determine isActive - default to true on create
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	// Begin transaction
	tx, err := db.Begin(ctx)
	if err != nil {
		log.Error().Err(err).Msg("CreateUnifiedEmployee: failed to begin transaction")
		RespondWithError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	// 1. INSERT into employees → get emp_id
	var empID int
	err = tx.QueryRow(ctx, `
		INSERT INTO employees (
			first_name, middle_name, last_name, employee_id, email,
			aadhaar_no, contact_no, alt_contact_no, address, other_details, is_active
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id
	`, req.FirstName, req.MiddleName, req.LastName, req.EmployeeID, email,
		req.AadhaarNo, req.ContactNo, req.AltContactNo, req.Address, req.OtherDetails, isActive).Scan(&empID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			// Determine which field caused the conflict
			errMsg := err.Error()
			if strings.Contains(errMsg, "employee_id") {
				RespondWithError(w, http.StatusConflict, "Employee ID already exists")
			} else if strings.Contains(errMsg, "contact_no") {
				RespondWithError(w, http.StatusConflict, "Contact number already exists")
			} else {
				RespondWithError(w, http.StatusConflict, "Duplicate entry detected")
			}
			return
		}
		log.Error().Err(err).Msg("CreateUnifiedEmployee: failed to insert employee")
		RespondWithError(w, http.StatusInternalServerError, "Failed to create employee")
		return
	}

	// 2. Get role name for the users table
	var roleName string
	err = tx.QueryRow(ctx, `SELECT name FROM roles WHERE id = $1`, req.RoleID).Scan(&roleName)
	if err != nil {
		log.Error().Err(err).Int("role_id", req.RoleID).Msg("CreateUnifiedEmployee: invalid role_id")
		RespondWithError(w, http.StatusBadRequest, fmt.Sprintf("Invalid role_id: role %d does not exist", req.RoleID))
		return
	}

	// 3. INSERT/UPSERT into users → get user_id
	var userID int
	err = tx.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, role)
		VALUES ($1, $2, $3)
		ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = $3
		RETURNING id
	`, email, passwordHash, roleName).Scan(&userID)
	if err != nil {
		log.Error().Err(err).Msg("CreateUnifiedEmployee: failed to upsert user")
		RespondWithError(w, http.StatusInternalServerError, "Failed to create user account")
		return
	}

	// 4. UPSERT into user_roles (enforce single-role-per-user)
	_, err = tx.Exec(ctx, `
		INSERT INTO user_roles (user_id, role_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET role_id = $2
	`, userID, req.RoleID)
	if err != nil {
		log.Error().Err(err).Msg("CreateUnifiedEmployee: failed to upsert user_roles")
		RespondWithError(w, http.StatusInternalServerError, "Failed to assign role")
		return
	}

	// 5. UPSERT into employee_department_designations
	// Determine region_id from zone_id or first ward_id
	var regionID *int
	if req.ZoneID != nil {
		regionID = req.ZoneID
	} else if len(req.WardIDs) > 0 {
		regionID = &req.WardIDs[0]
	}

	if regionID == nil {
		var fallbackID int
		err = tx.QueryRow(ctx, `SELECT id FROM regions ORDER BY id ASC LIMIT 1`).Scan(&fallbackID)
		if err == nil {
			regionID = &fallbackID
		}
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO employee_department_designations (employee_id, department_id, designation_id, region_id)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (employee_id) DO UPDATE SET
			department_id = $2, designation_id = $3, region_id = $4
	`, empID, req.DepartmentID, req.DesignationID, regionID)
	if err != nil {
		log.Error().Err(err).Msg("CreateUnifiedEmployee: failed to upsert employee_department_designations")
		RespondWithError(w, http.StatusInternalServerError, "Failed to assign department/designation")
		return
	}

	// 6. DELETE + INSERT into employee_scopes based on role's scope_type
	var scopeType string
	err = tx.QueryRow(ctx, `SELECT COALESCE(scope_type, 'none') FROM roles WHERE id = $1`, req.RoleID).Scan(&scopeType)
	if err != nil {
		log.Error().Err(err).Msg("CreateUnifiedEmployee: failed to get role scope_type")
		RespondWithError(w, http.StatusInternalServerError, "Failed to determine scope type")
		return
	}

	// Clear existing scopes for this employee
	_, err = tx.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id = $1`, empID)
	if err != nil {
		log.Error().Err(err).Msg("CreateUnifiedEmployee: failed to clear employee_scopes")
		RespondWithError(w, http.StatusInternalServerError, "Failed to manage scope entries")
		return
	}

	// Insert new scope entries based on scope_type
	switch scopeType {
	case "zone":
		if req.ZoneID != nil {
			_, err = tx.Exec(ctx, `
				INSERT INTO employee_scopes (employee_id, scope_type, region_id)
				VALUES ($1, 'zone', $2)
			`, empID, *req.ZoneID)
			if err != nil {
				log.Error().Err(err).Msg("CreateUnifiedEmployee: failed to insert zone scope")
				RespondWithError(w, http.StatusInternalServerError, "Failed to assign zone scope")
				return
			}
		}
	case "ward":
		for _, wardID := range req.WardIDs {
			_, err = tx.Exec(ctx, `
				INSERT INTO employee_scopes (employee_id, scope_type, region_id)
				VALUES ($1, 'ward', $2)
			`, empID, wardID)
			if err != nil {
				log.Error().Err(err).Msg("CreateUnifiedEmployee: failed to insert ward scope")
				RespondWithError(w, http.StatusInternalServerError, "Failed to assign ward scope")
				return
			}
		}
	}
	// scope_type "none" → no scope entries inserted

	// 7. COMMIT
	if err := tx.Commit(ctx); err != nil {
		log.Error().Err(err).Msg("CreateUnifiedEmployee: failed to commit transaction")
		RespondWithError(w, http.StatusInternalServerError, "Failed to commit transaction")
		return
	}

	// 8. Load and return the complete employee state
	response, err := h.loadUnifiedEmployee(ctx, empID)
	if err != nil {
		log.Error().Err(err).Int("emp_id", empID).Msg("CreateUnifiedEmployee: failed to load response")
		// Employee was created successfully, but we couldn't load the full response
		RespondWithJSON(w, http.StatusCreated, map[string]interface{}{"id": empID})
		return
	}

	RespondWithJSON(w, http.StatusCreated, response)
}

// loadUnifiedEmployee fetches a complete employee state with all joins for the response.
func (h *Handler) loadUnifiedEmployee(ctx context.Context, empID int) (*UnifiedEmployeeResponse, error) {
	db := h.gpsRepo.Pool()

	var resp UnifiedEmployeeResponse
	var designationName *string
	var departmentName *string

	err := db.QueryRow(ctx, `
		SELECT
			e.id, e.first_name, COALESCE(e.middle_name, ''), e.last_name,
			e.employee_id, COALESCE(e.email, ''), COALESCE(e.aadhaar_no, ''),
			e.contact_no, COALESCE(e.alt_contact_no, ''),
			COALESCE(e.address, ''), COALESCE(e.other_details, ''),
			COALESCE(e.is_active, true),
			TO_CHAR(e.created_at, 'YYYY-MM-DD HH24:MI:SS'),
			COALESCE(u.id, 0), COALESCE(u.email, ''),
			COALESCE(ur.role_id, 0), COALESCE(r.name, ''),
			COALESCE(edd.department_id, 0), d.name,
			COALESCE(edd.designation_id, 0), des.name
		FROM employees e
		LEFT JOIN users u ON u.email = LOWER(e.employee_id) || '@swift.com'
		LEFT JOIN user_roles ur ON ur.user_id = u.id
		LEFT JOIN roles r ON r.id = ur.role_id
		LEFT JOIN employee_department_designations edd ON edd.employee_id = e.id
		LEFT JOIN departments d ON d.id = edd.department_id
		LEFT JOIN designations des ON des.id = edd.designation_id
		WHERE e.id = $1
	`, empID).Scan(
		&resp.ID, &resp.FirstName, &resp.MiddleName, &resp.LastName,
		&resp.EmployeeID, &resp.Email, &resp.AadhaarNo,
		&resp.ContactNo, &resp.AltContactNo,
		&resp.Address, &resp.OtherDetails,
		&resp.IsActive, &resp.CreatedAt,
		&resp.UserID, &resp.UserEmail,
		&resp.RoleID, &resp.RoleName,
		&resp.DepartmentID, &departmentName,
		&resp.DesignationID, &designationName,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load employee: %w", err)
	}

	if departmentName != nil {
		resp.DepartmentName = *departmentName
	}
	if designationName != nil {
		resp.DesignationName = *designationName
	}

	// Load scopes
	rows, err := db.Query(ctx, `
		SELECT es.scope_type, es.region_id, COALESCE(r.region_name, '')
		FROM employee_scopes es
		LEFT JOIN regions r ON r.id = es.region_id
		WHERE es.employee_id = $1
		ORDER BY es.scope_type, es.region_id
	`, empID)
	if err != nil {
		return nil, fmt.Errorf("failed to load scopes: %w", err)
	}
	defer rows.Close()

	resp.Scopes = []ScopeEntry{}
	for rows.Next() {
		var s ScopeEntry
		if err := rows.Scan(&s.ScopeType, &s.RegionID, &s.RegionName); err != nil {
			continue
		}
		resp.Scopes = append(resp.Scopes, s)
	}

	return &resp, nil
}

// UpdateUnifiedEmployee handles PUT /api/employees/{id}
// Updates an employee with all related entities in a single atomic transaction.
// Detects role changes and clears stale scopes. Skips password update if blank.
func (h *Handler) UpdateUnifiedEmployee(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	// Parse employee ID from URL
	idStr := chi.URLParam(r, "id")
	empID, err := strconv.Atoi(idStr)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Parse request body
	var req UnifiedEmployeeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid JSON payload: "+err.Error())
		return
	}

	// Validate required fields (password not required on update)
	fieldErrors := validateUpdate(req)
	if len(fieldErrors) > 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":      false,
			"error":        "Validation failed",
			"field_errors": fieldErrors,
		})
		return
	}

	// Check employee exists and get current state
	var currentRoleID int
	var currentUserID int
	var currentEmail string
	err = db.QueryRow(ctx, `
		SELECT e.id, COALESCE(u.id, 0), COALESCE(ur.role_id, 0), COALESCE(u.email, '')
		FROM employees e
		LEFT JOIN users u ON u.email = LOWER(e.employee_id) || '@swift.com'
		LEFT JOIN user_roles ur ON ur.user_id = u.id
		WHERE e.id = $1
	`, empID).Scan(&empID, &currentUserID, &currentRoleID, &currentEmail)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Employee not found")
		return
	}

	// Derive email if not provided
	email := req.Email
	if email == "" {
		email = strings.ToLower(req.EmployeeID) + "@swift.com"
	}
	// Login email is always derived from employee_id (not personal email)
	loginEmail := strings.ToLower(req.EmployeeID) + "@swift.com"

	// Determine isActive
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	// Begin transaction
	tx, err := db.Begin(ctx)
	if err != nil {
		log.Error().Err(err).Msg("UpdateUnifiedEmployee: failed to begin transaction")
		RespondWithError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	// 1. UPDATE employees
	_, err = tx.Exec(ctx, `
		UPDATE employees SET
			first_name = $1, middle_name = $2, last_name = $3, employee_id = $4, email = $5,
			aadhaar_no = $6, contact_no = $7, alt_contact_no = $8, address = $9, other_details = $10,
			is_active = $11
		WHERE id = $12
	`, req.FirstName, req.MiddleName, req.LastName, req.EmployeeID, email,
		req.AadhaarNo, req.ContactNo, req.AltContactNo, req.Address, req.OtherDetails,
		isActive, empID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			errMsg := err.Error()
			if strings.Contains(errMsg, "employee_id") {
				RespondWithError(w, http.StatusConflict, "Employee ID already exists")
			} else if strings.Contains(errMsg, "contact_no") {
				RespondWithError(w, http.StatusConflict, "Contact number already exists")
			} else {
				RespondWithError(w, http.StatusConflict, "Duplicate entry detected")
			}
			return
		}
		log.Error().Err(err).Msg("UpdateUnifiedEmployee: failed to update employee")
		RespondWithError(w, http.StatusInternalServerError, "Failed to update employee")
		return
	}

	// 2. Get role name for the users table
	var roleName string
	err = tx.QueryRow(ctx, `SELECT name FROM roles WHERE id = $1`, req.RoleID).Scan(&roleName)
	if err != nil {
		log.Error().Err(err).Int("role_id", req.RoleID).Msg("UpdateUnifiedEmployee: invalid role_id")
		RespondWithError(w, http.StatusBadRequest, fmt.Sprintf("Invalid role_id: role %d does not exist", req.RoleID))
		return
	}

	// 3. UPDATE or INSERT user — skip password if blank
	var userID int
	if req.Password != "" {
		// Hash new password
		passwordHash, err := auth.HashPassword(req.Password)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, "Failed to hash password")
			return
		}
		err = tx.QueryRow(ctx, `
			INSERT INTO users (email, password_hash, role)
			VALUES ($1, $2, $3)
			ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = $3
			RETURNING id
		`, loginEmail, passwordHash, roleName).Scan(&userID)
	} else {
		// Keep existing password — only update role
		err = tx.QueryRow(ctx, `
			INSERT INTO users (email, password_hash, role)
			VALUES ($1, '', $2)
			ON CONFLICT (email) DO UPDATE SET role = $2
			RETURNING id
		`, loginEmail, roleName).Scan(&userID)
	}
	if err != nil {
		log.Error().Err(err).Msg("UpdateUnifiedEmployee: failed to upsert user")
		RespondWithError(w, http.StatusInternalServerError, "Failed to update user account")
		return
	}

	// 4. UPSERT user_roles
	_, err = tx.Exec(ctx, `
		INSERT INTO user_roles (user_id, role_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET role_id = $2
	`, userID, req.RoleID)
	if err != nil {
		log.Error().Err(err).Msg("UpdateUnifiedEmployee: failed to upsert user_roles")
		RespondWithError(w, http.StatusInternalServerError, "Failed to assign role")
		return
	}

	// 5. UPSERT employee_department_designations
	var regionID *int
	if req.ZoneID != nil {
		regionID = req.ZoneID
	} else if len(req.WardIDs) > 0 {
		regionID = &req.WardIDs[0]
	}

	if regionID == nil {
		var fallbackID int
		err = tx.QueryRow(ctx, `SELECT id FROM regions ORDER BY id ASC LIMIT 1`).Scan(&fallbackID)
		if err == nil {
			regionID = &fallbackID
		}
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO employee_department_designations (employee_id, department_id, designation_id, region_id)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (employee_id) DO UPDATE SET
			department_id = $2, designation_id = $3, region_id = $4
	`, empID, req.DepartmentID, req.DesignationID, regionID)
	if err != nil {
		log.Error().Err(err).Msg("UpdateUnifiedEmployee: failed to upsert employee_department_designations")
		RespondWithError(w, http.StatusInternalServerError, "Failed to assign department/designation")
		return
	}

	// 6. Detect role change → clear stale scopes and insert new ones
	roleChanged := currentRoleID != req.RoleID

	// Get the new role's scope_type
	var scopeType string
	err = tx.QueryRow(ctx, `SELECT COALESCE(scope_type, 'none') FROM roles WHERE id = $1`, req.RoleID).Scan(&scopeType)
	if err != nil {
		log.Error().Err(err).Msg("UpdateUnifiedEmployee: failed to get role scope_type")
		RespondWithError(w, http.StatusInternalServerError, "Failed to determine scope type")
		return
	}

	// Always clear and re-insert scopes (handles both role-change and scope-value-change)
	_, err = tx.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id = $1`, empID)
	if err != nil {
		log.Error().Err(err).Msg("UpdateUnifiedEmployee: failed to clear employee_scopes")
		RespondWithError(w, http.StatusInternalServerError, "Failed to manage scope entries")
		return
	}

	// Insert new scope entries based on scope_type
	switch scopeType {
	case "zone":
		if req.ZoneID != nil {
			_, err = tx.Exec(ctx, `
				INSERT INTO employee_scopes (employee_id, scope_type, region_id)
				VALUES ($1, 'zone', $2)
			`, empID, *req.ZoneID)
			if err != nil {
				log.Error().Err(err).Msg("UpdateUnifiedEmployee: failed to insert zone scope")
				RespondWithError(w, http.StatusInternalServerError, "Failed to assign zone scope")
				return
			}
		}
	case "ward":
		for _, wardID := range req.WardIDs {
			_, err = tx.Exec(ctx, `
				INSERT INTO employee_scopes (employee_id, scope_type, region_id)
				VALUES ($1, 'ward', $2)
			`, empID, wardID)
			if err != nil {
				log.Error().Err(err).Msg("UpdateUnifiedEmployee: failed to insert ward scope")
				RespondWithError(w, http.StatusInternalServerError, "Failed to assign ward scope")
				return
			}
		}
	}

	// 7. If role changed FROM Driver → non-Driver, remove vehicle assignments
	if roleChanged {
		var oldRoleName string
		if currentRoleID > 0 {
			_ = tx.QueryRow(ctx, `SELECT COALESCE(name, '') FROM roles WHERE id = $1`, currentRoleID).Scan(&oldRoleName)
		}
		oldIsDriver := strings.Contains(strings.ToLower(oldRoleName), "driver")
		newIsDriver := strings.Contains(strings.ToLower(roleName), "driver")
		if oldIsDriver && !newIsDriver {
			_, err = tx.Exec(ctx, `DELETE FROM employee_vehicle_assignments WHERE employee_id = $1`, empID)
			if err != nil {
				log.Error().Err(err).Int("emp_id", empID).Msg("UpdateUnifiedEmployee: failed to remove vehicle assignments")
				RespondWithError(w, http.StatusInternalServerError, "Failed to remove vehicle assignments")
				return
			}
			log.Info().Int("emp_id", empID).Str("old_role", oldRoleName).Str("new_role", roleName).Msg("UpdateUnifiedEmployee: removed vehicle assignments due to Driver→non-Driver role change")
		}
	}

	// 8. COMMIT
	if err := tx.Commit(ctx); err != nil {
		log.Error().Err(err).Msg("UpdateUnifiedEmployee: failed to commit transaction")
		RespondWithError(w, http.StatusInternalServerError, "Failed to commit transaction")
		return
	}

	// 9. Load and return the complete employee state
	response, err := h.loadUnifiedEmployee(ctx, empID)
	if err != nil {
		log.Error().Err(err).Int("emp_id", empID).Msg("UpdateUnifiedEmployee: failed to load response")
		RespondWithJSON(w, http.StatusOK, map[string]interface{}{"id": empID})
		return
	}

	RespondWithJSON(w, http.StatusOK, response)
}

// GetUnifiedEmployee handles GET /api/employees/{id}
// Returns the complete employee state including all joined data.
func (h *Handler) GetUnifiedEmployee(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	idStr := chi.URLParam(r, "id")
	empID, err := strconv.Atoi(idStr)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	response, err := h.loadUnifiedEmployee(ctx, empID)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Employee not found")
		return
	}

	RespondWithJSON(w, http.StatusOK, response)
}

// GetUnifiedEmployees handles GET /api/employees
// Lists employees with joined data. Supports filters:
//   - ?department_id=N — filter by department
//   - ?status=active|inactive (default: active)
//   - ?search=term — filter by name (first_name, last_name, employee_id)
//   - ?page=N&page_size=M — pagination (defaults: page=1, page_size=20)
func (h *Handler) GetUnifiedEmployees(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	// Parse query parameters
	departmentIDStr := r.URL.Query().Get("department_id")
	status := r.URL.Query().Get("status")
	search := r.URL.Query().Get("search")
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("page_size")

	// Defaults
	if status == "" {
		status = "active"
	}
	page := 1
	pageSize := 20
	if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
		page = p
	}
	if ps, err := strconv.Atoi(pageSizeStr); err == nil && ps > 0 && ps <= 100 {
		pageSize = ps
	}
	offset := (page - 1) * pageSize

	// Build query with filters
	baseQuery := `
		FROM employees e
		LEFT JOIN users u ON u.email = LOWER(e.employee_id) || '@swift.com'
		LEFT JOIN user_roles ur ON ur.user_id = u.id
		LEFT JOIN roles r ON r.id = ur.role_id
		LEFT JOIN employee_department_designations edd ON edd.employee_id = e.id
		LEFT JOIN departments d ON d.id = edd.department_id
		LEFT JOIN designations des ON des.id = edd.designation_id
		WHERE 1=1
	`

	args := []interface{}{}
	argIdx := 1

	// Status filter
	if status == "active" {
		baseQuery += fmt.Sprintf(" AND COALESCE(e.is_active, true) = true")
	} else if status == "inactive" {
		baseQuery += fmt.Sprintf(" AND COALESCE(e.is_active, true) = false")
	}
	// status == "all" shows everything

	// Department filter
	if departmentIDStr != "" {
		if deptID, err := strconv.Atoi(departmentIDStr); err == nil {
			baseQuery += fmt.Sprintf(" AND edd.department_id = $%d", argIdx)
			args = append(args, deptID)
			argIdx++
		}
	}

	// Search filter (name or employee_id)
	if search != "" {
		searchPattern := "%" + strings.ToLower(search) + "%"
		baseQuery += fmt.Sprintf(" AND (LOWER(e.first_name) LIKE $%d OR LOWER(e.last_name) LIKE $%d OR LOWER(e.employee_id) LIKE $%d)", argIdx, argIdx, argIdx)
		args = append(args, searchPattern)
		argIdx++
	}

	// Count total
	var total int
	countQuery := "SELECT COUNT(*) " + baseQuery
	err := db.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		log.Error().Err(err).Msg("GetUnifiedEmployees: failed to count employees")
		RespondWithError(w, http.StatusInternalServerError, "Failed to count employees")
		return
	}

	// Fetch page
	selectQuery := `
		SELECT
			e.id, e.first_name, COALESCE(e.middle_name, ''), e.last_name,
			e.employee_id, COALESCE(e.email, ''), COALESCE(e.aadhaar_no, ''),
			e.contact_no, COALESCE(e.alt_contact_no, ''),
			COALESCE(e.address, ''), COALESCE(e.other_details, ''),
			COALESCE(e.is_active, true),
			TO_CHAR(e.created_at, 'YYYY-MM-DD HH24:MI:SS'),
			COALESCE(u.id, 0), COALESCE(u.email, ''),
			COALESCE(ur.role_id, 0), COALESCE(r.name, ''),
			COALESCE(edd.department_id, 0), COALESCE(d.name, ''),
			COALESCE(edd.designation_id, 0), COALESCE(des.name, '')
	` + baseQuery + fmt.Sprintf(" ORDER BY e.id DESC LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
	args = append(args, pageSize, offset)

	rows, err := db.Query(ctx, selectQuery, args...)
	if err != nil {
		log.Error().Err(err).Msg("GetUnifiedEmployees: failed to query employees")
		RespondWithError(w, http.StatusInternalServerError, "Failed to fetch employees")
		return
	}
	defer rows.Close()

	employees := []UnifiedEmployeeResponse{}
	empIDs := []int{}

	for rows.Next() {
		var emp UnifiedEmployeeResponse
		err := rows.Scan(
			&emp.ID, &emp.FirstName, &emp.MiddleName, &emp.LastName,
			&emp.EmployeeID, &emp.Email, &emp.AadhaarNo,
			&emp.ContactNo, &emp.AltContactNo,
			&emp.Address, &emp.OtherDetails,
			&emp.IsActive, &emp.CreatedAt,
			&emp.UserID, &emp.UserEmail,
			&emp.RoleID, &emp.RoleName,
			&emp.DepartmentID, &emp.DepartmentName,
			&emp.DesignationID, &emp.DesignationName,
		)
		if err != nil {
			log.Error().Err(err).Msg("GetUnifiedEmployees: failed to scan row")
			continue
		}
		emp.Scopes = []ScopeEntry{}
		employees = append(employees, emp)
		empIDs = append(empIDs, emp.ID)
	}

	// Batch load scopes for all employees in this page
	if len(empIDs) > 0 {
		scopeQuery := `
			SELECT es.employee_id, es.scope_type, es.region_id, COALESCE(r.region_name, '')
			FROM employee_scopes es
			LEFT JOIN regions r ON r.id = es.region_id
			WHERE es.employee_id = ANY($1)
			ORDER BY es.employee_id, es.scope_type, es.region_id
		`
		scopeRows, err := db.Query(ctx, scopeQuery, empIDs)
		if err == nil {
			defer scopeRows.Close()
			scopeMap := make(map[int][]ScopeEntry)
			for scopeRows.Next() {
				var empIDRef int
				var s ScopeEntry
				if err := scopeRows.Scan(&empIDRef, &s.ScopeType, &s.RegionID, &s.RegionName); err == nil {
					scopeMap[empIDRef] = append(scopeMap[empIDRef], s)
				}
			}
			for i := range employees {
				if scopes, ok := scopeMap[employees[i].ID]; ok {
					employees[i].Scopes = scopes
				}
			}
		}
	}

	totalPages := (total + pageSize - 1) / pageSize

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":     true,
		"data":        employees,
		"total":       total,
		"page":        page,
		"page_size":   pageSize,
		"total_pages": totalPages,
	})
}

// EmployeeStatusRequest is the payload for PUT /api/employees/{id}/status
type EmployeeStatusRequest struct {
	Status string `json:"status"` // "active" or "inactive"
}

// UpdateEmployeeStatus handles PUT /api/employees/{id}/status
// Deactivates or reactivates an employee and their user account.
func (h *Handler) UpdateEmployeeStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	// Parse employee ID from URL
	idStr := chi.URLParam(r, "id")
	empID, err := strconv.Atoi(idStr)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Parse request body
	var req EmployeeStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid JSON payload: "+err.Error())
		return
	}

	// Validate status value
	req.Status = strings.ToLower(strings.TrimSpace(req.Status))
	if req.Status != "active" && req.Status != "inactive" {
		RespondWithError(w, http.StatusBadRequest, "Status must be 'active' or 'inactive'")
		return
	}

	// Check employee exists
	var exists bool
	err = db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM employees WHERE id = $1)`, empID).Scan(&exists)
	if err != nil || !exists {
		RespondWithError(w, http.StatusNotFound, "Employee not found")
		return
	}

	// Begin transaction
	tx, err := db.Begin(ctx)
	if err != nil {
		log.Error().Err(err).Msg("UpdateEmployeeStatus: failed to begin transaction")
		RespondWithError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	isActive := req.Status == "active"

	// 1. Update employee status and is_active flag
	_, err = tx.Exec(ctx, `
		UPDATE employees SET status = $1, is_active = $2 WHERE id = $3
	`, req.Status, isActive, empID)
	if err != nil {
		log.Error().Err(err).Msg("UpdateEmployeeStatus: failed to update employee")
		RespondWithError(w, http.StatusInternalServerError, "Failed to update employee status")
		return
	}

	// 2. Update user account is_active (enable/disable login)
	_, err = tx.Exec(ctx, `
		UPDATE users SET is_active = $1
		WHERE email = (
			SELECT LOWER(employee_id) || '@swift.com' FROM employees WHERE id = $2
		)
	`, isActive, empID)
	if err != nil {
		// Non-fatal: user account might not exist yet
		log.Warn().Err(err).Int("emp_id", empID).Msg("UpdateEmployeeStatus: could not update user is_active")
	}

	// 3. COMMIT
	if err := tx.Commit(ctx); err != nil {
		log.Error().Err(err).Msg("UpdateEmployeeStatus: failed to commit transaction")
		RespondWithError(w, http.StatusInternalServerError, "Failed to commit transaction")
		return
	}

	// 4. Load and return updated employee
	response, err := h.loadUnifiedEmployee(ctx, empID)
	if err != nil {
		log.Error().Err(err).Int("emp_id", empID).Msg("UpdateEmployeeStatus: failed to load response")
		RespondWithJSON(w, http.StatusOK, map[string]interface{}{"id": empID, "status": req.Status})
		return
	}

	RespondWithJSON(w, http.StatusOK, response)
}
