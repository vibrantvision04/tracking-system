package properties

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gps-tracking-system/internal/api"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"pgregory.net/rapid"
)

// testPrerequisites holds IDs of a role, department, designation, and region that exist in the test database.
type testPrerequisites struct {
	RoleID        int
	DepartmentID  int
	DesignationID int
	RegionID      int // a valid region for zone_id
}

// ensurePrerequisites finds or creates a valid role, department, and region in the test DB.
// It first queries for existing records; if none exist, it creates minimal fixtures.
// Cleans up any created fixtures on test completion.
func ensurePrerequisites(t *testing.T, pool *pgxpool.Pool) testPrerequisites {
	t.Helper()
	ctx := context.Background()

	prereq := testPrerequisites{}
	var createdRole, createdDept bool

	// Try to find an existing role
	err := pool.QueryRow(ctx, `SELECT id FROM roles LIMIT 1`).Scan(&prereq.RoleID)
	if err != nil {
		// No roles exist — create one
		roleName := "prop1_test_role"
		pool.Exec(ctx, `DELETE FROM roles WHERE name = $1`, roleName)
		err = pool.QueryRow(ctx, `
			INSERT INTO roles (name, description)
			VALUES ($1, 'Test role for property 1')
			RETURNING id
		`, roleName).Scan(&prereq.RoleID)
		if err != nil {
			t.Fatalf("failed to create test role: %v", err)
		}
		createdRole = true
	}

	// Try to find an existing department
	err = pool.QueryRow(ctx, `SELECT id FROM departments LIMIT 1`).Scan(&prereq.DepartmentID)
	if err != nil {
		// No departments exist — create one
		deptName := "prop1_test_dept"
		pool.Exec(ctx, `DELETE FROM departments WHERE name = $1`, deptName)
		err = pool.QueryRow(ctx, `
			INSERT INTO departments (name) VALUES ($1)
			RETURNING id
		`, deptName).Scan(&prereq.DepartmentID)
		if err != nil {
			t.Fatalf("failed to create test department: %v", err)
		}
		createdDept = true
	}

	// Try to find a valid region (zone-type, region_type_id=2) for zone_id
	err = pool.QueryRow(ctx, `SELECT id FROM regions WHERE region_type_id = 2 LIMIT 1`).Scan(&prereq.RegionID)
	if err != nil {
		// Try any region
		err = pool.QueryRow(ctx, `SELECT id FROM regions LIMIT 1`).Scan(&prereq.RegionID)
		if err != nil {
			t.Skip("no regions in database — cannot run property test")
		}
	}

	// Try to find a valid designation
	err = pool.QueryRow(ctx, `SELECT id FROM designations LIMIT 1`).Scan(&prereq.DesignationID)
	if err != nil {
		// No designations exist — create one
		desigName := "prop1_test_desig"
		pool.Exec(ctx, `DELETE FROM designations WHERE name = $1`, desigName)
		err = pool.QueryRow(ctx, `
			INSERT INTO designations (name) VALUES ($1)
			RETURNING id
		`, desigName).Scan(&prereq.DesignationID)
		if err != nil {
			t.Fatalf("failed to create test designation: %v", err)
		}
		t.Cleanup(func() {
			pool.Exec(ctx, `DELETE FROM designations WHERE name = 'prop1_test_desig'`)
		})
	}

	t.Cleanup(func() {
		if createdRole {
			pool.Exec(ctx, `DELETE FROM roles WHERE name = 'prop1_test_role'`)
		}
		if createdDept {
			pool.Exec(ctx, `DELETE FROM departments WHERE name = 'prop1_test_dept'`)
		}
	})

	return prereq
}

// buildLifecycleRouter returns a chi router with both POST and GET employee routes.
func buildLifecycleRouter(h *api.Handler) http.Handler {
	r := chi.NewRouter()
	r.Post("/api/employee-management/employees", h.CreateUnifiedEmployee)
	r.Get("/api/employee-management/employees/{id}", h.GetUnifiedEmployee)
	return r
}

