package properties

import (
	"context"
	"fmt"
	"sort"
	"testing"

	"gps-tracking-system/internal/repository"

	"pgregory.net/rapid"
)

// TestProperty9_RoleRemovalRevokesAllPermissions verifies that after removing
// a user's role assignment, GetUserPermissions returns an empty permission set.
//
// **Validates: Requirements 4.3**
func TestProperty9_RoleRemovalRevokesAllPermissions(t *testing.T) {
	pool := connectTestDB(t)
	ctx := context.Background()
	rbacRepo := repository.NewRBACRepository(pool)

	rapid.Check(t, func(rt *rapid.T) {
		// Generate a random number of permissions to assign (1-5)
		numPerms := rapid.IntRange(1, 5).Draw(rt, "numPerms")

		// --- Setup: Create a test role ---
		roleName := fmt.Sprintf("test_prop9_role_%s", rapid.StringMatching(`[a-z]{6}`).Draw(rt, "roleSuffix"))
		roleID, err := rbacRepo.CreateRole(ctx, roleName, "Property 9 test role")
		if err != nil {
			rt.Fatalf("failed to create test role: %v", err)
		}
		defer pool.Exec(ctx, `DELETE FROM roles WHERE id = $1`, roleID)

		// --- Setup: Create test permissions ---
		permIDs := make([]int, 0, numPerms)
		for i := 0; i < numPerms; i++ {
			permCode := fmt.Sprintf("prop9.test.%s.%d", roleName, i)
			var permID int
			err := pool.QueryRow(ctx, `
				INSERT INTO permissions (category_id, code, name, description, module, permission_type, is_menu, menu_path, display_order)
				VALUES ((SELECT id FROM permission_categories ORDER BY id LIMIT 1), $1, $2, '', 'test', 'action', false, '', 0)
				ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
				RETURNING id
			`, permCode, permCode).Scan(&permID)
			if err != nil {
				rt.Fatalf("failed to create test permission %d: %v", i, err)
			}
			permIDs = append(permIDs, permID)
			defer pool.Exec(ctx, `DELETE FROM permissions WHERE id = $1`, permID)
		}

		// --- Setup: Assign permissions to the role ---
		err = rbacRepo.ReplaceRolePermissions(ctx, roleID, permIDs)
		if err != nil {
			rt.Fatalf("failed to assign permissions to role: %v", err)
		}
		defer pool.Exec(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID)

		// --- Setup: Create a test user ---
		userEmail := fmt.Sprintf("%s@prop9test.local", roleName)
		var userID int
		err = pool.QueryRow(ctx, `
			INSERT INTO users (email, password_hash, role)
			VALUES ($1, 'test_hash', 'test')
			ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
			RETURNING id
		`, userEmail).Scan(&userID)
		if err != nil {
			rt.Fatalf("failed to create test user: %v", err)
		}
		defer pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)

		// --- Setup: Assign the role to the user ---
		err = rbacRepo.AssignUserRole(ctx, userID, roleID)
		if err != nil {
			rt.Fatalf("failed to assign role to user: %v", err)
		}

		// Verify the user HAS permissions before removal
		permsBefore, err := rbacRepo.GetUserPermissions(ctx, userID)
		if err != nil {
			rt.Fatalf("failed to get user permissions before removal: %v", err)
		}
		if len(permsBefore) == 0 {
			rt.Fatalf("expected user to have permissions before role removal, got 0")
		}

		// --- Action: Remove the user's role ---
		err = rbacRepo.RemoveUserRole(ctx, userID)
		if err != nil {
			rt.Fatalf("failed to remove user role: %v", err)
		}

		// --- Verify: GetUserPermissions should return empty ---
		permsAfter, err := rbacRepo.GetUserPermissions(ctx, userID)
		if err != nil {
			rt.Fatalf("failed to get user permissions after removal: %v", err)
		}
		if len(permsAfter) != 0 {
			rt.Fatalf("expected empty permissions after role removal, got %d: %v", len(permsAfter), permsAfter)
		}
	})
}

