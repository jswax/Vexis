package routes

import (
	"errors"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"vexis-backend/auth"
	"vexis-backend/config"
	"vexis-backend/middleware"
	"vexis-backend/models"
	"vexis-backend/notify"
)

func setAuthCookie(c *gin.Context, jwt string) {
	secure := os.Getenv("GIN_MODE") == "release"
	c.SetCookie("vexis_token", jwt, 60*60*24*7, "/", "", secure, true)
	// SameSite=Strict (Go stdlib doesn't expose via gin helper; set explicitly).
	c.Header("Set-Cookie", c.Writer.Header().Get("Set-Cookie")+"; SameSite=Strict")
}

func clearAuthCookie(c *gin.Context) {
	secure := os.Getenv("GIN_MODE") == "release"
	c.SetCookie("vexis_token", "", -1, "/", "", secure, true)
	c.Header("Set-Cookie", c.Writer.Header().Get("Set-Cookie")+"; SameSite=Strict")
}

func RegisterAuth(r *gin.Engine, database *gorm.DB, cfg *config.Config) {
	pub := r.Group("/auth")

	pub.POST("/register", middleware.RateLimitPerIP(10, time.Minute), registerHandler(database, cfg))
	pub.POST("/login", middleware.RateLimitPerIP(10, time.Minute), loginHandler(database, cfg))
	pub.POST("/verify-otp", middleware.RateLimitPerIP(30, time.Minute), verifyOTPHandler(database, cfg))
	pub.GET("/verify-email", verifyEmailHandler(database, cfg))
	pub.POST("/forgot-password", middleware.RateLimitPerIP(5, time.Minute), forgotPasswordHandler(database, cfg))
	pub.POST("/reset-password", resetPasswordHandler(database, cfg))

	pvt := r.Group("/")
	pvt.Use(middleware.RequireAuth(cfg.JWTSecret, database))
	{
		pvt.GET("/auth/me", MeHandler())
		pvt.POST("/auth/logout", logoutHandler(database))
		pvt.POST("/auth/change-password", changePasswordHandler(database, cfg))
		pvt.POST("/auth/profile/tradingview", profileTradingviewHandler(database))
		pvt.POST("/auth/profile/phone-request", profilePhoneRequestHandler(database, cfg))
		pvt.POST("/auth/profile/phone-verify", profilePhoneVerifyHandler(database, cfg))
	}
}

type registerBody struct {
	Email                string  `json:"email"`
	Password             string  `json:"password"`
	PhoneNumber          string  `json:"phone_number"`
	TradingviewUsername  *string `json:"tradingview_username"`
}

func registerHandler(database *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body registerBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		email := normalizeEmail(body.Email)
		if msg := validateEmailPassword(email, body.Password); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}
		if msg := validateE164Phone(body.PhoneNumber); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}

		var existingUser models.User
		if err := database.Where("email = ?", email).First(&existingUser).Error; err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "email already registered"})
			return
		} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
			return
		}

		hash, err := auth.HashPassword(body.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}

		emailToken, err := randomHex(32)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
			return
		}
		now := time.Now().UTC()
		// Link points to the frontend login page, which completes verification.
		verifyURL := stringsTrimSlash(cfg.AppURL) + "/login?verify_email_token=" + emailToken

		pending := models.PendingSignup{
			Email:               email,
			PasswordHash:        hash,
			PhoneNumber:         body.PhoneNumber,
			TradingviewUsername: body.TradingviewUsername,
			VerifyToken:         emailToken,
			ExpiresAt:           now.Add(24 * time.Hour),
			CreatedAt:           now,
		}
		if err := database.Where("email = ?", email).Delete(&models.PendingSignup{}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare signup"})
			return
		}
		if err := database.Create(&pending).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save signup"})
			return
		}

		if err := notify.SendVerificationEmail(cfg.EmailBypass, mailCfg(cfg), fromAddress(cfg), email, verifyURL); err != nil {
			_ = database.Where("email = ?", email).Delete(&models.PendingSignup{})
			c.JSON(http.StatusBadGateway, gin.H{
				"error": "failed to send verification email: " + err.Error(),
			})
			return
		}

		out := gin.H{
			"ok":      true,
			"message": "check your email to finish registration. Your account is created when you open the verification link.",
		}
		if cfg.EmailBypass {
			out["dev_email_verify_url"] = verifyURL
		}
		c.JSON(http.StatusCreated, out)
	}
}

func stringsTrimSlash(s string) string {
	for len(s) > 0 && s[len(s)-1] == '/' {
		s = s[:len(s)-1]
	}
	return s
}

