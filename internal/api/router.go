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
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false, // Set to false to support "*" origin properly
		MaxAge:           300,
	}))

	// 2. WebSocket
	r.HandleFunc("/ws/track", hub.ServeHTTP)

	// 3. API Routes (v1)
	r.Route("/api", func(r chi.Router) {
		r.Get("/vehicles", h.GetVehicles)
		r.Get("/vehicles/imei/{imei}", h.GetVehicleByIMEI)
		r.Post("/vehicles", h.CreateVehicle)
		r.Put("/vehicles/{id}", h.UpdateVehicle)
		r.Delete("/vehicles/{id}", h.DeleteVehicle)
		r.Get("/vehicle-types", h.GetVehicleTypes)
		r.Post("/vehicle-types", h.CreateVehicleType)
		r.Delete("/vehicle-types/{id}", h.DeleteVehicleType)
		r.Get("/vehicle-purposes", h.GetVehiclePurposes)
		r.Post("/vehicle-purposes", h.CreateVehiclePurpose)
		r.Put("/vehicle-purposes/{id}", h.UpdateVehiclePurpose)
		r.Delete("/vehicle-purposes/{id}", h.DeleteVehiclePurpose)
		
		r.Get("/devices", h.GetDevices)
		r.Post("/devices", h.CreateDevice)
		r.Delete("/devices/{id}", h.DeleteDevice)
		r.Put("/devices/status", h.UpdateDeviceStatus)
		r.Post("/map-device", h.MapDevice)
		r.Post("/unmap-device/{id}", h.UnmapDevice)
		
		r.Get("/gps-data/{imei}", h.GetGpsData)
		r.Get("/reports", h.GetReports)
		r.Get("/alerts", h.GetAlerts)
		r.Post("/alerts/{id}/resolve", h.ResolveAlert)
		r.Get("/zones", h.GetZones)
		r.Get("/wards", h.GetWards)
		r.Get("/d2d/dashboard", h.GetD2DDashboard)
		r.Get("/routes", h.GetRoutes)
		r.Get("/routes/{id}/checkpoints", h.GetRouteCheckpoints)
		r.Post("/routes", h.CreateRoute)
		r.Put("/routes/{id}", h.UpdateRoute)
		r.Delete("/routes/{id}", h.DeleteRoute)
		r.Get("/shifts", h.GetShifts)
		r.Post("/shifts", h.CreateShift)
		r.Delete("/shifts/{id}", h.DeleteShift)
		r.Get("/route-types", h.GetRouteTypes)
		r.Post("/route-types", h.CreateRouteType)
		r.Delete("/route-types/{id}", h.DeleteRouteType)
		
		r.Get("/route-wards", h.GetRouteWards)
		r.Post("/route-wards", h.CreateRouteWard)
		r.Delete("/route-wards/{id}", h.DeleteRouteWard)
		
		r.Get("/region-types", h.GetRegionTypes)
		r.Post("/region-types", h.CreateRegionType)
		r.Put("/region-types/{id}", h.UpdateRegionType)
		r.Delete("/region-types/{id}", h.DeleteRegionType)
		r.Get("/regions", h.GetRegions)
		r.Post("/regions", h.CreateRegion)
		r.Put("/regions/{id}", h.UpdateRegion)
		r.Delete("/regions/{id}", h.DeleteRegion)

		r.Get("/vehicle-regions", h.GetVehicleRegions)
		r.Post("/vehicle-regions", h.AssignVehicleRegion)
		r.Delete("/vehicle-regions/{id}", h.RemoveVehicleRegion)

		r.Get("/parking-spots", h.GetParkingSpots)
		r.Post("/parking-spots", h.CreateParkingSpot)
		r.Put("/parking-spots/{id}", h.UpdateParkingSpot)
		r.Delete("/parking-spots/{id}", h.DeleteParkingSpot)

		r.Get("/parking-spot-zones", h.GetParkingSpotZones)
		r.Post("/parking-spot-zones", h.CreateParkingSpotZone)
		r.Delete("/parking-spot-zones/{id}", h.DeleteParkingSpotZone)

		r.Get("/transfer-stations", h.GetTransferStations)
		r.Post("/transfer-stations", h.CreateTransferStation)
		r.Put("/transfer-stations/{id}", h.UpdateTransferStation)
		r.Delete("/transfer-stations/{id}", h.DeleteTransferStation)

		r.Get("/transfer-station-wards", h.GetTransferStationWards)
		r.Post("/transfer-station-wards", h.CreateTransferStationWard)
		r.Delete("/transfer-station-wards/{id}", h.DeleteTransferStationWard)

		r.Get("/fuel-companies", h.GetFuelCompanies)
		r.Post("/fuel-companies", h.CreateFuelCompany)
		r.Put("/fuel-companies/{id}", h.UpdateFuelCompany)
		r.Delete("/fuel-companies/{id}", h.DeleteFuelCompany)
		r.Get("/fuel-stations", h.GetFuelStations)
		r.Post("/fuel-stations", h.CreateFuelStation)
		r.Put("/fuel-stations/{id}", h.UpdateFuelStation)
		r.Delete("/fuel-stations/{id}", h.DeleteFuelStation)
        
		// Workshop Routes
		r.Get("/workshops", h.GetWorkshops)
		r.Post("/workshops", h.CreateWorkshop)
		r.Put("/workshops/{id}", h.UpdateWorkshop)
		r.Delete("/workshops/{id}", h.DeleteWorkshop)

		r.Get("/fuel-station-zones", h.GetFuelStationZones)
		r.Post("/fuel-station-zones", h.CreateFuelStationZone)
		r.Delete("/fuel-station-zones/{id}", h.DeleteFuelStationZone)

		r.Get("/departments", h.GetDepartments)
		r.Post("/departments", h.CreateDepartment)
		r.Put("/departments/{id}", h.UpdateDepartment)
		r.Delete("/departments/{id}", h.DeleteDepartment)

		r.Get("/designations", h.GetDesignations)
		r.Post("/designations", h.CreateDesignation)
		r.Put("/designations/{id}", h.UpdateDesignation)
		r.Delete("/designations/{id}", h.DeleteDesignation)

		r.Get("/employees", h.GetEmployees)
		r.Post("/employees", h.CreateEmployee)
		r.Put("/employees/{id}", h.UpdateEmployee)
		r.Delete("/employees/{id}", h.DeleteEmployee)

		r.Get("/vehicle-departments", h.GetVehicleDepartments)
		r.Post("/vehicle-departments", h.CreateVehicleDepartment)
		r.Put("/vehicle-departments/{id}", h.UpdateVehicleDepartment)
		r.Delete("/vehicle-departments/{id}", h.DeleteVehicleDepartment)

		// Reports
		r.Get("/reports/d2d-coverage", h.GetD2DRouteCoverageReport)
		r.Get("/reports/alert-detail", h.GetAlertDetailReport)
		r.Get("/reports/lane-monitoring", h.GetLaneMonitoringReport)
		r.Get("/reports/active-vehicle-summary", h.GetActiveVehicleSummaryReport)
		r.Get("/reports/geofence-event", h.GetGeofenceEventReport)



		// New Route Coverage endpoints
		r.Post("/routes/{id}/checkpoints", h.AddRouteCheckpoint)
		r.Get("/routes/{id}/checkpoints", h.GetRouteCheckpoints)
		r.Post("/vehicles/{id}/assign-route", h.AssignRouteToVehicle)
		r.Get("/vehicles/{id}/route-coverage", h.GetVehicleRouteCoverage)

		// Temporary Vehicle endpoints
		r.Get("/temporary-vehicles", h.GetTemporaryVehicles)
		r.Post("/temporary-vehicles", h.CreateTemporaryVehicle)
		r.Put("/temporary-vehicles/{id}", h.UpdateTemporaryVehicle)
		r.Delete("/temporary-vehicles/{id}", h.DeleteTemporaryVehicle)
		r.Get("/routes/{route_id}/regular-vehicle", h.GetRegularVehicleForRoute)

		// Route Type to Vehicle Type Mapping endpoints
		r.Get("/route-type-vehicle-types", h.GetRouteTypeVehicleTypes)
		r.Post("/route-type-vehicle-types", h.CreateRouteTypeVehicleType)
		r.Delete("/route-type-vehicle-types/{id}", h.DeleteRouteTypeVehicleType)

		// Employee Department & Designation Mapping endpoints
		r.Get("/employee-department-designations", h.GetEmployeeDepartmentDesignations)
		r.Post("/employee-department-designations", h.CreateEmployeeDepartmentDesignation)
		r.Delete("/employee-department-designations/{id}", h.DeleteEmployeeDepartmentDesignation)

		// User & Role Management endpoints
		r.Get("/users", h.GetUsers)
		r.Post("/users", h.CreateUser)
		r.Put("/users/{id}", h.UpdateUser)
		r.Delete("/users/{id}", h.DeleteUser)

		// Reason Management endpoints
		r.Get("/reasons", h.GetReasons)
		r.Post("/reasons", h.CreateReason)
		r.Put("/reasons/{id}", h.UpdateReason)
		r.Delete("/reasons/{id}", h.DeleteReason)
	})

	return r
}
