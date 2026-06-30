package main

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Employee struct {
	ID        int
	FirstName string
	LastName  string
}

type EDD struct {
	EmployeeID      int
	DesignationName string
}

func main() {
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, "postgres://gps:password@localhost:5432/gpsdb")
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	defer pool.Close()

	// 1. Fetch employees
	rows, err := pool.Query(ctx, `SELECT id, first_name, last_name FROM employees`)
	if err != nil {
		log.Fatalf("Employees query failed: %v\n", err)
	}
	var employees []Employee
	for rows.Next() {
		var e Employee
		rows.Scan(&e.ID, &e.FirstName, &e.LastName)
		employees = append(employees, e)
	}
	rows.Close()

	// 2. Fetch EDD
	rows, err = pool.Query(ctx, `
		SELECT 
			edd.employee_id, 
			COALESCE(des.name, '') AS designation_name
		FROM employee_department_designations edd
		JOIN employees e ON edd.employee_id = e.id
		LEFT JOIN departments d ON edd.department_id = d.id
		LEFT JOIN designations des ON edd.designation_id = des.id
		LEFT JOIN regions reg ON edd.region_id = reg.id
	`)
	if err != nil {
		log.Fatalf("EDD query failed: %v\n", err)
	}
	var edds []EDD
	for rows.Next() {
		var edd EDD
		rows.Scan(&edd.EmployeeID, &edd.DesignationName)
		edds = append(edds, edd)
	}
	rows.Close()

	fmt.Printf("Loaded %d employees and %d EDD mappings.\n", len(employees), len(edds))

	// Simulate frontend mapping and filter
	count := 0
	for _, e := range employees {
		var designation string = "Employee"
		for _, m := range edds {
			if m.EmployeeID == e.ID {
				designation = m.DesignationName
				break
			}
		}
		isDriver := strings.Contains(strings.ToLower(designation), "driver")
		if isDriver {
			fmt.Printf("MATCH FOUND: ID=%d, Name=%s %s, Designation=%s\n", e.ID, e.FirstName, e.LastName, designation)
			count++
		}
	}
	fmt.Printf("Total drivers found after simulation: %d\n", count)
}
