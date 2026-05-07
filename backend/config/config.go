package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	DatabaseURL           string
	JWTSecret             string
	Port                  string
	TradingViewWebhookURL string
	AlertSecret           string
	AllowedOrigins        []string
	GinMode               string
	AppURL                string

	// SMSBypass skips Twilio (logs OTP server-side; API may include dev_otp). Never use in production.
	SMSBypass bool
	// EmailBypass skips SendGrid/SMTP (logs links; API may include dev_email_verify_url). Never use in production.
	EmailBypass bool
	TwilioAccountSID  string
	TwilioAuthToken   string
	TwilioPhoneNumber string

	SendgridAPIKey string
	SMTPHost       string
	SMTPPort       string
	SMTPUser       string
	SMTPPassword   string
	FromEmail      string

	// Stripe — optional; payments are disabled when StripeSecretKey is empty.
	StripeSecretKey       string
	StripeWebhookSecret   string
	StripeStandardPriceID string
	StripePremiumPriceID  string

	// Admin seed — set these on first deploy to auto-create an admin account on startup.
	AdminEmail    string
	AdminPassword string
	AdminPhone    string

	// Plan prices in USD for revenue calculation (e.g. "29.99").
	StandardPlanPrice float64
	PremiumPlanPrice  float64
}

func parsePrice(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return v
}

func envTruthy(key string) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func parseAllowedOrigins(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		out = append(out, p)
	}
	return out
}

func Load() (Config, error) {
	allowedOrigins := parseAllowedOrigins(os.Getenv("ALLOWED_ORIGINS"))
	if len(allowedOrigins) == 0 {
		// Back-compat for older deployments/envs.
		allowedOrigins = parseAllowedOrigins(os.Getenv("ALLOWED_ORIGIN"))
	}
	cfg := Config{
		DatabaseURL:           os.Getenv("DATABASE_URL"),
		JWTSecret:             os.Getenv("JWT_SECRET"),
		Port:                  os.Getenv("PORT"),
		TradingViewWebhookURL: os.Getenv("TRADINGVIEW_WEBHOOK_URL"),
		AlertSecret:           os.Getenv("ALERT_SECRET"),
		AllowedOrigins:        allowedOrigins,
		GinMode:               os.Getenv("GIN_MODE"),
		AppURL:                os.Getenv("APP_URL"),

		SMSBypass:         envTruthy("SMS_BYPASS"),
		EmailBypass:       envTruthy("EMAIL_BYPASS"),
		TwilioAccountSID:  os.Getenv("TWILIO_ACCOUNT_SID"),
		TwilioAuthToken:   os.Getenv("TWILIO_AUTH_TOKEN"),
		TwilioPhoneNumber: os.Getenv("TWILIO_PHONE_NUMBER"),

		SendgridAPIKey: strings.TrimSpace(os.Getenv("SENDGRID_API_KEY")),
		SMTPHost:       os.Getenv("SMTP_HOST"),
		SMTPPort:       os.Getenv("SMTP_PORT"),
		SMTPUser:       os.Getenv("SMTP_USER"),
		SMTPPassword:   os.Getenv("SMTP_PASSWORD"),
		FromEmail:      strings.TrimSpace(os.Getenv("FROM_EMAIL")),

		StripeSecretKey:       strings.TrimSpace(os.Getenv("STRIPE_SECRET_KEY")),
		StripeWebhookSecret:   strings.TrimSpace(os.Getenv("STRIPE_WEBHOOK_SECRET")),
		StripeStandardPriceID: strings.TrimSpace(os.Getenv("STRIPE_STANDARD_PRICE_ID")),
		StripePremiumPriceID:  strings.TrimSpace(os.Getenv("STRIPE_PREMIUM_PRICE_ID")),

		AdminEmail:    strings.TrimSpace(os.Getenv("ADMIN_EMAIL")),
		AdminPassword: strings.TrimSpace(os.Getenv("ADMIN_PASSWORD")),
		AdminPhone:    strings.TrimSpace(os.Getenv("ADMIN_PHONE")),

		StandardPlanPrice: parsePrice(os.Getenv("STANDARD_PLAN_PRICE")),
		PremiumPlanPrice:  parsePrice(os.Getenv("PREMIUM_PLAN_PRICE")),
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
	if len(cfg.AllowedOrigins) == 0 {
		return Config{}, errors.New("ALLOWED_ORIGINS (preferred) or ALLOWED_ORIGIN is required (comma-separated), e.g. http://localhost:3000,https://vexis-eight.vercel.app")
	}
	if cfg.AppURL == "" {
		return Config{}, errors.New("APP_URL is required")
	}
	if !cfg.SMSBypass &&
		(cfg.TwilioAccountSID == "" || cfg.TwilioAuthToken == "" || cfg.TwilioPhoneNumber == "") {
		return Config{}, errors.New("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER are required (or set SMS_BYPASS=true for local dev)")
	}
	if !cfg.EmailBypass {
		hasSendgrid := cfg.SendgridAPIKey != ""
		hasSMTP := cfg.SMTPHost != "" && cfg.SMTPPort != "" && cfg.SMTPUser != "" && cfg.SMTPPassword != ""
		if !hasSendgrid && !hasSMTP {
			return Config{}, errors.New("either SENDGRID_API_KEY or SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD are required (or set EMAIL_BYPASS=true for local dev)")
		}
		if hasSendgrid {
			if cfg.FromEmail == "" {
				return Config{}, errors.New("FROM_EMAIL is required when SENDGRID_API_KEY is set — use the exact address verified under SendGrid → Settings → Sender Authentication")
			}
			fe := strings.ToLower(cfg.FromEmail)
			if strings.Contains(fe, "localhost") || strings.HasSuffix(fe, "@example.com") {
				return Config{}, errors.New("FROM_EMAIL must be a real verified sender in SendGrid, not localhost or example.com — see https://app.sendgrid.com/settings/sender_auth")
			}
		}
	}
	return cfg, nil
}

