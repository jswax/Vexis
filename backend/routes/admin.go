package routes

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"vexis-backend/config"
	"vexis-backend/middleware"
	"vexis-backend/models"
)

func RegisterAdmin(r *gin.Engine, database *gorm.DB, cfg *config.Config) {
	admin := r.Group("/admin")
	admin.Use(middleware.RequireAuth(cfg.JWTSecret, database))
	admin.Use(middleware.RequireAdmin())

	admin.GET("/users", adminListUsers(database))
	admin.PATCH("/users/:id", adminUpdateUser(database))
	admin.GET("/stats", adminStats(database))
	admin.GET("/revenue", adminRevenue(database, cfg))
}

// adminListUsers returns a paginated, searchable user list.
func adminListUsers(database *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 100 {
			limit = 20
		}
		offset := (page - 1) * limit

		search := c.Query("search")
		plan := c.Query("plan")

		q := database.Model(&models.User{})
		if search != "" {
			q = q.Where("email LIKE ?", "%"+search+"%")
		}
		if plan != "" {
			q = q.Where("plan = ?", plan)
		}

		var total int64
		q.Count(&total)

		var users []models.User
		q.Omit("password_hash", "email_verify_token", "reset_token", "otp_code", "login_otp_code",
			"phone_change_otp").
			Order("created_at DESC").
			Offset(offset).Limit(limit).Find(&users)

		type userRow struct {
			ID                  uint       `json:"id"`
			Email               string     `json:"email"`
			PhoneNumber         string     `json:"phone_number"`
			Plan                string     `json:"plan"`
			IsAdmin             bool       `json:"is_admin"`
			EmailVerified       bool       `json:"email_verified"`
			PhoneVerified       bool       `json:"phone_verified"`
			TradingviewUsername *string    `json:"tradingview_username"`
			CreatedAt           time.Time  `json:"created_at"`
			LastLoginAt         *time.Time `json:"last_login_at"`
		}

		rows := make([]userRow, len(users))
		for i, u := range users {
			rows[i] = userRow{
				ID:                  u.ID,
				Email:               u.Email,
				PhoneNumber:         u.PhoneNumber,
				Plan:                u.Plan,
				IsAdmin:             u.IsAdmin,
				EmailVerified:       u.EmailVerified,
				PhoneVerified:       u.PhoneVerified,
				TradingviewUsername: u.TradingviewUsername,
				CreatedAt:           u.CreatedAt,
				LastLoginAt:         u.LastLoginAt,
			}
		}

		pages := int(total) / limit
		if int(total)%limit != 0 {
			pages++
		}

		c.JSON(http.StatusOK, gin.H{
			"users": rows,
			"total": total,
			"page":  page,
			"pages": pages,
		})
	}
}

type adminUpdateBody struct {
	Plan                *string `json:"plan"`
	Email               *string `json:"email"`
	TradingviewUsername *string `json:"tradingview_username"`
	IsAdmin             *bool   `json:"is_admin"`
}

func adminUpdateUser(database *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		idStr := c.Param("id")
		id, err := strconv.ParseUint(idStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
			return
		}

		var body adminUpdateBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}

		updates := map[string]any{}
		if body.Plan != nil {
			switch *body.Plan {
			case "free", "standard", "premium":
				updates["plan"] = *body.Plan
			default:
				c.JSON(http.StatusBadRequest, gin.H{"error": "plan must be free, standard, or premium"})
				return
			}
		}
		if body.Email != nil && *body.Email != "" {
			updates["email"] = normalizeEmail(*body.Email)
		}
		if body.TradingviewUsername != nil {
			if *body.TradingviewUsername == "" {
				updates["tradingview_username"] = nil
			} else {
				updates["tradingview_username"] = *body.TradingviewUsername
			}
		}
		if body.IsAdmin != nil {
			updates["is_admin"] = *body.IsAdmin
		}

		if len(updates) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
			return
		}

		if err := database.Model(&models.User{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update user"})
			return
		}

		var updated models.User
		database.First(&updated, id)
		tv := ""
		if updated.TradingviewUsername != nil {
			tv = *updated.TradingviewUsername
		}
		c.JSON(http.StatusOK, gin.H{
			"ok": true,
			"user": gin.H{
				"id":                   updated.ID,
				"email":                updated.Email,
				"plan":                 updated.Plan,
				"is_admin":             updated.IsAdmin,
				"tradingview_username": tv,
			},
		})
	}
}

func adminStats(database *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var totalUsers int64
		database.Model(&models.User{}).Count(&totalUsers)

		type planCount struct {
			Plan  string `json:"plan"`
			Count int64  `json:"count"`
		}
		var planCounts []planCount
		database.Model(&models.User{}).
			Select("plan, count(*) as count").
			Group("plan").
			Scan(&planCounts)

		var totalSessions int64
		database.Model(&models.Session{}).Count(&totalSessions)

		var activeSessions int64
		database.Model(&models.Session{}).
			Where("expires_at > ?", time.Now().UTC()).
			Count(&activeSessions)

		// Signups per day for the last 30 days.
		type dayStat struct {
			Day   string `json:"day"`
			Count int64  `json:"count"`
		}
		var dailySignups []dayStat
		database.Model(&models.User{}).
			Select("DATE(created_at) as day, count(*) as count").
			Where("created_at >= ?", time.Now().UTC().AddDate(0, 0, -30)).
			Group("DATE(created_at)").
			Order("day ASC").
			Scan(&dailySignups)

		var newToday int64
		database.Model(&models.User{}).
			Where("created_at >= ?", time.Now().UTC().Truncate(24*time.Hour)).
			Count(&newToday)

		c.JSON(http.StatusOK, gin.H{
			"total_users":     totalUsers,
			"plan_counts":     planCounts,
			"total_sessions":  totalSessions,
			"active_sessions": activeSessions,
			"daily_signups":   dailySignups,
			"new_today":       newToday,
		})
	}
}

func adminRevenue(database *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var standardCount int64
		database.Model(&models.User{}).Where("plan = ?", "standard").Count(&standardCount)

		var premiumCount int64
		database.Model(&models.User{}).Where("plan = ?", "premium").Count(&premiumCount)

		var freeCount int64
		database.Model(&models.User{}).Where("plan = ?", "free").Count(&freeCount)

		standardRevenue := float64(standardCount) * cfg.StandardPlanPrice
		premiumRevenue := float64(premiumCount) * cfg.PremiumPlanPrice
		monthlyRevenue := standardRevenue + premiumRevenue

		c.JSON(http.StatusOK, gin.H{
			"standard_count":    standardCount,
			"premium_count":     premiumCount,
			"free_count":        freeCount,
			"standard_price":    cfg.StandardPlanPrice,
			"premium_price":     cfg.PremiumPlanPrice,
			"standard_revenue":  standardRevenue,
			"premium_revenue":   premiumRevenue,
			"monthly_revenue":   monthlyRevenue,
		})
	}
}
