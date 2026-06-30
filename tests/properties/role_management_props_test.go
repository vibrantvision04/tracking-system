package properties

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"

	"gps-tracking-system/internal/api"

	"github.com/go-chi/chi/v5"
	"pgregory.net/rapid"
)

// buildRBACRouter returns a chi router with RBAC role management routes registered.
func buildRBACRouter(h *api.Handler) http.Handler {
	r := chi.NewRouter()
	r.Post("/api/rbac/roles/{id}/duplicate", h.DuplicateRole)
	r.Delete("/api/rbac/roles/{id}", h.DeleteRole)
	r.Get("/api/rbac/roles/{id}/permissions", h.GetRolePermissions)
	r.Put("/api/rbac/roles/{id}/permissions", h.SetRolePermissions)
	return r
}



// TestProperty6_RoleDuplicationPreservesPermissionSet verifies that for any role
// with an arbitrary set of granted permissions, duplicating that role produces a
// new role whose permission set is identical to the original's.
//
// **Validates: Requirements 3.5**
func TestProperty6_RoleDuplicationPreservesPermissionSet(t *testing.T) {
	pool := connectTestDB(t)
	ctx := context.Background()

	h := buildTestHandler(pool)
	router := buildRBACRouter(h)

	// Get available permission IDs from the database
	rows, err := pool.Query(ctx, `SELECT id FROM permissions ORDER BY id ASC`)
	if err != nil {
		t.Fatalf("failed to query permissions: %v", err)
	}
	var allPermIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err == nil {
			allPermIDs = append(allPermIDs, id)
		}
	}
	rows.Close()

	if len(allPermIDs) == 0 {
		t.Skip("no permissions found in DB — skipping property 6 test")
	}

	rapid.Check(t, func(rt *rapid.T) {
		// 1. Create a source role
		suffix := rapid.IntRange(100000, 999999).Draw(rt, "suffix")
		srcRoleName := fmt.Sprintf("prop6_src_%d", suffix)
		dupRoleName := fmt.Sprintf("prop6_dup_%d", suffix)

		// Clean up any leftover roles
		pool.Exec(ctx, `DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE name IN ($1, $2))`, srcRoleName, dupRoleName)
		pool.Exec(ctx, `DELETE FROM roles WHERE name IN ($1, $2)`, srcRoleName, dupRoleName)

		// Create source role
		var srcRoleID int
		err := pool.QueryRow(ctx,
			`INSERT INTO roles (name, description) VALUES ($1, 'prop6 test role') RETURNING id`,
			srcRoleName,
		).Scan(&srcRoleID)
		if err != nil {
			rt.Fatalf("failed to create source role: %v", err)
		}

		// 2. Select a random subset of permissions to assign
		numPerms := rapid.IntRange(0, len(allPermIDs)).Draw(rt, "num_permissions")
		// Shuffle and take first N
		permIndices := rapid.SliceOfN(rapid.IntRange(0, len(allPermIDs)-1), numPerms, numPerms).Draw(rt, "perm_indices")

		// Deduplicate indices
		seen := make(map[int]bool)
		var selectedPermIDs []int
		for _, idx := range permIndices {
			if !seen[idx] {
				seen[idx] = true
				selectedPermIDs = append(selectedPermIDs, allPermIDs[idx])
			}
		}

		// 3. Assign permissions to source role via API
		permPayload, _ := json.Marshal(map[string]interface{}{
			"permission_ids": selectedPermIDs,
		})
		setReq := httptest.NewRequest(http.MethodPut,
			fmt.Sprintf("/api/rbac/roles/%d/permissions", srcRoleID),
			bytes.NewReader(permPayload))
		setReq.Header.Set("Content-Type", "application/json")
		setRec := httptest.NewRecorder()
		router.ServeHTTP(setRec, setReq)

		if setRec.Code != http.StatusOK {
			rt.Fatalf("failed to set permissions on source role: HTTP %d, body: %s", setRec.Code, setRec.Body.String())
		}

		// 4. Duplicate the role via API
		dupPayload, _ := json.Marshal(map[string]interface{}{
			"name": dupRoleName,
		})
		dupReq := httptest.NewRequest(http.MethodPost,
			fmt.Sprintf("/api/rbac/roles/%d/duplicate", srcRoleID),
			bytes.NewReader(dupPayload))
		dupReq.Header.Set("Content-Type", "application/json")
		dupRec := httptest.NewRecorder()
		router.ServeHTTP(dupRec, dupReq)

		if dupRec.Code != http.StatusCreated {
			rt.Fatalf("failed to duplicate role: HTTP %d, body: %s", dupRec.Code, dupRec.Body.String())
		}

		var dupResp struct {
			Success bool `json:"success"`
			ID      int  `json:"id"`
		}
		if err := json.NewDecoder(dupRec.Body).Decode(&dupResp); err != nil {
			rt.Fatalf("failed to decode duplicate response: %v", err)
		}
		if !dupResp.Success || dupResp.ID == 0 {
			rt.Fatalf("duplicate response invalid: %+v", dupResp)
		}
		newRoleID := dupResp.ID

		// 5. Get permissions of the duplicated role via API
		getReq := httptest.NewRequest(http.MethodGet,
			fmt.Sprintf("/api/rbac/roles/%d/permissions", newRoleID), nil)
		getRec := httptest.NewRecorder()
		router.ServeHTTP(getRec, getReq)

		if getRec.Code != http.StatusOK {
			rt.Fatalf("failed to get permissions of duplicated role: HTTP %d", getRec.Code)
		}

		var permResp struct {
			Success bool `json:"success"`
			Data    []struct {
				PermissionID int  `json:"permission_id"`
				IsGranted    bool `json:"is_granted"`
			} `json:"data"`
		}
		if err := json.NewDecoder(getRec.Body).Decode(&permResp); err != nil {
			rt.Fatalf("failed to decode permissions response: %v", err)
		}

		// 6. Extract granted permission IDs from duplicate
		var dupGrantedIDs []int
		for _, p := range permResp.Data {
			if p.IsGranted {
				dupGrantedIDs = append(dupGrantedIDs, p.PermissionID)
			}
		}

		// 7. Compare with original permission set
		sort.Ints(selectedPermIDs)
		sort.Ints(dupGrantedIDs)

		if len(selectedPermIDs) != len(dupGrantedIDs) {
			rt.Fatalf("permission count mismatch: source has %d, duplicate has %d\nsource: %v\nduplicate: %v",
				len(selectedPermIDs), len(dupGrantedIDs), selectedPermIDs, dupGrantedIDs)
		}
		for i := range selectedPermIDs {
			if selectedPermIDs[i] != dupGrantedIDs[i] {
				rt.Fatalf("permission mismatch at index %d: source=%d, duplicate=%d\nsource: %v\nduplicate: %v",
					i, selectedPermIDs[i], dupGrantedIDs[i], selectedPermIDs, dupGrantedIDs)
			}
		}

		// Cleanup
		pool.Exec(ctx, `DELETE FROM role_permissions WHERE role_id IN ($1, $2)`, srcRoleID, newRoleID)
		pool.Exec(ctx, `DELETE FROM roles WHERE id IN ($1, $2)`, srcRoleID, newRoleID)
	})
}

