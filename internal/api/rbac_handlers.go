package api

import (
	"encoding/json"
	"gps-tracking-system/internal/repository"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// ---- Roles ----

// RoleWithExtras extends the base Role with scope_type and employee_count
// for the GET /api/rbac/roles response.
type RoleWithExtras struct {
	repository.Role
	ScopeType     string `json:"scope_type"`
	EmployeeCount int    `json:"employee_count"`
}

func (h *Handler) GetRoles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	// Query roles with scope_type and assigned employee count
	rows, err := db.Query(ctx, `
		SELECT r.id, r.name, COALESCE(r.description,''), r.is_system, r.is_active,
		       r.created_at, r.updated_at,
		       COALESCE(r.scope_type, 'none'),
		       (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id)
		FROM roles r
		ORDER BY r.is_system DESC, r.id ASC
	`)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var list []RoleWithExtras
	for rows.Next() {
		var ro RoleWithExtras
		if err := rows.Scan(&ro.ID, &ro.Name, &ro.Description, &ro.IsSystem, &ro.IsActive,
			&ro.CreatedAt, &ro.UpdatedAt, &ro.ScopeType, &ro.EmployeeCount); err == nil {
			list = append(list, ro)
		}
	}
	if list == nil {
		list = []RoleWithExtras{}
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": list})
}

func (h *Handler) CreateRole(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}
	if req.Name == "" {
		RespondWithError(w, http.StatusBadRequest, "Role name is required")
		return
	}
	id, err := h.rbacRepo.CreateRole(r.Context(), req.Name, req.Description)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true, "id": id})
}

func (h *Handler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid role ID")
		return
	}
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		IsActive    *bool  `json:"is_active"`
		ScopeType   string `json:"scope_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	// Validate scope_type if provided
	if req.ScopeType != "" && req.ScopeType != "none" && req.ScopeType != "zone" && req.ScopeType != "ward" {
		RespondWithError(w, http.StatusBadRequest, "scope_type must be 'none', 'zone', or 'ward'")
		return
	}

	// Update role fields including scope_type
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	if req.ScopeType != "" {
		// Update with scope_type
		if req.IsActive != nil {
			_, err = db.Exec(ctx, `UPDATE roles SET name=$1, description=$2, is_active=$3, scope_type=$4, updated_at=NOW() WHERE id=$5`,
				req.Name, req.Description, *req.IsActive, req.ScopeType, id)
		} else {
			_, err = db.Exec(ctx, `UPDATE roles SET name=$1, description=$2, scope_type=$3, updated_at=NOW() WHERE id=$4`,
				req.Name, req.Description, req.ScopeType, id)
		}
	} else {
		// No scope_type change — use the existing repo method
		err = h.rbacRepo.UpdateRole(ctx, id, req.Name, req.Description, req.IsActive)
	}

	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) DeleteRole(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid role ID")
		return
	}

	// Prevent deletion of system-defined roles
	ctx := r.Context()
	role, err := h.rbacRepo.GetRoleByID(ctx, id)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "Role not found")
		return
	}
	if role.IsSystem {
		RespondWithError(w, http.StatusForbidden, "System-defined roles cannot be deleted")
		return
	}

	if err := h.rbacRepo.DeleteRole(ctx, id); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) DuplicateRole(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid role ID")
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}
	if req.Name == "" {
		RespondWithError(w, http.StatusBadRequest, "New role name is required")
		return
	}
	newID, err := h.rbacRepo.DuplicateRole(r.Context(), id, req.Name)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true, "id": newID})
}

// GetRoleEmployees handles GET /api/rbac/roles/{id}/employees
// Returns list of employees assigned to a specific role.
func (h *Handler) GetRoleEmployees(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	roleID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid role ID")
		return
	}

	rows, err := db.Query(ctx, `
		SELECT e.id, e.first_name, COALESCE(e.middle_name, ''), e.last_name,
		       e.employee_id, e.contact_no, COALESCE(e.is_active, true),
		       COALESCE(d.name, ''), COALESCE(des.name, '')
		FROM users u
		JOIN user_roles ur ON ur.user_id = u.id
		LEFT JOIN employees e ON LOWER(e.employee_id) || '@swift.com' = u.email
		LEFT JOIN employee_department_designations edd ON edd.employee_id = e.id
		LEFT JOIN departments d ON d.id = edd.department_id
		LEFT JOIN designations des ON des.id = edd.designation_id
		WHERE ur.role_id = $1 AND e.id IS NOT NULL
		ORDER BY e.first_name ASC
	`, roleID)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type RoleEmployee struct {
		ID              int    `json:"id"`
		FirstName       string `json:"first_name"`
		MiddleName      string `json:"middle_name"`
		LastName        string `json:"last_name"`
		EmployeeID      string `json:"employee_id"`
		ContactNo       string `json:"contact_no"`
		IsActive        bool   `json:"is_active"`
		DepartmentName  string `json:"department_name"`
		DesignationName string `json:"designation_name"`
	}

	var employees []RoleEmployee
	for rows.Next() {
		var emp RoleEmployee
		if err := rows.Scan(&emp.ID, &emp.FirstName, &emp.MiddleName, &emp.LastName,
			&emp.EmployeeID, &emp.ContactNo, &emp.IsActive,
			&emp.DepartmentName, &emp.DesignationName); err == nil {
			employees = append(employees, emp)
		}
	}
	if employees == nil {
		employees = []RoleEmployee{}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": employees})
}

// ---- Permissions ----

func (h *Handler) GetPermissions(w http.ResponseWriter, r *http.Request) {
	categories, err := h.rbacRepo.GetPermissionsByCategory(r.Context())
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if categories == nil {
		categories = []repository.PermissionCategory{}
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": categories})
}

// ---- Role-Permissions ----

func (h *Handler) GetRolePermissions(w http.ResponseWriter, r *http.Request) {
	roleID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid role ID")
		return
	}
	perms, err := h.rbacRepo.GetRolePermissions(r.Context(), roleID)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Convert map to array for frontend
	type PermEntry struct {
		PermissionID int  `json:"permission_id"`
		IsGranted    bool `json:"is_granted"`
	}
	var list []PermEntry
	for pid, granted := range perms {
		list = append(list, PermEntry{PermissionID: pid, IsGranted: granted})
	}
	if list == nil {
		list = []PermEntry{}
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": list})
}

func (h *Handler) SetRolePermissions(w http.ResponseWriter, r *http.Request) {
	roleID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid role ID")
		return
	}
	var req struct {
		PermissionIDs []int `json:"permission_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}
	if err := h.rbacRepo.ReplaceRolePermissions(r.Context(), roleID, req.PermissionIDs); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// ---- User-Role Assignment ----