// TestProperty1_AtomicCreationRoundTrip verifies that for any valid
// UnifiedEmployeeRequest payload, creating an employee via POST and
// immediately retrieving it via GET returns a response where all identity,
// organizational, and user-related fields match the original request.
//
// **Validates: Requirements 1.1, 2.1, 10.1, 10.2**
func TestProperty1_AtomicCreationRoundTrip(t *testing.T) {
	pool := connectTestDB(t)

	h := buildTestHandler(pool)
	router := buildLifecycleRouter(h)
	prereq := ensurePrerequisites(t, pool)

	rapid.Check(t, func(rt *rapid.T) {
		// Generate random valid employee data
		suffix := rapid.IntRange(100000, 999999).Draw(rt, "suffix")
		firstName := rapid.StringMatching(`[A-Z][a-z]{2,10}`).Draw(rt, "first_name")
		middleName := rapid.StringMatching(`[A-Z][a-z]{2,8}`).Draw(rt, "middle_name")
		lastName := rapid.StringMatching(`[A-Z][a-z]{2,10}`).Draw(rt, "last_name")
		employeeID := fmt.Sprintf("PROP1_%d", suffix)
		contactNo := fmt.Sprintf("9%09d", suffix)
		altContactNo := fmt.Sprintf("8%09d", suffix)
		aadhaarNo := fmt.Sprintf("%012d", rapid.Int64Range(100000000000, 999999999999).Draw(rt, "aadhaar"))
		address := rapid.StringMatching(`[A-Za-z0-9 ,]{5,30}`).Draw(rt, "address")
		otherDetails := rapid.StringMatching(`[A-Za-z0-9 ]{0,20}`).Draw(rt, "other_details")
		password := fmt.Sprintf("Pass_%d!", suffix)

		// Pre-cleanup: remove any leftover records from prior failed runs
		ctx := context.Background()
		derivedEmail := strings.ToLower(employeeID) + "@swift.com"
		pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id IN (SELECT id FROM employees WHERE employee_id = $1)`, employeeID)
		pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id IN (SELECT id FROM employees WHERE employee_id = $1)`, employeeID)
		pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, derivedEmail)
		pool.Exec(ctx, `DELETE FROM employees WHERE employee_id = $1`, employeeID)
		pool.Exec(ctx, `DELETE FROM users WHERE email = $1`, derivedEmail)

		// Build the request payload
		payload := map[string]interface{}{
			"first_name":     firstName,
			"middle_name":    middleName,
			"last_name":      lastName,
			"employee_id":    employeeID,
			"contact_no":     contactNo,
			"alt_contact_no": altContactNo,
			"aadhaar_no":     aadhaarNo,
			"address":        address,
			"other_details":  otherDetails,
			"password":       password,
			"role_id":        prereq.RoleID,
			"department_id":  prereq.DepartmentID,
			"designation_id": prereq.DesignationID,
			"zone_id":        prereq.RegionID,
		}

		body, err := json.Marshal(payload)
		if err != nil {
			rt.Fatalf("failed to marshal payload: %v", err)
		}

		// POST: Create the employee
		createReq := httptest.NewRequest(http.MethodPost, "/api/employee-management/employees", bytes.NewReader(body))
		createReq.Header.Set("Content-Type", "application/json")
		createRec := httptest.NewRecorder()
		router.ServeHTTP(createRec, createReq)

		if createRec.Code != http.StatusCreated {
			rt.Fatalf("POST returned HTTP %d, expected 201; body: %s", createRec.Code, createRec.Body.String())
		}

		// Parse the POST response to get the employee ID.
		// Response format: {"success": true, "data": {UnifiedEmployeeResponse}}
		var createWrapper struct {
			Success bool                       `json:"success"`
			Data    api.UnifiedEmployeeResponse `json:"data"`
		}
		if err := json.NewDecoder(createRec.Body).Decode(&createWrapper); err != nil {
			rt.Fatalf("failed to decode POST response: %v (raw: %s)", err, createRec.Body.String())
		}

		createdID := createWrapper.Data.ID
		if createdID == 0 {
			rt.Fatalf("POST response has ID=0")
		}

		// GET: Retrieve the employee
		getURL := fmt.Sprintf("/api/employee-management/employees/%d", createdID)
		getReq := httptest.NewRequest(http.MethodGet, getURL, nil)
		getRec := httptest.NewRecorder()
		router.ServeHTTP(getRec, getReq)

		if getRec.Code != http.StatusOK {
			rt.Fatalf("GET returned HTTP %d, expected 200; body: %s", getRec.Code, getRec.Body.String())
		}

		var getWrapper struct {
			Success bool                       `json:"success"`
			Data    api.UnifiedEmployeeResponse `json:"data"`
		}
		if err := json.NewDecoder(getRec.Body).Decode(&getWrapper); err != nil {
			rt.Fatalf("failed to decode GET response: %v (raw: %s)", err, getRec.Body.String())
		}

		got := getWrapper.Data

		// Verify identity fields match
		if got.FirstName != firstName {
			rt.Fatalf("FirstName mismatch: got %q, want %q", got.FirstName, firstName)
		}
		if got.MiddleName != middleName {
			rt.Fatalf("MiddleName mismatch: got %q, want %q", got.MiddleName, middleName)
		}
		if got.LastName != lastName {
			rt.Fatalf("LastName mismatch: got %q, want %q", got.LastName, lastName)
		}
		if got.EmployeeID != employeeID {
			rt.Fatalf("EmployeeID mismatch: got %q, want %q", got.EmployeeID, employeeID)
		}
		if got.ContactNo != contactNo {
			rt.Fatalf("ContactNo mismatch: got %q, want %q", got.ContactNo, contactNo)
		}
		if got.AltContactNo != altContactNo {
			rt.Fatalf("AltContactNo mismatch: got %q, want %q", got.AltContactNo, altContactNo)
		}
		if got.AadhaarNo != aadhaarNo {
			rt.Fatalf("AadhaarNo mismatch: got %q, want %q", got.AadhaarNo, aadhaarNo)
		}
		if got.Address != address {
			rt.Fatalf("Address mismatch: got %q, want %q", got.Address, address)
		}
		if got.OtherDetails != otherDetails {
			rt.Fatalf("OtherDetails mismatch: got %q, want %q", got.OtherDetails, otherDetails)
		}

		// Verify organizational fields
		if got.RoleID != prereq.RoleID {
			rt.Fatalf("RoleID mismatch: got %d, want %d", got.RoleID, prereq.RoleID)
		}
		if got.DepartmentID != prereq.DepartmentID {
			rt.Fatalf("DepartmentID mismatch: got %d, want %d", got.DepartmentID, prereq.DepartmentID)
		}
		if got.DesignationID != prereq.DesignationID {
			rt.Fatalf("DesignationID mismatch: got %d, want %d", got.DesignationID, prereq.DesignationID)
		}

		// Verify user email derivation (employee_id@swift.com)
		expectedEmail := fmt.Sprintf("%s@swift.com", strings.ToLower(employeeID))
		if got.UserEmail != expectedEmail {
			rt.Fatalf("UserEmail mismatch: got %q, want %q", got.UserEmail, expectedEmail)
		}

		// Verify active status defaults to true
		if !got.IsActive {
			rt.Fatalf("IsActive should be true for newly created employee, got false")
		}

		// Verify a user was linked (user_id > 0)
		if got.UserID == 0 {
			rt.Fatalf("UserID should be > 0, got 0")
		}

		// Cleanup: remove the created employee and associated records
		pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id = $1`, createdID)
		pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id = $1`, createdID)
		pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, got.UserID)
		pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, got.UserID)
		pool.Exec(ctx, `DELETE FROM employees WHERE id = $1`, createdID)
	})
}

