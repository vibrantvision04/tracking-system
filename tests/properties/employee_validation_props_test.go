package properties

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"gps-tracking-system/internal/api"
	"gps-tracking-system/internal/repository"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"pgregory.net/rapid"
)

// connectTestDB connects to the database specified by TEST_DATABASE_URL.
// Returns nil and skips the test if the env var is not set.
func connectTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set — skipping DB integration test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connectTestDB: pgxpool.New: %v", err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		t.Fatalf("connectTestDB: ping failed: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// validScopeTypes is the set of accepted scope_type values per the CHECK constraint.
var validScopeTypes = map[string]bool{
	"none": true,
	"zone": true,
	"ward": true,
}

// TestProperty18_ScopeTypeConstraintEnforcement verifies that the roles table
// CHECK constraint on scope_type rejects any value not in {'none', 'zone', 'ward'}
// and accepts all valid values.
//
// **Validates: Requirements 12.3**
func TestProperty18_ScopeTypeConstraintEnforcement(t *testing.T) {
	pool := connectTestDB(t)
	ctx := context.Background()

	t.Run("invalid_scope_type_rejected", func(t *testing.T) {
		rapid.Check(t, func(t *rapid.T) {
			// Generate an arbitrary string that is NOT a valid scope_type
			candidate := rapid.StringMatching(`[a-zA-Z0-9_]{1,20}`).Draw(t, "scope_type_candidate")

			// Skip if the generated string happens to be a valid value
			if validScopeTypes[candidate] {
				t.Skip("generated value is valid, skipping")
			}

			// Attempt to INSERT a role with the invalid scope_type
			_, err := pool.Exec(ctx, `
				INSERT INTO roles (name, description, scope_type)
				VALUES ($1, 'test role', $2)
			`, fmt.Sprintf("test_prop18_%s", candidate), candidate)

			if err == nil {
				// Clean up if unexpectedly inserted
				pool.Exec(ctx, `DELETE FROM roles WHERE name = $1`, fmt.Sprintf("test_prop18_%s", candidate))
				t.Fatalf("expected DB to reject scope_type=%q but INSERT succeeded", candidate)
			}
		})
	})

	t.Run("valid_scope_types_accepted", func(t *testing.T) {
		for _, validType := range []string{"none", "zone", "ward"} {
			t.Run(validType, func(t *testing.T) {
				roleName := fmt.Sprintf("test_prop18_valid_%s", validType)

				// Clean up any leftover from previous runs
				pool.Exec(ctx, `DELETE FROM roles WHERE name = $1`, roleName)

				// Insert with valid scope_type — should succeed
				_, err := pool.Exec(ctx, `
					INSERT INTO roles (name, description, scope_type)
					VALUES ($1, 'test role for property 18', $2)
				`, roleName, validType)
				if err != nil {
					t.Fatalf("expected valid scope_type=%q to be accepted, got error: %v", validType, err)
				}

				// Clean up
				t.Cleanup(func() {
					pool.Exec(ctx, `DELETE FROM roles WHERE name = $1`, roleName)
				})

				// Verify it was stored correctly
				var stored string
				err = pool.QueryRow(ctx, `SELECT scope_type FROM roles WHERE name = $1`, roleName).Scan(&stored)
				if err != nil {
					t.Fatalf("failed to read back stored scope_type: %v", err)
				}
				if stored != validType {
					t.Fatalf("stored scope_type=%q does not match expected=%q", stored, validType)
				}
			})
		}
	})

	t.Run("update_to_invalid_scope_type_rejected", func(t *testing.T) {
		// Create a role with a valid scope_type first
		roleName := "test_prop18_update_target"
		pool.Exec(ctx, `DELETE FROM roles WHERE name = $1`, roleName)
		_, err := pool.Exec(ctx, `
			INSERT INTO roles (name, description, scope_type)
			VALUES ($1, 'update target', 'none')
		`, roleName)
		if err != nil {
			t.Fatalf("failed to create test role for update test: %v", err)
		}
		t.Cleanup(func() {
			pool.Exec(ctx, `DELETE FROM roles WHERE name = $1`, roleName)
		})

		rapid.Check(t, func(t *rapid.T) {
			// Generate an arbitrary string that is NOT a valid scope_type
			candidate := rapid.StringMatching(`[a-zA-Z0-9_]{1,20}`).Draw(t, "scope_type_candidate")

			if validScopeTypes[candidate] {
				t.Skip("generated value is valid, skipping")
			}

			// Attempt to UPDATE the role with the invalid scope_type
			_, err := pool.Exec(ctx, `
				UPDATE roles SET scope_type = $1 WHERE name = $2
			`, candidate, roleName)

			if err == nil {
				// Reset to valid value if unexpectedly succeeded
				pool.Exec(ctx, `UPDATE roles SET scope_type = 'none' WHERE name = $1`, roleName)
				t.Fatalf("expected DB to reject UPDATE scope_type=%q but it succeeded", candidate)
			}
		})
	})
}


