package api

import (
	"context"
	"gps-tracking-system/internal/repository"
)

// All system permissions organized by category.
// When new modules are added, just add entries here and they auto-appear in the Role Management UI.
func allPermissions() []repository.Permission {
	return []repository.Permission{
		// ---- Dashboard (category 1) ----
		{CategoryID: 1, Code: "dashboard.view", Name: "View Dashboard", PermissionType: "menu", IsMenu: true, MenuPath: "/", DisplayOrder: 1},
		{CategoryID: 1, Code: "dashboard.stats", Name: "View Statistics", PermissionType: "action", DisplayOrder: 2},

		// ---- Vehicles (category 2) ----
		{CategoryID: 2, Code: "vehicles.view", Name: "View Vehicles", PermissionType: "menu", IsMenu: true, MenuPath: "/vehicles", DisplayOrder: 1},
		{CategoryID: 2, Code: "vehicles.create", Name: "Create Vehicle", PermissionType: "action", DisplayOrder: 2},
		{CategoryID: 2, Code: "vehicles.edit", Name: "Edit Vehicle", PermissionType: "action", DisplayOrder: 3},
		{CategoryID: 2, Code: "vehicles.delete", Name: "Delete Vehicle", PermissionType: "action", DisplayOrder: 4},
		{CategoryID: 2, Code: "vehicles.assign", Name: "Assign Route/Driver", PermissionType: "action", DisplayOrder: 5},
		{CategoryID: 2, Code: "vehicles.export", Name: "Export Vehicles", PermissionType: "action", DisplayOrder: 6},
		{CategoryID: 2, Code: "vehicles.types", Name: "Manage Vehicle Types", PermissionType: "action", DisplayOrder: 7},
		{CategoryID: 2, Code: "vehicles.gps_devices", Name: "Manage GPS Devices", PermissionType: "action", DisplayOrder: 8},

		// ---- Employees (category 3) ----
		{CategoryID: 3, Code: "employees.view", Name: "View Employees", PermissionType: "menu", IsMenu: true, MenuPath: "/employees", DisplayOrder: 1},
		{CategoryID: 3, Code: "employees.create", Name: "Create Employee", PermissionType: "action", DisplayOrder: 2},
		{CategoryID: 3, Code: "employees.edit", Name: "Edit Employee", PermissionType: "action", DisplayOrder: 3},
		{CategoryID: 3, Code: "employees.delete", Name: "Delete Employee", PermissionType: "action", DisplayOrder: 4},
		{CategoryID: 3, Code: "employees.import", Name: "Import Employees", PermissionType: "action", DisplayOrder: 5},
		{CategoryID: 3, Code: "employees.export", Name: "Export Employees", PermissionType: "action", DisplayOrder: 6},
		{CategoryID: 3, Code: "employees.departments", Name: "Manage Departments", PermissionType: "action", DisplayOrder: 7},
		{CategoryID: 3, Code: "employees.designations", Name: "Manage Designations", PermissionType: "action", DisplayOrder: 8},

		// ---- Routes (category 4) ----
		{CategoryID: 4, Code: "routes.view", Name: "View Routes", PermissionType: "menu", IsMenu: true, MenuPath: "/routes", DisplayOrder: 1},
		{CategoryID: 4, Code: "routes.create", Name: "Create Route", PermissionType: "action", DisplayOrder: 2},
		{CategoryID: 4, Code: "routes.edit", Name: "Edit Route", PermissionType: "action", DisplayOrder: 3},
		{CategoryID: 4, Code: "routes.delete", Name: "Delete Route", PermissionType: "action", DisplayOrder: 4},
		{CategoryID: 4, Code: "routes.assign", Name: "Assign Vehicles", PermissionType: "action", DisplayOrder: 5},
		{CategoryID: 4, Code: "routes.checkpoints", Name: "Manage Checkpoints", PermissionType: "action", DisplayOrder: 6},
		{CategoryID: 4, Code: "routes.regions", Name: "Manage Regions/Zones", PermissionType: "action", DisplayOrder: 7},

		// ---- Reports (category 5) ----
		{CategoryID: 5, Code: "reports.view", Name: "View Reports Menu", PermissionType: "menu", IsMenu: true, MenuPath: "/reports", DisplayOrder: 1},
		{CategoryID: 5, Code: "reports.movement", Name: "Vehicle Movement Report", PermissionType: "report", DisplayOrder: 2},
		{CategoryID: 5, Code: "reports.coverage", Name: "Route Coverage Report", PermissionType: "report", DisplayOrder: 3},
		{CategoryID: 5, Code: "reports.attendance", Name: "Attendance Report", PermissionType: "report", DisplayOrder: 4},
		{CategoryID: 5, Code: "reports.open_depot", Name: "Open Depot Report", PermissionType: "report", DisplayOrder: 5},
		{CategoryID: 5, Code: "reports.fuel", Name: "Fuel Report", PermissionType: "report", DisplayOrder: 6},
		{CategoryID: 5, Code: "reports.export", Name: "Export Reports", PermissionType: "action", DisplayOrder: 7},
		{CategoryID: 5, Code: "reports.print", Name: "Print Reports", PermissionType: "action", DisplayOrder: 8},
		{CategoryID: 5, Code: "reports.master", Name: "Master Consolidated Report", PermissionType: "report", DisplayOrder: 9},

		// ---- Attendance (category 6) ----
		{CategoryID: 6, Code: "attendance.view", Name: "View Attendance", PermissionType: "menu", IsMenu: true, MenuPath: "/attendance", DisplayOrder: 1},
		{CategoryID: 6, Code: "attendance.mark", Name: "Mark Attendance", PermissionType: "action", DisplayOrder: 2},
		{CategoryID: 6, Code: "attendance.export", Name: "Export Attendance", PermissionType: "action", DisplayOrder: 3},

		// ---- Approvals (category 7) ----
		{CategoryID: 7, Code: "approvals.view", Name: "View Approvals", PermissionType: "menu", IsMenu: true, MenuPath: "/swift", DisplayOrder: 1},
		{CategoryID: 7, Code: "approvals.approve", Name: "Approve Submissions", PermissionType: "action", DisplayOrder: 2},
		{CategoryID: 7, Code: "approvals.reject", Name: "Reject Submissions", PermissionType: "action", DisplayOrder: 3},
		{CategoryID: 7, Code: "approvals.open_depot_cleaning", Name: "Open Depot Cleaning Reviews", PermissionType: "action", DisplayOrder: 4},

		// ---- Transfer Stations (category 8) ----
		{CategoryID: 8, Code: "transfer_stations.view", Name: "View Transfer Stations", PermissionType: "menu", IsMenu: true, MenuPath: "/transfer-stations", DisplayOrder: 1},
		{CategoryID: 8, Code: "transfer_stations.create", Name: "Create Transfer Station", PermissionType: "action", DisplayOrder: 2},
		{CategoryID: 8, Code: "transfer_stations.edit", Name: "Edit Transfer Station", PermissionType: "action", DisplayOrder: 3},
		{CategoryID: 8, Code: "transfer_stations.delete", Name: "Delete Transfer Station", PermissionType: "action", DisplayOrder: 4},

		// ---- Open Depots (category 9) ----
		{CategoryID: 9, Code: "open_depots.view", Name: "View Open Depots", PermissionType: "menu", IsMenu: true, MenuPath: "/swift/open-depot", DisplayOrder: 1},
		{CategoryID: 9, Code: "open_depots.create", Name: "Create Open Depot", PermissionType: "action", DisplayOrder: 2},
		{CategoryID: 9, Code: "open_depots.edit", Name: "Edit Open Depot", PermissionType: "action", DisplayOrder: 3},
		{CategoryID: 9, Code: "open_depots.delete", Name: "Delete Open Depot", PermissionType: "action", DisplayOrder: 4},
		{CategoryID: 9, Code: "open_depots.live_map", Name: "Live Map View", PermissionType: "action", DisplayOrder: 5},
		{CategoryID: 9, Code: "open_depots.cleaning_report", Name: "Cleaning Report", PermissionType: "action", DisplayOrder: 6},
		{CategoryID: 9, Code: "open_depots.cleaning_reviews", Name: "Cleaning Reviews", PermissionType: "action", DisplayOrder: 7},

		// ---- RFID (category 10) ----
		{CategoryID: 10, Code: "rfid.view", Name: "View RFID", PermissionType: "menu", IsMenu: true, MenuPath: "/rfid", DisplayOrder: 1},
		{CategoryID: 10, Code: "rfid.scan", Name: "Scan RFID", PermissionType: "action", DisplayOrder: 2},
		{CategoryID: 10, Code: "rfid.register", Name: "Register RFID", PermissionType: "action", DisplayOrder: 3},

		// ---- Playback (category 11) ----
		{CategoryID: 11, Code: "playback.view", Name: "View Playback", PermissionType: "menu", IsMenu: true, MenuPath: "/playback", DisplayOrder: 1},
		{CategoryID: 11, Code: "playback.export", Name: "Export Playback Data", PermissionType: "action", DisplayOrder: 2},

		// ---- Tracking (category 12) ----
		{CategoryID: 12, Code: "tracking.view", Name: "View Live Tracking", PermissionType: "menu", IsMenu: true, MenuPath: "/live", DisplayOrder: 1},
		{CategoryID: 12, Code: "tracking.history", Name: "View Tracking History", PermissionType: "action", DisplayOrder: 2},

		// ---- Settings (category 13) ----
		{CategoryID: 13, Code: "settings.view", Name: "View Settings", PermissionType: "menu", IsMenu: true, MenuPath: "/settings", DisplayOrder: 1},
		{CategoryID: 13, Code: "settings.parking", Name: "Manage Parking Spots", PermissionType: "action", DisplayOrder: 2},
		{CategoryID: 13, Code: "settings.workshops", Name: "Manage Workshops", PermissionType: "action", DisplayOrder: 3},
		{CategoryID: 13, Code: "settings.fuel_stations", Name: "Manage Fuel Stations", PermissionType: "action", DisplayOrder: 4},
		{CategoryID: 13, Code: "settings.shifts", Name: "Manage Shifts", PermissionType: "action", DisplayOrder: 5},
		{CategoryID: 13, Code: "settings.reasons", Name: "Manage Reasons", PermissionType: "action", DisplayOrder: 6},

		// ---- Users (category 14) ----
		{CategoryID: 14, Code: "users.view", Name: "View Users", PermissionType: "menu", IsMenu: true, MenuPath: "/users", DisplayOrder: 1},
		{CategoryID: 14, Code: "users.create", Name: "Create User", PermissionType: "action", DisplayOrder: 2},
		{CategoryID: 14, Code: "users.edit", Name: "Edit User", PermissionType: "action", DisplayOrder: 3},
		{CategoryID: 14, Code: "users.delete", Name: "Delete User", PermissionType: "action", DisplayOrder: 4},
		{CategoryID: 14, Code: "users.roles", Name: "Manage Roles", PermissionType: "action", DisplayOrder: 5},
		{CategoryID: 14, Code: "users.assign_roles", Name: "Assign Roles to Users", PermissionType: "action", DisplayOrder: 6},

		// ---- System (category 15) ----
		{CategoryID: 15, Code: "system.view", Name: "View System", PermissionType: "menu", IsMenu: true, MenuPath: "/system", DisplayOrder: 1},
		{CategoryID: 15, Code: "system.logs", Name: "View Audit Logs", PermissionType: "action", DisplayOrder: 2},
		{CategoryID: 15, Code: "system.recalculate", Name: "Recalculate Reports", PermissionType: "action", DisplayOrder: 3},

		// ---- Road Sweeping (category 17) ----
		{CategoryID: 17, Code: "sweeping.routes.view", Name: "View Sweeping Routes", PermissionType: "menu", IsMenu: true, MenuPath: "/swift/sweeping-routes", DisplayOrder: 1},
		{CategoryID: 17, Code: "sweeping.routes.create", Name: "Create Sweeping Route", PermissionType: "action", DisplayOrder: 2},
		{CategoryID: 17, Code: "sweeping.routes.edit", Name: "Edit Sweeping Route", PermissionType: "action", DisplayOrder: 3},
		{CategoryID: 17, Code: "sweeping.routes.delete", Name: "Delete Sweeping Route", PermissionType: "action", DisplayOrder: 4},
		{CategoryID: 17, Code: "sweeping.assignments.view", Name: "View Sweeping Assignments", PermissionType: "action", DisplayOrder: 5},
		{CategoryID: 17, Code: "sweeping.assignments.create", Name: "Create Sweeping Assignment", PermissionType: "action", DisplayOrder: 6},
		{CategoryID: 17, Code: "sweeping.assignments.delete", Name: "Delete Sweeping Assignment", PermissionType: "action", DisplayOrder: 7},
		{CategoryID: 17, Code: "sweeping.tasks.view", Name: "View Cleaning Tasks", PermissionType: "action", DisplayOrder: 8},
		{CategoryID: 17, Code: "sweeping.tasks.approve", Name: "Approve/Reject Cleaning Tasks", PermissionType: "action", DisplayOrder: 9},
		{CategoryID: 17, Code: "sweeping.reports.view", Name: "View Sweeping Reports", PermissionType: "report", DisplayOrder: 10},

		// ---- Mobile (category 16) ----
		{CategoryID: 16, Code: "mobile.attendance.punch_in", Name: "Can Punch In", Module: "mobile", PermissionType: "mobile", DisplayOrder: 1},
		{CategoryID: 16, Code: "mobile.attendance.punch_out", Name: "Can Punch Out", Module: "mobile", PermissionType: "mobile", DisplayOrder: 2},
		{CategoryID: 16, Code: "mobile.attendance.mark_others", Name: "Can Mark Others Attendance", Module: "mobile", PermissionType: "mobile", DisplayOrder: 3},
		{CategoryID: 16, Code: "mobile.attendance.view_history", Name: "Can View Attendance History", Module: "mobile", PermissionType: "mobile", DisplayOrder: 4},
		{CategoryID: 16, Code: "mobile.rfid.scan", Name: "Can Scan RFID", Module: "mobile", PermissionType: "mobile", DisplayOrder: 5},
		{CategoryID: 16, Code: "mobile.rfid.register", Name: "Can Register RFID", Module: "mobile", PermissionType: "mobile", DisplayOrder: 6},
		{CategoryID: 16, Code: "mobile.gps.start_tracking", Name: "Can Start Tracking", Module: "mobile", PermissionType: "mobile", DisplayOrder: 7},
		{CategoryID: 16, Code: "mobile.gps.stop_tracking", Name: "Can Stop Tracking", Module: "mobile", PermissionType: "mobile", DisplayOrder: 8},
		{CategoryID: 16, Code: "mobile.gps.view_route", Name: "Can View Route", Module: "mobile", PermissionType: "mobile", DisplayOrder: 9},
		{CategoryID: 16, Code: "mobile.camera.capture", Name: "Can Capture Image", Module: "mobile", PermissionType: "mobile", DisplayOrder: 10},
		{CategoryID: 16, Code: "mobile.camera.upload", Name: "Can Upload Image", Module: "mobile", PermissionType: "mobile", DisplayOrder: 11},
		{CategoryID: 16, Code: "mobile.camera.retake", Name: "Can Retake Image", Module: "mobile", PermissionType: "mobile", DisplayOrder: 12},
		{CategoryID: 16, Code: "mobile.open_depot.submit", Name: "Can Submit Cleaning Photo", Module: "mobile", PermissionType: "mobile", DisplayOrder: 13},
		{CategoryID: 16, Code: "mobile.open_depot.view_previous", Name: "Can View Previous Submissions", Module: "mobile", PermissionType: "mobile", DisplayOrder: 14},
		{CategoryID: 16, Code: "mobile.open_depot.select_depot", Name: "Can Select Depot", Module: "mobile", PermissionType: "mobile", DisplayOrder: 15},
		{CategoryID: 16, Code: "mobile.approvals.approve", Name: "Can Approve", Module: "mobile", PermissionType: "mobile", DisplayOrder: 16},
		{CategoryID: 16, Code: "mobile.approvals.reject", Name: "Can Reject", Module: "mobile", PermissionType: "mobile", DisplayOrder: 17},
		{CategoryID: 16, Code: "mobile.approvals.view_pending", Name: "Can View Pending Approvals", Module: "mobile", PermissionType: "mobile", DisplayOrder: 18},
		{CategoryID: 16, Code: "mobile.notifications.receive", Name: "Can Receive Alerts", Module: "mobile", PermissionType: "mobile", DisplayOrder: 19},
		{CategoryID: 16, Code: "mobile.notifications.send", Name: "Can Send Alerts", Module: "mobile", PermissionType: "mobile", DisplayOrder: 20},
		{CategoryID: 16, Code: "mobile.emergency.sos", Name: "SOS Emergency", Module: "mobile", PermissionType: "mobile", DisplayOrder: 21},
		{CategoryID: 16, Code: "mobile.live_tracking.view", Name: "Live Tracking", Module: "mobile", PermissionType: "mobile", DisplayOrder: 22},
		{CategoryID: 16, Code: "mobile.complaints.submit", Name: "Submit Complaint", Module: "mobile", PermissionType: "mobile", DisplayOrder: 23},
	}
}

