package repository

import (
	"context"
	"fmt"
	"time"
	"github.com/jackc/pgx/v5/pgxpool"
)

type VehicleType struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	IconColor string `json:"icon_color"`
}

type GpsDevice struct {
	ID         int      `json:"id"`
	IMEI       string   `json:"imei"`
	SerialNo   string   `json:"serial_no"`
	SimNo      string   `json:"sim_no"`
	DeviceType string   `json:"device_type"`
	IsActive   bool     `json:"is_active"`
	Vehicle    *Vehicle `json:"vehicle,omitempty"`
}

type Vehicle struct {
	ID             int          `json:"id"`
	RegistrationNo string       `json:"registration_no"`
	ChassisNo      string       `json:"chassis_no"`
	IsOwned        bool         `json:"is_owned"`
	VehicleTypeID  *int         `json:"vehicle_type_id"`
	IsActive       bool         `json:"is_active"`
	VehicleType    *VehicleType `json:"vehicle_type"`
	GpsDevice      *GpsDevice   `json:"gps_device"`
	Status         string       `json:"status"` // "running", "idle", "stopped", "offline"
	LastLat        float64      `json:"last_lat"`
	LastLng        float64      `json:"last_lng"`
	LastTime       *time.Time   `json:"last_time"`
}

type VehicleRepository struct {
	pool *pgxpool.Pool
}

func NewVehicleRepository(pool *pgxpool.Pool) *VehicleRepository {
	return &VehicleRepository{pool: pool}
}

func (r *VehicleRepository) GetAll(ctx context.Context) ([]Vehicle, error) {
	// Joining with vehicle_types and gps_devices via mapping table
	query := `
		SELECT 
			v.id, v.registration_no, COALESCE(v.chassis_no, ''), v.is_owned, v.vehicle_type_id, v.is_active,
			COALESCE(vt.vehicle_type_name, 'Unknown'), COALESCE(vt.icon_color, '#666'),
			COALESCE(d.id, 0), COALESCE(d.imei, ''), COALESCE(d.serial_no, ''), COALESCE(d.sim_no, ''), COALESCE(d.device_type, ''), COALESCE(d.is_active, false),
			COALESCE(lp.lat, 0), COALESCE(lp.lng, 0), lp.time
		FROM vehicles v
		LEFT JOIN vehicle_types_iswm vt ON v.vehicle_type_id = vt.id
		LEFT JOIN vehicle_gps_map m ON v.id = m.vehicle_id AND m.unassigned_at IS NULL
		LEFT JOIN gps_devices d ON m.device_id = d.id
		LEFT JOIN LATERAL (
			SELECT lat, lng, time 
			FROM gps_data 
			WHERE imei = d.imei
			ORDER BY time DESC
			LIMIT 1
		) lp ON true
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vehicles []Vehicle
	for rows.Next() {
		var v Vehicle
		var vt VehicleType
		var d GpsDevice
		var vTypeId *int
		
		err := rows.Scan(
			&v.ID, &v.RegistrationNo, &v.ChassisNo, &v.IsOwned, &vTypeId, &v.IsActive,
			&vt.Name, &vt.IconColor,
			&d.ID, &d.IMEI, &d.SerialNo, &d.SimNo, &d.DeviceType, &d.IsActive,
			&v.LastLat, &v.LastLng, &v.LastTime,
		)
		if err == nil {
			v.VehicleTypeID = vTypeId
			v.VehicleType = &vt
			if d.ID > 0 {
				v.GpsDevice = &d
			}
			// Status logic (simplified for now, usually comes from cache)
			v.Status = "offline" 
			vehicles = append(vehicles, v)
		}
	}
	return vehicles, nil
}
func (r *VehicleRepository) GetByIMEI(ctx context.Context, imei string) (*Vehicle, error) {
	query := `
		SELECT 
			v.id, v.registration_no, COALESCE(v.chassis_no, ''), v.is_owned, v.vehicle_type_id, v.is_active,
			COALESCE(vt.vehicle_type_name, 'Unknown'), COALESCE(vt.icon_color, '#666'),
			d.id, d.imei, COALESCE(d.serial_no, ''), COALESCE(d.sim_no, ''), COALESCE(d.device_type, ''), d.is_active,
			COALESCE(lp.lat, 0), COALESCE(lp.lng, 0), lp.time
		FROM vehicles v
		LEFT JOIN vehicle_types_iswm vt ON v.vehicle_type_id = vt.id
		JOIN vehicle_gps_map m ON v.id = m.vehicle_id AND m.unassigned_at IS NULL
		JOIN gps_devices d ON m.device_id = d.id
		LEFT JOIN LATERAL (
			SELECT lat, lng, time 
			FROM gps_data 
			WHERE imei = d.imei
			ORDER BY time DESC
			LIMIT 1
		) lp ON true
		WHERE d.imei = $1
	`
	var v Vehicle
	var vt VehicleType
	var d GpsDevice
	var vTypeId *int
	
	err := r.pool.QueryRow(ctx, query, imei).Scan(
		&v.ID, &v.RegistrationNo, &v.ChassisNo, &v.IsOwned, &vTypeId, &v.IsActive,
		&vt.Name, &vt.IconColor,
		&d.ID, &d.IMEI, &d.SerialNo, &d.SimNo, &d.DeviceType, &d.IsActive,
		&v.LastLat, &v.LastLng, &v.LastTime,
	)
	if err != nil {
		return nil, err
	}
	
	v.VehicleTypeID = vTypeId
	v.VehicleType = &vt
	v.GpsDevice = &d
	v.Status = "offline"
	
	return &v, nil
}

func (r *VehicleRepository) GetTypes(ctx context.Context) ([]VehicleType, error) {
	query := `SELECT id, vehicle_type_name, icon_color FROM vehicle_types_iswm`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var types []VehicleType
	for rows.Next() {
		var vt VehicleType
		if err := rows.Scan(&vt.ID, &vt.Name, &vt.IconColor); err == nil {
			types = append(types, vt)
		}
	}
	return types, nil
}
func (r *VehicleRepository) CreateType(ctx context.Context, vt *VehicleType) error {
	query := `
		INSERT INTO vehicle_types_iswm (vehicle_type_name, icon_color)
		VALUES ($1, $2)
		RETURNING id
	`
	if vt.IconColor == "" {
		vt.IconColor = "#6366f1" // Default indigo
	}
	err := r.pool.QueryRow(ctx, query, vt.Name, vt.IconColor).Scan(&vt.ID)
	return err
}

func (r *VehicleRepository) CreateVehicle(ctx context.Context, v *Vehicle) error {
	query := `
		INSERT INTO vehicles (registration_no, chassis_no, is_owned, vehicle_type_id, is_active, name, plate_number)
		VALUES ($1, $2, $3, $4, $5, $1, $1)
		RETURNING id
	`
	err := r.pool.QueryRow(ctx, query,
		v.RegistrationNo,
		v.ChassisNo,
		v.IsOwned,
		v.VehicleTypeID,
		v.IsActive,
	).Scan(&v.ID)
	return err
}

func (r *VehicleRepository) GetDevices(ctx context.Context) ([]GpsDevice, error) {
	query := `
		SELECT 
			d.id, d.imei, COALESCE(d.serial_no, ''), COALESCE(d.sim_no, ''), COALESCE(d.model, ''), d.status = 'active',
			COALESCE(v.id, 0), COALESCE(v.registration_no, '')
		FROM gps_devices d
		LEFT JOIN vehicle_gps_map m ON d.id = m.device_id AND m.unassigned_at IS NULL
		LEFT JOIN vehicles v ON m.vehicle_id = v.id
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []GpsDevice
	for rows.Next() {
		var d GpsDevice
		var vID int
		var vReg string
		if err := rows.Scan(&d.ID, &d.IMEI, &d.SerialNo, &d.SimNo, &d.DeviceType, &d.IsActive, &vID, &vReg); err == nil {
			if vID > 0 {
				d.Vehicle = &Vehicle{ID: vID, RegistrationNo: vReg}
			}
			devices = append(devices, d)
		}
	}
	return devices, nil
}

