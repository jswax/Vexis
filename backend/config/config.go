package config

import (
	"errors"
	"os"
)

type Config struct {
	DatabaseURL           string
	JWTSecret             string
	Port                  string
	TradingViewWebhookURL string
	AlertSecret           string
	AllowedOrigin         string
	GinMode               string
}

func Load() (Config, error) {
	cfg := Config{
		DatabaseURL:           os.Getenv("DATABASE_URL"),
		JWTSecret:             os.Getenv("JWT_SECRET"),
		Port:                  os.Getenv("PORT"),
		TradingViewWebhookURL: os.Getenv("TRADINGVIEW_WEBHOOK_URL"),
		AlertSecret:           os.Getenv("ALERT_SECRET"),
		AllowedOrigin:         os.Getenv("ALLOWED_ORIGIN"),
		GinMode:               os.Getenv("GIN_MODE"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		return Config{}, errors.New("JWT_SECRET is required")
	}
	if cfg.TradingViewWebhookURL == "" {
		return Config{}, errors.New("TRADINGVIEW_WEBHOOK_URL is required")
	}
	if cfg.AlertSecret == "" {
		return Config{}, errors.New("ALERT_SECRET is required")
	}
	if cfg.AllowedOrigin == "" {
		return Config{}, errors.New("ALLOWED_ORIGIN is required")
	}
	return cfg, nil
}