type loginBody struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func loginHandler(database *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body loginBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		email := normalizeEmail(body.Email)
		if msg := validateEmailPassword(email, body.Password); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}

		var u models.User
		if err := database.Where("email = ?", email).First(&u).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}
		if !u.EmailVerified {
			c.JSON(http.StatusForbidden, gin.H{"error": "verify your email before logging in"})
			return
		}
		if err := auth.VerifyPassword(body.Password, u.PasswordHash); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}
		if !u.PhoneVerified {
			out := gin.H{"requires_otp": true, "otp_phase": "signup_phone"}
			if cfg.SMSBypass && u.OtpCode != nil {
				out["dev_otp"] = *u.OtpCode
			}
			c.JSON(http.StatusOK, out)
			return
		}

		otp, err := randomOTP6()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate otp"})
			return
		}
		t := time.Now().UTC().Add(10 * time.Minute)
		u.LoginOtpCode = &otp
		u.LoginOtpExpiresAt = &t
		if err := database.Model(&models.User{}).Where("id = ?", u.ID).Updates(map[string]any{
			"login_otp_code":      otp,
			"login_otp_expires_at": t,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save login otp"})
			return
		}

		if err := notify.SendOTP(cfg.SMSBypass, cfg.TwilioAccountSID, cfg.TwilioAuthToken, cfg.TwilioPhoneNumber, u.PhoneNumber, otp); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to send SMS"})
			return
		}

		out := gin.H{"requires_otp": true}
		if cfg.SMSBypass {
			out["dev_otp"] = otp
		}
		c.JSON(http.StatusOK, out)
	}
}

type verifyOTPBody struct {
	Email string `json:"email"`
	Otp   string `json:"otp"`
}

func verifyOTPHandler(database *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body verifyOTPBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		email := normalizeEmail(body.Email)
		if body.Otp == "" || len(body.Otp) != 6 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid otp"})
			return
		}

		var u models.User
		if err := database.Where("email = ?", email).First(&u).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid otp"})
			return
		}

		now := time.Now().UTC()

		if !u.PhoneVerified {
			if u.OtpCode == nil || u.OtpExpiresAt == nil || u.OtpExpiresAt.Before(now) || *u.OtpCode != body.Otp {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired otp"})
				return
			}
			u.PhoneVerified = true
			u.OtpCode = nil
			u.OtpExpiresAt = nil
			if err := database.Model(&u).Updates(map[string]any{
				"phone_verified": true,
				"otp_code":       nil,
				"otp_expires_at": nil,
			}).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update user"})
				return
			}
			var uFresh models.User
			if err := database.Where("id = ?", u.ID).First(&uFresh).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
				return
			}
			if !uFresh.EmailVerified {
				c.JSON(http.StatusForbidden, gin.H{"error": "verify your email to continue"})
				return
			}
			jwtStr, err := createSessionAndJWT(database, cfg, uFresh, c.ClientIP(), c.Request.UserAgent())
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
				return
			}
			setAuthCookie(c, jwtStr)
			c.JSON(http.StatusOK, gin.H{"ok": true})
			return
		}

		if u.LoginOtpCode == nil || u.LoginOtpExpiresAt == nil || u.LoginOtpExpiresAt.Before(now) || *u.LoginOtpCode != body.Otp {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired otp"})
			return
		}

		if err := database.Model(&u).Updates(map[string]any{
			"login_otp_code":       nil,
			"login_otp_expires_at": nil,
			"last_login_at":        now,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update user"})
			return
		}

		var u2 models.User
		_ = database.Where("id = ?", u.ID).First(&u2).Error
		jwtStr, err := createSessionAndJWT(database, cfg, u2, c.ClientIP(), c.Request.UserAgent())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
			return
		}
		setAuthCookie(c, jwtStr)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func createSessionAndJWT(database *gorm.DB, cfg *config.Config, user models.User, ip, ua string) (string, error) {
	sid := uuid.New().String()
	now := time.Now().UTC()
	exp := now.Add(7 * 24 * time.Hour)
	jwtStr, err := auth.SignJWT(user.ID, user.Email, sid, cfg.JWTSecret)
	if err != nil {
		return "", err
	}
	sess := models.Session{
		ID:        sid,
		UserID:    user.ID,
		TokenHash: auth.JWTTokenHash(jwtStr),
		IPAddress: ip,
		UserAgent: ua,
		CreatedAt: now,
		ExpiresAt: exp,
	}
	if err := database.Create(&sess).Error; err != nil {
		return "", err
	}
	return jwtStr, nil
}

