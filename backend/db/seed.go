package db

import (
	"log"
	"strings"
	"time"

	"gorm.io/gorm"

	"vexis-backend/auth"
	"vexis-backend/models"
)

// SeedAdmin creates or promotes an admin user on startup.
// Pass ADMIN_EMAIL, ADMIN_PASSWORD (only needed for creation), ADMIN_PHONE (only needed for creation).
// Idempotent: safe to call on every restart.
func SeedAdmin(database *gorm.DB, email, password, phone string) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return
	}

	var user models.User
	err := database.Where("email = ?", email).First(&user).Error
	if err == nil {
		// User exists.
		if user.IsAdmin {
			log.Printf("admin seed: %s is already admin — skipping", email)
			return
		}
		// Promote existing user to admin.
		if dbErr := database.Model(&user).Update("is_admin", true).Error; dbErr != nil {
			log.Printf("admin seed: failed to promote %s: %v", email, dbErr)
			return
		}
		log.Printf("admin seed: promoted %s to admin", email)
		return
	}

	// User does not exist — create if credentials are provided.
	if password == "" || phone == "" {
		log.Printf("admin seed: ADMIN_EMAIL is set but ADMIN_PASSWORD/ADMIN_PHONE are missing — skipping admin creation")
		return
	}

	hash, hashErr := auth.HashPassword(password)
	if hashErr != nil {
		log.Printf("admin seed: failed to hash password: %v", hashErr)
		return
	}

	now := time.Now().UTC()
	admin := models.User{
		Email:         email,
		PasswordHash:  hash,
		PhoneNumber:   phone,
		EmailVerified: true,
		PhoneVerified: true,
		Plan:          "free",
		IsAdmin:       true,
		CreatedAt:     now,
	}

	if createErr := database.Create(&admin).Error; createErr != nil {
		log.Printf("admin seed: failed to create admin user: %v", createErr)
		return
	}
	log.Printf("admin seed: created admin user %s (id=%d)", email, admin.ID)
}
