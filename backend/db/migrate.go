package db

import (
	"vexis-backend/models"

	"gorm.io/gorm"
)

func AutoMigrate(database *gorm.DB) error {
	return database.AutoMigrate(
		&models.User{},
		&models.PendingSignup{},
		&models.Alert{},
		&models.Session{},
	)
}