func verifyEmailHandler(database *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Query("token")
		if token == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "token is required"})
			return
		}
		now := time.Now().UTC()

		var pending models.PendingSignup
		err := database.Where("verify_token = ?", token).First(&pending).Error
		if err == nil {
			if pending.ExpiresAt.Before(now) {
				_ = database.Delete(&pending).Error
				c.JSON(http.StatusBadRequest, gin.H{"error": "link expired — register again"})
				return
			}
			var taken models.User
			if err := database.Where("email = ?", pending.Email).First(&taken).Error; err == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "email already registered"})
				return
			} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
				return
			}

			otp, err := randomOTP6()
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate otp"})
				return
			}
			otpExp := now.Add(10 * time.Minute)

			u := models.User{
				Email:               pending.Email,
				PasswordHash:        pending.PasswordHash,
				PhoneNumber:         pending.PhoneNumber,
				EmailVerified:       true,
				PhoneVerified:       false,
				EmailVerifyToken:    nil,
				OtpCode:             &otp,
				OtpExpiresAt:        &otpExp,
				Plan:                "free",
				TradingviewUsername: pending.TradingviewUsername,
				CreatedAt:           now,
			}

			pendingSnap := pending
			err = database.Transaction(func(tx *gorm.DB) error {
				if err := tx.Create(&u).Error; err != nil {
					return err
				}
				return tx.Delete(&pendingSnap).Error
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create account"})
				return
			}

			if err := notify.SendOTP(cfg.SMSBypass, cfg.TwilioAccountSID, cfg.TwilioAuthToken, cfg.TwilioPhoneNumber, pendingSnap.PhoneNumber, otp); err != nil {
				restore := pendingSnap
				restore.ID = 0
				_ = database.Transaction(func(tx *gorm.DB) error {
					if err := tx.Unscoped().Delete(&models.User{}, u.ID).Error; err != nil {
						return err
					}
					return tx.Create(&restore).Error
				})
				c.JSON(http.StatusBadGateway, gin.H{"error": "failed to send phone verification SMS — open the email link again to retry"})
				return
			}

			out := gin.H{"ok": true}
			if cfg.SMSBypass {
				out["dev_otp"] = otp
			}
			c.JSON(http.StatusOK, out)
			return
		}

		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
			return
		}

		var u models.User
		if err := database.Where("email_verify_token = ?", token).First(&u).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired link"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
			}
			return
		}
		if err := database.Model(&u).Updates(map[string]any{
			"email_verified":     true,
			"email_verify_token": nil,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify email"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

type forgotBody struct {
	Email string `json:"email"`
}

func forgotPasswordHandler(database *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body forgotBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		email := normalizeEmail(body.Email)
		c.JSON(http.StatusOK, gin.H{"ok": true})

		var u models.User
		if err := database.Where("email = ?", email).First(&u).Error; err != nil {
			return
		}
		tok, err := randomHex(32)
		if err != nil {
			return
		}
		exp := time.Now().UTC().Add(time.Hour)
		_ = database.Model(&u).Updates(map[string]any{
			"reset_token":              tok,
			"reset_token_expires_at":   exp,
		})
		resetURL := stringsTrimSlash(cfg.AppURL) + "/login?reset=" + tok
		_ = notify.SendPasswordResetEmail(cfg.EmailBypass, mailCfg(cfg), fromAddress(cfg), email, resetURL)
	}
}

type resetBody struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

func resetPasswordHandler(database *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body resetBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		if body.Token == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "token is required"})
			return
		}
		if len(body.Password) < 8 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "password must be at least 8 characters"})
			return
		}
		var u models.User
		if err := database.Where("reset_token = ?", body.Token).First(&u).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid token"})
			return
		}
		if u.ResetTokenExpiresAt == nil || u.ResetTokenExpiresAt.Before(time.Now().UTC()) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "token expired"})
			return
		}
		hash, err := auth.HashPassword(body.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}
		if err := database.Model(&u).Updates(map[string]any{
			"password_hash":             hash,
			"reset_token":               nil,
			"reset_token_expires_at":    nil,
			"login_otp_code":            nil,
			"login_otp_expires_at":      nil,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update password"})
			return
		}
		_ = database.Where("user_id = ?", u.ID).Delete(&models.Session{})
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func logoutHandler(database *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		sid, ok := c.Get("session_id")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		database.Where("id = ?", sid.(string)).Delete(&models.Session{})
		clearAuthCookie(c)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func changePasswordHandler(database *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	type body struct {
		Current string `json:"current_password"`
		New     string `json:"new_password"`
		Confirm string `json:"confirm_password"`
	}
	return func(c *gin.Context) {
		var b body
		if err := c.ShouldBindJSON(&b); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		if len(b.New) < 8 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "password must be at least 8 characters"})
			return
		}
		if b.New != b.Confirm {
			c.JSON(http.StatusBadRequest, gin.H{"error": "passwords do not match"})
			return
		}
		u := c.MustGet("user").(models.User)
		if err := auth.VerifyPassword(b.Current, u.PasswordHash); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "current password is incorrect"})
			return
		}
		hash, err := auth.HashPassword(b.New)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}
		if err := database.Model(&models.User{}).Where("id = ?", u.ID).Update("password_hash", hash).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update password"})
			return
		}
		_ = database.Where("user_id = ?", u.ID).Delete(&models.Session{})
		var u2 models.User
		if err := database.Where("id = ?", u.ID).First(&u2).Error; err != nil {
			c.JSON(http.StatusOK, gin.H{"ok": true})
			return
		}
		jwtStr, err := createSessionAndJWT(database, cfg, u2, c.ClientIP(), c.Request.UserAgent())
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"ok": true})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "token": jwtStr})
	}
}

