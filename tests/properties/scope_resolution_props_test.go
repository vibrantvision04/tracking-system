package properties

import (
	"context"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"pgregory.net/rapid"
)

// testScopeRole represents a seeded role with a known scope_type for property testing.
type testScopeRole struct {
	ID        int
	Name      string
	ScopeType string // "none", "zone", "ward"
}

// testRegion represents a seeded region (zone or ward) for scope assignment.
type testRegion struct {
	ID           int
	Name         string
	RegionTypeID int // 2 = zone, 3 = ward (based on VSWM conventions)
}

// scopeTestFixtures holds all seeded test data for scope property tests.
type scopeTestFixtures struct {
	Roles         []testScopeRole
	ZoneRegions   []testRegion
	WardRegions   []testRegion
	DeptID        int
	DesignationID int
}

// seedScopeTestFixtures creates test roles (with different scope_types), regions, and a department.
// Returns fixtures and a cleanup function.
func seedScopeTestFixtures(t *testing.T, pool *pgxpool.Pool) *scopeTestFixtures {
	t.Helper()
	ctx := context.Background()

	fixtures := &scopeTestFixtures{}

	// Clean up any previous test data
	cleanupScopeFixtures(pool)

	// Ensure region_types exist for zones (id=2) and wards (id=3)
	pool.Exec(ctx, `INSERT INTO region_types (id, title) VALUES (2, 'Zone') ON CONFLICT (id) DO NOTHING`)
	pool.Exec(ctx, `INSERT INTO region_types (id, title) VALUES (3, 'Ward') ON CONFLICT (id) DO NOTHING`)

	// Create test regions — 2 zones, 3 wards
	zoneNames := []string{"prop5_test_zone_1", "prop5_test_zone_2"}
	for _, name := range zoneNames {
		var id int
		err := pool.QueryRow(ctx, `
			INSERT INTO regions (region_name, region_type_id, is_active)
			VALUES ($1, 2, true) RETURNING id
		`, name).Scan(&id)
		if err != nil {
			t.Fatalf("seedScopeTestFixtures: failed to create zone region %s: %v", name, err)
		}
		fixtures.ZoneRegions = append(fixtures.ZoneRegions, testRegion{ID: id, Name: name, RegionTypeID: 2})
	}

	wardNames := []string{"prop5_test_ward_1", "prop5_test_ward_2", "prop5_test_ward_3"}
	for _, name := range wardNames {
		var id int
		err := pool.QueryRow(ctx, `
			INSERT INTO regions (region_name, region_type_id, is_active)
			VALUES ($1, 3, true) RETURNING id
		`, name).Scan(&id)
		if err != nil {
			t.Fatalf("seedScopeTestFixtures: failed to create ward region %s: %v", name, err)
		}
		fixtures.WardRegions = append(fixtures.WardRegions, testRegion{ID: id, Name: name, RegionTypeID: 3})
	}

	// Create test roles with different scope_types
	roleSpecs := []struct {
		Name      string
		ScopeType string
	}{
		{"prop5_zone_manager_role", "zone"},
		{"prop5_supervisor_role", "ward"},
		{"prop5_driver_role", "none"},
	}

	for _, spec := range roleSpecs {
		var id int
		err := pool.QueryRow(ctx, `
			INSERT INTO roles (name, description, scope_type)
			VALUES ($1, 'Test role for property 5', $2)
			RETURNING id
		`, spec.Name, spec.ScopeType).Scan(&id)
		if err != nil {
			t.Fatalf("seedScopeTestFixtures: failed to create role %s: %v", spec.Name, err)
		}
		fixtures.Roles = append(fixtures.Roles, testScopeRole{ID: id, Name: spec.Name, ScopeType: spec.ScopeType})
	}

	// Create a test department
	var deptID int
	err := pool.QueryRow(ctx, `
		INSERT INTO departments (name) VALUES ('prop5_test_department') RETURNING id
	`).Scan(&deptID)
	if err != nil {
		t.Fatalf("seedScopeTestFixtures: failed to create department: %v", err)
	}
	fixtures.DeptID = deptID

	// Create a test designation
	var desigID int
	err = pool.QueryRow(ctx, `
		INSERT INTO designations (name) VALUES ('prop5_test_designation') RETURNING id
	`).Scan(&desigID)
	if err != nil {
		t.Fatalf("seedScopeTestFixtures: failed to create designation: %v", err)
	}
	fixtures.DesignationID = desigID

	t.Cleanup(func() { cleanupScopeFixtures(pool) })

	return fixtures
}

