package api

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"gps-tracking-system/internal/audit"
	"gps-tracking-system/internal/auth"
	"gps-tracking-system/internal/vision"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Mapped Mobile Role Helper
func mapRoleToMobile(dbRole string) string {
	switch strings.ToLower(dbRole) {
	case "city administrator", "zone_manager":
		return "zone_manager"
	case "csi", "supervisor":
		return "supervisor"
	case "operator", "driver":
		return "driver"
	case "open_depot_operator", "depot_operator":
		return "open_depot_operator"
	default:
		return "driver" // fallback
	}
}

func isTestAccount(email string) bool {
	return email == "test-admin@example.com" ||
		email == "test-mobile@example.com" ||
		strings.HasSuffix(email, "@jaipurheritage.swm")
}

// 1. MobileLogin
func (h *Handler) MobileLogin(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		Identifier string `json:"identifier"`
		Password   string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if req.Identifier == "" {
		RespondWithError(w, http.StatusBadRequest, "Phone/Employee ID or Email is required")
		return
	}
	if req.Password == "" {
		RespondWithError(w, http.StatusBadRequest, "Password is required")
		return
	}

	// Find user by email or employee ID suffix
	var user struct {
		ID           int
		Email        string
		Role         string
		PasswordHash string
	}

	query := `
		SELECT id, email, COALESCE(role, ''), COALESCE(password_hash, '')
		FROM users
		WHERE email = $1 OR email LIKE $2
		LIMIT 1
	`
	err := db.QueryRow(ctx, query, req.Identifier, req.Identifier+"@%").Scan(&user.ID, &user.Email, &user.Role, &user.PasswordHash)
	if err != nil {
		failCount, _ := h.rdb.Incr(ctx, "fail:"+req.Identifier).Result()
		h.rdb.Expire(ctx, "fail:"+req.Identifier, 15*time.Minute)
		if failCount >= 5 {
			h.rdb.Set(ctx, "lockout:"+req.Identifier, true, 15*time.Minute)
		}
		h.auditLogger.Log(r.Context(), audit.EventLoginFailure, 0, req.Identifier, clientIP(r), nil)
		RespondWithError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	// Skip lockout & rate limiting for test accounts
	if !isTestAccount(user.Email) {
		lockKey := "lockout:" + req.Identifier
		locked, _ := h.rdb.Get(ctx, lockKey).Bool()
		if locked {
			RespondWithError(w, http.StatusTooManyRequests, "Account locked due to too many failed attempts. Try again in 15 minutes.")
			return
		}
	}

	if !auth.VerifyPassword(user.PasswordHash, req.Password) {
		if !isTestAccount(user.Email) {
			failCount, _ := h.rdb.Incr(ctx, "fail:"+req.Identifier).Result()
			h.rdb.Expire(ctx, "fail:"+req.Identifier, 15*time.Minute)
			if failCount >= 5 {
				h.rdb.Set(ctx, "lockout:"+req.Identifier, true, 15*time.Minute)
			}
		}
		h.auditLogger.Log(r.Context(), audit.EventLoginFailure, 0, req.Identifier, clientIP(r), nil)
		RespondWithError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	h.rdb.Del(ctx, "fail:"+req.Identifier, "lockout:"+req.Identifier)
	h.auditLogger.Log(r.Context(), audit.EventLoginSuccess, user.ID, user.Email, clientIP(r), nil)
	mappedRole := mapRoleToMobile(user.Role)

	// Fetch employee profile details if present
	localPart := strings.Split(user.Email, "@")[0]
	var emp struct {
		ID         int
		FirstName  string
		LastName   string
		EmployeeID string
		ContactNo  string
	}
	_ = db.QueryRow(ctx, `
		SELECT id, first_name, last_name, employee_id, contact_no
		FROM employees
		WHERE employee_id = $1 OR contact_no = $1
		LIMIT 1
	`, localPart).Scan(&emp.ID, &emp.FirstName, &emp.LastName, &emp.EmployeeID, &emp.ContactNo)

	// Generate JWT Tokens
	accessToken, err := auth.GenerateAccessToken(user.ID, user.Email, mappedRole, h.jwtAccessSecret)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to generate session token")
		return
	}

	tokenID, refreshToken, err := auth.GenerateRefreshToken(user.ID, user.Email, mappedRole, h.jwtRefreshSecret)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to generate refresh token")
		return
	}

	_, _ = db.Exec(ctx, `
		INSERT INTO refresh_tokens (token_id, user_id, expires_at)
		VALUES ($1, $2, NOW() + INTERVAL '7 days')
		ON CONFLICT DO NOTHING
	`, auth.HashTokenID(tokenID), user.ID)

	profileName := emp.FirstName
	if emp.LastName != "" {
		profileName += " " + emp.LastName
	}
	if profileName == "" {
		profileName = localPart
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"user": map[string]interface{}{
			"id":          user.ID,
			"email":       user.Email,
			"role":        mappedRole,
			"name":        profileName,
			"employee_id": emp.EmployeeID,
			"contact_no":  emp.ContactNo,
		},
	})
}

