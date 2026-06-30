package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Role struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	IsSystem    bool      `json:"is_system"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type PermissionCategory struct {
	ID           int          `json:"id"`
	Name         string       `json:"name"`
	DisplayOrder int          `json:"display_order"`
	Permissions  []Permission `json:"permissions,omitempty"`
}

type Permission struct {
	ID             int       `json:"id"`
	CategoryID     int       `json:"category_id"`
	Code           string    `json:"code"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Module         string    `json:"module"`
	PermissionType string    `json:"permission_type"`
	IsMenu         bool      `json:"is_menu"`
	MenuPath       string    `json:"menu_path"`
	DisplayOrder   int       `json:"display_order"`
}

type RolePermission struct {
	ID           int       `json:"id"`
	RoleID       int       `json:"role_id"`
	PermissionID int       `json:"permission_id"`
	IsGranted    bool      `json:"is_granted"`
}

type UserRole struct {
	UserID    int       `json:"user_id"`
	RoleID    int       `json:"role_id"`
	CreatedAt time.Time `json:"created_at"`
	RoleName  string    `json:"role_name,omitempty"`
	Email     string    `json:"email,omitempty"`
}

type RBACRepository struct {
	db *pgxpool.Pool
}

func NewRBACRepository(db *pgxpool.Pool) *RBACRepository {
	return &RBACRepository{db: db}
}

func (r *RBACRepository) Pool() *pgxpool.Pool {
	return r.db
}

// --- Roles ---

