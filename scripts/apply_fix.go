//go:build ignore

package main

import (
	"context"
	"fmt"
	"os"
	"io/ioutil"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

func main() {
	godotenv.Load()
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		fmt.Println("DB_DSN not found in .env")
		os.Exit(1)
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		fmt.Printf("Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	fmt.Println("Applying schema fix...")
	sql, err := ioutil.ReadFile("migrations/999_fix_everything.sql")
	if err != nil {
		fmt.Printf("Unable to read SQL file: %v\n", err)
		os.Exit(1)
	}

	_, err = conn.Exec(ctx, string(sql))
	if err != nil {
		fmt.Printf("Error executing SQL: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Schema fix applied successfully!")
}
