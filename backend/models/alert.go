package models

import "time"

type Alert struct {
	ID        uint      `gorm:"primaryKey"`
	Source    string    `gorm:"not null;default:'trading-model'"`
	Payload   string    `gorm:"type:text;not null"`
	CreatedAt time.Time `gorm:"not null"`
}