// TestProperty13_DriverRoleChangeRemovesVehicleAssignment verifies that for any
// employee with role "Driver" and an active employee_vehicle_assignments entry,
// changing their role to any non-Driver role via PUT /api/employees/{id} results
// in zero active vehicle assignments for that employee.
//
// **Validates: Requirements 9.3**
func TestProperty13_DriverRoleChangeRemovesVehicleAssignment(t *testing.T) {
	pool := connectTestDB(t)

	h := buildTestHandler(pool)
	router := chi.NewRouter()
	router.Post("/api/employee-management/employees", h.CreateUnifiedEmployee)
	router.Put("/api/employee-management/employees/{id}", h.UpdateUnifiedEmployee)

	ctx := context.Background()

	// Ensure a "Driver" role exists (scope_type = 'none')
	var driverRoleID int
	err := pool.QueryRow(ctx, `SELECT id FROM roles WHERE LOWER(name) = 'driver' LIMIT 1`).Scan(&driverRoleID)
	if err != nil {
		// Create a Driver role
		pool.Exec(ctx, `DELETE FROM roles WHERE name = 'PropTest_Driver'`)
		err = pool.QueryRow(ctx, `
			INSERT INTO roles (name, description, scope_type)
			VALUES ('PropTest_Driver', 'Driver role for property 13 test', 'none')
			RETURNING id
		`).Scan(&driverRoleID)
		if err != nil {
			t.Fatalf("failed to create Driver role: %v", err)
		}
		t.Cleanup(func() {
			pool.Exec(ctx, `DELETE FROM roles WHERE name = 'PropTest_Driver'`)
		})
	}

	// Gather a set of non-Driver roles for randomization
	rows, err := pool.Query(ctx, `SELECT id, name FROM roles WHERE LOWER(name) NOT LIKE '%driver%' AND id != $1`, driverRoleID)
	if err != nil {
		t.Fatalf("failed to query non-driver roles: %v", err)
	}
	defer rows.Close()

	type roleEntry struct {
		ID   int
		Name string
	}
	var nonDriverRoles []roleEntry
	for rows.Next() {
		var r roleEntry
		if err := rows.Scan(&r.ID, &r.Name); err == nil {
			nonDriverRoles = append(nonDriverRoles, r)
		}
	}
	rows.Close()

	// If no non-Driver roles exist, create some
	if len(nonDriverRoles) == 0 {
		for _, name := range []string{"PropTest_Supervisor", "PropTest_Admin", "PropTest_Operator"} {
			pool.Exec(ctx, `DELETE FROM roles WHERE name = $1`, name)
			var id int
			err := pool.QueryRow(ctx, `
				INSERT INTO roles (name, description, scope_type)
				VALUES ($1, 'Non-driver role for property 13', 'none')
				RETURNING id
			`, name).Scan(&id)
			if err != nil {
				t.Fatalf("failed to create non-driver role %s: %v", name, err)
			}
			nonDriverRoles = append(nonDriverRoles, roleEntry{ID: id, Name: name})
			t.Cleanup(func() {
				pool.Exec(ctx, `DELETE FROM roles WHERE name = $1`, name)
			})
		}
	}

	prereq := ensurePrerequisites(t, pool)

	rapid.Check(t, func(rt *rapid.T) {
		// Generate unique identifiers for this iteration
		suffix := rapid.IntRange(100000, 999999).Draw(rt, "suffix")
		employeeID := fmt.Sprintf("P13_%d", suffix)
		contactNo := fmt.Sprintf("7%09d", suffix)
		password := fmt.Sprintf("Pass_%d!", suffix)
		derivedEmail := strings.ToLower(employeeID) + "@swift.com"

		// Pick a random non-Driver role to change to
		targetRoleIdx := rapid.IntRange(0, len(nonDriverRoles)-1).Draw(rt, "target_role_idx")
		targetRole := nonDriverRoles[targetRoleIdx]

		// Pre-cleanup: remove any leftover from prior failed runs
		pool.Exec(ctx, `DELETE FROM employee_vehicle_assignments WHERE employee_id IN (SELECT id FROM employees WHERE employee_id = $1)`, employeeID)
		pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id IN (SELECT id FROM employees WHERE employee_id = $1)`, employeeID)
		pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id IN (SELECT id FROM employees WHERE employee_id = $1)`, employeeID)
		pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, derivedEmail)
		pool.Exec(ctx, `DELETE FROM employees WHERE employee_id = $1`, employeeID)
		pool.Exec(ctx, `DELETE FROM users WHERE email = $1`, derivedEmail)

		// Step 1: Create employee with Driver role via POST
		createPayload := map[string]interface{}{
			"first_name":     "PropThirteen",
			"middle_name":    "",
			"last_name":      "TestEmp",
			"employee_id":    employeeID,
			"contact_no":     contactNo,
			"password":       password,
			"role_id":        driverRoleID,
			"department_id":  prereq.DepartmentID,
			"designation_id": prereq.DesignationID,
			"zone_id":        prereq.RegionID,
		}

		body, _ := json.Marshal(createPayload)
		createReq := httptest.NewRequest(http.MethodPost, "/api/employee-management/employees", bytes.NewReader(body))
		createReq.Header.Set("Content-Type", "application/json")
		createRec := httptest.NewRecorder()
		router.ServeHTTP(createRec, createReq)

		if createRec.Code != http.StatusCreated {
			rt.Fatalf("POST create employee returned HTTP %d, expected 201; body: %s", createRec.Code, createRec.Body.String())
		}

		// Parse employee ID from response
		var createWrapper struct {
			Success bool                        `json:"success"`
			Data    api.UnifiedEmployeeResponse `json:"data"`
		}
		if err := json.NewDecoder(createRec.Body).Decode(&createWrapper); err != nil {
			rt.Fatalf("failed to decode POST response: %v", err)
		}
		empDBID := createWrapper.Data.ID
		if empDBID == 0 {
			rt.Fatalf("POST response has ID=0")
		}

		// Step 2: Create a test vehicle and assign it to the employee
		vehiclePlate := fmt.Sprintf("P13-%d", suffix)
		pool.Exec(ctx, `DELETE FROM vehicles WHERE plate_number = $1`, vehiclePlate)
		var vehicleID int
		err := pool.QueryRow(ctx, `
			INSERT INTO vehicles (name, plate_number)
			VALUES ($1, $2)
			RETURNING id
		`, fmt.Sprintf("TestVehicle_%d", suffix), vehiclePlate).Scan(&vehicleID)
		if err != nil {
			rt.Fatalf("failed to create test vehicle: %v", err)
		}

		// Insert vehicle assignment for this employee
		_, err = pool.Exec(ctx, `
			INSERT INTO employee_vehicle_assignments (employee_id, vehicle_id, is_active)
			VALUES ($1, $2, true)
			ON CONFLICT (employee_id) DO UPDATE SET vehicle_id = $2, is_active = true
		`, empDBID, vehicleID)
		if err != nil {
			rt.Fatalf("failed to create vehicle assignment: %v", err)
		}

		// Verify assignment exists before role change
		var countBefore int
		pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM employee_vehicle_assignments WHERE employee_id = $1
		`, empDBID).Scan(&countBefore)
		if countBefore == 0 {
			rt.Fatalf("expected at least 1 vehicle assignment before role change, got 0")
		}

		// Step 3: PUT to change role from Driver to a non-Driver role
		// Provide a password so the update uses the password-update code path
		updatePayload := map[string]interface{}{
			"first_name":     "PropThirteen",
			"middle_name":    "",
			"last_name":      "TestEmp",
			"employee_id":    employeeID,
			"contact_no":     contactNo,
			"password":       password,
			"role_id":        targetRole.ID,
			"department_id":  prereq.DepartmentID,
			"designation_id": prereq.DesignationID,
			"zone_id":        prereq.RegionID,
		}

		updateBody, _ := json.Marshal(updatePayload)
		updateReq := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/employee-management/employees/%d", empDBID), bytes.NewReader(updateBody))
		updateReq.Header.Set("Content-Type", "application/json")
		updateRec := httptest.NewRecorder()
		router.ServeHTTP(updateRec, updateReq)

		if updateRec.Code != http.StatusOK {
			rt.Fatalf("PUT update employee returned HTTP %d, expected 200; body: %s", updateRec.Code, updateRec.Body.String())
		}

		// Step 4: Verify zero vehicle assignments remain for this employee
		var countAfter int
		err = pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM employee_vehicle_assignments WHERE employee_id = $1
		`, empDBID).Scan(&countAfter)
		if err != nil {
			rt.Fatalf("failed to query vehicle assignments: %v", err)
		}

		if countAfter != 0 {
			rt.Fatalf("expected 0 vehicle assignments after Driver→%s role change, got %d", targetRole.Name, countAfter)
		}

		// Cleanup
		pool.Exec(ctx, `DELETE FROM employee_vehicle_assignments WHERE employee_id = $1`, empDBID)
		pool.Exec(ctx, `DELETE FROM vehicles WHERE id = $1`, vehicleID)
		pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id = $1`, empDBID)
		pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id = $1`, empDBID)
		pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, createWrapper.Data.UserID)
		pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, createWrapper.Data.UserID)
		pool.Exec(ctx, `DELETE FROM employees WHERE id = $1`, empDBID)
	})
}

