package models

import "time"

// PendingSignup holds registration data until the email verification link is used.
type PendingSignup struct {
	ID                  uint      `gorm:"primaryKey"`
	Email               string    `gorm:"uniqueIndex;not null;column:email"`
	PasswordHash        string    `gorm:"not null;column:password_hash"`
	PhoneNumber         string    `gorm:"not null;default:'';column:phone_number"`
	TradingviewUsername *string   `gorm:"column:tradingview_username"`
	VerifyToken         string    `gorm:"uniqueIndex;not null;column:verify_token"`
	ExpiresAt           time.Time `gorm:"not null;column:expires_at"`
	CreatedAt           time.Time `gorm:"not null;column:created_at"`
}

func (PendingSignup) TableName() string {
	return "pending_signups"
}
