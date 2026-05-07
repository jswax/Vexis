package models

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID           uint           `gorm:"primaryKey"`
	Email        string         `gorm:"uniqueIndex;not null"`
	PasswordHash string         `gorm:"not null;column:password_hash"`
	PhoneNumber  string         `gorm:"not null;default:'';column:phone_number"`

	PhoneVerified bool `gorm:"not null;default:true;column:phone_verified"`
	EmailVerified bool `gorm:"not null;default:false;column:email_verified"`

	EmailVerifyToken *string    `gorm:"uniqueIndex;column:email_verify_token"`
	ResetToken       *string    `gorm:"uniqueIndex;column:reset_token"`
	ResetTokenExpiresAt *time.Time `gorm:"column:reset_token_expires_at"`

	OtpCode     *string    `gorm:"column:otp_code"`
	OtpExpiresAt *time.Time `gorm:"column:otp_expires_at"`

	LoginOtpCode     *string    `gorm:"column:login_otp_code"`
	LoginOtpExpiresAt *time.Time `gorm:"column:login_otp_expires_at"`

	Plan string `gorm:"not null;default:free;type:varchar(16)"`

	TradingviewUsername *string `gorm:"column:tradingview_username"`

	PendingPhoneNumber *string `gorm:"column:pending_phone_number"`
	PhoneChangeOtp     *string `gorm:"column:phone_change_otp"`
	PhoneChangeOtpExpiresAt *time.Time `gorm:"column:phone_change_otp_expires_at"`

	IsAdmin bool `gorm:"not null;default:false;column:is_admin"`

	LastLoginAt *time.Time `gorm:"column:last_login_at"`
	CreatedAt   time.Time  `gorm:"not null;column:created_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index"`
}