// TestProperty11_DepartmentFilterReturnsOnlyMatchingEmployees verifies that for any
// department ID used as a filter parameter on the employee list endpoint, every employee
// in the response has that department ID, and no employee assigned to that department
// is missing from the response.
//
// Strategy:
//   1. Create 2+ departments
//   2. Create employees distributed across departments (rapid-varied count per dept)
//   3. For each department: call GET /api/employees?department_id=X&status=all
//   4. Verify every employee in response has the filtered department_id
//   5. Verify no employee from that department is missing from the response
//   6. Clean up after test
//
// **Validates: Requirements 6.3**
func TestProperty11_DepartmentFilterReturnsOnlyMatchingEmployees(t *testing.T) {
	pool := connectTestDB(t)
	ctx := context.Background()

	h := buildTestHandler(pool)

	// Build a router with list + create endpoints
	r := chi.NewRouter()
	r.Get("/api/employee-management/employees", h.GetUnifiedEmployees)
	r.Post("/api/employee-management/employees", h.CreateUnifiedEmployee)
	router := r

	// We need a role to create employees — ensure prerequisites
	prereq := ensurePrerequisites(t, pool)

	rapid.Check(t, func(rt *rapid.T) {
		// --- Setup: Create 2 or 3 departments for this iteration ---
		numDepts := rapid.IntRange(2, 3).Draw(rt, "num_departments")
		deptIDs := make([]int, 0, numDepts)
		deptNames := make([]string, 0, numDepts)

		iterSuffix := rapid.IntRange(100000, 999999).Draw(rt, "iter_suffix")

		for i := 0; i < numDepts; i++ {
			deptName := fmt.Sprintf("prop11_dept_%d_%d", iterSuffix, i)
			deptNames = append(deptNames, deptName)

			// Clean up any leftover from previous runs
			pool.Exec(ctx, `DELETE FROM departments WHERE name = $1`, deptName)

			var deptID int
			err := pool.QueryRow(ctx,
				`INSERT INTO departments (name) VALUES ($1) RETURNING id`, deptName,
			).Scan(&deptID)
			if err != nil {
				rt.Fatalf("failed to create department %q: %v", deptName, err)
			}
			deptIDs = append(deptIDs, deptID)
		}

		// --- Create employees distributed across departments ---
		type createdEmployee struct {
			ID           int
			EmployeeID   string
			DepartmentID int
			UserID       int
		}
		allCreated := make([]createdEmployee, 0)

		empCounter := 0 // monotonic counter to guarantee unique employee IDs within this iteration
		for deptIdx, deptID := range deptIDs {
			// Each department gets 1-3 employees (rapid-varied)
			numEmps := rapid.IntRange(1, 3).Draw(rt, fmt.Sprintf("num_emps_dept_%d", deptIdx))

			for empI := 0; empI < numEmps; empI++ {
				empCounter++
				employeeID := fmt.Sprintf("P11_%d_%d", iterSuffix, empCounter)
				contactNo := fmt.Sprintf("7%04d%05d", iterSuffix%10000, empCounter)

				// Pre-cleanup
				derivedEmail := strings.ToLower(employeeID) + "@swift.com"
				pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id IN (SELECT id FROM employees WHERE employee_id = $1)`, employeeID)
				pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id IN (SELECT id FROM employees WHERE employee_id = $1)`, employeeID)
				pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, derivedEmail)
				pool.Exec(ctx, `DELETE FROM employees WHERE employee_id = $1`, employeeID)
				pool.Exec(ctx, `DELETE FROM users WHERE email = $1`, derivedEmail)

				payload := map[string]interface{}{
					"first_name":     fmt.Sprintf("First%d", empCounter),
					"last_name":      fmt.Sprintf("Last%d", empCounter),
					"employee_id":    employeeID,
					"contact_no":     contactNo,
					"password":       fmt.Sprintf("Pass_%d!", empCounter),
					"role_id":        prereq.RoleID,
					"department_id":  deptID,
					"designation_id": prereq.DesignationID,
					"zone_id":        prereq.RegionID,
				}

				body, err := json.Marshal(payload)
				if err != nil {
					rt.Fatalf("failed to marshal payload: %v", err)
				}

				createReq := httptest.NewRequest(http.MethodPost, "/api/employee-management/employees", bytes.NewReader(body))
				createReq.Header.Set("Content-Type", "application/json")
				createRec := httptest.NewRecorder()
				router.ServeHTTP(createRec, createReq)

				if createRec.Code != http.StatusCreated {
					rt.Fatalf("POST returned HTTP %d for emp %s in dept %d; body: %s",
						createRec.Code, employeeID, deptID, createRec.Body.String())
				}

				var createWrapper struct {
					Success bool                        `json:"success"`
					Data    api.UnifiedEmployeeResponse `json:"data"`
				}
				if err := json.NewDecoder(createRec.Body).Decode(&createWrapper); err != nil {
					rt.Fatalf("failed to decode POST response: %v", err)
				}

				allCreated = append(allCreated, createdEmployee{
					ID:           createWrapper.Data.ID,
					EmployeeID:   employeeID,
					DepartmentID: deptID,
					UserID:       createWrapper.Data.UserID,
				})
			}
		}

		// --- For each department, call GET /api/employees?department_id=X&status=all ---
		for _, deptID := range deptIDs {
			url := fmt.Sprintf("/api/employee-management/employees?department_id=%d&status=all&page_size=100", deptID)
			getReq := httptest.NewRequest(http.MethodGet, url, nil)
			getRec := httptest.NewRecorder()
			router.ServeHTTP(getRec, getReq)

			if getRec.Code != http.StatusOK {
				rt.Fatalf("GET employees?department_id=%d returned HTTP %d; body: %s",
					deptID, getRec.Code, getRec.Body.String())
			}

			var listResp struct {
				Success bool                          `json:"success"`
				Data    []api.UnifiedEmployeeResponse `json:"data"`
				Total   int                           `json:"total"`
			}
			if err := json.NewDecoder(getRec.Body).Decode(&listResp); err != nil {
				rt.Fatalf("failed to decode GET response: %v", err)
			}

			// Property assertion 1: Every employee in response has the filtered department_id
			for _, emp := range listResp.Data {
				if emp.DepartmentID != deptID {
					rt.Fatalf("department filter violation: employee %d (%s) has department_id=%d, expected %d",
						emp.ID, emp.EmployeeID, emp.DepartmentID, deptID)
				}
			}

			// Property assertion 2: No employee from that department is missing from the response
			// Collect the IDs we created for this department
			expectedIDs := make(map[int]bool)
			for _, ce := range allCreated {
				if ce.DepartmentID == deptID {
					expectedIDs[ce.ID] = true
				}
			}

			// Collect returned IDs
			returnedIDs := make(map[int]bool)
			for _, emp := range listResp.Data {
				returnedIDs[emp.ID] = true
			}

			// Every expected employee must be in the response
			for id := range expectedIDs {
				if !returnedIDs[id] {
					rt.Fatalf("completeness violation: employee id=%d is in department %d but missing from filtered response (response had %d employees)",
						id, deptID, len(listResp.Data))
				}
			}
		}

		// --- Cleanup: remove all created employees and departments ---
		for _, ce := range allCreated {
			pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id = $1`, ce.ID)
			pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id = $1`, ce.ID)
			pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, ce.UserID)
			pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, ce.UserID)
			pool.Exec(ctx, `DELETE FROM employees WHERE id = $1`, ce.ID)
		}
		for _, deptName := range deptNames {
			pool.Exec(ctx, `DELETE FROM departments WHERE name = $1`, deptName)
		}
	})
}