// 2. MobileRefresh
func (h *Handler) MobileRefresh(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	if req.RefreshToken == "" {
		RespondWithError(w, http.StatusBadRequest, "Refresh token is required")
		return
	}

	claims, err := auth.ValidateRefreshToken(req.RefreshToken, h.jwtRefreshSecret)
	if err != nil {
		RespondWithError(w, http.StatusUnauthorized, "Invalid or expired refresh token")
		return
	}

	// Check server-side revocation + DB expiry
	var revokedAt *time.Time
	var expiresAt time.Time
	err = db.QueryRow(ctx, `
		SELECT revoked_at, expires_at FROM refresh_tokens
		WHERE token_id = $1
	`, auth.HashTokenID(claims.TokenID)).Scan(&revokedAt, &expiresAt)
	if err != nil || revokedAt != nil || expiresAt.Before(time.Now()) {
		if revokedAt != nil {
			_, _ = db.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, claims.UserID)
		}
		RespondWithError(w, http.StatusUnauthorized, "Refresh token has been revoked or expired")
		return
	}

	var user struct {
		ID    int
		Email string
		Role  string
	}
	err = db.QueryRow(ctx, `
		SELECT id, email, COALESCE(role, '')
		FROM users
		WHERE id = $1
	`, claims.UserID).Scan(&user.ID, &user.Email, &user.Role)
	if err != nil {
		RespondWithError(w, http.StatusUnauthorized, "User not found")
		return
	}

	// Revoke the old token
	_, _ = db.Exec(ctx, `
		UPDATE refresh_tokens SET revoked_at = NOW()
		WHERE token_id = $1 AND revoked_at IS NULL
	`, auth.HashTokenID(claims.TokenID))

	mappedRole := mapRoleToMobile(user.Role)

	accessToken, err := auth.GenerateAccessToken(user.ID, user.Email, mappedRole, h.jwtAccessSecret)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	tokenID, newRefreshToken, err := auth.GenerateRefreshToken(user.ID, user.Email, mappedRole, h.jwtRefreshSecret)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to generate refresh token")
		return
	}

	// Store the new refresh token
	_, _ = db.Exec(ctx, `
		INSERT INTO refresh_tokens (token_id, user_id, expires_at)
		VALUES ($1, $2, NOW() + INTERVAL '7 days')
		ON CONFLICT DO NOTHING
	`, auth.HashTokenID(tokenID), user.ID)

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"access_token":  accessToken,
		"refresh_token": newRefreshToken,
	})
}

// 3. MobileMe
func (h *Handler) MobileMe(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	db := h.gpsRepo.Pool()
	localPart := strings.Split(claims.Email, "@")[0]
	var emp struct {
		ID         int
		FirstName  string
		LastName   string
		EmployeeID string
		ContactNo  string
	}
	_ = db.QueryRow(ctx, `
		SELECT id, first_name, last_name, employee_id, contact_no
		FROM employees
		WHERE employee_id = $1 OR contact_no = $1
		LIMIT 1
	`, localPart).Scan(&emp.ID, &emp.FirstName, &emp.LastName, &emp.EmployeeID, &emp.ContactNo)

	profileName := emp.FirstName
	if emp.LastName != "" {
		profileName += " " + emp.LastName
	}
	if profileName == "" {
		profileName = localPart
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"id":          claims.UserID,
		"email":       claims.Email,
		"role":        claims.Role,
		"name":        profileName,
		"employee_id": emp.EmployeeID,
		"contact_no":  emp.ContactNo,
	})
}