func (r *VehicleRepository) CreateDevice(ctx context.Context, d *GpsDevice) error {
	// Devices created from the frontend should default to active
	d.IsActive = true
	query := `
		INSERT INTO gps_devices (imei, serial_no, sim_no, model, status, is_active)
		VALUES ($1, $2, $3, $4, 'active', true)
		RETURNING id
	`
	err := r.pool.QueryRow(ctx, query,
		d.IMEI,
		d.SerialNo,
		d.SimNo,
		d.DeviceType,
	).Scan(&d.ID)
	return err
}

func (r *VehicleRepository) MapDevice(ctx context.Context, vehicleID int, deviceID int) error {
	// Check if already mapped
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM vehicle_gps_map 
			WHERE (vehicle_id = $1 OR device_id = $2) AND unassigned_at IS NULL
		)
	`, vehicleID, deviceID).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("device or vehicle is already assigned. Please unassign first")
	}

	// Create new mapping
	_, err = r.pool.Exec(ctx, `
		INSERT INTO vehicle_gps_map (vehicle_id, device_id)
		VALUES ($1, $2)
	`, vehicleID, deviceID)
	return err
}

func (r *VehicleRepository) UnmapDevice(ctx context.Context, deviceID int) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE vehicle_gps_map 
		SET unassigned_at = NOW() 
		WHERE device_id = $1 AND unassigned_at IS NULL
	`, deviceID)
	return err
}

func (r *VehicleRepository) DeleteVehicle(ctx context.Context, vehicleID int) error {
	// 1. Unassign GPS devices
	_, err := r.pool.Exec(ctx, `
		UPDATE vehicle_gps_map 
		SET unassigned_at = NOW() 
		WHERE vehicle_id = $1 AND unassigned_at IS NULL
	`, vehicleID)
	if err != nil {
		return err
	}

	// 2. Delete the vehicle mapping history to avoid foreign key issues
	_, err = r.pool.Exec(ctx, `DELETE FROM vehicle_gps_map WHERE vehicle_id = $1`, vehicleID)
	if err != nil {
		return err
	}

	// 3. Delete the vehicle
	_, err = r.pool.Exec(ctx, `DELETE FROM vehicles WHERE id = $1`, vehicleID)
	return err
}

func (r *VehicleRepository) UpdateDeviceStatus(ctx context.Context, id int, isActive bool) error {
	status := "inactive"
	if isActive {
		status = "active"
	}
	_, err := r.pool.Exec(ctx, `
		UPDATE gps_devices 
		SET is_active = $1, status = $2 
		WHERE id = $3
	`, isActive, status, id)
	return err
}

func (r *VehicleRepository) DeleteDevice(ctx context.Context, deviceID int) error {
	// 1. Unassign from vehicles
	_, err := r.pool.Exec(ctx, `
		UPDATE vehicle_gps_map 
		SET unassigned_at = NOW() 
		WHERE device_id = $1 AND unassigned_at IS NULL
	`, deviceID)
	if err != nil {
		return err
	}

	// 2. Delete mapping history
	_, err = r.pool.Exec(ctx, `DELETE FROM vehicle_gps_map WHERE device_id = $1`, deviceID)
	if err != nil {
		return err
	}

	// 3. Delete the GPS device itself
	_, err = r.pool.Exec(ctx, `DELETE FROM gps_devices WHERE id = $1`, deviceID)
	return err
}
