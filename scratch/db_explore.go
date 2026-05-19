package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
)

func main() {
	dsn := "postgresql://neondb_owner:npg_QtJ4xXKy3Fmo@ep-spring-scene-amchbrn8-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	rows, err := conn.Query(ctx, `
		SELECT id, region_name, parent_id, region_type_id 
		FROM regions 
		ORDER BY id ASC 
		LIMIT 20
	`)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}
	defer rows.Close()

	fmt.Println("Sample Regions in DB:")
	for rows.Next() {
		var id, regionTypeId int
		var name string
		var parentId *int
		if err := rows.Scan(&id, &name, &parentId, &regionTypeId); err == nil {
			pVal := "nil"
			if parentId != nil {
				pVal = fmt.Sprintf("%d", *parentId)
			}
			fmt.Printf("  ID: %d, Name: %s, ParentID: %s, TypeID: %d\n", id, name, pVal, regionTypeId)
		}
	}
}