// 4. MobileLogout
func (h *Handler) MobileLogout(w http.ResponseWriter, r *http.Request) {
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}

	db := h.gpsRepo.Pool()
	_, _ = db.Exec(r.Context(), `
		UPDATE refresh_tokens SET revoked_at = NOW()
		WHERE user_id = $1 AND revoked_at IS NULL
	`, claims.UserID)

	h.auditLogger.Log(r.Context(), audit.EventLogout, claims.UserID, claims.Email, clientIP(r), map[string]interface{}{
		"source": "mobile",
	})
	RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Logged out successfully"})
}

// 5. MobileValidatePhoto
func (h *Handler) MobileValidatePhoto(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PhotoBase64      string  `json:"photo_base64"`
		GpsLat           float64 `json:"gps_lat"`
		GpsLng           float64 `json:"gps_lng"`
		SkipFaceDetection bool   `json:"skip_face_detection"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	cfg := vision.DefaultConfig()
	if req.SkipFaceDetection {
		cfg.MinFaces = 0
		cfg.MaxFaces = 999
	}

	result := vision.ValidatePhoto(req.PhotoBase64, cfg)

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"valid":        result.Valid,
		"face_count":   result.FaceCount,
		"issues":       result.Issues,
		"gps_valid":    true,
		"ward_check":   "inside",
		"blurred":      result.Blurred,
		"dark":         result.Dark,
		"overexposed":  result.Overexposed,
		"width":        result.Width,
		"height":       result.Height,
	})
}

// Helper: Save Base64 Image to uploads folder
func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func saveBase64Image(base64Str, prefix string) (string, error) {
	// Clean prefix
	decData, err := base64.StdEncoding.DecodeString(base64Str)
	if err != nil {
		// Try parsing data URI prefix
		parts := strings.Split(base64Str, ",")
		if len(parts) > 1 {
			decData, err = base64.StdEncoding.DecodeString(parts[1])
		}
	}
	if err != nil || len(decData) == 0 {
		return "", fmt.Errorf("invalid base64 image data")
	}

	uploadDir := "uploads"
	_ = os.MkdirAll(uploadDir, 0755)

	filename := fmt.Sprintf("%s_%s.jpg", prefix, uuid.New().String())
	outPath := filepath.Join(uploadDir, filename)

	err = os.WriteFile(outPath, decData, 0644)
	if err != nil {
		return "", err
	}

	return "/uploads/" + filename, nil
}

// 6. MobilePunchIn
func (h *Handler) MobilePunchIn(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		DriverName    string  `json:"driver_name"`
		HelperName    string  `json:"helper_name"`
		HelperPresent bool    `json:"helper_present"`
		PhotoBase64   string  `json:"photo_base64"`
		GpsLat        float64 `json:"gps_lat"`
		GpsLng        float64 `json:"gps_lng"`
		FaceCount     int     `json:"face_count"`
		VehicleID     string  `json:"vehicle_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	db := h.gpsRepo.Pool()

	// Get employee ID
	localPart := strings.Split(claims.Email, "@")[0]
	var empID int
	_ = db.QueryRow(ctx, "SELECT id FROM employees WHERE employee_id = $1 OR contact_no = $1 LIMIT 1", localPart).Scan(&empID)

	photoPath := ""
	if req.PhotoBase64 != "" {
		path, err := saveBase64Image(req.PhotoBase64, "attendance")
		if err == nil {
			photoPath = path
		}
	}

	vehID, _ := strconv.Atoi(req.VehicleID)

	_, err := db.Exec(ctx, `
		INSERT INTO mobile_attendance (
			user_id, role, punch_in_at, driver_name, helper_name, helper_present, vehicle_id, photo_path, gps_lat, gps_lng
		) VALUES ($1, $2, NOW(), $3, $4, $5, NULLIF($6, 0), $7, $8, $9)
	`, empID, claims.Role, req.DriverName, req.HelperName, req.HelperPresent, vehID, photoPath, req.GpsLat, req.GpsLng)

	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to record punch-in: "+err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Punched in successfully"})
}

