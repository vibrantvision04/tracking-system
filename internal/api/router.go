package api

import (
	"gps-tracking-system/internal/config"
	"gps-tracking-system/internal/ws"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func SetupRouter(h *Handler, hub *ws.Hub, cfg *config.Config) http.Handler {
	r := chi.NewRouter()

	// 1. Global Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Compress(5))
	r.Use(SecurityHeadersMiddleware)

	// CORS — allow the configured frontend origin(s)
	corsOrigins := strings.Split(cfg.FrontendURL, ",")
	for i := range corsOrigins {
		corsOrigins[i] = strings.TrimSpace(corsOrigins[i])
	}
	if len(corsOrigins) == 0 || (len(corsOrigins) == 1 && corsOrigins[0] == "") {
		corsOrigins = []string{"http://localhost:3000", "http://localhost:5173", "http://localhost:8080"}
	}
	allowedOriginsMap := make(map[string]bool, len(corsOrigins))
	for _, o := range corsOrigins {
		allowedOriginsMap[o] = true
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   corsOrigins,
		AllowOriginFunc:  func(r *http.Request, origin string) bool { return allowedOriginsMap[origin] },
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Requested-With"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// 2. WebSocket
	r.HandleFunc("/ws/track", hub.ServeHTTP)

	// 3. Public API Routes (no auth required)
	r.Route("/api", func(r chi.Router) {
		r.With(LoginRateLimitMiddleware(h.rdb, 5, 1*time.Minute)).Post("/login", h.Login)
		r.Post("/refresh", h.RefreshToken)

		// Protected API Routes (auth required)
		r.Group(func(r chi.Router) {
			r.Use(AuthMiddleware(cfg))
			r.Post("/logout", h.Logout)

			// ============== READ (authenticated user) ==============
			r.Get("/vehicles", h.GetVehicles)
			r.Get("/vehicles/imei/{imei}", h.GetVehicleByIMEI)
			r.Get("/vehicle-types", h.GetVehicleTypes)
			r.Get("/vehicle-purposes", h.GetVehiclePurposes)
			r.Get("/devices", h.GetDevices)
			r.Get("/gps-data/{imei}", h.GetGpsData)
			r.Get("/reports", h.GetReports)
			r.Get("/alerts", h.GetAlerts)
			r.Get("/zones", h.GetZones)
			r.Get("/wards", h.GetWards)
			r.Get("/d2d/dashboard", h.GetD2DDashboard)
			r.Get("/routes", h.GetRoutes)
			r.Get("/routes/{id}", h.GetRouteByID)
			r.Get("/routes/{id}/checkpoints", h.GetRouteCheckpoints)
			r.Get("/routes/{id}/playback-geometry", h.GetRoutePlaybackGeometry)
			r.Get("/shifts", h.GetShifts)
			r.Get("/report-types", h.GetReportTypes)
			r.Get("/route-types", h.GetRouteTypes)
			r.Get("/route-wards", h.GetRouteWards)
			r.Get("/region-types", h.GetRegionTypes)
			r.Get("/regions", h.GetRegions)
			r.Get("/vehicle-regions", h.GetVehicleRegions)
			r.Get("/parking-spots", h.GetParkingSpots)
			r.Get("/parking-spot-zones", h.GetParkingSpotZones)
			r.Get("/transfer-stations", h.GetTransferStations)
			r.Get("/transfer-station-wards", h.GetTransferStationWards)
			r.Get("/fuel-companies", h.GetFuelCompanies)
			r.Get("/fuel-stations", h.GetFuelStations)
			r.Get("/workshops", h.GetWorkshops)
			r.Get("/fuel-station-zones", h.GetFuelStationZones)
			r.Get("/departments", h.GetDepartments)
			r.Get("/designations", h.GetDesignations)
			r.Get("/employees", h.GetEmployees)
			r.Get("/vehicle-departments", h.GetVehicleDepartments)
			r.Get("/reports/d2d-coverage", h.GetD2DRouteCoverageReport)
			r.Get("/reports/alert-detail", h.GetAlertDetailReport)
			r.Get("/reports/lane-monitoring", h.GetLaneMonitoringReport)
			r.Get("/reports/active-vehicle-summary", h.GetActiveVehicleSummaryReport)
			r.Get("/reports/active-vehicle-summary-by-ward", h.GetActiveVehicleSummaryByWardReport)
			r.Get("/reports/geofence-event", h.GetGeofenceEventReport)
			r.Get("/reports/ward-geofence", h.GetWardGeofenceReport)
			r.Get("/reports/gts-trips", h.GetGTSTripReport)
			r.Get("/reports/special-operations", h.GetShiftBasedOpsReport)
			r.Get("/reports/early-departed", h.GetEarlyDepartureReport)
			r.Get("/reports/vehicle-summary", h.GetVehicleSummaryReport)
			r.Get("/ultimate-reports/daily-excel", h.GetUltimateDailyExcelReport)
			r.Get("/ultimate-reports/template", h.DownloadUltimateTemplate)
			r.Get("/ultimate-reports/list", h.GetUltimateReportList)
			r.Get("/ultimate-reports/exceptions", h.GetDailyExceptions)
			r.Get("/routes/{id}/checkpoints", h.GetRouteCheckpoints)
			r.Get("/routes/{id}/lane-points", h.GetRouteLanePoints)
			r.Get("/vehicles/{id}/route-coverage", h.GetVehicleRouteCoverage)
			r.Get("/vehicles/{id}/lane-point-coverage", h.GetVehicleLanePointCoverage)
			r.Get("/vehicle-route-assignments", h.GetVehicleRouteAssignments)
			r.Get("/temporary-vehicles", h.GetTemporaryVehicles)
			r.Get("/routes/{route_id}/regular-vehicle", h.GetRegularVehicleForRoute)
			r.Get("/route-type-vehicle-types", h.GetRouteTypeVehicleTypes)
			r.Get("/employee-department-designations", h.GetEmployeeDepartmentDesignations)
			r.Get("/attendance", h.GetAttendance)
			r.Get("/reasons", h.GetReasons)
			r.Get("/open-depots", h.GetOpenDepots)
			r.Get("/open-depots/analytics", h.GetOpenDepotAnalytics)
			r.Get("/open-depots/dashboard", h.GetOpenDepotDashboard)
			r.Get("/open-depots/{id}", h.GetOpenDepotByID)
			r.Get("/open-depots/cleanings", h.GetCleaningSubmissions)
			r.Get("/open-depot-submissions", h.AdminGetOpenDepotSubmissions)

			// ============== WRITE (admin only) ==============
			r.Group(func(r chi.Router) {
				r.Use(RequireRole("ADMIN"))

				// Vehicles
				r.Post("/vehicles", h.CreateVehicle)
				r.Put("/vehicles/{id}", h.UpdateVehicle)
				r.Delete("/vehicles/{id}", h.DeleteVehicle)

				// Vehicle Types
				r.Post("/vehicle-types", h.CreateVehicleType)
				r.Delete("/vehicle-types/{id}", h.DeleteVehicleType)

				// Vehicle Purposes
				r.Post("/vehicle-purposes", h.CreateVehiclePurpose)
				r.Put("/vehicle-purposes/{id}", h.UpdateVehiclePurpose)
				r.Delete("/vehicle-purposes/{id}", h.DeleteVehiclePurpose)

				// Devices
				r.Post("/devices", h.CreateDevice)
				r.Delete("/devices/{id}", h.DeleteDevice)
				r.Put("/devices/status", h.UpdateDeviceStatus)
				r.Put("/devices/block", h.BlockDevice)
				r.Post("/map-device", h.MapDevice)
				r.Post("/unmap-device/{id}", h.UnmapDevice)

				// Alerts
				r.Post("/alerts/{id}/resolve", h.ResolveAlert)

				// Routes
				r.Post("/routes", h.CreateRoute)
				r.Put("/routes/{id}", h.UpdateRoute)
				r.Delete("/routes/{id}", h.DeleteRoute)

				// Route Coverage
				r.Post("/routes/{id}/checkpoints", h.AddRouteCheckpoint)
				r.Post("/vehicles/{id}/assign-route", h.AssignRouteToVehicle)
				r.Post("/vehicles/{id}/reconstruct-route", h.GetVehicleReconstruction)
				r.Delete("/vehicle-route-assignments/{id}", h.DeleteVehicleRouteAssignment)

				// Shifts
				r.Post("/shifts", h.CreateShift)
				r.Delete("/shifts/{id}", h.DeleteShift)

				// Route Types
				r.Post("/route-types", h.CreateRouteType)
				r.Delete("/route-types/{id}", h.DeleteRouteType)

				// Route Wards
				r.Post("/route-wards", h.CreateRouteWard)
				r.Delete("/route-wards/{id}", h.DeleteRouteWard)

				// Regions
				r.Post("/region-types", h.CreateRegionType)
				r.Put("/region-types/{id}", h.UpdateRegionType)
				r.Delete("/region-types/{id}", h.DeleteRegionType)
				r.Post("/regions", h.CreateRegion)
				r.Put("/regions/{id}", h.UpdateRegion)
				r.Delete("/regions/{id}", h.DeleteRegion)
				r.Post("/vehicle-regions", h.AssignVehicleRegion)
				r.Delete("/vehicle-regions/{id}", h.RemoveVehicleRegion)

				// Parking
				r.Post("/parking-spots", h.CreateParkingSpot)
				r.Put("/parking-spots/{id}", h.UpdateParkingSpot)
				r.Delete("/parking-spots/{id}", h.DeleteParkingSpot)
				r.Post("/parking-spot-zones", h.CreateParkingSpotZone)
				r.Delete("/parking-spot-zones/{id}", h.DeleteParkingSpotZone)

				// Transfer Stations
				r.Post("/transfer-stations", h.CreateTransferStation)
				r.Put("/transfer-stations/{id}", h.UpdateTransferStation)
				r.Delete("/transfer-stations/{id}", h.DeleteTransferStation)
				r.Post("/transfer-station-wards", h.CreateTransferStationWard)
				r.Delete("/transfer-station-wards/{id}", h.DeleteTransferStationWard)

				// Fuel
				r.Post("/fuel-companies", h.CreateFuelCompany)
				r.Put("/fuel-companies/{id}", h.UpdateFuelCompany)
				r.Delete("/fuel-companies/{id}", h.DeleteFuelCompany)
				r.Post("/fuel-stations", h.CreateFuelStation)
				r.Put("/fuel-stations/{id}", h.UpdateFuelStation)
				r.Delete("/fuel-stations/{id}", h.DeleteFuelStation)
				r.Post("/fuel-station-zones", h.CreateFuelStationZone)
				r.Delete("/fuel-station-zones/{id}", h.DeleteFuelStationZone)

				// Workshops
				r.Post("/workshops", h.CreateWorkshop)
				r.Put("/workshops/{id}", h.UpdateWorkshop)
				r.Delete("/workshops/{id}", h.DeleteWorkshop)

				// Departments
				r.Post("/departments", h.CreateDepartment)
				r.Put("/departments/{id}", h.UpdateDepartment)
				r.Delete("/departments/{id}", h.DeleteDepartment)

				// Designations
				r.Post("/designations", h.CreateDesignation)
				r.Put("/designations/{id}", h.UpdateDesignation)
				r.Delete("/designations/{id}", h.DeleteDesignation)

				// Employees
				r.Post("/employees", h.CreateEmployee)
				r.Put("/employees/{id}", h.UpdateEmployee)
				r.Delete("/employees/{id}", h.DeleteEmployee)

				// Vehicle Departments
				r.Post("/vehicle-departments", h.CreateVehicleDepartment)
				r.Put("/vehicle-departments/{id}", h.UpdateVehicleDepartment)
				r.Delete("/vehicle-departments/{id}", h.DeleteVehicleDepartment)

				// Ultimate Reports
				r.Post("/ultimate-reports/exceptions", h.CreateDailyException)
				r.Delete("/ultimate-reports/exceptions", h.DeleteDailyException)

				// Temporary Vehicles
				r.Post("/temporary-vehicles", h.CreateTemporaryVehicle)
				r.Put("/temporary-vehicles/{id}", h.UpdateTemporaryVehicle)
				r.Delete("/temporary-vehicles/{id}", h.DeleteTemporaryVehicle)

				// Mappings
				r.Post("/route-type-vehicle-types", h.CreateRouteTypeVehicleType)
				r.Delete("/route-type-vehicle-types/{id}", h.DeleteRouteTypeVehicleType)
				r.Post("/employee-department-designations", h.CreateEmployeeDepartmentDesignation)
				r.Delete("/employee-department-designations/{id}", h.DeleteEmployeeDepartmentDesignation)

				// User & Role Management
				r.Get("/users", h.GetUsers)
				r.Post("/users", h.CreateUser)
				r.Put("/users/{id}", h.UpdateUser)
				r.Delete("/users/{id}", h.DeleteUser)

				// Reasons
				r.Post("/reasons", h.CreateReason)
				r.Put("/reasons/{id}", h.UpdateReason)
				r.Delete("/reasons/{id}", h.DeleteReason)

				// Open Depot Management
				r.Post("/open-depots", h.CreateOpenDepot)
				r.Put("/open-depots/{id}", h.UpdateOpenDepot)
				r.Delete("/open-depots/{id}", h.DeleteOpenDepot)
				r.Post("/open-depots/cleanings/{id}/review", h.ReviewCleaningSubmission)
				r.Post("/open-depot-submissions/{id}/review", h.AdminReviewOpenDepotSubmission)
			})

			// ============== WRITE (authenticated user) ==============
			r.Post("/open-depots/cleanings/upload", h.UploadCleaningPhoto)
			r.Post("/open-depots/cleanings", h.CreateCleaningSubmission)
		})
	})

	// 4. Mobile API Routes
	r.Route("/api/mobile", func(r chi.Router) {
		r.With(LoginRateLimitMiddleware(h.rdb, 5, 1*time.Minute)).Post("/login", h.MobileLogin)
		r.Post("/refresh", h.MobileRefresh)

		// Authenticated Mobile Routes
		r.Group(func(r chi.Router) {
			r.Use(AuthMiddleware(cfg))

			r.Get("/me", h.MobileMe)
			r.Post("/logout", h.MobileLogout)

			r.Post("/attendance/validate-photo", h.MobileValidatePhoto)
			r.Post("/attendance/punch-in", h.MobilePunchIn)
			r.Post("/attendance/punch-out", h.MobilePunchOut)
			r.Post("/attendance/mark", h.MobileMarkAttendance)
			r.Get("/attendance/status", h.MobileAttendanceStatus)
			r.Get("/attendance/list", h.MobileAttendanceList)

			r.Get("/routes/my", h.MobileMyRoutes)
			r.Get("/coverage/my", h.MobileMyCoverage)
			r.Get("/coverage/wards", h.MobileWardsCoverage)
			r.Get("/coverage/zone", h.MobileZoneCoverage)

			r.Get("/alerts/my", h.MobileMyAlerts)
			r.Get("/alerts/ward", h.MobileWardAlerts)
			r.Get("/alerts/zone", h.MobileZoneAlerts)
			r.Post("/alerts/acknowledge/{id}", h.MobileAcknowledgeAlert)
			r.Post("/alerts/custom", h.MobileSendCustomAlert)

			r.Post("/blockages", h.MobileSubmitBlockage)
			r.Get("/blockages", h.MobileListBlockages)
			r.Patch("/blockages/{id}", h.MobileReviewBlockage)

			r.Get("/open-depot/depots", h.MobileGetOpenDepots)
			r.Get("/open-depot/submissions", h.MobileGetOpenDepotSubmissions)
			r.Post("/open-depot", h.MobileSubmitOpenDepot)

			r.Get("/tracking/ward", h.MobileLiveTrackingWard)
			r.Get("/tracking/zone", h.MobileLiveTrackingZone)
		})
	})

	// Static files serving for uploaded cleaning photos
	fileServer(r, "/uploads", http.Dir("./uploads"))

	return r
}

func fileServer(r chi.Router, path string, root http.FileSystem) {
	if strings.ContainsAny(path, "{}*") {
		panic("FileServer does not permit any URL parameters.")
	}

	if path != "/" && path[len(path)-1] == '/' {
		r.Get(path, http.RedirectHandler(path[:len(path)-1], http.StatusMovedPermanently).ServeHTTP)
		path = path[:len(path)-1]
	}
	pathPattern := path + "/*"

	r.Get(pathPattern, func(w http.ResponseWriter, r *http.Request) {
		rctx := chi.RouteContext(r.Context())
		pathPrefix := strings.TrimSuffix(rctx.RoutePattern(), "/*")
		fs := http.StripPrefix(pathPrefix, http.FileServer(root))
		fs.ServeHTTP(w, r)
	})
}
