package service

import (
	"context"
	"gps-tracking-system/internal/repository"
)

type VehicleService struct {
	repo *repository.VehicleRepository
}

func NewVehicleService(repo *repository.VehicleRepository) *VehicleService {
	return &VehicleService{repo: repo}
}

func (s *VehicleService) GetAllVehicles(ctx context.Context) ([]repository.Vehicle, error) {
	return s.repo.GetAll(ctx)
}
