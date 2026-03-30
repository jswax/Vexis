package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"

	"vexis-backend/models"
)

type JWTClaims struct {
	UserID uint   `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

func SignJWT(userID uint, email string, jwtSecret string) (string, error) {
	now := time.Now().UTC()
	claims := JWTClaims{
		UserID: userID,
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "user",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(7 * 24 * time.Hour)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(jwtSecret))
}

func VerifyJWT(tokenString string, jwtSecret string) (JWTClaims, error) {
	var claims JWTClaims
	parsed, err := jwt.ParseWithClaims(tokenString, &claims, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(jwtSecret), nil
	})
	if err != nil || !parsed.Valid {
		return JWTClaims{}, errors.New("invalid token")
	}
	return claims, nil
}

func LoadUserByID(database *gorm.DB, id uint) (models.User, error) {
	var user models.User
	if err := database.First(&user, id).Error; err != nil {
		return models.User{}, err
	}
	return user, nil
}

