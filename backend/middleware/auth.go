package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"vexis-backend/auth"
	"vexis-backend/models"
)

func RequireAuth(jwtSecret string, database *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		token := ""
		if authHeader != "" {
			t := strings.TrimPrefix(authHeader, "Bearer ")
			if t == authHeader {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid Authorization header"})
				return
			}
			token = t
		} else {
			// Prefer HttpOnly cookie in browsers (Vercel/production).
			cookie, err := c.Cookie("vexis_token")
			if err != nil || cookie == "" {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
				return
			}
			token = cookie
		}

		claims, err := auth.VerifyJWT(token, jwtSecret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		var sess models.Session
		if err := database.Where("id = ? AND user_id = ?", claims.SessionID, claims.UserID).First(&sess).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid session"})
			return
		}
		if sess.TokenHash != auth.JWTTokenHash(token) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid session"})
			return
		}
		if !sess.ExpiresAt.After(time.Now().UTC()) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "session expired"})
			return
		}

		user, err := auth.LoadUserByID(database, claims.UserID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}

		c.Set("user", user)
		c.Set("jwt_raw", token)
		c.Set("session_id", claims.SessionID)
		c.Next()
	}
}
