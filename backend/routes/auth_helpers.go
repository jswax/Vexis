package routes

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"math/big"
	"net/mail"
	"strings"

	"vexis-backend/config"
	"vexis-backend/notify"
)

func validateEmailPassword(email, password string) string {
	if email == "" {
		return "email is required"
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return "email is invalid"
	}
	if password == "" {
		return "password is required"
	}
	if len(password) < 8 {
		return "password must be at least 8 characters"
	}
	return ""
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func validateE164Phone(phone string) string {
	if phone == "" {
		return "phone number is required"
	}
	if len(phone) < 10 || phone[0] != '+' {
		return "phone number must be in E.164 format (e.g. +15551234567)"
	}
	for _, r := range phone[1:] {
		if r < '0' || r > '9' {
			return "phone number must be in E.164 format"
		}
	}
	return ""
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func randomOTP6() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func mailCfg(c *config.Config) notify.MailConfig {
	return notify.MailConfig{
		SendgridKey: c.SendgridAPIKey,
		SMTPHost:    c.SMTPHost,
		SMTPPort:    c.SMTPPort,
		SMTPUser:    c.SMTPUser,
		SMTPPass:    c.SMTPPassword,
	}
}

func fromAddress(c *config.Config) string {
	if c.FromEmail != "" {
		return c.FromEmail
	}
	if c.SMTPUser != "" {
		return c.SMTPUser
	}
	return "noreply@vexis.local"
}