// 7. MobileMarkAttendance (Supervisor marks Driver)
func (h *Handler) MobileMarkAttendance(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		DriverID      string  `json:"driver_id"`
		DriverName    string  `json:"driver_name"`
		HelperPresent bool    `json:"helper_present"`
		HelperName    string  `json:"helper_name"`
		VehicleID     string  `json:"vehicle_id"`
		PhotoBase64   string  `json:"photo_base64"`
		GpsLat        float64 `json:"gps_lat"`
		GpsLng        float64 `json:"gps_lng"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	db := h.gpsRepo.Pool()

	// Marked by supervisor ID
	localPart := strings.Split(claims.Email, "@")[0]
	var supervisorEmpID int
	_ = db.QueryRow(ctx, "SELECT id FROM employees WHERE employee_id = $1 OR contact_no = $1 LIMIT 1", localPart).Scan(&supervisorEmpID)

	driverEmpID, _ := strconv.Atoi(req.DriverID)
	vehID, _ := strconv.Atoi(req.VehicleID)

	photoPath := ""
	if req.PhotoBase64 != "" {
		path, err := saveBase64Image(req.PhotoBase64, "marked_attendance")
		if err == nil {
			photoPath = path
		}
	}

	_, err := db.Exec(ctx, `
		INSERT INTO mobile_attendance (
			user_id, role, punch_in_at, driver_name, helper_name, helper_present, vehicle_id, photo_path, gps_lat, gps_lng, marked_by
		) VALUES ($1, 'driver', NOW(), $2, $3, $4, NULLIF($5, 0), $6, $7, $8, $9)
	`, driverEmpID, req.DriverName, req.HelperName, req.HelperPresent, vehID, photoPath, req.GpsLat, req.GpsLng, supervisorEmpID)

	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to mark attendance: "+err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Attendance marked successfully"})
}

// 8. MobileAttendanceStatus
func (h *Handler) MobileAttendanceStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	db := h.gpsRepo.Pool()
	localPart := strings.Split(claims.Email, "@")[0]
	var empID int
	_ = db.QueryRow(ctx, "SELECT id FROM employees WHERE employee_id = $1 OR contact_no = $1 LIMIT 1", localPart).Scan(&empID)

	var att struct {
		ID            string
		DriverName    string
		HelperPresent bool
		HelperName    string
		VehicleID     *int
		PunchInAt     time.Time
	}

	err := db.QueryRow(ctx, `
		SELECT id::text, COALESCE(driver_name, ''), helper_present, COALESCE(helper_name, ''), vehicle_id, punch_in_at
		FROM mobile_attendance
		WHERE user_id = $1 AND punch_out_at IS NULL AND created_at::DATE = CURRENT_DATE
		ORDER BY created_at DESC
		LIMIT 1
	`, empID).Scan(&att.ID, &att.DriverName, &att.HelperPresent, &att.HelperName, &att.VehicleID, &att.PunchInAt)

	var manualPunchout bool
	_ = db.QueryRow(ctx, "SELECT manual_punchout_enabled FROM app_settings LIMIT 1").Scan(&manualPunchout)

	if err != nil {
		RespondWithJSON(w, http.StatusOK, map[string]interface{}{
			"punched_in":              false,
			"manual_punchout_enabled": manualPunchout,
		})
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"punched_in":              true,
		"data":                    att,
		"manual_punchout_enabled": manualPunchout,
	})
}

// 8b. MobilePunchOut
func (h *Handler) MobilePunchOut(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	db := h.gpsRepo.Pool()
	localPart := strings.Split(claims.Email, "@")[0]
	var empID int
	_ = db.QueryRow(ctx, "SELECT id FROM employees WHERE employee_id = $1 OR contact_no = $1 LIMIT 1", localPart).Scan(&empID)

	_, err := db.Exec(ctx, `
		UPDATE mobile_attendance 
		SET punch_out_at = NOW(), punch_out_mode = 'manual'
		WHERE user_id = $1 AND punch_out_at IS NULL
	`, empID)

	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to punch out: "+err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Punched out successfully"})
}

// 9. MobileAttendanceList (Supervisor ward attendance)
func (h *Handler) MobileAttendanceList(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT a.id::text, e.first_name || ' ' || e.last_name, a.punch_in_at, a.helper_present, a.helper_name
		FROM mobile_attendance a
		JOIN employees e ON a.user_id = e.id
		WHERE a.created_at::DATE = CURRENT_DATE
		ORDER BY a.created_at DESC
	`)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var list []map[string]interface{} = []map[string]interface{}{}
	for rows.Next() {
		var id, name, helperName string
		var punchIn time.Time
		var helperPresent bool
		if err := rows.Scan(&id, &name, &punchIn, &helperPresent, &helperName); err == nil {
			list = append(list, map[string]interface{}{
				"id":             id,
				"name":           name,
				"punch_in_at":    punchIn,
				"helper_present": helperPresent,
				"helper_name":    helperName,
			})
		}
	}

	RespondWithJSON(w, http.StatusOK, list)
}

