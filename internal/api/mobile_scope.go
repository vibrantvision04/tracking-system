package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"gps-tracking-system/internal/auth"

	"github.com/jackc/pgx/v5"
)

// region_type_id values in the regions table (see GetZones/GetWards):
//   2 = Zone, 3 = Ward. A ward's parent_id points at its zone.
const (
	regionTypeZone = 2
	regionTypeWard = 3
)

// RoleScope is the authoritative, token-derived view of what data the caller
// may access. Every field is resolved from the authenticated JWT claims and the
// associations stored in the database — never from client-supplied query
// parameters. Pointer fields are nil when the corresponding scope is not
// applicable to the role or could not be resolved.
type RoleScope struct {
	Role       string // "zone_manager" | "supervisor" | "driver"
	UserID     int    // users.id from the JWT
	EmployeeID int    // employees.id linked to the user (0 if none)
	ZoneID     *int   // set for zone_manager (and supervisor's parent zone)
	WardID     *int   // set for supervisor (and resolved for driver via route)
	VehicleID  *int   // set for driver
}

// resolveScope derives the authoritative RoleScope from the JWT claims. It
// confines the caller to their own zone (zone_manager), ward (supervisor), or
// vehicle/route (driver). Client-supplied ward_id/zone_id values are never
// consulted here.
func (h *Handler) resolveScope(ctx context.Context, claims *auth.Claims) (RoleScope, error) {
	if claims == nil {
		return RoleScope{}, fmt.Errorf("resolveScope: no authenticated claims")
	}

	scope := RoleScope{
		Role:   strings.ToLower(claims.Role),
		UserID: claims.UserID,
	}

	db := h.gpsRepo.Pool()

	// Map the authenticated user to an employee record using the same
	// convention as the rest of the mobile handlers: the local part of the
	// email matches either employee_id or contact_no.
	localPart := claims.Email
	if i := strings.Index(localPart, "@"); i >= 0 {
		localPart = localPart[:i]
	}

	var empID int
	err := db.QueryRow(ctx, `
		SELECT id FROM employees
		WHERE employee_id = $1 OR contact_no = $1
		LIMIT 1
	`, localPart).Scan(&empID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return scope, fmt.Errorf("resolveScope: resolve employee: %w", err)
	}
	scope.EmployeeID = empID

	switch strings.ToLower(claims.Role) {
	case "zone_manager":
		if err := h.resolveZoneScope(ctx, &scope); err != nil {
			return scope, err
		}
	case "supervisor":
		if err := h.resolveSupervisorScope(ctx, &scope); err != nil {
			return scope, err
		}
	case "road_sweeper":
		if err := h.resolveSweeperScope(ctx, &scope); err != nil {
			return scope, err
		}
	case "driver":
		if err := h.resolveDriverScope(ctx, &scope); err != nil {
			return scope, err
		}
	default:
		// Admin-level roles (City Administrator, ADMIN, Super Admin, etc.)
		// get zone_manager-equivalent access. Attempt to resolve from employee
		// region first; if none found, grant city-wide access (all zones).
		scope.Role = "zone_manager"
		if err := h.resolveZoneScope(ctx, &scope); err != nil {
			return scope, err
		}
		// If no zone could be resolved from the employee record, grant access
		// to the entire city by resolving the top-level region's child zones.
		if scope.ZoneID == nil {
			if err := h.resolveCityWideScope(ctx, &scope); err != nil {
				return scope, err
			}
		}
	}

	return scope, nil
}

// resolveZoneScope sets ZoneID (and WardID when the manager is pinned to a
// single ward) from the employee's assigned region.
func (h *Handler) resolveZoneScope(ctx context.Context, scope *RoleScope) error {
	if scope.EmployeeID == 0 {
		return nil
	}

	regionID, regionTypeID, parentID, err := h.employeeRegion(ctx, scope.EmployeeID)
	if err != nil {
		return fmt.Errorf("resolveZoneScope: %w", err)
	}
	if regionID == 0 {
		return nil
	}

	switch regionTypeID {
	case regionTypeWard:
		// Manager assigned at ward granularity: the zone is the ward's parent.
		ward := regionID
		scope.WardID = &ward
		if parentID != nil {
			scope.ZoneID = parentID
		}
	default:
		zone := regionID
		scope.ZoneID = &zone
	}
	return nil
}

