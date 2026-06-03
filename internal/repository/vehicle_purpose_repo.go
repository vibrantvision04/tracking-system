package repository

import "context"

// VehiclePurpose represents a Vehicle Collection Type category.
type VehiclePurpose struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
}

// GetAllVehiclePurposes returns all collection types ordered by id.
func (r *VehicleRepository) GetAllVehiclePurposes(ctx context.Context) ([]VehiclePurpose, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, name, is_active, TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') FROM vehicle_purposes ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []VehiclePurpose
	for rows.Next() {
		var vp VehiclePurpose
		if err := rows.Scan(&vp.ID, &vp.Name, &vp.IsActive, &vp.CreatedAt); err == nil {
			list = append(list, vp)
		}
	}
	return list, nil
}

// CreateVehiclePurpose inserts a new collection type.
func (r *VehicleRepository) CreateVehiclePurpose(ctx context.Context, vp *VehiclePurpose) error {
	return r.pool.QueryRow(ctx,
		`INSERT INTO vehicle_purposes (name, is_active) VALUES ($1, true) RETURNING id, is_active, TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS')`,
		vp.Name,
	).Scan(&vp.ID, &vp.IsActive, &vp.CreatedAt)
}

// UpdateVehiclePurpose renames a collection type.
func (r *VehicleRepository) UpdateVehiclePurpose(ctx context.Context, id int, name string) error {
	_, err := r.pool.Exec(ctx, `UPDATE vehicle_purposes SET name = $1 WHERE id = $2`, name, id)
	return err
}

// DeleteVehiclePurpose removes a collection type by ID.
func (r *VehicleRepository) DeleteVehiclePurpose(ctx context.Context, id int) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM vehicle_purposes WHERE id = $1`, id)
	return err
}
