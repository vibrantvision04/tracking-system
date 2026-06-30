//go:build ignore
// +build ignore

package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"gps-tracking-system/internal/auth"

	"github.com/jackc/pgx/v5"
)

func main() {
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		dsn = "postgres://gps:password@localhost:5432/gpsdb"
	}

	ctx := context.Background()
	var conn *pgx.Conn
	var err error

	for i := 0; i < 15; i++ {
		conn, err = pgx.Connect(ctx, dsn)
		if err == nil {
			break
		}
		fmt.Printf("DB connection failed (attempt %d/15): %v. Retrying in 2s...\n", i+1, err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	fmt.Println("Connected. Clearing ALL existing employees and related records...")

	conn.Exec(ctx, `SET session_replication_role = 'replica'`)
	conn.Exec(ctx, `TRUNCATE TABLE employees CASCADE`)
	conn.Exec(ctx, `DELETE FROM users WHERE email NOT IN ('test-admin@example.com', 'test-mobile@example.com')`)
	conn.Exec(ctx, `DELETE FROM user_roles`)
	conn.Exec(ctx, `SET session_replication_role = 'origin'`)

	var empCount int
	conn.QueryRow(ctx, `SELECT COUNT(*) FROM employees`).Scan(&empCount)
	fmt.Printf("Remaining employees: %d (should be 0)\n", empCount)

	hash, err := auth.HashPassword("Test@1234")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to hash password: %v\n", err)
		os.Exit(1)
	}

	// Fetch RBAC role IDs
	roleNameToID := map[string]int{}
	rows, _ := conn.Query(ctx, `SELECT id, name FROM roles`)
	for rows.Next() {
		var id int
		var name string
		rows.Scan(&id, &name)
		roleNameToID[name] = id
	}

	type account struct {
		EmployeeID string
		Role       string // users.role (for mobile role mapping)
		RBACRole   string // roles.name (for RBAC)
		FirstName  string
	}
	accounts := []account{
		{"000000000001", "ADMIN", "Super Admin", "SuperAdmin"},
		{"000000000002", "driver", "Driver", "Driver"},
		{"000000000003", "supervisor", "Supervisor", "Supervisor"},
		{"000000000004", "zone_manager", "Manager", "ZoneManager"},
		{"000000000005", "open_depot_operator", "Driver", "OpenDepot"},
		{"000000000006", "road_sweeper", "Driver", "RoadSweeper"},
	}

	for _, a := range accounts {
		empEmail := a.EmployeeID + "@vswm.com"

		var empID int
		err = conn.QueryRow(ctx, `
			INSERT INTO employees (first_name, last_name, employee_id, email, aadhaar_no, contact_no, address, is_active)
			VALUES ($1, 'User', $2, $3, $4, $5, 'Temporary seed account', true)
			RETURNING id
		`, a.FirstName, a.EmployeeID, empEmail, a.EmployeeID, a.EmployeeID).Scan(&empID)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to insert employee %s: %v\n", a.EmployeeID, err)
			continue
		}
		fmt.Printf("Created employee: %s (id=%d)\n", a.EmployeeID, empID)

		var userID int
		err = conn.QueryRow(ctx, `
			INSERT INTO users (email, role, password_hash)
			VALUES ($1, $2, $3)
			ON CONFLICT (email) DO UPDATE SET role = $2, password_hash = $3
			RETURNING id
		`, empEmail, a.Role, hash).Scan(&userID)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to insert user %s: %v\n", empEmail, err)
			continue
		}
		fmt.Printf("Created user: %s (id=%d, role=%s)\n", empEmail, userID, a.Role)

		// Assign RBAC role
		if rbacID, ok := roleNameToID[a.RBACRole]; ok {
			conn.Exec(ctx, `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, userID, rbacID)
			fmt.Printf("  Assigned RBAC role %s (id=%d)\n", a.RBACRole, rbacID)
		} else {
			fmt.Printf("  WARNING: RBAC role '%s' not found in roles table\n", a.RBACRole)
		}
	}

	fmt.Println("\nDone! Temporary employees seeded.")
	fmt.Println("Passwords: Test@1234")
	fmt.Println("Login via employee_id (e.g. '000000000001') or email (e.g. '000000000001@vswm.com')")
}