// buildDeactivationRouter returns a chi router with all routes needed for
// deactivation/reactivation property tests (create, list, status update, get single).
func buildDeactivationRouter(h *api.Handler) http.Handler {
	r := chi.NewRouter()
	r.Post("/api/employee-management/employees", h.CreateUnifiedEmployee)
	r.Get("/api/employee-management/employees", h.GetUnifiedEmployees)
	r.Get("/api/employee-management/employees/{id}", h.GetUnifiedEmployee)
	r.Put("/api/employee-management/employees/{id}/status", h.UpdateEmployeeStatus)
	return r
}

// TestProperty15_DeactivationExcludesFromActiveLists verifies that for any active employee,
// after deactivation: (a) the employee's status is "inactive", (b) the employee does not
// appear in the default (active-only) employee list, and (c) the employee still appears
// when fetching with ?status=all.
//
// **Validates: Requirements 13.1, 13.3**
func TestProperty15_DeactivationExcludesFromActiveLists(t *testing.T) {
	pool := connectTestDB(t)

	h := buildTestHandler(pool)
	router := buildDeactivationRouter(h)
	prereq := ensurePrerequisites(t, pool)

	rapid.Check(t, func(rt *rapid.T) {
		// Generate random valid employee data
		suffix := rapid.IntRange(100000, 999999).Draw(rt, "suffix")
		firstName := rapid.StringMatching(`[A-Z][a-z]{2,10}`).Draw(rt, "first_name")
		lastName := rapid.StringMatching(`[A-Z][a-z]{2,10}`).Draw(rt, "last_name")
		employeeID := fmt.Sprintf("P15_%d", suffix)
		contactNo := fmt.Sprintf("9%09d", suffix)
		password := fmt.Sprintf("Pass_%d!", suffix)

		// Pre-cleanup
		ctx := context.Background()
		derivedEmail := strings.ToLower(employeeID) + "@swift.com"
		pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id IN (SELECT id FROM employees WHERE employee_id = $1)`, employeeID)
		pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id IN (SELECT id FROM employees WHERE employee_id = $1)`, employeeID)
		pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, derivedEmail)
		pool.Exec(ctx, `DELETE FROM employees WHERE employee_id = $1`, employeeID)
		pool.Exec(ctx, `DELETE FROM users WHERE email = $1`, derivedEmail)

		// 1. Create an active employee via POST
		payload := map[string]interface{}{
			"first_name":     firstName,
			"last_name":      lastName,
			"employee_id":    employeeID,
			"contact_no":     contactNo,
			"password":       password,
			"role_id":        prereq.RoleID,
			"department_id":  prereq.DepartmentID,
			"designation_id": prereq.DesignationID,
		}
		body, _ := json.Marshal(payload)

		createReq := httptest.NewRequest(http.MethodPost, "/api/employee-management/employees", bytes.NewReader(body))
		createReq.Header.Set("Content-Type", "application/json")
		createRec := httptest.NewRecorder()
		router.ServeHTTP(createRec, createReq)

		if createRec.Code != http.StatusCreated {
			rt.Fatalf("POST returned HTTP %d, expected 201; body: %s", createRec.Code, createRec.Body.String())
		}

		var createWrapper struct {
			Success bool                        `json:"success"`
			Data    api.UnifiedEmployeeResponse `json:"data"`
		}
		if err := json.NewDecoder(createRec.Body).Decode(&createWrapper); err != nil {
			rt.Fatalf("failed to decode POST response: %v", err)
		}
		createdID := createWrapper.Data.ID
		userID := createWrapper.Data.UserID

		// 2. Deactivate via PUT /api/employees/{id}/status
		deactivateBody, _ := json.Marshal(map[string]string{"status": "inactive"})
		deactivateURL := fmt.Sprintf("/api/employee-management/employees/%d/status", createdID)
		deactivateReq := httptest.NewRequest(http.MethodPut, deactivateURL, bytes.NewReader(deactivateBody))
		deactivateReq.Header.Set("Content-Type", "application/json")
		deactivateRec := httptest.NewRecorder()
		router.ServeHTTP(deactivateRec, deactivateReq)

		if deactivateRec.Code != http.StatusOK {
			rt.Fatalf("PUT status returned HTTP %d, expected 200; body: %s", deactivateRec.Code, deactivateRec.Body.String())
		}

		// 3. Verify employee does NOT appear in default GET /api/employees (active-only)
		listReq := httptest.NewRequest(http.MethodGet, "/api/employee-management/employees", nil)
		listRec := httptest.NewRecorder()
		router.ServeHTTP(listRec, listReq)

		if listRec.Code != http.StatusOK {
			rt.Fatalf("GET list returned HTTP %d, expected 200", listRec.Code)
		}

		var listResponse struct {
			Success bool                          `json:"success"`
			Data    []api.UnifiedEmployeeResponse `json:"data"`
		}
		if err := json.NewDecoder(listRec.Body).Decode(&listResponse); err != nil {
			rt.Fatalf("failed to decode list response: %v", err)
		}

		for _, emp := range listResponse.Data {
			if emp.ID == createdID {
				rt.Fatalf("deactivated employee (ID=%d) should NOT appear in default active list", createdID)
			}
		}

		// 4. Verify employee.status = "inactive" via GET with ?status=all
		listAllReq := httptest.NewRequest(http.MethodGet, "/api/employee-management/employees?status=all", nil)
		listAllRec := httptest.NewRecorder()
		router.ServeHTTP(listAllRec, listAllReq)

		if listAllRec.Code != http.StatusOK {
			rt.Fatalf("GET list?status=all returned HTTP %d", listAllRec.Code)
		}

		var listAllResponse struct {
			Success bool                          `json:"success"`
			Data    []api.UnifiedEmployeeResponse `json:"data"`
		}
		if err := json.NewDecoder(listAllRec.Body).Decode(&listAllResponse); err != nil {
			rt.Fatalf("failed to decode list all response: %v", err)
		}

		found := false
		for _, emp := range listAllResponse.Data {
			if emp.ID == createdID {
				found = true
				if emp.IsActive {
					rt.Fatalf("deactivated employee should have IsActive=false, got true")
				}
				break
			}
		}
		if !found {
			rt.Fatalf("deactivated employee (ID=%d) should appear in ?status=all list", createdID)
		}

		// 5. Verify user account is_active = false (login disabled)
		var userIsActive bool
		err := pool.QueryRow(ctx, `SELECT COALESCE(is_active, true) FROM users WHERE email = $1`, derivedEmail).Scan(&userIsActive)
		if err != nil {
			rt.Fatalf("failed to query user is_active: %v", err)
		}
		if userIsActive {
			rt.Fatalf("user account should have is_active=false after deactivation, got true")
		}

		// Cleanup
		pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id = $1`, createdID)
		pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id = $1`, createdID)
		pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, userID)
		pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
		pool.Exec(ctx, `DELETE FROM employees WHERE id = $1`, createdID)
	})
}