func profileTradingviewHandler(database *gorm.DB) gin.HandlerFunc {
	type body struct {
		TradingviewUsername *string `json:"tradingview_username"`
	}
	return func(c *gin.Context) {
		var b body
		if err := c.ShouldBindJSON(&b); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		u := c.MustGet("user").(models.User)
		val := any(nil)
		if b.TradingviewUsername != nil && *b.TradingviewUsername != "" {
			val = *b.TradingviewUsername
		}
		if err := database.Model(&models.User{}).Where("id = ?", u.ID).Updates(map[string]any{
			"tradingview_username": val,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func profilePhoneRequestHandler(database *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	type body struct {
		PhoneNumber string `json:"phone_number"`
	}
	return func(c *gin.Context) {
		var b body
		if err := c.ShouldBindJSON(&b); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		if msg := validateE164Phone(b.PhoneNumber); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}
		u := c.MustGet("user").(models.User)
		otp, err := randomOTP6()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate otp"})
			return
		}
		t := time.Now().UTC().Add(10 * time.Minute)
		if err := database.Model(&models.User{}).Where("id = ?", u.ID).Updates(map[string]any{
			"pending_phone_number":      b.PhoneNumber,
			"phone_change_otp":          otp,
			"phone_change_otp_expires_at": t,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save"})
			return
		}
		if err := notify.SendOTP(cfg.SMSBypass, cfg.TwilioAccountSID, cfg.TwilioAuthToken, cfg.TwilioPhoneNumber, b.PhoneNumber, otp); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to send SMS"})
			return
		}
		out := gin.H{"ok": true}
		if cfg.SMSBypass {
			out["dev_otp"] = otp
		}
		c.JSON(http.StatusOK, out)
	}
}

func profilePhoneVerifyHandler(database *gorm.DB, _ *config.Config) gin.HandlerFunc {
	type body struct {
		Otp string `json:"otp"`
	}
	return func(c *gin.Context) {
		var b body
		if err := c.ShouldBindJSON(&b); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		u := c.MustGet("user").(models.User)
		var fresh models.User
		if err := database.Where("id = ?", u.ID).First(&fresh).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		now := time.Now().UTC()
		if fresh.PendingPhoneNumber == nil || fresh.PhoneChangeOtp == nil || fresh.PhoneChangeOtpExpiresAt == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "no pending phone change"})
			return
		}
		if fresh.PhoneChangeOtpExpiresAt.Before(now) || *fresh.PhoneChangeOtp != b.Otp {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired otp"})
			return
		}
		newPhone := *fresh.PendingPhoneNumber
		if err := database.Model(&models.User{}).Where("id = ?", fresh.ID).Updates(map[string]any{
			"phone_number":               newPhone,
			"pending_phone_number":       nil,
			"phone_change_otp":           nil,
			"phone_change_otp_expires_at": nil,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update phone"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func MeHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		u := c.MustGet("user").(models.User)
		tv := ""
		if u.TradingviewUsername != nil {
			tv = *u.TradingviewUsername
		}
		c.JSON(http.StatusOK, gin.H{
			"id":                    u.ID,
			"email":                 u.Email,
			"phone_number":          u.PhoneNumber,
			"phone_verified":        u.PhoneVerified,
			"email_verified":        u.EmailVerified,
			"plan":                  u.Plan,
			"tradingview_username": tv,
			"created_at":            u.CreatedAt,
			"last_login_at":         u.LastLoginAt,
		})
	}
}