// buildTestHandler creates a minimal Handler wired to the given pool.
// Only gpsRepo (which provides Pool()) is needed for unified employee handlers.
func buildTestHandler(pool *pgxpool.Pool) *api.Handler {
	vRepo := repository.NewVehicleRepository(pool)
	gpsRepo := repository.NewGPSRepository(pool)
	routeRepo := repository.NewRouteRepository(pool)
	rbacRepo := repository.NewRBACRepository(pool)
	empVehicleRepo := repository.NewEmployeeVehicleRepository(pool)
	return api.NewHandler(vRepo, gpsRepo, nil, nil, routeRepo, nil, nil, rbacRepo, empVehicleRepo, "test-secret", "test-refresh", false)
}

// buildEmployeeRouter returns a chi router with the CreateUnifiedEmployee route registered.
func buildEmployeeRouter(h *api.Handler) http.Handler {
	r := chi.NewRouter()
	r.Post("/api/employee-management/employees", h.CreateUnifiedEmployee)
	return r
}

// TestProperty14_TransactionRollbackOnPartialFailure verifies that when a
// CreateUnifiedEmployee request contains valid format but non-existent FK references
// (role_id, department_id), the entire transaction is rolled back and NO records
// are created in any table (employees, users, user_roles, employee_scopes,
// employee_department_designations).
//
// **Validates: Requirements 10.3**
func TestProperty14_TransactionRollbackOnPartialFailure(t *testing.T) {
	pool := connectTestDB(t)
	ctx := context.Background()

	h := buildTestHandler(pool)
	router := buildEmployeeRouter(h)

	rapid.Check(t, func(rt *rapid.T) {
		// Generate a unique employee_id and contact that won't collide
		suffix := rapid.IntRange(100000, 999999).Draw(rt, "suffix")
		employeeID := fmt.Sprintf("PROP14_EMP_%d", suffix)
		contactNo := fmt.Sprintf("9%09d", suffix)
		email := fmt.Sprintf("prop14_%d@test.com", suffix)

		// Generate non-existent FK IDs (high range that won't exist in DB)
		nonExistentRoleID := 9000000 + rapid.IntRange(1, 999999).Draw(rt, "fake_role_id")
		nonExistentDeptID := 9000000 + rapid.IntRange(1, 999999).Draw(rt, "fake_dept_id")

		// Build a payload with all required fields valid but FK references pointing nowhere
		payload := map[string]interface{}{
			"first_name":     "PropTest",
			"last_name":      "Rollback",
			"employee_id":    employeeID,
			"contact_no":     contactNo,
			"email":          email,
			"password":       "TestPassword123!",
			"role_id":        nonExistentRoleID,
			"department_id":  nonExistentDeptID,
			"designation_id": 0,
		}

		body, err := json.Marshal(payload)
		if err != nil {
			rt.Fatalf("failed to marshal payload: %v", err)
		}

		// Send POST request
		req := httptest.NewRequest(http.MethodPost, "/api/employee-management/employees", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		// Verify we get an error response (400 or 500 — not 201)
		if rec.Code == http.StatusCreated {
			rt.Fatalf("expected error response for non-existent FK references, got HTTP 201")
		}
		if rec.Code != http.StatusBadRequest && rec.Code != http.StatusInternalServerError {
			// Accept any non-success error code, but log it
			rt.Logf("got HTTP %d (expected 400 or 500)", rec.Code)
		}

		// Verify NO records were created in any table
		// 1. Check employees table
		var empCount int
		err = pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM employees WHERE employee_id = $1`, employeeID,
		).Scan(&empCount)
		if err != nil {
			rt.Fatalf("failed to query employees table: %v", err)
		}
		if empCount > 0 {
			// Cleanup and fail
			pool.Exec(ctx, `DELETE FROM employees WHERE employee_id = $1`, employeeID)
			rt.Fatalf("transaction rollback failed: found %d record(s) in employees table for employee_id=%s", empCount, employeeID)
		}

		// 2. Check users table (by email)
		var userCount int
		err = pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM users WHERE email = $1`, email,
		).Scan(&userCount)
		if err != nil {
			rt.Fatalf("failed to query users table: %v", err)
		}
		if userCount > 0 {
			pool.Exec(ctx, `DELETE FROM users WHERE email = $1`, email)
			rt.Fatalf("transaction rollback failed: found %d record(s) in users table for email=%s", userCount, email)
		}

		// 3. Check user_roles table (join via users email)
		var userRoleCount int
		err = pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM user_roles ur JOIN users u ON ur.user_id = u.id WHERE u.email = $1`, email,
		).Scan(&userRoleCount)
		if err != nil {
			rt.Fatalf("failed to query user_roles table: %v", err)
		}
		if userRoleCount > 0 {
			rt.Fatalf("transaction rollback failed: found %d record(s) in user_roles for email=%s", userRoleCount, email)
		}

		// 4. Check employee_scopes table (join via employees.employee_id)
		var scopeCount int
		err = pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM employee_scopes es JOIN employees e ON es.employee_id = e.id WHERE e.employee_id = $1`, employeeID,
		).Scan(&scopeCount)
		if err != nil {
			rt.Fatalf("failed to query employee_scopes table: %v", err)
		}
		if scopeCount > 0 {
			rt.Fatalf("transaction rollback failed: found %d record(s) in employee_scopes for employee_id=%s", scopeCount, employeeID)
		}

		// 5. Check employee_department_designations table
		var eddCount int
		err = pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM employee_department_designations edd JOIN employees e ON edd.employee_id = e.id WHERE e.employee_id = $1`, employeeID,
		).Scan(&eddCount)
		if err != nil {
			rt.Fatalf("failed to query employee_department_designations table: %v", err)
		}
		if eddCount > 0 {
			rt.Fatalf("transaction rollback failed: found %d record(s) in employee_department_designations for employee_id=%s", eddCount, employeeID)
		}
	})
}

// requiredFields lists the fields that must be present for employee creation validation to pass.
var requiredFields = []string{
	"employee_id", "first_name", "last_name", "contact_no",
	"department_id", "role_id", "password",
}

// TestProperty3_ValidationRejectsInvalidPayloads verifies that for any employee creation
// payload missing one or more required fields, the API returns HTTP 400 with field-level
// error indicators and no database records are created.
//
// **Validates: Requirements 1.6, 1.7, 10.4**
func TestProperty3_ValidationRejectsInvalidPayloads(t *testing.T) {
	pool := connectTestDB(t)
	ctx := context.Background()

	h := buildTestHandler(pool)
	router := buildEmployeeRouter(h)

	rapid.Check(t, func(rt *rapid.T) {
		// Generate a unique suffix to avoid collisions across iterations
		suffix := rapid.IntRange(100000, 999999).Draw(rt, "suffix")

		// Start with a fully valid payload
		basePayload := map[string]interface{}{
			"employee_id":    fmt.Sprintf("PROP3_EMP_%d", suffix),
			"first_name":    "TestFirst",
			"last_name":     "TestLast",
			"contact_no":    fmt.Sprintf("8%09d", suffix),
			"department_id": 1,
			"role_id":       1,
			"password":      "ValidPass123!",
		}

		// Randomly choose which required fields to remove (at least one must be removed)
		// Generate a bitmask where at least one bit is set
		numFields := len(requiredFields)
		maxMask := (1 << numFields) - 1 // e.g., 127 for 7 fields
		// Draw a mask from 1..maxMask (excluding 0, which means "remove nothing")
		removalMask := rapid.IntRange(1, maxMask).Draw(rt, "removal_mask")

		// Build the payload with selected fields removed or zeroed
		payload := make(map[string]interface{})
		for k, v := range basePayload {
			payload[k] = v
		}

		var removedFields []string
		for i, field := range requiredFields {
			if removalMask&(1<<i) != 0 {
				// Remove this field by setting to zero-value or deleting it
				// For string fields: set to "" (empty); for int fields: set to 0
				switch field {
				case "department_id", "role_id":
					payload[field] = 0
				default:
					payload[field] = ""
				}
				removedFields = append(removedFields, field)
			}
		}

		// Marshal and send POST request
		body, err := json.Marshal(payload)
		if err != nil {
			rt.Fatalf("failed to marshal payload: %v", err)
		}

		req := httptest.NewRequest(http.MethodPost, "/api/employee-management/employees", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		// 1. Verify HTTP 400 response
		if rec.Code != http.StatusBadRequest {
			rt.Fatalf("expected HTTP 400 for payload missing fields %v, got HTTP %d; body: %s",
				removedFields, rec.Code, rec.Body.String())
		}

		// 2. Verify response has field_errors with entries for the removed fields
		var respBody struct {
			Success     bool              `json:"success"`
			Error       string            `json:"error"`
			FieldErrors map[string]string `json:"field_errors"`
		}
		if err := json.NewDecoder(rec.Body).Decode(&respBody); err != nil {
			rt.Fatalf("failed to decode response body: %v (raw: %s)", err, rec.Body.String())
		}

		if respBody.Success {
			rt.Fatalf("expected success=false, got true")
		}

		if respBody.FieldErrors == nil {
			rt.Fatalf("expected field_errors map in response, got nil")
		}

		// Each removed field should have a corresponding error
		for _, field := range removedFields {
			if _, ok := respBody.FieldErrors[field]; !ok {
				rt.Fatalf("expected field_errors to contain error for field %q, got: %v",
					field, respBody.FieldErrors)
			}
		}

		// 3. Verify no employee record was created in DB
		employeeID := fmt.Sprintf("PROP3_EMP_%d", suffix)
		var empCount int
		err = pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM employees WHERE employee_id = $1`, employeeID,
		).Scan(&empCount)
		if err != nil {
			rt.Fatalf("failed to query employees table: %v", err)
		}
		if empCount > 0 {
			// Cleanup and fail
			pool.Exec(ctx, `DELETE FROM employees WHERE employee_id = $1`, employeeID)
			rt.Fatalf("validation rejection failed: found %d record(s) in employees table for employee_id=%s (fields removed: %v)",
				empCount, employeeID, removedFields)
		}

		// 4. Verify no user record was created
		derivedEmail := fmt.Sprintf("prop3_emp_%d@swift.com", suffix)
		var userCount int
		err = pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM users WHERE email = $1`, derivedEmail,
		).Scan(&userCount)
		if err != nil {
			rt.Fatalf("failed to query users table: %v", err)
		}
		if userCount > 0 {
			pool.Exec(ctx, `DELETE FROM users WHERE email = $1`, derivedEmail)
			rt.Fatalf("validation rejection failed: found %d record(s) in users table for email=%s (fields removed: %v)",
				userCount, derivedEmail, removedFields)
		}
	})
}
