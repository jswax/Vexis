package routes

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"vexis-backend/models"
)

// RegisterAlerts wires up the alert endpoints.
func RegisterAlerts(r *gin.Engine, database *gorm.DB, tradingViewWebhookURL string, alertSecret string) {
	group := r.Group("/alerts")

	group.POST("/trigger", func(c *gin.Context) {
		start := time.Now()

		bodyBytes, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}

		if err := verifyHMACSignature(c.GetHeader("X-Signature"), bodyBytes, alertSecret); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		// Store raw payload for history/auditing.
		alert := models.Alert{
			Source:    "trading-model",
			Payload:   string(bodyBytes),
			CreatedAt: time.Now().UTC(),
		}
		_ = database.Create(&alert).Error

		// Support multiple subscribers via comma-separated URLs.
		urls := splitURLs(tradingViewWebhookURL)
		client := &http.Client{
			Timeout: 2 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 100,
				IdleConnTimeout:     90 * time.Second,
			},
		}

		for _, u := range urls {
			u := u
			payload := append([]byte(nil), bodyBytes...)
			go func() {
				req, _ := http.NewRequest(http.MethodPost, u, bytes.NewReader(payload))
				req.Header.Set("Content-Type", "application/json")
				_, _ = client.Do(req)
			}()
		}

		// Return immediately to keep latency low.
		c.JSON(http.StatusAccepted, gin.H{
			"ok":          true,
			"alert_id":    alert.ID,
			"elapsed_ms":  float64(time.Since(start).Microseconds()) / 1000.0,
			"subscribers": len(urls),
		})
	})

	group.GET("/history", func(c *gin.Context) {
		var alerts []models.Alert
		if err := database.Order("id DESC").Limit(200).Find(&alerts).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load history"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"alerts": alerts})
	})
}

func splitURLs(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		u := strings.TrimSpace(p)
		if u != "" {
			out = append(out, u)
		}
	}
	return out
}

func verifyHMACSignature(signatureHeader string, body []byte, secret string) error {
	if signatureHeader == "" {
		return errors.New("missing X-Signature header")
	}
	sigHex := strings.TrimSpace(signatureHeader)
	sig, err := hex.DecodeString(sigHex)
	if err != nil {
		return errors.New("invalid X-Signature encoding")
	}

	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	expected := mac.Sum(nil)

	if len(sig) != len(expected) || subtle.ConstantTimeCompare(sig, expected) != 1 {
		return errors.New("invalid signature")
	}
	return nil
}

