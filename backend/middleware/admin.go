package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"vexis-backend/models"
)

// RequireAdmin must be chained after RequireAuth (which sets "user" in context).
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		u, ok := c.Get("user")
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		user, ok := u.(models.User)
		if !ok || !user.IsAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin access required"})
			return
		}
		c.Next()
	}
}