// resolveSupervisorScope sets WardID (and the parent ZoneID) from the
// employee's assigned region.
func (h *Handler) resolveSupervisorScope(ctx context.Context, scope *RoleScope) error {
	if scope.EmployeeID == 0 {
		return nil
	}

	regionID, regionTypeID, parentID, err := h.employeeRegion(ctx, scope.EmployeeID)
	if err != nil {
		return fmt.Errorf("resolveSupervisorScope: %w", err)
	}
	if regionID == 0 {
		return nil
	}

	ward := regionID
	scope.WardID = &ward
	if regionTypeID == regionTypeWard && parentID != nil {
		scope.ZoneID = parentID
	}
	return nil
}

// resolveDriverScope sets VehicleID from the driver's persistent
// employee_vehicle_assignments table (admin-managed, not date-wise), falling
// back to the most recent mobile_attendance punch-in. WardID is derived via
// that vehicle's active route assignment.
func (h *Handler) resolveDriverScope(ctx context.Context, scope *RoleScope) error {
	if scope.EmployeeID == 0 {
		return nil
	}

	db := h.gpsRepo.Pool()

	// 1. Check persistent employee_vehicle_assignments first (admin-set, lasts
	//    until changed). This is the authoritative source when present.
	var vehicleID int
	err := db.QueryRow(ctx, `
		SELECT vehicle_id FROM employee_vehicle_assignments
		WHERE employee_id = $1 AND is_active = true
	`, scope.EmployeeID).Scan(&vehicleID)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("resolveDriverScope: resolve vehicle from assignment: %w", err)
		}
		// 2. Fallback: most recent attendance assignment (punch-in selected
		//    vehicle). Prefers an open (not-yet-punched-out) shift.
		err = db.QueryRow(ctx, `
			SELECT vehicle_id FROM mobile_attendance
			WHERE user_id = $1 AND vehicle_id IS NOT NULL
			ORDER BY (punch_out_at IS NULL) DESC, created_at DESC
			LIMIT 1
		`, scope.EmployeeID).Scan(&vehicleID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil
			}
			return fmt.Errorf("resolveDriverScope: resolve vehicle from attendance: %w", err)
		}
	}
	scope.VehicleID = &vehicleID

	// Vehicle → active route → ward.
	var wardID int
	err = db.QueryRow(ctx, `
		SELECT rw.ward_id
		FROM vehicle_route_assignments vra
		JOIN route_wards rw ON rw.route_id = vra.route_id
		WHERE vra.vehicle_id = $1 AND vra.is_active = true
		ORDER BY vra.assigned_date DESC
		LIMIT 1
	`, vehicleID).Scan(&wardID)
	switch {
	case err == nil:
		scope.WardID = &wardID
	case errors.Is(err, pgx.ErrNoRows):
		// Fallback: ward stored directly on the vehicle record.
		var vWard *int
		if e := db.QueryRow(ctx, `SELECT ward_id FROM vehicles WHERE id = $1`, vehicleID).Scan(&vWard); e == nil && vWard != nil {
			scope.WardID = vWard
		}
	default:
		return fmt.Errorf("resolveDriverScope: resolve ward: %w", err)
	}

	return nil
}

// resolveSweeperScope sets WardID from the employee's assigned sweeping route.
// Unlike drivers, sweepers are not tied to a specific vehicle — they are assigned
// to a sweeping_route which belongs to a ward. Their ward scope comes from the
// sweeping_assignments table.
func (h *Handler) resolveSweeperScope(ctx context.Context, scope *RoleScope) error {
	if scope.EmployeeID == 0 {
		return nil
	}

	db := h.gpsRepo.Pool()
	var wardID int
	err := db.QueryRow(ctx, `
		SELECT sa.ward_id
		FROM sweeping_assignments sa
		WHERE sa.employee_id = $1 AND sa.is_active = true
		  AND (sa.valid_to IS NULL OR sa.valid_to >= CURRENT_DATE)
		  AND sa.valid_from <= CURRENT_DATE
		ORDER BY sa.id DESC
		LIMIT 1
	`, scope.EmployeeID).Scan(&wardID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("resolveSweeperScope: %w", err)
	}
	scope.WardID = &wardID
	return nil
}