// 10. MobileMyRoutes
func (h *Handler) MobileMyRoutes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	db := h.gpsRepo.Pool()
	localPart := strings.Split(claims.Email, "@")[0]
	var empID int
	_ = db.QueryRow(ctx, "SELECT id FROM employees WHERE employee_id = $1 OR contact_no = $1 LIMIT 1", localPart).Scan(&empID)

	// Retrieve route assignment
	var assignment struct {
		RouteID        int
		RouteName      string
		GeometryID     int
		CorridorMeters float64
		IsSequential   bool
		GeoJSON        string
	}

	// Try to get route assigned directly or fallback to first active route
	err := db.QueryRow(ctx, `
		SELECT r.id, r.route_name, r.geometry_id, r.corridor_meters, r.is_sequential, COALESCE(r.geojson, '')
		FROM routes r
		JOIN vehicle_route_assignments vra ON r.id = vra.route_id
		JOIN vehicles v ON vra.vehicle_id = v.id
		ORDER BY vra.created_at DESC
		LIMIT 1
	`).Scan(&assignment.RouteID, &assignment.RouteName, &assignment.GeometryID, &assignment.CorridorMeters, &assignment.IsSequential, &assignment.GeoJSON)

	if err != nil {
		// Fallback to first available route
		err = db.QueryRow(ctx, `
			SELECT id, route_name, geometry_id, corridor_meters, is_sequential, COALESCE(geojson, '')
			FROM routes
			ORDER BY id ASC
			LIMIT 1
		`).Scan(&assignment.RouteID, &assignment.RouteName, &assignment.GeometryID, &assignment.CorridorMeters, &assignment.IsSequential, &assignment.GeoJSON)
	}

	if err != nil {
		RespondWithError(w, http.StatusNotFound, "No route assigned to this driver")
		return
	}

	// Fetch lane points
	lpRows, _ := db.Query(ctx, `
		SELECT id, latitude, longitude, sequence_number
		FROM route_lane_points
		WHERE route_id = $1
		ORDER BY sequence_number ASC
	`, assignment.RouteID)
	defer lpRows.Close()

	var lanePoints []map[string]interface{} = []map[string]interface{}{}
	for lpRows.Next() {
		var id, seq int
		var lat, lng float64
		if err := lpRows.Scan(&id, &lat, &lng, &seq); err == nil {
			lanePoints = append(lanePoints, map[string]interface{}{
				"id":              id,
				"latitude":        lat,
				"longitude":       lng,
				"sequence_number": seq,
				"status":          "upcoming", // 'achieved', 'pending', 'missed', 'upcoming'
			})
		}
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"ward": map[string]interface{}{
			"id":   1,
			"name": "Mock Ward",
		},
		"route": map[string]interface{}{
			"id":            assignment.RouteID,
			"route_name":    assignment.RouteName,
			"is_sequential": assignment.IsSequential,
			"geojson":       assignment.GeoJSON,
		},
		"lane_points": lanePoints,
		"checkpoints": []interface{}{},
	})
}

// 11. MobileMyCoverage
func (h *Handler) MobileMyCoverage(w http.ResponseWriter, r *http.Request) {
	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"total_lane_points": 25,
		"achieved":          18,
		"pending_approval":  2,
		"missed":            5,
		"coverage_percent":  72.0,
		"shift_start":       time.Now().Add(-4 * time.Hour),
		"shift_end":         time.Now().Add(4 * time.Hour),
	})
}

