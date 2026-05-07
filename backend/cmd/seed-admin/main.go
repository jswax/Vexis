package main

import (
	"log"
	"os"
	"path/filepath"
	"runtime"

	"github.com/joho/godotenv"

	"vexis-backend/db"
)

func main() {
	// Only load .env if DATABASE_URL isn't already set in the environment.
	if os.Getenv("DATABASE_URL") == "" {
		_ = godotenv.Load(".env")
		_, self, _, ok := runtime.Caller(0)
		if ok {
			backendDir := filepath.Join(filepath.Dir(self), "..", "..")
			_ = godotenv.Load(filepath.Join(backendDir, ".env"))
		}
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL not set")
	}

	database, err := db.Connect(dbURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}

	if err := db.AutoMigrate(database); err != nil {
		log.Fatalf("db migrate: %v", err)
	}

	email := "admin@vexis.com"
	password := "admin@2026"
	phone := "+10000000000"

	db.SeedAdmin(database, email, password, phone)
	log.Println("done")
}