func (r *RBACRepository) GetRoles(ctx context.Context) ([]Role, error) {
	rows, err := r.db.Query(ctx, `SELECT id, name, COALESCE(description,''), is_system, is_active, created_at, updated_at FROM roles ORDER BY is_system DESC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Role
	for rows.Next() {
		var ro Role
		if err := rows.Scan(&ro.ID, &ro.Name, &ro.Description, &ro.IsSystem, &ro.IsActive, &ro.CreatedAt, &ro.UpdatedAt); err == nil {
			list = append(list, ro)
		}
	}
	return list, nil
}

func (r *RBACRepository) GetRoleByID(ctx context.Context, id int) (*Role, error) {
	var ro Role
	err := r.db.QueryRow(ctx, `SELECT id, name, COALESCE(description,''), is_system, is_active, created_at, updated_at FROM roles WHERE id = $1`, id).
		Scan(&ro.ID, &ro.Name, &ro.Description, &ro.IsSystem, &ro.IsActive, &ro.CreatedAt, &ro.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &ro, nil
}

func (r *RBACRepository) CreateRole(ctx context.Context, name, description string) (int, error) {
	var id int
	err := r.db.QueryRow(ctx, `INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING id`, name, description).Scan(&id)
	return id, err
}

func (r *RBACRepository) UpdateRole(ctx context.Context, id int, name, description string, isActive *bool) error {
	if isActive != nil {
		_, err := r.db.Exec(ctx, `UPDATE roles SET name=$1, description=$2, is_active=$3, updated_at=NOW() WHERE id=$4`, name, description, *isActive, id)
		return err
	}
	_, err := r.db.Exec(ctx, `UPDATE roles SET name=$1, description=$2, updated_at=NOW() WHERE id=$3`, name, description, id)
	return err
}

func (r *RBACRepository) DeleteRole(ctx context.Context, id int) error {
	_, err := r.db.Exec(ctx, `DELETE FROM roles WHERE id=$1 AND is_system=false`, id)
	return err
}

func (r *RBACRepository) DuplicateRole(ctx context.Context, id int, newName string) (int, error) {
	var orig Role
	err := r.db.QueryRow(ctx, `SELECT name, COALESCE(description,''), is_system, is_active FROM roles WHERE id=$1`, id).
		Scan(&orig.Name, &orig.Description, &orig.IsSystem, &orig.IsActive)
	if err != nil {
		return 0, err
	}
	var newID int
	err = r.db.QueryRow(ctx, `INSERT INTO roles (name, description, is_active) VALUES ($1, $2, $3) RETURNING id`,
		newName, orig.Description, orig.IsActive).Scan(&newID)
	if err != nil {
		return 0, err
	}
	// Copy permissions
	_, err = r.db.Exec(ctx, `
		INSERT INTO role_permissions (role_id, permission_id, is_granted)
		SELECT $1, permission_id, is_granted FROM role_permissions WHERE role_id=$2
	`, newID, id)
	return newID, err
}

// --- Permissions ---

func (r *RBACRepository) GetPermissionCategories(ctx context.Context) ([]PermissionCategory, error) {
	rows, err := r.db.Query(ctx, `SELECT id, name, display_order FROM permission_categories ORDER BY display_order ASC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var categories []PermissionCategory
	for rows.Next() {
		var cat PermissionCategory
		if err := rows.Scan(&cat.ID, &cat.Name, &cat.DisplayOrder); err == nil {
			categories = append(categories, cat)
		}
	}
	return categories, nil
}

func (r *RBACRepository) GetPermissionsByCategory(ctx context.Context) ([]PermissionCategory, error) {
	categories, err := r.GetPermissionCategories(ctx)
	if err != nil {
		return nil, err
	}
	permRows, err := r.db.Query(ctx, `
		SELECT id, COALESCE(category_id,0), code, name, COALESCE(description,''), 
		       COALESCE(module,''), permission_type, is_menu, COALESCE(menu_path,''), display_order
		FROM permissions ORDER BY display_order ASC, id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer permRows.Close()
	permMap := make(map[int][]Permission)
	for permRows.Next() {
		var p Permission
		if err := permRows.Scan(&p.ID, &p.CategoryID, &p.Code, &p.Name, &p.Description,
			&p.Module, &p.PermissionType, &p.IsMenu, &p.MenuPath, &p.DisplayOrder); err == nil {
			permMap[p.CategoryID] = append(permMap[p.CategoryID], p)
		}
	}
	for i, cat := range categories {
		if perms, ok := permMap[cat.ID]; ok {
			categories[i].Permissions = perms
		} else {
			categories[i].Permissions = []Permission{}
		}
	}
	return categories, nil
}

func (r *RBACRepository) UpsertPermission(ctx context.Context, p *Permission) (int, error) {
	if p.CategoryID == 0 {
		_ = r.db.QueryRow(ctx, `SELECT id FROM permission_categories ORDER BY id ASC LIMIT 1`).Scan(&p.CategoryID)
	}
	var id int
	err := r.db.QueryRow(ctx, `
		INSERT INTO permissions (category_id, code, name, description, module, permission_type, is_menu, menu_path, display_order)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, is_menu=EXCLUDED.is_menu,
			menu_path=EXCLUDED.menu_path, display_order=EXCLUDED.display_order
		RETURNING id
	`, p.CategoryID, p.Code, p.Name, p.Description, p.Module, p.PermissionType, p.IsMenu, p.MenuPath, p.DisplayOrder).Scan(&id)
	return id, err
}

// --- Role-Permissions ---

func (r *RBACRepository) GetRolePermissions(ctx context.Context, roleID int) (map[int]bool, error) {
	rows, err := r.db.Query(ctx, `SELECT permission_id, is_granted FROM role_permissions WHERE role_id=$1`, roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make(map[int]bool)
	for rows.Next() {
		var pid int
		var granted bool
		if err := rows.Scan(&pid, &granted); err == nil {
			result[pid] = granted
		}
	}
	return result, nil
}

func (r *RBACRepository) SetRolePermission(ctx context.Context, roleID, permissionID int, granted bool) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO role_permissions (role_id, permission_id, is_granted)
		VALUES ($1, $2, $3)
		ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted=$3
	`, roleID, permissionID, granted)
	return err
}

func (r *RBACRepository) SetRolePermissionsBatch(ctx context.Context, roleID int, permissionIDs []int, granted bool) error {
	if len(permissionIDs) == 0 {
		return nil
	}
	batch := &pgx.Batch{}
	for _, pid := range permissionIDs {
		batch.Queue(`
			INSERT INTO role_permissions (role_id, permission_id, is_granted)
			VALUES ($1, $2, $3)
			ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted=$3
		`, roleID, pid, granted)
	}
	br := r.db.SendBatch(ctx, batch)
	defer br.Close()
	for range permissionIDs {
		if _, err := br.Exec(); err != nil {
			return err
		}
	}
	return nil
}

func (r *RBACRepository) ReplaceRolePermissions(ctx context.Context, roleID int, permissionIDs []int) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM role_permissions WHERE role_id=$1`, roleID); err != nil {
		return err
	}

	if len(permissionIDs) == 0 {
		return tx.Commit(ctx)
	}

	for _, pid := range permissionIDs {
		if _, err := tx.Exec(ctx, `
			INSERT INTO role_permissions (role_id, permission_id, is_granted)
			VALUES ($1, $2, true)
		`, roleID, pid); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// --- User-Role ---

func (r *RBACRepository) GetUserRole(ctx context.Context, userID int) (*UserRole, error) {
	var ur UserRole
	err := r.db.QueryRow(ctx, `
		SELECT ur.user_id, ur.role_id, r.name
		FROM user_roles ur
		JOIN roles r ON r.id = ur.role_id
		WHERE ur.user_id = $1
	`, userID).Scan(&ur.UserID, &ur.RoleID, &ur.RoleName)
	if err != nil {
		return nil, err
	}
	return &ur, nil
}

func (r *RBACRepository) GetAllUserRoles(ctx context.Context) ([]UserRole, error) {
	rows, err := r.db.Query(ctx, `
		SELECT ur.user_id, COALESCE(ur.role_id,0), COALESCE(r.name,''), u.email
		FROM users u
		LEFT JOIN user_roles ur ON ur.user_id = u.id
		LEFT JOIN roles r ON r.id = ur.role_id
		ORDER BY u.id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []UserRole
	for rows.Next() {
		var ur UserRole
		if err := rows.Scan(&ur.UserID, &ur.RoleID, &ur.RoleName, &ur.Email); err == nil {
			list = append(list, ur)
		}
	}
	return list, nil
}