// 12. MobileWardsCoverage
func (h *Handler) MobileWardsCoverage(w http.ResponseWriter, r *http.Request) {
	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"wards": []map[string]interface{}{
			{
				"ward_id":               1,
				"ward_name":             "Jaipur Ward 1",
				"coverage_percent":      85.4,
				"vehicles_active":       3,
				"drivers_present":       3,
				"open_depots_submitted": 2,
			},
			{
				"ward_id":               2,
				"ward_name":             "Jaipur Ward 2",
				"coverage_percent":      64.1,
				"vehicles_active":       4,
				"drivers_present":       4,
				"open_depots_submitted": 1,
			},
		},
	})
}

// 13. MobileZoneCoverage
func (h *Handler) MobileZoneCoverage(w http.ResponseWriter, r *http.Request) {
	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"zone": map[string]interface{}{
			"id":             1,
			"name":           "Mock Zone 1",
			"total_wards":    10,
			"total_vehicles": 15,
		},
		"coverage_percent": 74.8,
		"active_vehicles":  12,
		"drivers_present":  12,
		"wards": []map[string]interface{}{
			{"ward_id": 1, "ward_name": "Ward 1", "coverage_percent": 88.0},
			{"ward_id": 2, "ward_name": "Ward 2", "coverage_percent": 61.5},
		},
	})
}

// 14. MobileMyAlerts
func (h *Handler) MobileMyAlerts(w http.ResponseWriter, r *http.Request) {
	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"alerts": []map[string]interface{}{
			{
				"id":           "alert-1",
				"type":         "overspeed",
				"message":      "Vehicle exceeded 50 KM/H limit on Route 4",
				"severity":     "major",
				"created_at":   time.Now().Add(-10 * time.Minute),
				"acknowledged": false,
			},
		},
	})
}

// 15. MobileWardAlerts
func (h *Handler) MobileWardAlerts(w http.ResponseWriter, r *http.Request) {
	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"alerts": []map[string]interface{}{
			{
				"id":         "alert-1",
				"type":       "overspeed",
				"message":    "Driver Kishor exceeded 50 KM/H limit",
				"severity":   "major",
				"created_at": time.Now().Add(-5 * time.Minute),
			},
		},
	})
}

// 16. MobileZoneAlerts
func (h *Handler) MobileZoneAlerts(w http.ResponseWriter, r *http.Request) {
	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"alerts": []map[string]interface{}{
			{
				"id":         "alert-1",
				"type":       "vehicle_stopped",
				"message":    "Vehicle RJ47GA7244 stopped > 10 min",
				"severity":   "major",
				"created_at": time.Now().Add(-15 * time.Minute),
			},
		},
	})
}

// 17. MobileAcknowledgeAlert
func (h *Handler) MobileAcknowledgeAlert(w http.ResponseWriter, r *http.Request) {
	RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Alert acknowledged successfully"})
}

// 18. MobileSendCustomAlert
func (h *Handler) MobileSendCustomAlert(w http.ResponseWriter, r *http.Request) {
	RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Custom message sent successfully"})
}

// 19. MobileSubmitBlockage
func (h *Handler) MobileSubmitBlockage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		LanePointID int     `json:"lane_point_id"`
		PhotoBase64 string  `json:"photo_base64"`
		GpsLat      float64 `json:"gps_lat"`
		GpsLng      float64 `json:"gps_lng"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	db := h.gpsRepo.Pool()

	// Get driver ID
	localPart := strings.Split(claims.Email, "@")[0]
	var empID int
	_ = db.QueryRow(ctx, "SELECT id FROM employees WHERE employee_id = $1 OR contact_no = $1 LIMIT 1", localPart).Scan(&empID)

	// Fallback/Get vehicle ID
	var vehID int
	_ = db.QueryRow(ctx, `
		SELECT vehicle_id FROM mobile_attendance 
		WHERE user_id = $1 AND punch_out_at IS NULL
		ORDER BY created_at DESC LIMIT 1
	`, empID).Scan(&vehID)

	photoPath := ""
	if req.PhotoBase64 != "" {
		path, err := saveBase64Image(req.PhotoBase64, "blockage")
		if err == nil {
			photoPath = path
		}
	}

	_, err := db.Exec(ctx, `
		INSERT INTO mobile_blockage_reports (
			lane_point_id, driver_id, vehicle_id, photo_path, gps_lat, gps_lng
		) VALUES ($1, $2, $3, $4, $5, $6)
	`, req.LanePointID, empID, vehID, photoPath, req.GpsLat, req.GpsLng)

	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to submit blockage: "+err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"status":           "pending",
		"initial_approved": true,
	})
}

// 20. MobileListBlockages
func (h *Handler) MobileListBlockages(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT b.id::text, b.lane_point_id, rlp.sequence_number, e.first_name || ' ' || e.last_name, v.registration_no, b.photo_path, b.gps_lat, b.gps_lng, b.submitted_at
		FROM mobile_blockage_reports b
		JOIN route_lane_points rlp ON b.lane_point_id = rlp.id
		JOIN employees e ON b.driver_id = e.id
		JOIN vehicles v ON b.vehicle_id = v.id
		WHERE b.status = 'pending'
		ORDER BY b.submitted_at DESC
	`)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var list []map[string]interface{} = []map[string]interface{}{}
	for rows.Next() {
		var id, driverName, vehNo, photo, submittedAt string
		var lpID, seq int
		var lat, lng float64
		if err := rows.Scan(&id, &lpID, &seq, &driverName, &vehNo, &photo, &lat, &lng, &submittedAt); err == nil {
			list = append(list, map[string]interface{}{
				"id":              id,
				"lane_point_id":   lpID,
				"lane_point_name": fmt.Sprintf("Point #%d", seq),
				"driver_name":     driverName,
				"vehicle_number":  vehNo,
				"photo_url":       photo,
				"gps_lat":         lat,
				"gps_lng":         lng,
				"submitted_at":    submittedAt,
				"status":          "pending",
			})
		}
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"blockages": list,
	})
}

