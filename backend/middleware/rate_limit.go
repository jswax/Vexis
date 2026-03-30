package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type bucket struct {
	mu        sync.Mutex
	window    time.Time
	remaining int
}

// RateLimitPerIP enforces a fixed-window limit per client IP.
func RateLimitPerIP(maxRequests int, window time.Duration) gin.HandlerFunc {
	var buckets sync.Map // map[string]*bucket

	return func(c *gin.Context) {
		ip := c.ClientIP()
		now := time.Now()

		v, _ := buckets.LoadOrStore(ip, &bucket{
			window:    now,
			remaining: maxRequests,
		})
		b := v.(*bucket)

		b.mu.Lock()
		defer b.mu.Unlock()

		if now.Sub(b.window) >= window {
			b.window = now
			b.remaining = maxRequests
		}

		if b.remaining <= 0 {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "rate limit exceeded",
			})
			return
		}

		b.remaining--
		c.Next()
	}
}

