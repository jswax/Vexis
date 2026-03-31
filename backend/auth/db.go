package auth

import (
	"vexis-backend/models"

	"gorm.io/gorm"
)

func LoadUserByID(database *gorm.DB, id uint) (models.User, error) {
	var user models.User
	if err := database.First(&user, id).Error; err != nil {
		return models.User{}, err
	}
	return user, nil
}
