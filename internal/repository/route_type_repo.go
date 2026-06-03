package repository

import (
	"context"
)

// RouteType represents a single managed route category (D2D, SWEEPING, etc.)
type RouteType struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
}

// GetAllRouteTypes returns all route types ordered by id.
func (r *RouteRepository) GetAllRouteTypes(ctx context.Context) ([]RouteType, error) {
	query := `SELECT id, name, is_active, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') FROM route_types_iswm ORDER BY id ASC`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var types []RouteType
	for rows.Next() {
		var rt RouteType
		if err := rows.Scan(&rt.ID, &rt.Name, &rt.IsActive, &rt.CreatedAt); err == nil {
			types = append(types, rt)
		}
	}
	return types, nil
}

// CreateRouteType inserts a new route type and returns the generated ID.
func (r *RouteRepository) CreateRouteType(ctx context.Context, rt *RouteType) error {
	query := `INSERT INTO route_types_iswm (name, is_active) VALUES ($1, true) RETURNING id, is_active, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')`
	return r.db.QueryRow(ctx, query, rt.Name).Scan(&rt.ID, &rt.IsActive, &rt.CreatedAt)
}

// UpdateRouteType updates the name of an existing route type.
func (r *RouteRepository) UpdateRouteType(ctx context.Context, id int, name string) error {
	_, err := r.db.Exec(ctx, `UPDATE route_types_iswm SET name = $1 WHERE id = $2`, name, id)
	return err
}

// DeleteRouteType removes a route type and nullifies references in routes.
func (r *RouteRepository) DeleteRouteType(ctx context.Context, id int) error {
	// Unlink routes referencing this type
	if _, err := r.db.Exec(ctx, `UPDATE routes SET route_type_id = NULL WHERE route_type_id = $1`, id); err != nil {
		return err
	}
	_, err := r.db.Exec(ctx, `DELETE FROM route_types_iswm WHERE id = $1`, id)
	return err
}