func (r *RBACRepository) AssignUserRole(ctx context.Context, userID, roleID int) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET role_id=$2
	`, userID, roleID)
	return err
}

func (r *RBACRepository) RemoveUserRole(ctx context.Context, userID int) error {
	_, err := r.db.Exec(ctx, `DELETE FROM user_roles WHERE user_id=$1`, userID)
	return err
}

// --- Permission Checking ---

func (r *RBACRepository) GetUserPermissions(ctx context.Context, userID int) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT p.code
		FROM permissions p
		JOIN role_permissions rp ON rp.permission_id = p.id AND rp.is_granted = true
		JOIN user_roles ur ON ur.role_id = rp.role_id
		WHERE ur.user_id = $1
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var codes []string
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err == nil {
			codes = append(codes, code)
		}
	}
	if codes == nil {
		codes = []string{}
	}
	return codes, nil
}

func (r *RBACRepository) HasPermission(ctx context.Context, userID int, permissionCode string) (bool, error) {
	var count int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM permissions p
		JOIN role_permissions rp ON rp.permission_id = p.id AND rp.is_granted = true
		JOIN user_roles ur ON ur.role_id = rp.role_id
		WHERE ur.user_id = $1 AND p.code = $2
	`, userID, permissionCode).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *RBACRepository) IsSuperAdmin(ctx context.Context, userID int) (bool, error) {
	var isSystem bool
	err := r.db.QueryRow(ctx, `
		SELECT r.is_system FROM roles r
		JOIN user_roles ur ON ur.role_id = r.id
		WHERE ur.user_id = $1 AND r.id = 1
	`, userID).Scan(&isSystem)
	if err != nil {
		return false, nil
	}
	return isSystem, nil
}

func (r *RBACRepository) RegisterPermissions(ctx context.Context, perms []Permission) error {
	for _, p := range perms {
		catID := p.CategoryID
		if catID == 0 {
			_ = r.db.QueryRow(ctx, `SELECT id FROM permission_categories ORDER BY id ASC LIMIT 1`).Scan(&catID)
		}
		_, err := r.db.Exec(ctx, `
			INSERT INTO permissions (category_id, code, name, description, module, permission_type, is_menu, menu_path, display_order)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (code) DO NOTHING
		`, catID, p.Code, p.Name, p.Description, p.Module, p.PermissionType, p.IsMenu, p.MenuPath, p.DisplayOrder)
		if err != nil {
			return fmt.Errorf("register permission %s: %w", p.Code, err)
		}
	}
	return nil
}

// Ensure compilation
var _ = pgx.Batch{}
