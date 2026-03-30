package main

import (
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"vexis-backend/config"
	"vexis-backend/db"
	"vexis-backend/middleware"
	"vexis-backend/routes"
)

func main() {
	// Override any stale shell env vars in local dev.
	_ = godotenv.Overload()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config load failed: %v", err)
	}

	if cfg.GinMode != "" {
		gin.SetMode(cfg.GinMode)
	}

	database, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect failed: %v", err)
	}

	if err := db.AutoMigrate(database); err != nil {
		log.Fatalf("db migrate failed: %v", err)
	}

	engine := gin.New()
	if err := engine.SetTrustedProxies([]string{"127.0.0.1", "::1"}); err != nil {
		log.Fatalf("set trusted proxies failed: %v", err)
	}

	engine.Use(gin.LoggerWithConfig(gin.LoggerConfig{
		Formatter: func(p gin.LogFormatterParams) string {
			return logLine(p.Method, p.Path, p.StatusCode, p.Latency, p.ClientIP, p.ErrorMessage)
		},
	}))
	engine.Use(gin.Recovery())

	allowedOrigins := []string{"http://localhost:3000"}
	if cfg.GinMode == gin.ReleaseMode {
		allowedOrigins = []string{cfg.AllowedOrigin}
	}

	engine.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}))

	engine.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	routes.RegisterAuth(engine, database, cfg.JWTSecret)
	routes.RegisterAlerts(engine, database, cfg.TradingViewWebhookURL, cfg.AlertSecret)

	authed := engine.Group("/")
	authed.Use(middleware.RequireAuth(cfg.JWTSecret, database))
	{
		authed.GET("/auth/me", routes.MeHandler())
	}

	port := cfg.Port
	if port == "" {
		port = "8080"
	}
	if port[0] != ':' {
		port = ":" + port
	}

	log.Printf("Vexis backend listening on http://localhost%s", port)
	if err := engine.Run(port); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func logLine(method, path string, status int, latency time.Duration, clientIP, errMsg string) string {
	ms := float64(latency.Microseconds()) / 1000.0
	line := time.Now().UTC().Format(time.RFC3339Nano) + " " +
		method + " " + path + " " +
		"status=" + itoa(status) + " " +
		"latency_ms=" + ftoa(ms) + " " +
		"ip=" + clientIP
	if errMsg != "" {
		line += " error=" + errMsg
	}
	return line + "\n"
}

func itoa(i int) string { return strconv.Itoa(i) }
func ftoa(f float64) string {
	return strconv.FormatFloat(f, 'f', 3, 64)
}