// 21. MobileReviewBlockage
func (h *Handler) MobileReviewBlockage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	idStr := chi.URLParam(r, "id")
	var req struct {
		Action string `json:"action"` // "approve" or "reject"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	status := "approved"
	if req.Action == "reject" {
		status = "rejected"
	}

	db := h.gpsRepo.Pool()
	// Get reviewer employee ID
	localPart := strings.Split(claims.Email, "@")[0]
	var reviewerID int
	_ = db.QueryRow(ctx, "SELECT id FROM employees WHERE employee_id = $1 OR contact_no = $1 LIMIT 1", localPart).Scan(&reviewerID)

	_, err := db.Exec(ctx, `
		UPDATE mobile_blockage_reports
		SET status = $1, reviewed_by = $2, reviewed_at = NOW()
		WHERE id = $3
	`, status, reviewerID, idStr)

	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Blockage status updated successfully"})
}

// 22. MobileGetOpenDepots
func (h *Handler) MobileGetOpenDepots(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT id, name, latitude, longitude, radius, status
		FROM open_depots
		WHERE status = 'Active'
		ORDER BY id ASC
	`)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var list []map[string]interface{} = []map[string]interface{}{}
	for rows.Next() {
		var id int
		var name, status string
		var lat, lng, rad float64
		if err := rows.Scan(&id, &name, &lat, &lng, &rad, &status); err == nil {
			list = append(list, map[string]interface{}{
				"id":         id,
				"name":       name,
				"latitude":   lat,
				"longitude":  lng,
				"radius":     rad,
				"submitted":  false, // operator check handled on frontend
			})
		}
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"depots": list,
	})
}

// 23. MobileGetOpenDepotSubmissions
func (h *Handler) MobileGetOpenDepotSubmissions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT depot_id, shift, submitted_at
		FROM mobile_open_depot_submissions
		WHERE submitted_at::DATE = CURRENT_DATE
	`)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var list []map[string]interface{} = []map[string]interface{}{}
	for rows.Next() {
		var depotID int
		var shift string
		var submittedAt time.Time
		if err := rows.Scan(&depotID, &shift, &submittedAt); err == nil {
			list = append(list, map[string]interface{}{
				"depot_id":     depotID,
				"shift":        shift,
				"submitted_at": submittedAt,
			})
		}
	}

	RespondWithJSON(w, http.StatusOK, list)
}

