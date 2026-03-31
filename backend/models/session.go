package models

import (
	"time"
)

type Session struct {
	ID         string    `gorm:"primaryKey;size:36;column:id"`
	UserID     uint      `gorm:"not null;index;column:user_id"`
	TokenHash  string    `gorm:"not null;column:token_hash"`
	IPAddress  string    `gorm:"column:ip_address"`
	UserAgent  string    `gorm:"column:user_agent"`
	CreatedAt  time.Time `gorm:"not null;column:created_at"`
	ExpiresAt  time.Time `gorm:"not null;index;column:expires_at"`
}

func (Session) TableName() string {
	return "sessions"
}