// TestProperty16_ReactivationRestoresAccess verifies that for any previously-active
// employee who was deactivated, reactivation: (a) sets status to "active", (b) re-enables
// login (user is_active = true), and (c) the employee reappears in the default active list.
//
// **Validates: Requirements 13.2**
func TestProperty16_ReactivationRestoresAccess(t *testing.T) {
	pool := connectTestDB(t)

	h := buildTestHandler(pool)
	router := buildDeactivationRouter(h)
	prereq := ensurePrerequisites(t, pool)

	rapid.Check(t, func(rt *rapid.T) {
		// Generate random valid employee data
		suffix := rapid.IntRange(100000, 999999).Draw(rt, "suffix")
		firstName := rapid.StringMatching(`[A-Z][a-z]{2,10}`).Draw(rt, "first_name")
		lastName := rapid.StringMatching(`[A-Z][a-z]{2,10}`).Draw(rt, "last_name")
		employeeID := fmt.Sprintf("P16_%d", suffix)
		contactNo := fmt.Sprintf("7%09d", suffix)
		password := fmt.Sprintf("Pass_%d!", suffix)

		// Pre-cleanup
		ctx := context.Background()
		derivedEmail := strings.ToLower(employeeID) + "@swift.com"
		pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id IN (SELECT id FROM employees WHERE employee_id = $1)`, employeeID)
		pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id IN (SELECT id FROM employees WHERE employee_id = $1)`, employeeID)
		pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, derivedEmail)
		pool.Exec(ctx, `DELETE FROM employees WHERE employee_id = $1`, employeeID)
		pool.Exec(ctx, `DELETE FROM users WHERE email = $1`, derivedEmail)

		// 1. Create an active employee
		payload := map[string]interface{}{
			"first_name":     firstName,
			"last_name":      lastName,
			"employee_id":    employeeID,
			"contact_no":     contactNo,
			"password":       password,
			"role_id":        prereq.RoleID,
			"department_id":  prereq.DepartmentID,
			"designation_id": prereq.DesignationID,
		}
		body, _ := json.Marshal(payload)

		createReq := httptest.NewRequest(http.MethodPost, "/api/employee-management/employees", bytes.NewReader(body))
		createReq.Header.Set("Content-Type", "application/json")
		createRec := httptest.NewRecorder()
		router.ServeHTTP(createRec, createReq)

		if createRec.Code != http.StatusCreated {
			rt.Fatalf("POST returned HTTP %d, expected 201; body: %s", createRec.Code, createRec.Body.String())
		}

		var createWrapper struct {
			Success bool                        `json:"success"`
			Data    api.UnifiedEmployeeResponse `json:"data"`
		}
		if err := json.NewDecoder(createRec.Body).Decode(&createWrapper); err != nil {
			rt.Fatalf("failed to decode POST response: %v", err)
		}
		createdID := createWrapper.Data.ID
		userID := createWrapper.Data.UserID
		originalRoleID := createWrapper.Data.RoleID

		// 2. Deactivate the employee
		deactivateBody, _ := json.Marshal(map[string]string{"status": "inactive"})
		deactivateURL := fmt.Sprintf("/api/employee-management/employees/%d/status", createdID)
		deactivateReq := httptest.NewRequest(http.MethodPut, deactivateURL, bytes.NewReader(deactivateBody))
		deactivateReq.Header.Set("Content-Type", "application/json")
		deactivateRec := httptest.NewRecorder()
		router.ServeHTTP(deactivateRec, deactivateReq)

		if deactivateRec.Code != http.StatusOK {
			rt.Fatalf("PUT deactivate returned HTTP %d; body: %s", deactivateRec.Code, deactivateRec.Body.String())
		}

		// 3. Reactivate the employee
		reactivateBody, _ := json.Marshal(map[string]string{"status": "active"})
		reactivateURL := fmt.Sprintf("/api/employee-management/employees/%d/status", createdID)
		reactivateReq := httptest.NewRequest(http.MethodPut, reactivateURL, bytes.NewReader(reactivateBody))
		reactivateReq.Header.Set("Content-Type", "application/json")
		reactivateRec := httptest.NewRecorder()
		router.ServeHTTP(reactivateRec, reactivateReq)

		if reactivateRec.Code != http.StatusOK {
			rt.Fatalf("PUT reactivate returned HTTP %d; body: %s", reactivateRec.Code, reactivateRec.Body.String())
		}

		// 4. Verify employee status is "active" via GET single
		getURL := fmt.Sprintf("/api/employee-management/employees/%d", createdID)
		getReq := httptest.NewRequest(http.MethodGet, getURL, nil)
		getRec := httptest.NewRecorder()
		router.ServeHTTP(getRec, getReq)

		if getRec.Code != http.StatusOK {
			rt.Fatalf("GET returned HTTP %d; body: %s", getRec.Code, getRec.Body.String())
		}

		var getWrapper struct {
			Success bool                        `json:"success"`
			Data    api.UnifiedEmployeeResponse `json:"data"`
		}
		if err := json.NewDecoder(getRec.Body).Decode(&getWrapper); err != nil {
			rt.Fatalf("failed to decode GET response: %v", err)
		}

		if !getWrapper.Data.IsActive {
			rt.Fatalf("reactivated employee should have IsActive=true, got false")
		}

		// 5. Verify employee appears in default (active-only) employee list
		listReq := httptest.NewRequest(http.MethodGet, "/api/employee-management/employees", nil)
		listRec := httptest.NewRecorder()
		router.ServeHTTP(listRec, listReq)

		if listRec.Code != http.StatusOK {
			rt.Fatalf("GET list returned HTTP %d", listRec.Code)
		}

		var listResponse struct {
			Success bool                          `json:"success"`
			Data    []api.UnifiedEmployeeResponse `json:"data"`
		}
		if err := json.NewDecoder(listRec.Body).Decode(&listResponse); err != nil {
			rt.Fatalf("failed to decode list response: %v", err)
		}

		found := false
		for _, emp := range listResponse.Data {
			if emp.ID == createdID {
				found = true
				break
			}
		}
		if !found {
			rt.Fatalf("reactivated employee (ID=%d) should appear in default active list", createdID)
		}

		// 6. Verify user account is_active = true (login re-enabled)
		var userIsActive bool
		err := pool.QueryRow(ctx, `SELECT COALESCE(is_active, true) FROM users WHERE email = $1`, derivedEmail).Scan(&userIsActive)
		if err != nil {
			rt.Fatalf("failed to query user is_active: %v", err)
		}
		if !userIsActive {
			rt.Fatalf("user account should have is_active=true after reactivation, got false")
		}

		// 7. Verify role assignment is preserved through deactivation/reactivation cycle
		var currentRoleID int
		err = pool.QueryRow(ctx, `SELECT role_id FROM user_roles WHERE user_id = $1`, userID).Scan(&currentRoleID)
		if err != nil {
			rt.Fatalf("failed to query user_roles after reactivation: %v", err)
		}
		if currentRoleID != originalRoleID {
			rt.Fatalf("role should be preserved after reactivation: got role_id=%d, want %d", currentRoleID, originalRoleID)
		}

		// Cleanup
		pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id = $1`, createdID)
		pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id = $1`, createdID)
		pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, userID)
		pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
		pool.Exec(ctx, `DELETE FROM employees WHERE id = $1`, createdID)
	})
}