// TestProperty10_PermissionsDerivedExclusivelyFromRole verifies that an employee's
// permissions come exclusively from their assigned Role, not their Designation.
// Even when designation name differs from role name, permissions match the role config.
//
// **Validates: Requirements 5.2, 5.3, 5.4**
func TestProperty10_PermissionsDerivedExclusivelyFromRole(t *testing.T) {
	pool := connectTestDB(t)
	ctx := context.Background()
	rbacRepo := repository.NewRBACRepository(pool)

	rapid.Check(t, func(rt *rapid.T) {
		// Generate random designation name that could be misleading (e.g., "Zone Manager", "Admin")
		designationName := rapid.SampledFrom([]string{
			"Zone Manager", "Admin", "Super Admin", "Director",
			"Regional Head", "Chief Officer", "Team Lead",
			"Senior Manager", "Operations Manager", "Area Supervisor",
		}).Draw(rt, "designationName")

		// Generate a random number of permissions for the role (1-5)
		numPerms := rapid.IntRange(1, 5).Draw(rt, "numPerms")

		// --- Setup: Create a test role with a clearly different name ---
		roleSuffix := rapid.StringMatching(`[a-z]{6}`).Draw(rt, "roleSuffix")
		roleName := fmt.Sprintf("test_prop10_driver_%s", roleSuffix)
		roleID, err := rbacRepo.CreateRole(ctx, roleName, "Property 10 test role - restricted permissions")
		if err != nil {
			rt.Fatalf("failed to create test role: %v", err)
		}
		defer pool.Exec(ctx, `DELETE FROM roles WHERE id = $1`, roleID)

		// --- Setup: Create test permissions for the role ---
		expectedPermCodes := make([]string, 0, numPerms)
		permIDs := make([]int, 0, numPerms)
		for i := 0; i < numPerms; i++ {
			permCode := fmt.Sprintf("prop10.role.%s.%d", roleSuffix, i)
			var permID int
			err := pool.QueryRow(ctx, `
				INSERT INTO permissions (category_id, code, name, description, module, permission_type, is_menu, menu_path, display_order)
				VALUES ((SELECT id FROM permission_categories ORDER BY id LIMIT 1), $1, $2, '', 'test', 'action', false, '', 0)
				ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
				RETURNING id
			`, permCode, permCode).Scan(&permID)
			if err != nil {
				rt.Fatalf("failed to create test permission %d: %v", i, err)
			}
			permIDs = append(permIDs, permID)
			expectedPermCodes = append(expectedPermCodes, permCode)
			defer pool.Exec(ctx, `DELETE FROM permissions WHERE id = $1`, permID)
		}

		// --- Setup: Assign permissions to the role ---
		err = rbacRepo.ReplaceRolePermissions(ctx, roleID, permIDs)
		if err != nil {
			rt.Fatalf("failed to assign permissions to role: %v", err)
		}
		defer pool.Exec(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID)

		// --- Setup: Create a test user ---
		userEmail := fmt.Sprintf("%s@prop10test.local", roleSuffix)
		var userID int
		err = pool.QueryRow(ctx, `
			INSERT INTO users (email, password_hash, role)
			VALUES ($1, 'test_hash', 'test')
			ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
			RETURNING id
		`, userEmail).Scan(&userID)
		if err != nil {
			rt.Fatalf("failed to create test user: %v", err)
		}
		defer pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)

		// --- Setup: Assign role to user ---
		err = rbacRepo.AssignUserRole(ctx, userID, roleID)
		if err != nil {
			rt.Fatalf("failed to assign role to user: %v", err)
		}
		defer pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, userID)

		// --- Setup: Create an employee record linked to this user ---
		empID := fmt.Sprintf("PROP10_%s", roleSuffix)
		var employeeID int
		err = pool.QueryRow(ctx, `
			INSERT INTO employees (employee_id, first_name, last_name, contact_no, is_active)
			VALUES ($1, 'Test', 'Employee', $2, true)
			RETURNING id
		`, empID, fmt.Sprintf("9999%s", roleSuffix[:6])).Scan(&employeeID)
		if err != nil {
			rt.Fatalf("failed to create test employee: %v", err)
		}
		defer pool.Exec(ctx, `DELETE FROM employees WHERE id = $1`, employeeID)

		// --- Setup: Create or find the misleading designation ---
		var designationID int
		err = pool.QueryRow(ctx, `
			INSERT INTO designations (name)
			VALUES ($1)
			ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
			RETURNING id
		`, designationName).Scan(&designationID)
		if err != nil {
			rt.Fatalf("failed to create/find designation: %v", err)
		}

		// --- Setup: Assign the misleading designation to the employee ---
		// The designation says "Zone Manager" but the role is a restricted driver role
		var deptID int
		err = pool.QueryRow(ctx, `SELECT id FROM departments ORDER BY id LIMIT 1`).Scan(&deptID)
		if err != nil {
			rt.Fatalf("failed to get a department: %v", err)
		}

		_, err = pool.Exec(ctx, `
			INSERT INTO employee_department_designations (employee_id, department_id, designation_id)
			VALUES ($1, $2, $3)
			ON CONFLICT (employee_id) DO UPDATE SET designation_id = EXCLUDED.designation_id
		`, employeeID, deptID, designationID)
		if err != nil {
			rt.Fatalf("failed to assign designation to employee: %v", err)
		}
		defer pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id = $1`, employeeID)

		// --- Verify: Permissions come ONLY from the role, not the designation ---
		actualPerms, err := rbacRepo.GetUserPermissions(ctx, userID)
		if err != nil {
			rt.Fatalf("failed to get user permissions: %v", err)
		}

		// Sort both slices for comparison
		sort.Strings(expectedPermCodes)
		sort.Strings(actualPerms)

		if len(actualPerms) != len(expectedPermCodes) {
			rt.Fatalf("permission count mismatch: expected %d (from role %q), got %d.\nDesignation was %q (should have NO effect).\nExpected: %v\nActual: %v",
				len(expectedPermCodes), roleName, len(actualPerms), designationName, expectedPermCodes, actualPerms)
		}

		for i := range expectedPermCodes {
			if actualPerms[i] != expectedPermCodes[i] {
				rt.Fatalf("permission mismatch at index %d: expected %q, got %q.\nDesignation was %q (should have NO effect).\nExpected: %v\nActual: %v",
					i, expectedPermCodes[i], actualPerms[i], designationName, expectedPermCodes, actualPerms)
			}
		}
	})
}