// employeeRegion returns the region id, its region_type_id, and parent id for
// the employee's assigned region. Returns (0, 0, nil, nil) when the employee
// has no region assignment (admin-level roles get city-wide access via the
// caller's fallback logic).
//
// Priority 1: Check the new employee_scopes table (populated by unified employee management).
// Priority 2: Fall back to legacy employee_department_designations → regions join.
func (h *Handler) employeeRegion(ctx context.Context, employeeID int) (int, int, *int, error) {
	db := h.gpsRepo.Pool()
	var regionID, regionTypeID int
	var parentID *int

	// Priority 1: New employee_scopes table
	err := db.QueryRow(ctx, `
		SELECT r.id, COALESCE(r.region_type_id, 0), r.parent_id
		FROM employee_scopes es
		JOIN regions r ON es.region_id = r.id
		WHERE es.employee_id = $1
		ORDER BY es.scope_type ASC
		LIMIT 1
	`, employeeID).Scan(&regionID, &regionTypeID, &parentID)
	if err == nil {
		return regionID, regionTypeID, parentID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, 0, nil, err
	}

	// Priority 2: Legacy employee_department_designations (backward compat)
	err = db.QueryRow(ctx, `
		SELECT r.id, COALESCE(r.region_type_id, 0), r.parent_id
		FROM employee_department_designations edd
		JOIN regions r ON edd.region_id = r.id
		WHERE edd.employee_id = $1
		LIMIT 1
	`, employeeID).Scan(&regionID, &regionTypeID, &parentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// No scope found — admin-level roles will get city-wide access via caller
			return 0, 0, nil, nil
		}
		return 0, 0, nil, err
	}
	return regionID, regionTypeID, parentID, nil
}

// scopeForbidden writes a standard HTTP 403 response for an access attempt that
// falls outside the caller's resolved RoleScope.
func scopeForbidden(w http.ResponseWriter) {
	RespondWithError(w, http.StatusForbidden, "Requested resource is outside your authorized scope")
}

// ownsVehicle reports whether vehicleID is the driver's own resolved vehicle.
func (s RoleScope) ownsVehicle(vehicleID int) bool {
	return s.VehicleID != nil && *s.VehicleID == vehicleID
}

// wardInScope reports whether wardID is visible to the caller:
//   - driver / supervisor: only their own resolved ward
//   - zone_manager: any ward whose parent zone matches the resolved zone
//     (or all wards when city-wide sentinel is set)
func (h *Handler) wardInScope(ctx context.Context, scope RoleScope, wardID int) (bool, error) {
	switch scope.Role {
	case "driver", "supervisor":
		return scope.WardID != nil && *scope.WardID == wardID, nil
	case "zone_manager":
		if scope.ZoneID == nil {
			return false, nil
		}
		// City-wide sentinel: all wards are in scope.
		if *scope.ZoneID == cityWideSentinel {
			return true, nil
		}
		// A zone manager pinned to a single ward only sees that ward.
		if scope.WardID != nil {
			return *scope.WardID == wardID, nil
		}
		db := h.gpsRepo.Pool()
		var parentID *int
		err := db.QueryRow(ctx, `SELECT parent_id FROM regions WHERE id = $1`, wardID).Scan(&parentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return false, nil
			}
			return false, fmt.Errorf("wardInScope: %w", err)
		}
		return parentID != nil && *parentID == *scope.ZoneID, nil
	default:
		return false, nil
	}
}

// requireWardInScope writes HTTP 403 and returns false when wardID falls
// outside the caller's scope. On success it returns true and writes nothing.
func (h *Handler) requireWardInScope(ctx context.Context, w http.ResponseWriter, scope RoleScope, wardID int) bool {
	ok, err := h.wardInScope(ctx, scope, wardID)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to verify access scope")
		return false
	}
	if !ok {
		scopeForbidden(w)
		return false
	}
	return true
}

// requireVehicleInScope writes HTTP 403 and returns false when a driver
// requests a vehicle other than their own. Supervisors and zone managers are
// scoped at the ward/zone level and pass this driver-specific check.
func (h *Handler) requireVehicleInScope(w http.ResponseWriter, scope RoleScope, vehicleID int) bool {
	if scope.Role == "driver" && !scope.ownsVehicle(vehicleID) {
		scopeForbidden(w)
		return false
	}
	return true
}

// CityWide is a sentinel ZoneID value indicating city-wide access (all zones).
// When scopeWardIDs encounters this, it returns all wards in the system.
const cityWideSentinel = -1

// resolveCityWideScope grants city-wide access by setting ZoneID to the
// sentinel value. This is used for admin-level roles that have no explicit
// region assignment but should see everything.
func (h *Handler) resolveCityWideScope(ctx context.Context, scope *RoleScope) error {
	sentinel := cityWideSentinel
	scope.ZoneID = &sentinel
	return nil
}
