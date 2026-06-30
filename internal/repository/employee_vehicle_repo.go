package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type EmployeeVehicleAssignment struct {
	ID         int       `json:"id"`
	EmployeeID int       `json:"employee_id"`
	VehicleID  int       `json:"vehicle_id"`
	IsActive   bool      `json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type EmployeeVehicleAssignmentDetail struct {
	ID              int    `json:"id"`
	EmployeeID      int    `json:"employee_id"`
	EmployeeName    string `json:"employee_name"`
	EmployeeCode    string `json:"employee_code"`
	Designation     string `json:"designation"`
	VehicleID       int    `json:"vehicle_id"`
	VehiclePlate    string `json:"vehicle_plate"`
	VehicleType     string `json:"vehicle_type"`
	ShiftName       string `json:"shift_name"`
	IsActive        bool   `json:"is_active"`
	CreatedAt       string `json:"created_at"`
}

type EmployeeVehicleRepository struct {
	db *pgxpool.Pool
}

func NewEmployeeVehicleRepository(db *pgxpool.Pool) *EmployeeVehicleRepository {
	return &EmployeeVehicleRepository{db: db}
}

func (r *EmployeeVehicleRepository) GetAll(ctx context.Context) ([]EmployeeVehicleAssignmentDetail, error) {
	query := `
		SELECT
			eva.id,
			eva.employee_id,
			CONCAT(e.first_name, ' ', COALESCE(e.last_name, '')) AS employee_name,
			COALESCE(e.employee_id, '') AS employee_code,
			COALESCE(des.name, 'Driver') AS designation,
			eva.vehicle_id,
			COALESCE(v.registration_no, '') AS vehicle_plate,
			COALESCE(vt.vehicle_type_name, '') AS vehicle_type,
			COALESCE(s.shift_name, '') AS shift_name,
			eva.is_active,
			TO_CHAR(eva.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
		FROM employee_vehicle_assignments eva
		JOIN employees e ON e.id = eva.employee_id
		LEFT JOIN vehicles v ON v.id = eva.vehicle_id
		LEFT JOIN vehicle_types_vswm vt ON v.vehicle_type_id = vt.id
		LEFT JOIN vehicle_route_assignments vra ON vra.vehicle_id = eva.vehicle_id AND vra.is_active = true
		LEFT JOIN shifts s ON vra.shift_id = s.id
		LEFT JOIN employee_department_designations edd ON edd.employee_id = eva.employee_id
		LEFT JOIN designations des ON edd.designation_id = des.id
		ORDER BY eva.id DESC
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []EmployeeVehicleAssignmentDetail
	for rows.Next() {
		var item EmployeeVehicleAssignmentDetail
		if err := rows.Scan(
			&item.ID, &item.EmployeeID, &item.EmployeeName, &item.EmployeeCode,
			&item.Designation, &item.VehicleID, &item.VehiclePlate, &item.VehicleType,
			&item.ShiftName, &item.IsActive, &item.CreatedAt,
		); err == nil {
			items = append(items, item)
		}
	}
	return items, nil
}

func (r *EmployeeVehicleRepository) GetByEmployeeID(ctx context.Context, employeeID int) (*EmployeeVehicleAssignment, error) {
	query := `
		SELECT id, employee_id, vehicle_id, is_active, created_at, updated_at
		FROM employee_vehicle_assignments
		WHERE employee_id = $1
	`
	var a EmployeeVehicleAssignment
	err := r.db.QueryRow(ctx, query, employeeID).Scan(
		&a.ID, &a.EmployeeID, &a.VehicleID, &a.IsActive, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &a, nil
}

func (r *EmployeeVehicleRepository) Assign(ctx context.Context, employeeID, vehicleID int) (*EmployeeVehicleAssignment, error) {
	query := `
		INSERT INTO employee_vehicle_assignments (employee_id, vehicle_id, is_active)
		VALUES ($1, $2, true)
		ON CONFLICT (employee_id) DO UPDATE SET
			vehicle_id = $2,
			is_active = true,
			updated_at = NOW()
		RETURNING id, employee_id, vehicle_id, is_active, created_at, updated_at
	`
	var a EmployeeVehicleAssignment
	err := r.db.QueryRow(ctx, query, employeeID, vehicleID).Scan(
		&a.ID, &a.EmployeeID, &a.VehicleID, &a.IsActive, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *EmployeeVehicleRepository) Remove(ctx context.Context, employeeID int) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM employee_vehicle_assignments WHERE employee_id = $1
	`, employeeID)
	return err
}

func (r *EmployeeVehicleRepository) RemoveByID(ctx context.Context, id int) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM employee_vehicle_assignments WHERE id = $1
	`, id)
	return err
}

func (r *EmployeeVehicleRepository) GetVehicleIDForEmployee(ctx context.Context, employeeID int) (*int, error) {
	query := `
		SELECT vehicle_id FROM employee_vehicle_assignments
		WHERE employee_id = $1 AND is_active = true
	`
	var vehicleID int
	err := r.db.QueryRow(ctx, query, employeeID).Scan(&vehicleID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &vehicleID, nil
}