// cleanupScopeFixtures removes all test data created for property 5 tests.
func cleanupScopeFixtures(pool *pgxpool.Pool) {
	ctx := context.Background()

	// Delete employees (cascades to employee_scopes)
	pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id IN (SELECT id FROM employees WHERE employee_id LIKE 'prop5_%')`)
	pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'prop5_%')`)
	pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id IN (SELECT id FROM employees WHERE employee_id LIKE 'prop5_%')`)
	pool.Exec(ctx, `DELETE FROM employees WHERE employee_id LIKE 'prop5_%'`)
	pool.Exec(ctx, `DELETE FROM users WHERE email LIKE 'prop5_%'`)
	pool.Exec(ctx, `DELETE FROM departments WHERE name = 'prop5_test_department'`)
	pool.Exec(ctx, `DELETE FROM designations WHERE name = 'prop5_test_designation'`)
	pool.Exec(ctx, `DELETE FROM roles WHERE name LIKE 'prop5_%'`)
	pool.Exec(ctx, `DELETE FROM regions WHERE region_name LIKE 'prop5_test_%'`)
}

// createTestEmployeeWithScopes creates an employee assigned to a given role with scope entries,
// mimicking what CreateUnifiedEmployee does. Returns the employee ID.
func createTestEmployeeWithScopes(
	t *testing.T, pool *pgxpool.Pool, fixtures *scopeTestFixtures,
	empCode string, role testScopeRole, zoneID *int, wardIDs []int,
) int {
	t.Helper()
	ctx := context.Background()

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("createTestEmployeeWithScopes: begin tx: %v", err)
	}
	defer tx.Rollback(ctx)

	// Insert employee
	var empID int
	email := fmt.Sprintf("prop5_%s@vswm.com", empCode)
	err = tx.QueryRow(ctx, `
		INSERT INTO employees (first_name, last_name, employee_id, aadhaar_no, contact_no, address, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id
	`, "Test", empCode, fmt.Sprintf("prop5_%s", empCode), fmt.Sprintf("AADH_%s", empCode), fmt.Sprintf("9%s", empCode), "Test address for prop5").Scan(&empID)
	if err != nil {
		t.Fatalf("createTestEmployeeWithScopes: insert employee: %v", err)
	}

	// Insert user
	var userID int
	err = tx.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, role)
		VALUES ($1, 'hashed_test', $2) RETURNING id
	`, email, role.Name).Scan(&userID)
	if err != nil {
		t.Fatalf("createTestEmployeeWithScopes: insert user: %v", err)
	}

	// Insert user_roles
	_, err = tx.Exec(ctx, `
		INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET role_id = $2
	`, userID, role.ID)
	if err != nil {
		t.Fatalf("createTestEmployeeWithScopes: insert user_roles: %v", err)
	}

	// Insert employee_department_designations
	var regionID *int
	if zoneID != nil {
		regionID = zoneID
	} else if len(wardIDs) > 0 {
		regionID = &wardIDs[0]
	}

	// For the edd table, we need a non-null region_id. Use the first available zone as fallback.
	eddRegionID := regionID
	if eddRegionID == nil {
		// Use the first zone region from fixtures as a placeholder for 'none' scope roles
		if len(fixtures.ZoneRegions) > 0 {
			rid := fixtures.ZoneRegions[0].ID
			eddRegionID = &rid
		}
	}

	if eddRegionID != nil {
		_, err = tx.Exec(ctx, `
			INSERT INTO employee_department_designations (employee_id, department_id, designation_id, region_id)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (employee_id) DO UPDATE SET department_id = $2, designation_id = $3, region_id = $4
		`, empID, fixtures.DeptID, fixtures.DesignationID, *eddRegionID)
		if err != nil {
			t.Fatalf("createTestEmployeeWithScopes: insert edd: %v", err)
		}
	}

	// Insert scope entries based on role's scope_type
	switch role.ScopeType {
	case "zone":
		if zoneID != nil {
			_, err = tx.Exec(ctx, `
				INSERT INTO employee_scopes (employee_id, scope_type, region_id)
				VALUES ($1, 'zone', $2)
			`, empID, *zoneID)
			if err != nil {
				t.Fatalf("createTestEmployeeWithScopes: insert zone scope: %v", err)
			}
		}
	case "ward":
		for _, wID := range wardIDs {
			_, err = tx.Exec(ctx, `
				INSERT INTO employee_scopes (employee_id, scope_type, region_id)
				VALUES ($1, 'ward', $2)
			`, empID, wID)
			if err != nil {
				t.Fatalf("createTestEmployeeWithScopes: insert ward scope: %v", err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("createTestEmployeeWithScopes: commit: %v", err)
	}

	return empID
}

// simulateRoleChange performs the same scope-clearing logic as UpdateUnifiedEmployee:
// 1. DELETE all employee_scopes for the employee
// 2. INSERT new scope entries based on the new role's scope_type
// This directly tests the DB-level invariant that Property 5 specifies.
func simulateRoleChange(
	t *testing.T, pool *pgxpool.Pool,
	empID int, newRole testScopeRole, newZoneID *int, newWardIDs []int,
) {
	t.Helper()
	ctx := context.Background()

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("simulateRoleChange: begin tx: %v", err)
	}
	defer tx.Rollback(ctx)

	// Update user_roles to new role
	_, err = tx.Exec(ctx, `
		UPDATE user_roles SET role_id = $1
		WHERE user_id = (
			SELECT u.id FROM users u
			JOIN employees e ON u.email = LOWER(e.employee_id) || '@vswm.com'
			WHERE e.id = $2
		)
	`, newRole.ID, empID)
	if err != nil {
		t.Fatalf("simulateRoleChange: update user_roles: %v", err)
	}

	// DELETE existing scopes (exactly what the handler does)
	_, err = tx.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id = $1`, empID)
	if err != nil {
		t.Fatalf("simulateRoleChange: delete scopes: %v", err)
	}

	// INSERT new scopes based on new role's scope_type
	switch newRole.ScopeType {
	case "zone":
		if newZoneID != nil {
			_, err = tx.Exec(ctx, `
				INSERT INTO employee_scopes (employee_id, scope_type, region_id)
				VALUES ($1, 'zone', $2)
			`, empID, *newZoneID)
			if err != nil {
				t.Fatalf("simulateRoleChange: insert zone scope: %v", err)
			}
		}
	case "ward":
		for _, wID := range newWardIDs {
			_, err = tx.Exec(ctx, `
				INSERT INTO employee_scopes (employee_id, scope_type, region_id)
				VALUES ($1, 'ward', $2)
			`, empID, wID)
			if err != nil {
				t.Fatalf("simulateRoleChange: insert ward scope: %v", err)
			}
		}
	}
	// "none" → no scope entries

	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("simulateRoleChange: commit: %v", err)
	}
}

// TestProperty5_RoleChangeClearsStaleScopes verifies that when an employee's role
// changes to a role with a different scope_type, the old scope entries are removed
// and new scope entries matching the new role's scope_type are applied (or empty
// if scope_type = 'none').
//
// **Validates: Requirements 2.2, 2.4**
func TestProperty5_RoleChangeClearsStaleScopes(t *testing.T) {
	pool := connectTestDB(t)
	fixtures := seedScopeTestFixtures(t, pool)
	ctx := context.Background()

	// We need at least 2 roles with different scope_types to test transitions
	if len(fixtures.Roles) < 2 {
		t.Fatal("need at least 2 roles with different scope_types")
	}

	rapid.Check(t, func(rt *rapid.T) {
		// Pick an initial role (the one we create the employee with)
		initialRoleIdx := rapid.IntRange(0, len(fixtures.Roles)-1).Draw(rt, "initial_role_idx")
		initialRole := fixtures.Roles[initialRoleIdx]

		// Pick a different role for the change (must have different scope_type)
		var newRole testScopeRole
		candidateIdxs := []int{}
		for i, r := range fixtures.Roles {
			if r.ScopeType != initialRole.ScopeType {
				candidateIdxs = append(candidateIdxs, i)
			}
		}
		if len(candidateIdxs) == 0 {
			rt.Skip("no role with different scope_type available")
		}
		newRoleIdx := rapid.SampledFrom(candidateIdxs).Draw(rt, "new_role_idx")
		newRole = fixtures.Roles[newRoleIdx]

		// Generate a unique employee code for this iteration
		empCode := rapid.StringMatching(`[0-9]{8}`).Draw(rt, "emp_code")

		// Determine initial scope assignments based on initial role's scope_type
		var initialZoneID *int
		var initialWardIDs []int

		switch initialRole.ScopeType {
		case "zone":
			zoneIdx := rapid.IntRange(0, len(fixtures.ZoneRegions)-1).Draw(rt, "initial_zone_idx")
			zID := fixtures.ZoneRegions[zoneIdx].ID
			initialZoneID = &zID
		case "ward":
			// Pick 1 to N wards (take the first numWards from the sorted list)
			numWards := rapid.IntRange(1, len(fixtures.WardRegions)).Draw(rt, "num_initial_wards")
			for i := 0; i < numWards; i++ {
				initialWardIDs = append(initialWardIDs, fixtures.WardRegions[i].ID)
			}
		}
		// "none" → no scopes

		// Create the employee with initial role and scopes
		empID := createTestEmployeeWithScopes(t, pool, fixtures, empCode, initialRole, initialZoneID, initialWardIDs)

		// Verify initial scopes were created correctly
		var initialScopeCount int
		err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM employee_scopes WHERE employee_id = $1`, empID).Scan(&initialScopeCount)
		if err != nil {
			t.Fatalf("failed to count initial scopes: %v", err)
		}

		expectedInitialCount := 0
		switch initialRole.ScopeType {
		case "zone":
			if initialZoneID != nil {
				expectedInitialCount = 1
			}
		case "ward":
			expectedInitialCount = len(initialWardIDs)
		}

		if initialScopeCount != expectedInitialCount {
			t.Fatalf("initial scope count mismatch: got %d, want %d (role=%s)",
				initialScopeCount, expectedInitialCount, initialRole.ScopeType)
		}

		// Determine new scope assignments based on new role's scope_type
		var newZoneID *int
		var newWardIDs []int

		switch newRole.ScopeType {
		case "zone":
			zoneIdx := rapid.IntRange(0, len(fixtures.ZoneRegions)-1).Draw(rt, "new_zone_idx")
			zID := fixtures.ZoneRegions[zoneIdx].ID
			newZoneID = &zID
		case "ward":
			numWards := rapid.IntRange(1, len(fixtures.WardRegions)).Draw(rt, "num_new_wards")
			for i := 0; i < numWards; i++ {
				newWardIDs = append(newWardIDs, fixtures.WardRegions[i].ID)
			}
		}
		// "none" → no scopes

		// Simulate the role change (same logic as UpdateUnifiedEmployee handler)
		simulateRoleChange(t, pool, empID, newRole, newZoneID, newWardIDs)

		// PROPERTY VERIFICATION:
		// 1. Old scopes should be completely removed
		// 2. New scopes should match the new role's scope_type

		// Verify: query all scopes for the employee
		rows, err := pool.Query(ctx, `
			SELECT scope_type, region_id FROM employee_scopes
			WHERE employee_id = $1
			ORDER BY scope_type, region_id
		`, empID)
		if err != nil {
			t.Fatalf("failed to query scopes after role change: %v", err)
		}
		defer rows.Close()

		type scopeRecord struct {
			ScopeType string
			RegionID  int
		}
		var actualScopes []scopeRecord
		for rows.Next() {
			var s scopeRecord
			if err := rows.Scan(&s.ScopeType, &s.RegionID); err != nil {
				t.Fatalf("failed to scan scope row: %v", err)
			}
			actualScopes = append(actualScopes, s)
		}

		// Verify no old scope entries remain
		for _, s := range actualScopes {
			if initialRole.ScopeType != "none" && s.ScopeType == initialRole.ScopeType {
				// Check it's not an old region
				isOldRegion := false
				if initialRole.ScopeType == "zone" && initialZoneID != nil && s.RegionID == *initialZoneID {
					// Could be coincidence if new role is also zone — but we ensured scope_types differ
					isOldRegion = true
				}
				if initialRole.ScopeType == "ward" {
					for _, wID := range initialWardIDs {
						if s.RegionID == wID {
							isOldRegion = true
							break
						}
					}
				}
				if isOldRegion {
					t.Fatalf("stale scope entry found after role change: scope_type=%s region_id=%d (old role=%s, new role=%s)",
						s.ScopeType, s.RegionID, initialRole.ScopeType, newRole.ScopeType)
				}
			}
		}

		// Verify new scopes match new role's scope_type
		switch newRole.ScopeType {
		case "none":
			if len(actualScopes) != 0 {
				t.Fatalf("expected 0 scopes for scope_type='none', got %d", len(actualScopes))
			}
		case "zone":
			if newZoneID == nil {
				if len(actualScopes) != 0 {
					t.Fatalf("expected 0 scopes (no zone provided), got %d", len(actualScopes))
				}
			} else {
				if len(actualScopes) != 1 {
					t.Fatalf("expected 1 zone scope, got %d", len(actualScopes))
				}
				if actualScopes[0].ScopeType != "zone" {
					t.Fatalf("expected scope_type='zone', got %q", actualScopes[0].ScopeType)
				}
				if actualScopes[0].RegionID != *newZoneID {
					t.Fatalf("expected region_id=%d, got %d", *newZoneID, actualScopes[0].RegionID)
				}
			}
		case "ward":
			if len(actualScopes) != len(newWardIDs) {
				t.Fatalf("expected %d ward scopes, got %d", len(newWardIDs), len(actualScopes))
			}
			// All scopes must be scope_type="ward" and have matching region_ids
			wardSet := make(map[int]bool)
			for _, wID := range newWardIDs {
				wardSet[wID] = true
			}
			for _, s := range actualScopes {
				if s.ScopeType != "ward" {
					t.Fatalf("expected scope_type='ward', got %q", s.ScopeType)
				}
				if !wardSet[s.RegionID] {
					t.Fatalf("unexpected ward region_id=%d in scopes", s.RegionID)
				}
			}
		}

		// Cleanup this iteration's employee data
		pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id = $1`, empID)
		pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id = $1`, empID)
		pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, fmt.Sprintf("prop5_%s@vswm.com", empCode))
		pool.Exec(ctx, `DELETE FROM users WHERE email = $1`, fmt.Sprintf("prop5_%s@vswm.com", empCode))
		pool.Exec(ctx, `DELETE FROM employees WHERE id = $1`, empID)
	})
}