func RegisterAllPermissions(ctx context.Context, repo *repository.RBACRepository) error {
	return repo.RegisterPermissions(ctx, allPermissions())
}

// PermissionCode constants for use in middleware
const (
	PermDashboardView        = "dashboard.view"
	PermVehiclesView         = "vehicles.view"
	PermVehiclesCreate       = "vehicles.create"
	PermVehiclesEdit         = "vehicles.edit"
	PermVehiclesDelete       = "vehicles.delete"
	PermEmployeesView        = "employees.view"
	PermEmployeesCreate      = "employees.create"
	PermEmployeesEdit        = "employees.edit"
	PermEmployeesDelete      = "employees.delete"
	PermRoutesView           = "routes.view"
	PermRoutesCreate         = "routes.create"
	PermRoutesEdit           = "routes.edit"
	PermRoutesDelete         = "routes.delete"
	PermReportsView          = "reports.view"
	PermReportsExport        = "reports.export"
	PermApprovalsView        = "approvals.view"
	PermApprovalsApprove     = "approvals.approve"
	PermApprovalsReject      = "approvals.reject"
	PermOpenDepotsView       = "open_depots.view"
	PermOpenDepotsCreate     = "open_depots.create"
	PermOpenDepotsEdit       = "open_depots.edit"
	PermOpenDepotsDelete     = "open_depots.delete"
	PermPlaybackView         = "playback.view"
	PermTrackingView         = "tracking.view"
	PermUsersView            = "users.view"
	PermUsersCreate          = "users.create"
	PermUsersEdit            = "users.edit"
	PermUsersDelete          = "users.delete"
	PermUsersRoles           = "users.roles"
	PermUsersAssignRoles     = "users.assign_roles"
	PermSystemView           = "system.view"
	PermSettingsView         = "settings.view"
	PermAttendanceView       = "attendance.view"
	PermTransferStationsView = "transfer_stations.view"
	PermRFIDView             = "rfid.view"
)