// TestProperty7_SystemRolesCannotBeDeleted verifies that for any role where
// is_system = true, a DELETE request fails with 403 and the role remains present.
//
// **Validates: Requirements 3.6**
func TestProperty7_SystemRolesCannotBeDeleted(t *testing.T) {
	pool := connectTestDB(t)
	ctx := context.Background()

	h := buildTestHandler(pool)
	router := buildRBACRouter(h)

	// Get all system roles from the database
	rows, err := pool.Query(ctx, `SELECT id, name FROM roles WHERE is_system = true`)
	if err != nil {
		t.Fatalf("failed to query system roles: %v", err)
	}
	type sysRole struct {
		ID   int
		Name string
	}
	var systemRoles []sysRole
	for rows.Next() {
		var sr sysRole
		if err := rows.Scan(&sr.ID, &sr.Name); err == nil {
			systemRoles = append(systemRoles, sr)
		}
	}
	rows.Close()

	if len(systemRoles) == 0 {
		// Create a system role for testing
		var testSysID int
		err := pool.QueryRow(ctx,
			`INSERT INTO roles (name, description, is_system) VALUES ('prop7_system_test', 'system role for prop7', true) RETURNING id`,
		).Scan(&testSysID)
		if err != nil {
			t.Fatalf("failed to create test system role: %v", err)
		}
		systemRoles = append(systemRoles, sysRole{ID: testSysID, Name: "prop7_system_test"})
		t.Cleanup(func() {
			pool.Exec(ctx, `DELETE FROM roles WHERE id = $1`, testSysID)
		})
	}

	rapid.Check(t, func(rt *rapid.T) {
		// Pick a random system role
		idx := rapid.IntRange(0, len(systemRoles)-1).Draw(rt, "system_role_index")
		targetRole := systemRoles[idx]

		// Attempt to DELETE the system role via API
		delReq := httptest.NewRequest(http.MethodDelete,
			fmt.Sprintf("/api/rbac/roles/%d", targetRole.ID), nil)
		delRec := httptest.NewRecorder()
		router.ServeHTTP(delRec, delReq)

		// Verify we get 403 Forbidden
		if delRec.Code != http.StatusForbidden {
			rt.Fatalf("expected HTTP 403 when deleting system role %q (id=%d), got HTTP %d, body: %s",
				targetRole.Name, targetRole.ID, delRec.Code, delRec.Body.String())
		}

		// Verify the role still exists in the database
		var count int
		err := pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM roles WHERE id = $1`, targetRole.ID,
		).Scan(&count)
		if err != nil {
			rt.Fatalf("failed to verify role existence: %v", err)
		}
		if count == 0 {
			rt.Fatalf("system role %q (id=%d) was deleted despite is_system=true",
				targetRole.Name, targetRole.ID)
		}
	})
}

// TestProperty8_SingleRolePerUserInvariant verifies that after any sequence of
// role assignments, the user_roles table contains at most one entry for a user,
// and it is the most recently assigned role.
//
// **Validates: Requirements 4.2, 4.4**
func TestProperty8_SingleRolePerUserInvariant(t *testing.T) {
	pool := connectTestDB(t)
	ctx := context.Background()

	// Get available non-system role IDs for assignments
	rows, err := pool.Query(ctx, `SELECT id FROM roles WHERE is_system = false AND is_active = true ORDER BY id ASC`)
	if err != nil {
		t.Fatalf("failed to query roles: %v", err)
	}
	var roleIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err == nil {
			roleIDs = append(roleIDs, id)
		}
	}
	rows.Close()

	if len(roleIDs) < 2 {
		// Create test roles if not enough exist
		for i := len(roleIDs); i < 2; i++ {
			var newID int
			err := pool.QueryRow(ctx,
				`INSERT INTO roles (name, description, is_active) VALUES ($1, 'prop8 test role', true) RETURNING id`,
				fmt.Sprintf("prop8_role_%d", i),
			).Scan(&newID)
			if err != nil {
				t.Fatalf("failed to create test role: %v", err)
			}
			roleIDs = append(roleIDs, newID)
			t.Cleanup(func() {
				pool.Exec(ctx, `DELETE FROM roles WHERE id = $1`, newID)
			})
		}
	}

	rapid.Check(t, func(rt *rapid.T) {
		// 1. Create a test user
		suffix := rapid.IntRange(100000, 999999).Draw(rt, "suffix")
		testEmail := fmt.Sprintf("prop8_user_%d@test.com", suffix)

		// Clean up any leftover
		pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, testEmail)
		pool.Exec(ctx, `DELETE FROM users WHERE email = $1`, testEmail)

		var userID int
		err := pool.QueryRow(ctx,
			`INSERT INTO users (email, password_hash, role) VALUES ($1, 'test_hash', 'test') RETURNING id`,
			testEmail,
		).Scan(&userID)
		if err != nil {
			rt.Fatalf("failed to create test user: %v", err)
		}

		// 2. Generate a random sequence of role assignments (at least 2)
		numAssignments := rapid.IntRange(2, 5).Draw(rt, "num_assignments")
		var assignedRoles []int
		for i := 0; i < numAssignments; i++ {
			roleIdx := rapid.IntRange(0, len(roleIDs)-1).Draw(rt, fmt.Sprintf("role_idx_%d", i))
			assignedRoles = append(assignedRoles, roleIDs[roleIdx])
		}

		// 3. Perform all role assignments (using UPSERT via the repo pattern)
		for _, roleID := range assignedRoles {
			_, err := pool.Exec(ctx,
				`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET role_id = $2`,
				userID, roleID)
			if err != nil {
				rt.Fatalf("failed to assign role %d to user %d: %v", roleID, userID, err)
			}
		}

		// 4. Verify only one entry exists in user_roles for this user
		var roleCount int
		err = pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM user_roles WHERE user_id = $1`, userID,
		).Scan(&roleCount)
		if err != nil {
			rt.Fatalf("failed to query user_roles count: %v", err)
		}
		if roleCount != 1 {
			rt.Fatalf("expected exactly 1 entry in user_roles for user %d, got %d", userID, roleCount)
		}

		// 5. Verify it is the LAST assigned role
		lastExpectedRole := assignedRoles[len(assignedRoles)-1]
		var actualRole int
		err = pool.QueryRow(ctx,
			`SELECT role_id FROM user_roles WHERE user_id = $1`, userID,
		).Scan(&actualRole)
		if err != nil {
			rt.Fatalf("failed to query current role: %v", err)
		}
		if actualRole != lastExpectedRole {
			rt.Fatalf("expected user %d to have role %d (last assigned), got role %d\nassignment sequence: %v",
				userID, lastExpectedRole, actualRole, assignedRoles)
		}

		// Cleanup
		pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, userID)
		pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	})
}