// TestProperty12_ScopeResolutionReflectsCurrentScopes verifies that the employeeRegion
// function returns the correct region data based on the current state of employee_scopes,
// and that after scope updates the next call immediately reflects the new scope.
//
// The property tests:
// 1. Employee with scope entry → employeeRegion returns matching region
// 2. After scope update (change zone, change ward, remove scope) → employeeRegion reflects change
// 3. Fallback: employee in employee_department_designations but NOT employee_scopes → uses legacy table
//
// **Validates: Requirements 7.1, 7.2, 7.3**
func TestProperty12_ScopeResolutionReflectsCurrentScopes(t *testing.T) {
	pool := connectTestDB(t)
	fixtures := seedScopeTestFixtures(t, pool)
	ctx := context.Background()

	h := buildTestHandler(pool)

	// Ensure we have enough regions to test with
	if len(fixtures.ZoneRegions) < 2 {
		t.Fatal("need at least 2 zone regions for scope update testing")
	}
	if len(fixtures.WardRegions) < 2 {
		t.Fatal("need at least 2 ward regions for scope update testing")
	}

	rapid.Check(t, func(rt *rapid.T) {
		empCode := rapid.StringMatching(`[0-9]{8}`).Draw(rt, "emp_code")

		// Decide the action type for this iteration
		// 0 = test zone scope + update to different zone
		// 1 = test ward scope + update to different ward
		// 2 = test scope removal (employee_scopes → empty, falls back to edd)
		// 3 = test fallback only (no employee_scopes entry, uses edd)
		actionType := rapid.IntRange(0, 3).Draw(rt, "action_type")

		switch actionType {
		case 0:
			// --- Zone scope: create with zone, verify, update to different zone, verify ---
			zoneRole := findRoleByScopeType(fixtures.Roles, "zone")
			if zoneRole == nil {
				rt.Skip("no zone role available")
			}

			// Pick initial and new zones (must differ)
			initialZoneIdx := rapid.IntRange(0, len(fixtures.ZoneRegions)-1).Draw(rt, "initial_zone_idx")
			newZoneIdx := (initialZoneIdx + 1) % len(fixtures.ZoneRegions)
			initialZoneID := fixtures.ZoneRegions[initialZoneIdx].ID
			newZoneID := fixtures.ZoneRegions[newZoneIdx].ID

			// Create employee with initial zone scope
			empID := createTestEmployeeWithScopes(t, pool, fixtures, empCode, *zoneRole, &initialZoneID, nil)

			// Verify employeeRegion returns the initial zone
			regionID, regionTypeID, _, err := h.TestEmployeeRegion(ctx, empID)
			if err != nil {
				t.Fatalf("employeeRegion error after create: %v", err)
			}
			if regionID != initialZoneID {
				t.Fatalf("expected regionID=%d (initial zone), got %d", initialZoneID, regionID)
			}
			if regionTypeID != 2 {
				t.Fatalf("expected regionTypeID=2 (zone), got %d", regionTypeID)
			}

			// Update scope to different zone
			updateEmployeeScope(t, pool, empID, "zone", []int{newZoneID})

			// Verify employeeRegion immediately reflects the new zone
			regionID, regionTypeID, _, err = h.TestEmployeeRegion(ctx, empID)
			if err != nil {
				t.Fatalf("employeeRegion error after zone update: %v", err)
			}
			if regionID != newZoneID {
				t.Fatalf("after zone update: expected regionID=%d, got %d", newZoneID, regionID)
			}
			if regionTypeID != 2 {
				t.Fatalf("after zone update: expected regionTypeID=2, got %d", regionTypeID)
			}

			// Cleanup
			cleanupTestEmployee(pool, empID, empCode)

		case 1:
			// --- Ward scope: create with ward, verify, update to different ward, verify ---
			wardRole := findRoleByScopeType(fixtures.Roles, "ward")
			if wardRole == nil {
				rt.Skip("no ward role available")
			}

			// Pick initial and new wards (must differ)
			initialWardIdx := rapid.IntRange(0, len(fixtures.WardRegions)-1).Draw(rt, "initial_ward_idx")
			newWardIdx := (initialWardIdx + 1) % len(fixtures.WardRegions)
			initialWardID := fixtures.WardRegions[initialWardIdx].ID
			newWardID := fixtures.WardRegions[newWardIdx].ID

			// Create employee with initial ward scope
			empID := createTestEmployeeWithScopes(t, pool, fixtures, empCode, *wardRole, nil, []int{initialWardID})

			// Verify employeeRegion returns the initial ward
			regionID, regionTypeID, _, err := h.TestEmployeeRegion(ctx, empID)
			if err != nil {
				t.Fatalf("employeeRegion error after create: %v", err)
			}
			if regionID != initialWardID {
				t.Fatalf("expected regionID=%d (initial ward), got %d", initialWardID, regionID)
			}
			if regionTypeID != 3 {
				t.Fatalf("expected regionTypeID=3 (ward), got %d", regionTypeID)
			}

			// Update scope to different ward
			updateEmployeeScope(t, pool, empID, "ward", []int{newWardID})

			// Verify employeeRegion immediately reflects the new ward
			regionID, regionTypeID, _, err = h.TestEmployeeRegion(ctx, empID)
			if err != nil {
				t.Fatalf("employeeRegion error after ward update: %v", err)
			}
			if regionID != newWardID {
				t.Fatalf("after ward update: expected regionID=%d, got %d", newWardID, regionID)
			}
			if regionTypeID != 3 {
				t.Fatalf("after ward update: expected regionTypeID=3, got %d", regionTypeID)
			}

			// Cleanup
			cleanupTestEmployee(pool, empID, empCode)

		case 2:
			// --- Scope removal: create with scope, remove it, verify fallback to edd ---
			zoneRole := findRoleByScopeType(fixtures.Roles, "zone")
			if zoneRole == nil {
				rt.Skip("no zone role available")
			}

			zoneIdx := rapid.IntRange(0, len(fixtures.ZoneRegions)-1).Draw(rt, "zone_idx")
			zoneID := fixtures.ZoneRegions[zoneIdx].ID

			// Create employee with zone scope (edd also has zone as region)
			empID := createTestEmployeeWithScopes(t, pool, fixtures, empCode, *zoneRole, &zoneID, nil)

			// Verify priority 1 (employee_scopes) is used
			regionID, _, _, err := h.TestEmployeeRegion(ctx, empID)
			if err != nil {
				t.Fatalf("employeeRegion error before removal: %v", err)
			}
			if regionID != zoneID {
				t.Fatalf("before removal: expected regionID=%d, got %d", zoneID, regionID)
			}

			// Remove all scopes (simulating scope_type=none transition)
			_, err = pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id = $1`, empID)
			if err != nil {
				t.Fatalf("failed to delete scopes: %v", err)
			}

			// Verify fallback to employee_department_designations
			regionID, _, _, err = h.TestEmployeeRegion(ctx, empID)
			if err != nil {
				t.Fatalf("employeeRegion error after scope removal: %v", err)
			}
			// The edd entry should have the zone region (created by createTestEmployeeWithScopes)
			if regionID != zoneID {
				t.Fatalf("after scope removal: expected fallback regionID=%d (from edd), got %d", zoneID, regionID)
			}

			// Cleanup
			cleanupTestEmployee(pool, empID, empCode)

		case 3:
			// --- Fallback only: no employee_scopes entry, uses edd table ---
			noneRole := findRoleByScopeType(fixtures.Roles, "none")
			if noneRole == nil {
				rt.Skip("no 'none' scope role available")
			}

			// Create employee with 'none' role (no employee_scopes entries)
			// but edd has a region (the first zone region is used by createTestEmployeeWithScopes)
			empID := createTestEmployeeWithScopes(t, pool, fixtures, empCode, *noneRole, nil, nil)

			// Verify that employeeRegion falls back to edd
			regionID, _, _, err := h.TestEmployeeRegion(ctx, empID)
			if err != nil {
				t.Fatalf("employeeRegion error for fallback test: %v", err)
			}
			// createTestEmployeeWithScopes uses fixtures.ZoneRegions[0].ID as edd region for 'none' roles
			expectedRegionID := fixtures.ZoneRegions[0].ID
			if regionID != expectedRegionID {
				t.Fatalf("fallback: expected regionID=%d (from edd), got %d", expectedRegionID, regionID)
			}

			// Cleanup
			cleanupTestEmployee(pool, empID, empCode)
		}
	})
}

// findRoleByScopeType returns a pointer to the first role matching the given scope_type, or nil.
func findRoleByScopeType(roles []testScopeRole, scopeType string) *testScopeRole {
	for i := range roles {
		if roles[i].ScopeType == scopeType {
			return &roles[i]
		}
	}
	return nil
}

// updateEmployeeScope clears existing scopes and inserts new ones for the given employee.
func updateEmployeeScope(t *testing.T, pool *pgxpool.Pool, empID int, scopeType string, regionIDs []int) {
	t.Helper()
	ctx := context.Background()

	// Delete existing scopes
	_, err := pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id = $1`, empID)
	if err != nil {
		t.Fatalf("updateEmployeeScope: failed to delete existing scopes: %v", err)
	}

	// Insert new scopes
	for _, regionID := range regionIDs {
		_, err := pool.Exec(ctx, `
			INSERT INTO employee_scopes (employee_id, scope_type, region_id)
			VALUES ($1, $2, $3)
		`, empID, scopeType, regionID)
		if err != nil {
			t.Fatalf("updateEmployeeScope: failed to insert scope (emp=%d, type=%s, region=%d): %v",
				empID, scopeType, regionID, err)
		}
	}
}

// cleanupTestEmployee removes all test data for a single employee created during property testing.
func cleanupTestEmployee(pool *pgxpool.Pool, empID int, empCode string) {
	ctx := context.Background()
	email := fmt.Sprintf("prop5_%s@vswm.com", empCode)
	pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id = $1`, empID)
	pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id = $1`, empID)
	pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, email)
	pool.Exec(ctx, `DELETE FROM users WHERE email = $1`, email)
	pool.Exec(ctx, `DELETE FROM employees WHERE id = $1`, empID)
}
