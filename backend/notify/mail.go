package notify

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/smtp"
	"strings"
	"time"
)

var sendgridHTTP = &http.Client{Timeout: 45 * time.Second}

type MailConfig struct {
	SendgridKey string
	SMTPHost    string
	SMTPPort    string
	SMTPUser    string
	SMTPPass    string
}

func SendVerificationEmail(bypass bool, cfg MailConfig, fromAddr, toEmail, verifyURL string) error {
	if bypass {
		log.Printf("[EMAIL_BYPASS] Verify email for %s: %s", toEmail, verifyURL)
		return nil
	}
	subject := "Verify your Vexis email"
	bodyText := "Verify your email by opening this link:\n\n" + verifyURL + "\n"
	html := "<p>Verify your Vexis email by clicking <a href=\"" + verifyURL + "\">this link</a>.</p>"

	if cfg.SendgridKey != "" {
		return sendSendgrid(cfg.SendgridKey, strings.TrimSpace(fromAddr), toEmail, subject, bodyText, html)
	}
	return sendSMTP(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPass, strings.TrimSpace(fromAddr), toEmail, subject, bodyText)
}

func SendPasswordResetEmail(bypass bool, cfg MailConfig, fromAddr, toEmail, resetURL string) error {
	if bypass {
		log.Printf("[EMAIL_BYPASS] Password reset for %s: %s", toEmail, resetURL)
		return nil
	}
	subject := "Reset your Vexis password"
	bodyText := "Reset your password using this link (expires in 1 hour):\n\n" + resetURL + "\n"
	html := "<p>Reset your Vexis password by clicking <a href=\"" + resetURL + "\">this link</a>. This link expires in 1 hour.</p>"

	if cfg.SendgridKey != "" {
		return sendSendgrid(cfg.SendgridKey, strings.TrimSpace(fromAddr), toEmail, subject, bodyText, html)
	}
	return sendSMTP(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPass, strings.TrimSpace(fromAddr), toEmail, subject, bodyText)
}

func sendSendgrid(apiKey, from, to, subject, text, html string) error {
	if from == "" {
		return fmt.Errorf("from address is empty: set FROM_EMAIL to a verified SendGrid sender")
	}
	type content struct {
		Type  string `json:"type"`
		Value string `json:"value"`
	}
	type emailAddr struct {
		Email string `json:"email"`
	}
	payload := map[string]any{
		"personalizations": []map[string]any{
			{"to": []emailAddr{{Email: to}}},
		},
		"from":             emailAddr{Email: from},
		"subject":        subject,
		"content":        []content{{Type: "text/plain", Value: text}, {Type: "text/html", Value: html}},
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, "https://api.sendgrid.com/v3/mail/send", bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	req.Header.Set("Content-Type", "application/json")
	res, err := sendgridHTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	bodyBytes, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		msg := strings.TrimSpace(string(bodyBytes))
		if len(msg) > 512 {
			msg = msg[:512] + "…"
		}
		if msg == "" {
			return fmt.Errorf("sendgrid: HTTP %d", res.StatusCode)
		}
		return fmt.Errorf("sendgrid: HTTP %d: %s", res.StatusCode, msg)
	}
	log.Printf("sendgrid: message accepted (HTTP %d)", res.StatusCode)
	return nil
}

func sendSMTP(host, port, user, pass, from, to, subject, body string) error {
	addr := host + ":" + port
	auth := smtp.PlainAuth("", user, pass, host)
	msg := strings.Join([]string{
		"From: " + from,
		"To: " + to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"",
		body,
	}, "\r\n")
	return smtp.SendMail(addr, auth, from, []string{to}, []byte(msg))
}
