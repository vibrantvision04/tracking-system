package api

import (
	"gps-tracking-system/internal/ws"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func SetupRouter(h *Handler, hub *ws.Hub) http.Handler {
	r := chi.NewRouter()

	// 1. Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Compress(5)) // Enable gzip compression for faster API response transfer
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"}, // Change to specific URLs in production
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// 2. WebSocket
	r.HandleFunc("/ws/track", hub.ServeHTTP)

	// 3. API Routes (v1)
	r.Route("/api", func(r chi.Router) {
		r.Get("/vehicles", h.GetVehicles)
		r.Post("/vehicles", h.CreateVehicle)
		r.Delete("/vehicles/{id}", h.DeleteVehicle)
		r.Get("/vehicle-types", h.GetVehicleTypes)
		r.Post("/vehicle-types", h.CreateVehicleType)
		
		r.Get("/devices", h.GetDevices)
		r.Post("/devices", h.CreateDevice)
		r.Delete("/devices/{id}", h.DeleteDevice)
		r.Put("/devices/status", h.UpdateDeviceStatus)
		r.Post("/map-device", h.MapDevice)
		r.Post("/unmap-device/{id}", h.UnmapDevice)
		
		r.Get("/gps-data/{imei}", h.GetGpsData)
		r.Get("/reports", h.GetReports)
		r.Get("/alerts", h.GetAlerts)
	})

	return r
}