// TestProperty4_AtomicUpdatePreservesUnchangedFields verifies that for any existing
// employee, when an update is sent with a blank password field but other fields
// changed (e.g., address), the password hash in the users table remains unchanged
// while the updated field reflects its new value.
//
// **Validates: Requirements 2.3, 2.5**
func TestProperty4_AtomicUpdatePreservesUnchangedFields(t *testing.T) {
	pool := connectTestDB(t)

	h := buildTestHandler(pool)
	router := buildProperty4Router(h)
	prereq := ensurePrerequisites(t, pool)

	rapid.Check(t, func(rt *rapid.T) {
		ctx := context.Background()

		// Generate unique identifiers for this iteration
		suffix := rapid.IntRange(200000, 899999).Draw(rt, "suffix")
		employeeID := fmt.Sprintf("PROP4_%d", suffix)
		contactNo := fmt.Sprintf("7%09d", suffix)
		firstName := rapid.StringMatching(`[A-Z][a-z]{2,8}`).Draw(rt, "first_name")
		lastName := rapid.StringMatching(`[A-Z][a-z]{2,8}`).Draw(rt, "last_name")
		originalAddress := rapid.StringMatching(`[A-Za-z0-9 ,]{5,25}`).Draw(rt, "original_address")
		originalPassword := fmt.Sprintf("OrigPass_%d!", suffix)

		// Generate a different address for the update
		newAddress := rapid.StringMatching(`[A-Za-z0-9 ,]{5,25}`).Draw(rt, "new_address")
		// Ensure new address is different from original
		if newAddress == originalAddress {
			newAddress = newAddress + " Updated"
		}

		// Derive email
		derivedEmail := strings.ToLower(employeeID) + "@swift.com"

		// Pre-cleanup: remove any leftover records from prior failed runs
		pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id IN (SELECT id FROM employees WHERE employee_id = $1)`, employeeID)
		pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id IN (SELECT id FROM employees WHERE employee_id = $1)`, employeeID)
		pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, derivedEmail)
		pool.Exec(ctx, `DELETE FROM employees WHERE employee_id = $1`, employeeID)
		pool.Exec(ctx, `DELETE FROM users WHERE email = $1`, derivedEmail)

		// Step 1: Create an employee with a known password via POST
		createPayload := map[string]interface{}{
			"first_name":     firstName,
			"last_name":      lastName,
			"employee_id":    employeeID,
			"contact_no":     contactNo,
			"address":        originalAddress,
			"password":       originalPassword,
			"role_id":        prereq.RoleID,
			"department_id":  prereq.DepartmentID,
			"designation_id": prereq.DesignationID,
			"zone_id":        prereq.RegionID,
		}

		createBody, err := json.Marshal(createPayload)
		if err != nil {
			rt.Fatalf("failed to marshal create payload: %v", err)
		}

		createReq := httptest.NewRequest(http.MethodPost, "/api/employee-management/employees", bytes.NewReader(createBody))
		createReq.Header.Set("Content-Type", "application/json")
		createRec := httptest.NewRecorder()
		router.ServeHTTP(createRec, createReq)

		if createRec.Code != http.StatusCreated {
			rt.Fatalf("POST returned HTTP %d, expected 201; body: %s", createRec.Code, createRec.Body.String())
		}

		var createWrapper struct {
			Success bool                        `json:"success"`
			Data    api.UnifiedEmployeeResponse `json:"data"`
		}
		if err := json.NewDecoder(createRec.Body).Decode(&createWrapper); err != nil {
			rt.Fatalf("failed to decode POST response: %v", err)
		}

		createdID := createWrapper.Data.ID
		if createdID == 0 {
			rt.Fatalf("POST response has ID=0")
		}

		// Step 2: Read the password_hash from the users table directly
		var originalHash string
		err = pool.QueryRow(ctx, `SELECT password_hash FROM users WHERE email = $1`, derivedEmail).Scan(&originalHash)
		if err != nil {
			rt.Fatalf("failed to read original password_hash: %v", err)
		}
		if originalHash == "" {
			rt.Fatalf("original password_hash is empty after creation")
		}

		// Step 3: Send PUT with password="" (blank) but change address
		updatePayload := map[string]interface{}{
			"first_name":     firstName,
			"last_name":      lastName,
			"employee_id":    employeeID,
			"contact_no":     contactNo,
			"address":        newAddress,
			"password":       "", // blank — should preserve existing hash
			"role_id":        prereq.RoleID,
			"department_id":  prereq.DepartmentID,
			"designation_id": prereq.DesignationID,
			"zone_id":        prereq.RegionID,
		}

		updateBody, err := json.Marshal(updatePayload)
		if err != nil {
			rt.Fatalf("failed to marshal update payload: %v", err)
		}

		putURL := fmt.Sprintf("/api/employee-management/employees/%d", createdID)
		updateReq := httptest.NewRequest(http.MethodPut, putURL, bytes.NewReader(updateBody))
		updateReq.Header.Set("Content-Type", "application/json")
		updateRec := httptest.NewRecorder()
		router.ServeHTTP(updateRec, updateReq)

		if updateRec.Code != http.StatusOK {
			rt.Fatalf("PUT returned HTTP %d, expected 200; body: %s", updateRec.Code, updateRec.Body.String())
		}

		// Step 4: Read the password_hash again from users table
		var updatedHash string
		err = pool.QueryRow(ctx, `SELECT password_hash FROM users WHERE email = $1`, derivedEmail).Scan(&updatedHash)
		if err != nil {
			rt.Fatalf("failed to read updated password_hash: %v", err)
		}

		// Step 5: Verify password_hash is unchanged
		if updatedHash != originalHash {
			rt.Fatalf("password_hash changed after update with blank password!\n  original: %q\n  updated:  %q", originalHash, updatedHash)
		}

		// Step 6: Verify the updated field (address) is changed in GET response
		getURL := fmt.Sprintf("/api/employee-management/employees/%d", createdID)
		getReq := httptest.NewRequest(http.MethodGet, getURL, nil)
		getRec := httptest.NewRecorder()
		router.ServeHTTP(getRec, getReq)

		if getRec.Code != http.StatusOK {
			rt.Fatalf("GET returned HTTP %d, expected 200; body: %s", getRec.Code, getRec.Body.String())
		}

		var getWrapper struct {
			Success bool                        `json:"success"`
			Data    api.UnifiedEmployeeResponse `json:"data"`
		}
		if err := json.NewDecoder(getRec.Body).Decode(&getWrapper); err != nil {
			rt.Fatalf("failed to decode GET response: %v", err)
		}

		if getWrapper.Data.Address != newAddress {
			rt.Fatalf("Address not updated: got %q, want %q", getWrapper.Data.Address, newAddress)
		}

		// Cleanup: remove the created employee and associated records
		userID := createWrapper.Data.UserID
		pool.Exec(ctx, `DELETE FROM employee_scopes WHERE employee_id = $1`, createdID)
		pool.Exec(ctx, `DELETE FROM employee_department_designations WHERE employee_id = $1`, createdID)
		pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, userID)
		pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
		pool.Exec(ctx, `DELETE FROM employees WHERE id = $1`, createdID)
	})
}

// buildProperty4Router returns a chi router with POST, PUT, and GET employee routes.
func buildProperty4Router(h *api.Handler) http.Handler {
	r := chi.NewRouter()
	r.Post("/api/employee-management/employees", h.CreateUnifiedEmployee)
	r.Put("/api/employee-management/employees/{id}", h.UpdateUnifiedEmployee)
	r.Get("/api/employee-management/employees/{id}", h.GetUnifiedEmployee)
	return r
}