func (h *Handler) GetAllUserRoles(w http.ResponseWriter, r *http.Request) {
	assignments, err := h.rbacRepo.GetAllUserRoles(r.Context())
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if assignments == nil {
		assignments = []repository.UserRole{}
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": assignments})
}

func (h *Handler) AssignUserRole(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID int    `json:"user_id"`
		Email  string `json:"email"`
		RoleID int    `json:"role_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	userID := req.UserID
	if userID == 0 && req.Email != "" {
		err := h.gpsRepo.Pool().QueryRow(r.Context(),
			"SELECT id FROM users WHERE email = $1", req.Email,
		).Scan(&userID)
		if err != nil {
			RespondWithError(w, http.StatusNotFound, "User not found")
			return
		}
	}

	if userID == 0 {
		RespondWithError(w, http.StatusBadRequest, "user_id or email required")
		return
	}

	if req.RoleID <= 0 {
		if err := h.rbacRepo.RemoveUserRole(r.Context(), userID); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
	} else {
		if err := h.rbacRepo.AssignUserRole(r.Context(), userID, req.RoleID); err != nil {
			RespondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// ---- My Permissions (for current user) ----

func (h *Handler) GetMyPermissions(w http.ResponseWriter, r *http.Request) {
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}
	// Super Admin (role_id=1) gets all permissions
	isSuper, _ := h.rbacRepo.IsSuperAdmin(r.Context(), claims.UserID)
	if isSuper {
		sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": []string{"*"}})
		return
	}
	perms, err := h.rbacRepo.GetUserPermissions(r.Context(), claims.UserID)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": perms})
}

// ---- Register Default Permissions ----

func (h *Handler) RegisterDefaultPermissions(w http.ResponseWriter, r *http.Request) {
	if err := RegisterAllPermissions(r.Context(), h.rbacRepo); err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Default permissions registered"})
}