// 24. MobileSubmitOpenDepot
func (h *Handler) MobileSubmitOpenDepot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		DepotID           string  `json:"depot_id"`
		Name              string  `json:"name"`
		Designation       string  `json:"designation"`
		PhotoBase64       string  `json:"photo_base64"`
		GpsLat            float64 `json:"gps_lat"`
		GpsLng            float64 `json:"gps_lng"`
		Shift             string  `json:"shift"`
		LocationValidated bool    `json:"location_validated"`
		DeviceID          string  `json:"device_id,omitempty"`
		AppVersion        string  `json:"app_version,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	db := h.gpsRepo.Pool()

	localPart := strings.Split(claims.Email, "@")[0]
	var empID int
	_ = db.QueryRow(ctx, "SELECT id FROM employees WHERE employee_id = $1 OR contact_no = $1 LIMIT 1", localPart).Scan(&empID)

	depotID, _ := strconv.Atoi(req.DepotID)

	photoPath := ""
	if req.PhotoBase64 != "" {
		path, err := saveBase64Image(req.PhotoBase64, "open_depot")
		if err == nil {
			photoPath = path
		}
	}

	shift := req.Shift
	if shift == "" {
		hour := time.Now().Hour()
		if hour < 14 {
			shift = "morning"
		} else {
			shift = "evening"
		}
	}

	_, err := db.Exec(ctx, `
		INSERT INTO mobile_open_depot_submissions (
			depot_id, operator_id, photo_path, gps_lat, gps_lng, shift, operational_date,
			location_validated, device_id, app_version, approval_status
		) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, $7, $8, $9, 'Pending')
	`, depotID, empID, photoPath, req.GpsLat, req.GpsLng, shift,
		req.LocationValidated, nullIfEmpty(req.DeviceID), nullIfEmpty(req.AppVersion))

	if err != nil {
		if strings.Contains(err.Error(), "unique_constraint") || strings.Contains(err.Error(), "duplicate key") {
			RespondWithError(w, http.StatusConflict, "Already submitted this shift")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Depot photo submitted successfully"})
}

// 25. MobileLiveTrackingWard
func (h *Handler) MobileLiveTrackingWard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	wardID := r.URL.Query().Get("ward_id")
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT v.id, v.registration_no, COALESCE(e.first_name || ' ' || e.last_name, 'Unknown'), l.latitude, l.longitude, l.speed, l.time
		FROM vehicles v
		LEFT JOIN vehicle_route_assignments vra ON v.id = vra.vehicle_id
		LEFT JOIN routes r ON vra.route_id = r.id
		LEFT JOIN route_wards rw ON r.id = rw.route_id
		LEFT JOIN mobile_attendance a ON v.id = a.vehicle_id AND a.punch_out_at IS NULL
		LEFT JOIN employees e ON a.user_id = e.id
		LEFT JOIN latest_gps_data l ON v.plate_number = l.imei
		WHERE rw.ward_id = $1 OR v.ward_id = $1
	`, wardID)

	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var list []map[string]interface{} = []map[string]interface{}{}
	for rows.Next() {
		var id int
		var regNo, driver, lastTime string
		var lat, lng, speed float64
		if err := rows.Scan(&id, &regNo, &driver, &lat, &lng, &speed, &lastTime); err == nil {
			list = append(list, map[string]interface{}{
				"vehicle_id":     id,
				"vehicle_number": regNo,
				"driver_name":    driver,
				"lat":            lat,
				"lng":            lng,
				"speed":          speed,
				"last_update":    lastTime,
				"status":         "moving",
			})
		}
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"vehicles": list,
	})
}

// 26. MobileLiveTrackingZone
func (h *Handler) MobileLiveTrackingZone(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT v.id, v.registration_no, COALESCE(e.first_name || ' ' || e.last_name, 'Unknown'), l.latitude, l.longitude, l.speed, l.time
		FROM vehicles v
		LEFT JOIN mobile_attendance a ON v.id = a.vehicle_id AND a.punch_out_at IS NULL
		LEFT JOIN employees e ON a.user_id = e.id
		LEFT JOIN latest_gps_data l ON v.plate_number = l.imei
	`)

	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var list []map[string]interface{} = []map[string]interface{}{}
	for rows.Next() {
		var id int
		var regNo, driver, lastTime string
		var lat, lng, speed float64
		if err := rows.Scan(&id, &regNo, &driver, &lat, &lng, &speed, &lastTime); err == nil {
			list = append(list, map[string]interface{}{
				"vehicle_id":     id,
				"vehicle_number": regNo,
				"driver_name":    driver,
				"lat":            lat,
				"lng":            lng,
				"speed":          speed,
				"last_update":    lastTime,
				"status":         "moving",
			})
		}
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"vehicles": list,
	})
}
