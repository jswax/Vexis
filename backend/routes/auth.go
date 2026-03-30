package routes

import (
	"net/http"
	"net/mail"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"vexis-backend/auth"
	"vexis-backend/middleware"
	"vexis-backend/models"
)

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authResponse struct {
	Token string `json:"token"`
}

func RegisterAuth(r *gin.Engine, database *gorm.DB, jwtSecret string) {
	group := r.Group("/auth")

	group.POST("/register", middleware.RateLimitPerIP(10, time.Minute), func(c *gin.Context) {
		var req registerRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		if msg := validateEmailPassword(req.Email, req.Password); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}

		user := models.User{
			Email:        req.Email,
			PasswordHash: string(hash),
			CreatedAt:    time.Now().UTC(),
		}

		if err := database.Create(&user).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "user exists or invalid"})
			return
		}

		token, err := auth.SignJWT(user.ID, user.Email, jwtSecret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to sign token"})
			return
		}
		c.JSON(http.StatusOK, authResponse{Token: token})
	})

	group.POST("/login", middleware.RateLimitPerIP(10, time.Minute), func(c *gin.Context) {
		var req loginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		if msg := validateEmailPassword(req.Email, req.Password); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}

		var user models.User
		if err := database.Where("email = ?", req.Email).First(&user).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}

		token, err := auth.SignJWT(user.ID, user.Email, jwtSecret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to sign token"})
			return
		}

		c.JSON(http.StatusOK, authResponse{Token: token})
	})

	group.POST("/logout", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
}

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

func MeHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		v, ok := c.Get("user")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		user := v.(models.User)
		c.JSON(http.StatusOK, gin.H{
			"id":         user.ID,
			"email":      user.Email,
			"created_at": user.CreatedAt,
		})
	}
}

