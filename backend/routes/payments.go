package routes

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"vexis-backend/config"
	"vexis-backend/middleware"
	"vexis-backend/models"
)

func RegisterPayments(r *gin.Engine, database *gorm.DB, cfg *config.Config) {
	pvt := r.Group("/")
	pvt.Use(middleware.RequireAuth(cfg.JWTSecret, database))
	pvt.POST("/payments/create-checkout-session", createCheckoutSessionHandler(database, cfg))

	// Webhook is public — Stripe calls it directly; signature verified inside.
	r.POST("/payments/webhook", stripeWebhookHandler(database, cfg))
}

type checkoutReq struct {
	Plan string `json:"plan"` // "standard" | "premium"
}

func createCheckoutSessionHandler(_ *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if cfg.StripeSecretKey == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "payments not configured"})
			return
		}

		var body checkoutReq
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}

		var priceID string
		switch body.Plan {
		case "standard":
			priceID = cfg.StripeStandardPriceID
		case "premium":
			priceID = cfg.StripePremiumPriceID
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid plan"})
			return
		}
		if priceID == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "price not configured"})
			return
		}

		u := c.MustGet("user").(models.User)
		appURL := stringsTrimSlash(cfg.AppURL)

		params := url.Values{}
		params.Set("mode", "subscription")
		params.Set("line_items[0][price]", priceID)
		params.Set("line_items[0][quantity]", "1")
		params.Set("customer_email", u.Email)
		params.Set("client_reference_id", fmt.Sprintf("%d", u.ID))
		params.Set("metadata[plan]", body.Plan)
		params.Set("success_url", appURL+"/payments/success?session_id={CHECKOUT_SESSION_ID}")
		params.Set("cancel_url", appURL+"/payments/cancel")

		req, err := http.NewRequest(
			"POST",
			"https://api.stripe.com/v1/checkout/sessions",
			strings.NewReader(params.Encode()),
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build request"})
			return
		}
		req.SetBasicAuth(cfg.StripeSecretKey, "")
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "stripe request failed"})
			return
		}
		defer resp.Body.Close()

		raw, _ := io.ReadAll(resp.Body)
		var session struct {
			URL   string `json:"url"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal(raw, &session); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "invalid stripe response"})
			return
		}
		if session.Error != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": session.Error.Message})
			return
		}

		c.JSON(http.StatusOK, gin.H{"url": session.URL})
	}
}

func stripeWebhookHandler(database *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		payload, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read body"})
			return
		}

		if cfg.StripeWebhookSecret != "" {
			sig := c.GetHeader("Stripe-Signature")
			if !verifyStripeSignature(payload, sig, cfg.StripeWebhookSecret) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid signature"})
				return
			}
		}

		var event struct {
			Type string `json:"type"`
			Data struct {
				Object json.RawMessage `json:"object"`
			} `json:"data"`
		}
		if err := json.Unmarshal(payload, &event); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
			return
		}

		switch event.Type {
		case "checkout.session.completed":
			var session struct {
				ClientReferenceID string `json:"client_reference_id"`
				Metadata          struct {
					Plan string `json:"plan"`
				} `json:"metadata"`
			}
			if err := json.Unmarshal(event.Data.Object, &session); err == nil &&
				session.ClientReferenceID != "" {
				plan := session.Metadata.Plan
				if plan == "" {
					plan = "pro"
				}
				database.Model(&models.User{}).
					Where("id = ?", session.ClientReferenceID).
					Update("plan", plan)
			}
		case "customer.subscription.deleted":
			// Downgrade to free on cancellation.
			var sub struct {
				Metadata struct {
					UserID string `json:"user_id"`
				} `json:"metadata"`
			}
			if err := json.Unmarshal(event.Data.Object, &sub); err == nil &&
				sub.Metadata.UserID != "" {
				database.Model(&models.User{}).
					Where("id = ?", sub.Metadata.UserID).
					Update("plan", "free")
			}
		}

		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func verifyStripeSignature(payload []byte, sigHeader, secret string) bool {
	var timestamp, v1 string
	for _, part := range strings.Split(sigHeader, ",") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "t=") {
			timestamp = strings.TrimPrefix(part, "t=")
		}
		if strings.HasPrefix(part, "v1=") {
			v1 = strings.TrimPrefix(part, "v1=")
		}
	}
	if timestamp == "" || v1 == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "." + string(payload)))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(v1))
}
