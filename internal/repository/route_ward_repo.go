package repository

import "context"

type RouteWard struct {
	ID        int    `json:"id"`
	RouteID   int    `json:"route_id"`
	RouteName string `json:"route_name"`
	WardID    int    `json:"ward_id"`
	WardName  string `json:"ward_name"`
}

// GetRouteWards fetches all route-to-ward mappings, with joined names.
func (r *RouteRepository) GetRouteWards(ctx context.Context) ([]RouteWard, error) {
	query := `
		SELECT rw.id, rw.route_id, rt.route_name, rw.ward_id, rg.region_name
		FROM route_wards rw
		JOIN routes rt ON rw.route_id = rt.id
		JOIN regions rg ON rw.ward_id = rg.id
		ORDER BY rw.id ASC
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []RouteWard
	for rows.Next() {
		var rw RouteWard
		if err := rows.Scan(&rw.ID, &rw.RouteID, &rw.RouteName, &rw.WardID, &rw.WardName); err == nil {
			list = append(list, rw)
		}
	}
	return list, nil
}

// CreateRouteWard assigns a route to a ward.
func (r *RouteRepository) CreateRouteWard(ctx context.Context, routeID, wardID int) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO route_wards (route_id, ward_id) VALUES ($1, $2)
		ON CONFLICT (route_id, ward_id) DO NOTHING
	`, routeID, wardID)
	return err
}

// DeleteRouteWard removes an assignment.
func (r *RouteRepository) DeleteRouteWard(ctx context.Context, id int) error {
	_, err := r.db.Exec(ctx, `DELETE FROM route_wards WHERE id = $1`, id)
	return err
}
