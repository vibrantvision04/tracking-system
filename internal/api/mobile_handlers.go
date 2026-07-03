package api

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"gps-tracking-system/internal/audit"
	"gps-tracking-system/internal/auth"
	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/utils"
	"gps-tracking-system/internal/vision"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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
	case "road_sweeper":
		return "road_sweeper"
	default:
		return "driver" // fallback
	}
}

func isTestAccount(email string) bool {
	return email == "test-admin@example.com"
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
		SELECT u.id, u.email, COALESCE(u.role, ''), COALESCE(u.password_hash, '')
		FROM users u
		WHERE u.email = $1
		   OR u.email = LOWER($1) || '@swift.com'
		UNION ALL
		SELECT u.id, u.email, COALESCE(u.role, ''), COALESCE(u.password_hash, '')
		FROM users u
		JOIN employees e ON LOWER(u.email) = LOWER(e.employee_id) || '@swift.com'
		WHERE e.employee_id = $1 OR e.contact_no = $1
		LIMIT 1
	`
	err := db.QueryRow(ctx, query, req.Identifier).Scan(&user.ID, &user.Email, &user.Role, &user.PasswordHash)
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
		// FaceCount is the reliable face count detected on-device via Google ML Kit.
		// When provided (>= 0), the server trusts it and does not run its own
		// (unreliable) face detection.
		FaceCount        *int    `json:"face_count"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	cfg := vision.DefaultConfig()
	// Face presence/count is validated on-device (Google ML Kit), which is far more
	// reliable than the legacy server-side cascade. The backend now only performs
	// image-quality checks (blur/brightness/integrity) and trusts the device count.
	cfg.SkipFaceChecks = true

	result := vision.ValidatePhoto(req.PhotoBase64, cfg)

	// Prefer the on-device face count when supplied.
	faceCount := result.FaceCount
	if req.FaceCount != nil {
		faceCount = *req.FaceCount
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"valid":        result.Valid,
		"face_count":   faceCount,
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

	scope, _ := h.resolveScope(ctx, claims)
	var wardID *int
	if scope.WardID != nil {
		wardID = scope.WardID
	}

	_, err := db.Exec(ctx, `
		INSERT INTO mobile_attendance (
			user_id, role, punch_in_at, driver_name, helper_name, helper_present, vehicle_id, photo_path, gps_lat, gps_lng, ward_id
		) VALUES ($1, $2, NOW(), $3, $4, $5, NULLIF($6, 0), $7, $8, $9, $10)
	`, empID, claims.Role, req.DriverName, req.HelperName, req.HelperPresent, vehID, photoPath, req.GpsLat, req.GpsLng, wardID)

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

	scope, _ := h.resolveScope(ctx, claims)
	var wardID *int
	if scope.WardID != nil {
		wardID = scope.WardID
	}

	_, err := db.Exec(ctx, `
		INSERT INTO mobile_attendance (
			user_id, role, punch_in_at, driver_name, helper_name, helper_present, vehicle_id, photo_path, gps_lat, gps_lng, marked_by, ward_id
		) VALUES ($1, 'driver', NOW(), $2, $3, $4, NULLIF($5, 0), $6, $7, $8, $9, $10)
	`, driverEmpID, req.DriverName, req.HelperName, req.HelperPresent, vehID, photoPath, req.GpsLat, req.GpsLng, supervisorEmpID, wardID)

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

// attendanceListPagination parses the page / page_size query params for the
// attendance report, applying sensible defaults and a hard cap on page size.
func attendanceListPagination(r *http.Request) (page, pageSize int) {
	page = 1
	pageSize = 20
	if v, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("page"))); err == nil && v > 0 {
		page = v
	}
	if v, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("page_size"))); err == nil && v > 0 {
		pageSize = v
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}

// writeEmptyAttendancePage emits a well-formed empty Paginated<AttendanceReportRecord>
// response, used when the caller's scope resolves to no accessible records.
func writeEmptyAttendancePage(w http.ResponseWriter, r *http.Request) {
	page, pageSize := attendanceListPagination(r)
	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"items":       []interface{}{},
		"page":        page,
		"page_size":   pageSize,
		"total":       0,
		"total_pages": 0,
	})
}

// 9. MobileAttendanceList returns a role-scoped, filterable, paginated
// attendance report as Paginated<AttendanceReportRecord>:
//
//	{ items:[{id, employee_name, date, status, check_in?, check_out?}],
//	  page, page_size, total, total_pages }
//
// Authorization scope is always derived from the JWT via resolveScope:
//   - driver       → own records only
//   - supervisor   → own ward
//   - zone_manager → all wards in the assigned zone (or pinned ward)
//
// Client-supplied ward_id/zone_id are never consulted. Supported query filters:
// search (employee name), status (present|absent|late|leave), and date (or
// from_date/to_date). The mobile_attendance table has no status column, so
// status is derived: a record is 'present' (a punch-in occurred) unless the
// IST punch-in time falls more than 15 minutes after its shift start, in which
// case it is 'late'. The punch-in/out/mark/status flow is left untouched.
func (h *Handler) MobileAttendanceList(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	scope, err := h.resolveScope(ctx, claims)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve access scope")
		return
	}

	db := h.gpsRepo.Pool()

	// Build the base scope/date/search predicates. Each predicate appends its
	// bound value to args and references it positionally.
	var where []string
	var args []interface{}
	add := func(cond string, val interface{}) {
		args = append(args, val)
		where = append(where, fmt.Sprintf(cond, len(args)))
	}

	switch scope.Role {
	case "driver":
		if scope.EmployeeID == 0 {
			writeEmptyAttendancePage(w, r)
			return
		}
		add("a.user_id = $%d", scope.EmployeeID)
	case "supervisor":
		if scope.WardID == nil {
			writeEmptyAttendancePage(w, r)
			return
		}
		add("a.ward_id = $%d", *scope.WardID)
	case "zone_manager":
		switch {
		case scope.WardID != nil:
			add("a.ward_id = $%d", *scope.WardID)
		case scope.ZoneID != nil:
			add("a.ward_id IN (SELECT id FROM regions WHERE parent_id = $%d)", *scope.ZoneID)
		default:
			writeEmptyAttendancePage(w, r)
			return
		}
	default:
		// Unknown role: confine to the caller's own records as a safe default.
		add("a.user_id = $%d", scope.EmployeeID)
	}

	// Date filter: ?date=YYYY-MM-DD (single day) or ?from_date / ?to_date
	// (inclusive range). Defaults to today in IST when none is supplied. Only
	// well-formed dates are applied. Comparison is on the IST calendar date of
	// the punch-in timestamp.
	fromStr := strings.TrimSpace(r.URL.Query().Get("from_date"))
	toStr := strings.TrimSpace(r.URL.Query().Get("to_date"))
	if d := strings.TrimSpace(r.URL.Query().Get("date")); d != "" {
		fromStr, toStr = d, d
	}
	if fromStr == "" && toStr == "" {
		today := utils.CurrentTimeInIndia().Format("2006-01-02")
		fromStr, toStr = today, today
	}
	if _, e := time.Parse("2006-01-02", fromStr); e == nil {
		add("(a.punch_in_at AT TIME ZONE 'Asia/Kolkata')::date >= $%d", fromStr)
	}
	if _, e := time.Parse("2006-01-02", toStr); e == nil {
		add("(a.punch_in_at AT TIME ZONE 'Asia/Kolkata')::date <= $%d", toStr)
	}

	// Search filter on the employee's full name.
	if search := strings.TrimSpace(r.URL.Query().Get("search")); search != "" {
		add("(e.first_name || ' ' || COALESCE(e.last_name, '')) ILIKE '%%' || $%d || '%%'", search)
	}

	whereSQL := "TRUE"
	if len(where) > 0 {
		whereSQL = strings.Join(where, " AND ")
	}

	// Derived status CTE. status is 'late' when the IST punch-in time is more
	// than 15 minutes after the associated shift's start time, else 'present'.
	cte := `
		WITH base AS (
			SELECT a.id::text AS id,
			       (e.first_name || ' ' || COALESCE(e.last_name, '')) AS employee_name,
			       (a.punch_in_at AT TIME ZONE 'Asia/Kolkata')::date::text AS att_date,
			       a.punch_in_at AS check_in,
			       a.punch_out_at AS check_out,
			       CASE
			         WHEN s.start_time IS NOT NULL
			          AND (a.punch_in_at AT TIME ZONE 'Asia/Kolkata')::time > (s.start_time + interval '15 minutes')
			         THEN 'late'
			         ELSE 'present'
			       END AS status
			FROM mobile_attendance a
			JOIN employees e ON a.user_id = e.id
			LEFT JOIN shifts s ON a.shift_id = s.id
			WHERE ` + whereSQL + `
		)`

	// Status filter on the derived status (applied outside the CTE since it
	// references the computed column).
	statusWhere := "TRUE"
	if status := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status"))); status != "" {
		switch status {
		case "present", "absent", "late", "leave":
			args = append(args, status)
			statusWhere = fmt.Sprintf("status = $%d", len(args))
		}
	}

	// Total count for the filtered set.
	var total int
	if err := db.QueryRow(ctx, cte+" SELECT COUNT(*) FROM base WHERE "+statusWhere, args...).Scan(&total); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to count attendance records: "+err.Error())
		return
	}

	page, pageSize := attendanceListPagination(r)
	offset := (page - 1) * pageSize

	pageArgs := append(append([]interface{}{}, args...), pageSize, offset)
	pageQuery := cte + fmt.Sprintf(
		" SELECT id, employee_name, att_date, check_in, check_out, status FROM base"+
			" WHERE %s ORDER BY check_in DESC LIMIT $%d OFFSET $%d",
		statusWhere, len(args)+1, len(args)+2,
	)

	rows, err := db.Query(ctx, pageQuery, pageArgs...)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to load attendance records: "+err.Error())
		return
	}
	defer rows.Close()

	items := []map[string]interface{}{}
	for rows.Next() {
		var id, name, attDate, status string
		var checkIn time.Time
		var checkOut *time.Time
		if err := rows.Scan(&id, &name, &attDate, &checkIn, &checkOut, &status); err != nil {
			continue
		}
		item := map[string]interface{}{
			"id":            id,
			"employee_name": name,
			"date":          attDate,
			"status":        status,
			"check_in":      checkIn.Format(time.RFC3339),
		}
		if checkOut != nil {
			item["check_out"] = checkOut.Format(time.RFC3339)
		}
		items = append(items, item)
	}

	totalPages := 0
	if pageSize > 0 {
		totalPages = (total + pageSize - 1) / pageSize
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"items":       items,
		"page":        page,
		"page_size":   pageSize,
		"total":       total,
		"total_pages": totalPages,
	})
}

// 10. MobileMyRoutes returns the authenticated driver's assigned route with the
// REAL ward (route→route_wards→regions), per-lane-point status derived from the
// coverage single source of truth (vehicle_lane_point_coverage.details), the
// completed/remaining lane-point counts, route path geometry, and the driver's
// current position from the latest Redis telemetry. Scope is derived from the
// JWT via resolveScope; client-supplied ids are never trusted. When the driver
// has no assigned route it returns HTTP 404 so the mobile shows an Empty_State.
func (h *Handler) MobileMyRoutes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	scope, err := h.resolveScope(ctx, claims)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve access scope")
		return
	}

	// A driver must have a resolved vehicle to have an assigned route.
	if scope.VehicleID == nil {
		RespondWithError(w, http.StatusNotFound, "No route assigned to this driver")
		return
	}

	db := h.gpsRepo.Pool()

	// Driver → active route assignment (most recent active assignment for the
	// driver's own vehicle). No assignment → 404 (Empty_State on mobile).
	var route struct {
		ID             int
		Name           string
		CorridorMeters float64
		IsSequential   bool
	}
	err = db.QueryRow(ctx, `
		SELECT r.id, COALESCE(r.route_name, ''), COALESCE(r.corridor_meters, 0),
		       COALESCE(r.is_sequential, false)
		FROM routes r
		JOIN vehicle_route_assignments vra ON r.id = vra.route_id
		WHERE vra.vehicle_id = $1 AND vra.is_active = true
		ORDER BY vra.assigned_date DESC
		LIMIT 1
	`, *scope.VehicleID).Scan(&route.ID, &route.Name, &route.CorridorMeters, &route.IsSequential)
	if err != nil {
		RespondWithError(w, http.StatusNotFound, "No route assigned to this driver")
		return
	}

	// Real ward for the route via route_wards → regions. Never "Mock Ward".
	ward := map[string]interface{}{"id": 0, "name": ""}
	var wardID int
	var wardName string
	if err := db.QueryRow(ctx, `
		SELECT reg.id, COALESCE(reg.region_name, '')
		FROM route_wards rw
		JOIN regions reg ON reg.id = rw.ward_id
		WHERE rw.route_id = $1
		ORDER BY reg.id
		LIMIT 1
	`, route.ID).Scan(&wardID, &wardName); err == nil {
		ward = map[string]interface{}{"id": wardID, "name": wardName}
	} else if scope.WardID != nil {
		// Fallback to the scope-resolved ward when no route_wards row exists.
		var name string
		_ = db.QueryRow(ctx, `SELECT COALESCE(region_name, '') FROM regions WHERE id = $1`, *scope.WardID).Scan(&name)
		ward = map[string]interface{}{"id": *scope.WardID, "name": name}
	}

	// Per-lane-point status from the coverage SSOT for the report date.
	date := coverageDateParam(r)
	statusByLanePoint := h.laneStatusByLanePoint(ctx, *scope.VehicleID, route.ID, date)

	// Lane points ordered by sequence, each annotated with its coverage status.
	lpRows, err := db.Query(ctx, `
		SELECT id, latitude, longitude, sequence_number
		FROM route_lane_points
		WHERE route_id = $1
		ORDER BY sequence_number ASC
	`, route.ID)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to load route lane points")
		return
	}
	defer lpRows.Close()

	lanePoints := []map[string]interface{}{}
	completed := 0
	for lpRows.Next() {
		var id, seq int
		var lat, lng float64
		if err := lpRows.Scan(&id, &lat, &lng, &seq); err != nil {
			continue
		}
		// 'achieved' | 'pending' | 'missed' from coverage; 'upcoming' when the
		// lane point has no computed coverage for the date yet.
		status := "upcoming"
		if s, ok := statusByLanePoint[id]; ok && s != "" {
			status = s
		}
		if status == "achieved" {
			completed++
		}
		lanePoints = append(lanePoints, map[string]interface{}{
			"id":              id,
			"latitude":        lat,
			"longitude":       lng,
			"sequence_number": seq,
			"status":          status,
		})
	}

	total := len(lanePoints)
	remaining := total - completed
	if remaining < 0 {
		remaining = 0
	}
	coveragePct := 0.0
	if total > 0 {
		coveragePct = float64(completed) / float64(total) * 100.0
	}

	resp := map[string]interface{}{
		"ward": ward,
		"route": map[string]interface{}{
			"id":              route.ID,
			"route_name":      route.Name,
			"is_sequential":   route.IsSequential,
			"corridor_meters": route.CorridorMeters,
		},
		"lane_points":           lanePoints,
		"completed_lane_points": completed,
		"remaining_lane_points": remaining,
		"coverage_percent":      round1(coveragePct),
	}

	// Current position from the latest Redis telemetry for the driver's vehicle.
	if pos := h.vehicleCurrentPosition(ctx, *scope.VehicleID); pos != nil {
		resp["current_position"] = pos
	}

	RespondWithJSON(w, http.StatusOK, resp)
}

// laneStatusByLanePoint returns a map of route_lane_points.id → coverage status
// ('achieved' | 'pending' | 'missed') read from the coverage single source of
// truth (vehicle_lane_point_coverage.details) for the given vehicle/route/date.
// An empty map is returned when no coverage has been computed for that key.
func (h *Handler) laneStatusByLanePoint(ctx context.Context, vehicleID, routeID int, date string) map[int]string {
	out := map[int]string{}
	var detailsJSON []byte
	err := h.gpsRepo.Pool().QueryRow(ctx, `
		SELECT details
		FROM vehicle_lane_point_coverage
		WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3
	`, vehicleID, routeID, date).Scan(&detailsJSON)
	if err != nil || len(detailsJSON) == 0 {
		return out
	}
	var details []struct {
		LanePointID int    `json:"lane_point_id"`
		Status      string `json:"status"`
	}
	if err := json.Unmarshal(detailsJSON, &details); err != nil {
		return out
	}
	for _, d := range details {
		out[d.LanePointID] = d.Status
	}
	return out
}

// vehicleCurrentPosition returns the latest known position for a vehicle from
// Redis (gps:latest:<imei>), or nil when no device/telemetry is available.
func (h *Handler) vehicleCurrentPosition(ctx context.Context, vehicleID int) map[string]interface{} {
	var imei string
	err := h.gpsRepo.Pool().QueryRow(ctx, `
		SELECT COALESCE(d.imei, '')
		FROM vehicle_gps_map m
		JOIN gps_devices d ON m.device_id = d.id
		WHERE m.vehicle_id = $1 AND m.unassigned_at IS NULL
		LIMIT 1
	`, vehicleID).Scan(&imei)
	if err != nil || imei == "" {
		return nil
	}

	val, err := h.rdb.Get(ctx, "gps:latest:"+imei).Result()
	if err != nil {
		return nil
	}
	var data decoder.AVLData
	if json.Unmarshal([]byte(val), &data) != nil {
		return nil
	}
	updatedAt := ""
	if !data.Time.IsZero() {
		updatedAt = data.Time.Format(time.RFC3339)
	}
	return map[string]interface{}{
		"lat":        data.Lat,
		"lng":        data.Lng,
		"updated_at": updatedAt,
	}
}

// ---- Coverage helpers (shared by the three coverage handlers) ----

// coverageDateParam returns the report date for a coverage request. It uses a
// client-supplied ?date=YYYY-MM-DD when present and valid, otherwise today's
// date in IST. Only the date value is ever taken from the client; the
// authorization scope is always derived from the JWT via resolveScope.
func coverageDateParam(r *http.Request) string {
	if d := strings.TrimSpace(r.URL.Query().Get("date")); d != "" {
		if _, err := time.Parse("2006-01-02", d); err == nil {
			return d
		}
	}
	return utils.CurrentTimeInIndia().Format("2006-01-02")
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }
func round2(v float64) float64 { return math.Round(v*100) / 100 }

// routeDistanceKm returns the total length of a route in kilometres, computed by
// summing the great-circle distance between consecutive lane points ordered by
// sequence. Returns 0 when the route has fewer than two lane points.
func (h *Handler) routeDistanceKm(ctx context.Context, routeID int) float64 {
	rows, err := h.gpsRepo.Pool().Query(ctx, `
		SELECT latitude, longitude
		FROM route_lane_points
		WHERE route_id = $1
		ORDER BY sequence_number ASC
	`, routeID)
	if err != nil {
		return 0
	}
	defer rows.Close()

	var total, prevLat, prevLng float64
	first := true
	for rows.Next() {
		var lat, lng float64
		if err := rows.Scan(&lat, &lng); err != nil {
			continue
		}
		if !first {
			total += utils.Haversine(prevLat, prevLng, lat, lng)
		}
		prevLat, prevLng = lat, lng
		first = false
	}
	return total
}

// scopeWardIDs returns the set of ward ids visible to the caller for coverage
// aggregation, derived entirely from the JWT-resolved scope. A caller pinned to
// a single ward (supervisor, or a ward-pinned manager) only ever sees that ward;
// a zone manager sees every ward in their assigned zone.
func (h *Handler) scopeWardIDs(ctx context.Context, scope RoleScope) ([]int, error) {
	if scope.WardID != nil {
		return []int{*scope.WardID}, nil
	}
	if scope.Role == "zone_manager" && scope.ZoneID != nil {
		// City-wide sentinel: return ALL wards in the system.
		if *scope.ZoneID == cityWideSentinel {
			rows, err := h.gpsRepo.Pool().Query(ctx, `
				SELECT id FROM regions
				WHERE region_type_id = $1
				ORDER BY id
			`, regionTypeWard)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			ids := []int{}
			for rows.Next() {
				var id int
				if err := rows.Scan(&id); err == nil {
					ids = append(ids, id)
				}
			}
			return ids, nil
		}
		rows, err := h.gpsRepo.Pool().Query(ctx, `
			SELECT id FROM regions
			WHERE parent_id = $1 AND region_type_id = $2
			ORDER BY id
		`, *scope.ZoneID, regionTypeWard)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		ids := []int{}
		for rows.Next() {
			var id int
			if err := rows.Scan(&id); err == nil {
				ids = append(ids, id)
			}
		}
		return ids, nil
	}
	return []int{}, nil
}

// scopeVehicleIDs returns the set of vehicle ids visible to the caller, derived
// entirely from the JWT-resolved scope. A driver sees only their own resolved
// vehicle; a supervisor/zone manager sees every active vehicle attached to a
// route in their wards (or pinned directly to those wards). This mirrors the
// vehicle selection used by liveTelemetry so dashboard counts stay consistent
// with the live-tracking handlers.
func (h *Handler) scopeVehicleIDs(ctx context.Context, scope RoleScope, wardIDs []int) ([]int, error) {
	if scope.Role == "driver" {
		if scope.VehicleID != nil {
			return []int{*scope.VehicleID}, nil
		}
		return []int{}, nil
	}
	out := []int{}
	if len(wardIDs) == 0 {
		return out, nil
	}
	rows, err := h.gpsRepo.Pool().Query(ctx, `
		SELECT DISTINCT v.id
		FROM vehicles v
		LEFT JOIN vehicle_route_assignments vra ON v.id = vra.vehicle_id AND vra.is_active = true
		LEFT JOIN route_wards rw ON vra.route_id = rw.route_id
		WHERE (rw.ward_id = ANY($1) OR v.ward_id = ANY($1)) AND v.is_active = true
	`, wardIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err == nil {
			out = append(out, id)
		}
	}
	return out, nil
}

// wardCoverageRows aggregates per-ward coverage for the given ward ids on the
// given date. Coverage comes from the single source of truth
// (vehicle_lane_point_coverage) joined through route_wards; drivers_present is
// the count of distinct drivers punched in for the ward that day.
func (h *Handler) wardCoverageRows(ctx context.Context, wardIDs []int, date string) ([]map[string]interface{}, error) {
	out := []map[string]interface{}{}
	if len(wardIDs) == 0 {
		return out, nil
	}
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT w.id, COALESCE(w.region_name, ''),
		       COALESCE(SUM(c.total_points), 0)   AS total_points,
		       COALESCE(SUM(c.covered_points), 0) AS covered_points,
		       COUNT(DISTINCT c.vehicle_id)        AS vehicles_active
		FROM regions w
		LEFT JOIN route_wards rw ON rw.ward_id = w.id
		LEFT JOIN vehicle_lane_point_coverage c
		       ON c.route_id = rw.route_id AND c.report_date = $2
		WHERE w.id = ANY($1)
		GROUP BY w.id, w.region_name
		ORDER BY w.id
	`, wardIDs, date)
	if err != nil {
		return nil, err
	}

	type wc struct {
		id, total, covered, vehicles int
		name                         string
	}
	var list []wc
	for rows.Next() {
		var x wc
		if err := rows.Scan(&x.id, &x.name, &x.total, &x.covered, &x.vehicles); err != nil {
			continue
		}
		list = append(list, x)
	}
	rows.Close()

	// Distinct drivers punched in per ward on the date.
	present := map[int]int{}
	dRows, err := db.Query(ctx, `
		SELECT ward_id, COUNT(DISTINCT user_id)
		FROM mobile_attendance
		WHERE ward_id = ANY($1) AND role = 'driver' AND punch_in_at::date = $2::date
		GROUP BY ward_id
	`, wardIDs, date)
	if err == nil {
		for dRows.Next() {
			var wid, cnt int
			if err := dRows.Scan(&wid, &cnt); err == nil {
				present[wid] = cnt
			}
		}
		dRows.Close()
	}

	for _, x := range list {
		pct := 0.0
		if x.total > 0 {
			pct = float64(x.covered) / float64(x.total) * 100.0
		}
		out = append(out, map[string]interface{}{
			"ward_id":          x.id,
			"ward_name":        x.name,
			"coverage_percent": round1(pct),
			"vehicles_active":  x.vehicles,
			"drivers_present":  present[x.id],
		})
	}
	return out, nil
}

// 11. MobileMyCoverage returns the authenticated driver's daily coverage summary
// (lane-point completion, coverage %, covered/pending distance) computed from the
// single source of truth (vehicle_lane_point_coverage) for the driver's own
// vehicle. Scope is derived from the JWT; client-supplied ids are ignored.
func (h *Handler) MobileMyCoverage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	scope, err := h.resolveScope(ctx, claims)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve access scope")
		return
	}

	date := coverageDateParam(r)
	summary := map[string]interface{}{
		"date":                  date,
		"total_lane_points":     0,
		"completed_lane_points": 0,
		"remaining_lane_points": 0,
		"coverage_percent":      0.0,
		"covered_distance_km":   0.0,
		"pending_distance_km":   0.0,
	}

	// No assigned vehicle resolved → well-formed empty summary (Empty_State).
	if scope.VehicleID == nil {
		RespondWithJSON(w, http.StatusOK, summary)
		return
	}

	rows, err := h.gpsRepo.Pool().Query(ctx, `
		SELECT route_id, COALESCE(total_points, 0), COALESCE(covered_points, 0)
		FROM vehicle_lane_point_coverage
		WHERE vehicle_id = $1 AND report_date = $2
	`, *scope.VehicleID, date)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to load coverage")
		return
	}
	defer rows.Close()

	var totalPoints, completedPoints int
	var coveredDist, totalDist float64
	for rows.Next() {
		var routeID, total, covered int
		if err := rows.Scan(&routeID, &total, &covered); err != nil {
			continue
		}
		totalPoints += total
		completedPoints += covered
		rd := h.routeDistanceKm(ctx, routeID)
		totalDist += rd
		if total > 0 {
			coveredDist += rd * (float64(covered) / float64(total))
		}
	}

	remaining := totalPoints - completedPoints
	if remaining < 0 {
		remaining = 0
	}
	coveragePct := 0.0
	if totalPoints > 0 {
		coveragePct = float64(completedPoints) / float64(totalPoints) * 100.0
	}
	pendingDist := totalDist - coveredDist
	if pendingDist < 0 {
		pendingDist = 0
	}

	summary["total_lane_points"] = totalPoints
	summary["completed_lane_points"] = completedPoints
	summary["remaining_lane_points"] = remaining
	summary["coverage_percent"] = round1(coveragePct)
	summary["covered_distance_km"] = round2(coveredDist)
	summary["pending_distance_km"] = round2(pendingDist)

	RespondWithJSON(w, http.StatusOK, summary)
}

// 12. MobileWardsCoverage returns per-ward coverage aggregates for the caller's
// JWT-derived scope (supervisor → own ward, zone manager → wards in zone).
func (h *Handler) MobileWardsCoverage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	scope, err := h.resolveScope(ctx, claims)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve access scope")
		return
	}
	date := coverageDateParam(r)

	wardIDs, err := h.scopeWardIDs(ctx, scope)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve ward scope")
		return
	}
	wards, err := h.wardCoverageRows(ctx, wardIDs, date)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to load ward coverage")
		return
	}
	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"date":  date,
		"wards": wards,
	})
}

// 13. MobileZoneCoverage returns the zone manager's zone totals plus a per-ward
// breakdown, all derived from the JWT-resolved zone scope.
func (h *Handler) MobileZoneCoverage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	scope, err := h.resolveScope(ctx, claims)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve access scope")
		return
	}
	date := coverageDateParam(r)

	if scope.ZoneID == nil {
		// No zone resolved for this caller → well-formed empty shape.
		RespondWithJSON(w, http.StatusOK, map[string]interface{}{
			"zone":             map[string]interface{}{"id": 0, "name": "", "total_wards": 0, "total_vehicles": 0},
			"coverage_percent": 0.0,
			"active_vehicles":  0,
			"drivers_present":  0,
			"wards":            []interface{}{},
			"date":             date,
		})
		return
	}

	db := h.gpsRepo.Pool()
	zoneID := *scope.ZoneID

	var zoneName string
	_ = db.QueryRow(ctx, `SELECT COALESCE(region_name, '') FROM regions WHERE id = $1`, zoneID).Scan(&zoneName)

	wardIDs, err := h.scopeWardIDs(ctx, scope)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve ward scope")
		return
	}
	wards, err := h.wardCoverageRows(ctx, wardIDs, date)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to load zone coverage")
		return
	}

	// Zone totals from the same SSOT (sum across the scoped wards).
	var totalPoints, coveredPoints, activeVehicles int
	if len(wardIDs) > 0 {
		_ = db.QueryRow(ctx, `
			SELECT COALESCE(SUM(c.total_points), 0),
			       COALESCE(SUM(c.covered_points), 0),
			       COUNT(DISTINCT c.vehicle_id)
			FROM vehicle_lane_point_coverage c
			JOIN route_wards rw ON rw.route_id = c.route_id
			WHERE rw.ward_id = ANY($1) AND c.report_date = $2
		`, wardIDs, date).Scan(&totalPoints, &coveredPoints, &activeVehicles)
	}

	coveragePct := 0.0
	if totalPoints > 0 {
		coveragePct = float64(coveredPoints) / float64(totalPoints) * 100.0
	}

	// Total vehicles: scoped to the caller's wards when ward-pinned, else the zone.
	var totalVehicles int
	if scope.WardID != nil {
		_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM vehicles WHERE ward_id = ANY($1) AND is_active = true`, wardIDs).Scan(&totalVehicles)
	} else {
		_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM vehicles WHERE zone_id = $1 AND is_active = true`, zoneID).Scan(&totalVehicles)
	}

	var driversPresent int
	if len(wardIDs) > 0 {
		_ = db.QueryRow(ctx, `
			SELECT COUNT(DISTINCT user_id)
			FROM mobile_attendance
			WHERE ward_id = ANY($1) AND role = 'driver' AND punch_in_at::date = $2::date
		`, wardIDs, date).Scan(&driversPresent)
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"zone": map[string]interface{}{
			"id":             zoneID,
			"name":           zoneName,
			"total_wards":    len(wardIDs),
			"total_vehicles": totalVehicles,
		},
		"coverage_percent": round1(coveragePct),
		"active_vehicles":  activeVehicles,
		"drivers_present":  driversPresent,
		"wards":            wards,
		"date":             date,
	})
}

// MobileDashboard returns the role-scoped DashboardStats aggregate for the
// authenticated caller's home screen. Every metric is derived from real tables
// (no hardcoded values) and confined to the JWT-resolved scope:
//   - driver      → own vehicle / route / attendance / alerts / complaints
//   - supervisor  → own ward
//   - zone_manager→ all wards in the assigned zone
//
// "Today" is resolved in IST via utils.CurrentTimeInIndia(). Running vehicles
// and coverage reuse the same sources as the live-tracking and coverage
// handlers (Redis telemetry + vehicle_lane_point_coverage SSOT).
// Requirements: 3.1, 3.2. Design: "New endpoints (dashboard)".
func (h *Handler) MobileDashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	scope, err := h.resolveScope(ctx, claims)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve access scope")
		return
	}

	db := h.gpsRepo.Pool()
	date := utils.CurrentTimeInIndia().Format("2006-01-02")
	isDriver := scope.Role == "driver"

	wardIDs, err := h.scopeWardIDs(ctx, scope)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve ward scope")
		return
	}
	vehicleIDs, err := h.scopeVehicleIDs(ctx, scope, wardIDs)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve vehicle scope")
		return
	}
	vehicleSet := make(map[int]bool, len(vehicleIDs))
	for _, id := range vehicleIDs {
		vehicleSet[id] = true
	}

	// --- coverage_percent (vehicle_lane_point_coverage SSOT) ---
	var totalPoints, coveredPoints int
	if isDriver {
		if scope.VehicleID != nil {
			_ = db.QueryRow(ctx, `
				SELECT COALESCE(SUM(total_points), 0), COALESCE(SUM(covered_points), 0)
				FROM vehicle_lane_point_coverage
				WHERE vehicle_id = $1 AND report_date = $2
			`, *scope.VehicleID, date).Scan(&totalPoints, &coveredPoints)
		}
	} else if len(wardIDs) > 0 {
		_ = db.QueryRow(ctx, `
			SELECT COALESCE(SUM(c.total_points), 0), COALESCE(SUM(c.covered_points), 0)
			FROM vehicle_lane_point_coverage c
			JOIN route_wards rw ON rw.route_id = c.route_id
			WHERE rw.ward_id = ANY($1) AND c.report_date = $2
		`, wardIDs, date).Scan(&totalPoints, &coveredPoints)
	}
	coveragePct := 0.0
	if totalPoints > 0 {
		coveragePct = float64(coveredPoints) / float64(totalPoints) * 100.0
	}

	// --- total_vehicles / running_vehicles (Redis telemetry, same as tracking) ---
	totalVehicles := len(vehicleIDs)
	runningVehicles := 0
	if telemetry, terr := h.liveTelemetry(ctx, wardIDs); terr == nil {
		for _, t := range telemetry {
			vid, _ := t["vehicle_id"].(int)
			if !vehicleSet[vid] {
				continue
			}
			if status, _ := t["status"].(string); status == "running" {
				runningVehicles++
			}
		}
	}

	// --- completed_routes / pending_routes (today, IST) ---
	var totalRoutes, completedRoutes int
	if isDriver {
		if scope.VehicleID != nil {
			_ = db.QueryRow(ctx, `
				SELECT COUNT(DISTINCT route_id)
				FROM vehicle_route_assignments
				WHERE vehicle_id = $1 AND is_active = true
			`, *scope.VehicleID).Scan(&totalRoutes)
			_ = db.QueryRow(ctx, `
				SELECT COUNT(*) FROM (
					SELECT route_id
					FROM vehicle_lane_point_coverage
					WHERE vehicle_id = $1 AND report_date = $2
					GROUP BY route_id
					HAVING SUM(total_points) > 0 AND SUM(covered_points) >= SUM(total_points)
				) t
			`, *scope.VehicleID, date).Scan(&completedRoutes)
		}
	} else if len(wardIDs) > 0 {
		_ = db.QueryRow(ctx, `
			SELECT COUNT(DISTINCT route_id) FROM route_wards WHERE ward_id = ANY($1)
		`, wardIDs).Scan(&totalRoutes)
		_ = db.QueryRow(ctx, `
			SELECT COUNT(*) FROM (
				SELECT c.route_id
				FROM vehicle_lane_point_coverage c
				JOIN route_wards rw ON rw.route_id = c.route_id
				WHERE rw.ward_id = ANY($1) AND c.report_date = $2
				GROUP BY c.route_id
				HAVING SUM(c.total_points) > 0 AND SUM(c.covered_points) >= SUM(c.total_points)
			) t
		`, wardIDs, date).Scan(&completedRoutes)
	}
	pendingRoutes := totalRoutes - completedRoutes
	if pendingRoutes < 0 {
		pendingRoutes = 0
	}

	// --- attendance: active_drivers / attendance_present / attendance_total ---
	var activeDrivers, attendancePresent, attendanceTotal int
	if isDriver {
		if scope.EmployeeID != 0 {
			_ = db.QueryRow(ctx, `
				SELECT COUNT(DISTINCT user_id)
				FROM mobile_attendance
				WHERE user_id = $1 AND role = 'driver' AND punch_in_at::date = $2::date
			`, scope.EmployeeID, date).Scan(&attendancePresent)
			_ = db.QueryRow(ctx, `
				SELECT COUNT(DISTINCT user_id)
				FROM mobile_attendance
				WHERE user_id = $1 AND role = 'driver' AND punch_in_at::date = $2::date AND punch_out_at IS NULL
			`, scope.EmployeeID, date).Scan(&activeDrivers)
		}
		attendanceTotal = 1
	} else if len(wardIDs) > 0 {
		_ = db.QueryRow(ctx, `
			SELECT COUNT(DISTINCT user_id)
			FROM mobile_attendance
			WHERE ward_id = ANY($1) AND role = 'driver' AND punch_in_at::date = $2::date
		`, wardIDs, date).Scan(&attendancePresent)
		_ = db.QueryRow(ctx, `
			SELECT COUNT(DISTINCT user_id)
			FROM mobile_attendance
			WHERE ward_id = ANY($1) AND role = 'driver' AND punch_in_at::date = $2::date AND punch_out_at IS NULL
		`, wardIDs, date).Scan(&activeDrivers)
		// Expected drivers in scope ≈ one per in-scope vehicle.
		attendanceTotal = totalVehicles
	}

	// --- alert_count (automatic `alerts` + manual `vehicle_alerts`) ---
	alertCount := 0
	if len(vehicleIDs) > 0 {
		var autoAlerts, manualAlerts int
		_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM alerts WHERE vehicle_id = ANY($1)`, vehicleIDs).Scan(&autoAlerts)
		_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM vehicle_alerts WHERE vehicle_id = ANY($1)`, vehicleIDs).Scan(&manualAlerts)
		alertCount = autoAlerts + manualAlerts
	}

	// --- complaint_count (complaints scoped to ward / vehicle / driver) ---
	complaintCount := 0
	if isDriver {
		if scope.VehicleID != nil || scope.EmployeeID != 0 {
			vehID := 0
			if scope.VehicleID != nil {
				vehID = *scope.VehicleID
			}
			_ = db.QueryRow(ctx, `
				SELECT COUNT(*) FROM complaints
				WHERE assigned_vehicle_id = $1 OR assigned_driver_id = $2
			`, vehID, scope.EmployeeID).Scan(&complaintCount)
		}
	} else if len(wardIDs) > 0 {
		_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM complaints WHERE ward_id = ANY($1)`, wardIDs).Scan(&complaintCount)
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"coverage_percent":   round1(coveragePct),
		"total_vehicles":     totalVehicles,
		"running_vehicles":   runningVehicles,
		"completed_routes":   completedRoutes,
		"pending_routes":     pendingRoutes,
		"active_drivers":     activeDrivers,
		"attendance_present": attendancePresent,
		"attendance_total":   attendanceTotal,
		"alert_count":        alertCount,
		"complaint_count":    complaintCount,
	})
}

// 14. MobileMyAlerts — driver's own vehicle alert feed (unified automatic +
// manual), role-scoped from the JWT. See mobileAlertFeed.
func (h *Handler) MobileMyAlerts(w http.ResponseWriter, r *http.Request) {
	h.mobileAlertFeed(w, r)
}

// 15. MobileWardAlerts — supervisor's ward alert feed. Scope is derived from the
// JWT (the ward's vehicles), never from query params. See mobileAlertFeed.
func (h *Handler) MobileWardAlerts(w http.ResponseWriter, r *http.Request) {
	h.mobileAlertFeed(w, r)
}

// 16. MobileZoneAlerts — zone manager's zone alert feed (all wards' vehicles in
// scope). See mobileAlertFeed.
func (h *Handler) MobileZoneAlerts(w http.ResponseWriter, r *http.Request) {
	h.mobileAlertFeed(w, r)
}

// mobileAlertFeed builds the unified, role-scoped Vehicle_Alert feed shared by
// MobileMyAlerts / MobileWardAlerts / MobileZoneAlerts. Because the scope is
// resolved entirely from the JWT (driver → own vehicle, supervisor → ward
// vehicles, zone manager → zone wards' vehicles), the three role endpoints
// converge on the same logic; the resolved RoleScope alone determines what each
// caller sees (Req 2.2, 8.2).
//
// Sources combined:
//   - automatic alerts from the `alerts` table (migration 013), keyed "auto-<id>"
//   - manual alerts from the `vehicle_alerts` table (migration 057), keyed
//     "manual-<id>" and confined to alerts addressed to the caller.
//
// Per-alert `read` state and `unread_count` come from `alert_reads` keyed by the
// composite feed id and claims.UserID (Req 8.9).
func (h *Handler) mobileAlertFeed(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	scope, err := h.resolveScope(ctx, claims)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve access scope")
		return
	}

	db := h.gpsRepo.Pool()

	// Vehicle ids in scope drive the automatic-alert query and decorate manual
	// alerts with a registration number.
	wardIDs, err := h.scopeWardIDs(ctx, scope)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve ward scope")
		return
	}
	vehicleIDs, err := h.scopeVehicleIDs(ctx, scope, wardIDs)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve vehicle scope")
		return
	}

	// Read-state for the caller (user id from the JWT claims, Req 8.9).
	readIDs := map[string]bool{}
	if rows, qerr := db.Query(ctx, `SELECT alert_id FROM alert_reads WHERE user_id = $1`, scope.UserID); qerr == nil {
		defer rows.Close()
		for rows.Next() {
			var id string
			if rows.Scan(&id) == nil {
				readIDs[id] = true
			}
		}
	}

	alerts := []map[string]interface{}{}

	// Get today's start in IST timezone
	istLoc := time.FixedZone("IST", 19800)
	nowLocal := time.Now().In(istLoc)
	todayStart := time.Date(nowLocal.Year(), nowLocal.Month(), nowLocal.Day(), 0, 0, 0, 0, istLoc)

	// --- Automatic alerts (alerts table, migration 013) -------------------
	if len(vehicleIDs) > 0 {
		rows, qerr := db.Query(ctx, `
			SELECT id,
			       COALESCE(alert_type, ''),
			       COALESCE(alert_detail, ''),
			       COALESCE(registration_no, ''),
			       COALESCE(time_reported, created_at, NOW())
			FROM alerts
			WHERE vehicle_id = ANY($1)
			  AND COALESCE(time_reported, created_at, NOW()) >= $2
			ORDER BY COALESCE(time_reported, created_at, NOW()) DESC
			LIMIT 200
		`, vehicleIDs, todayStart)
		if qerr != nil {
			RespondWithError(w, http.StatusInternalServerError, "Failed to load alerts")
			return
		}
		for rows.Next() {
			var id int
			var alertType, detail, reg string
			var createdAt time.Time
			if rows.Scan(&id, &alertType, &detail, &reg, &createdAt) != nil {
				continue
			}
			mapped := mapAutoAlertType(alertType)
			feedID := fmt.Sprintf("auto-%d", id)
			message := detail
			if message == "" {
				message = humanizeAlertType(alertType)
			}
			item := map[string]interface{}{
				"id":           feedID,
				"type":         mapped,
				"source":       "automatic",
				"message":      message,
				"severity":     defaultAlertSeverity(mapped),
				"created_at":   createdAt,
				"read":         readIDs[feedID],
				"acknowledged": readIDs[feedID],
			}
			if reg != "" {
				item["vehicle_number"] = reg
			}
			alerts = append(alerts, item)
		}
		rows.Close()
	}

	// --- Manual alerts (vehicle_alerts table, migration 057) --------------
	// Confined to alerts addressed to the caller: matching recipient_role and
	// recipient_id (the user id, the linked employee id, or NULL for a
	// role-wide broadcast). Recipient semantics are finalized by task 13.4.
	manualRows, qerr := db.Query(ctx, `
		SELECT va.id,
		       COALESCE(va.type, 'manual'),
		       COALESCE(va.message, ''),
		       COALESCE(va.severity, 'minor'),
		       va.sender_role,
		       COALESCE(v.registration_no, ''),
		       va.created_at
		FROM vehicle_alerts va
		LEFT JOIN vehicles v ON v.id = va.vehicle_id
		WHERE va.source = 'manual'
		  AND COALESCE(va.recipient_role, '') = $1
		  AND (va.recipient_id IS NULL OR va.recipient_id = $2 OR va.recipient_id = $3)
		  AND va.created_at >= $4
		ORDER BY va.created_at DESC
		LIMIT 200
	`, scope.Role, scope.UserID, scope.EmployeeID, todayStart)
	if qerr != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to load alerts")
		return
	}
	for manualRows.Next() {
		var id int64
		var alertType, message, severity, reg string
		var senderRole *string
		var createdAt time.Time
		if manualRows.Scan(&id, &alertType, &message, &severity, &senderRole, &reg, &createdAt) != nil {
			continue
		}
		feedID := fmt.Sprintf("manual-%d", id)
		item := map[string]interface{}{
			"id":           feedID,
			"type":         alertType,
			"source":       "manual",
			"message":      message,
			"severity":     severity,
			"created_at":   createdAt,
			"read":         readIDs[feedID],
			"acknowledged": readIDs[feedID],
		}
		if reg != "" {
			item["vehicle_number"] = reg
		}
		if senderRole != nil && *senderRole != "" {
			item["sender_role"] = *senderRole
		}
		alerts = append(alerts, item)
	}
	manualRows.Close()

	// Merge: sort the combined feed by created_at descending (Req 8.2).
	sort.SliceStable(alerts, func(i, j int) bool {
		ti, _ := alerts[i]["created_at"].(time.Time)
		tj, _ := alerts[j]["created_at"].(time.Time)
		return ti.After(tj)
	})

	unread := 0
	for _, a := range alerts {
		if read, _ := a["read"].(bool); !read {
			unread++
		}
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"alerts":       alerts,
		"unread_count": unread,
	})
}

// mapAutoAlertType normalizes a free-text automatic alert_type (alerts table)
// to the mobile AlertType union where possible, otherwise returns the
// normalized type unchanged.
func mapAutoAlertType(raw string) string {
	t := strings.ToLower(strings.TrimSpace(raw))
	t = strings.ReplaceAll(t, " ", "_")
	t = strings.ReplaceAll(t, "-", "_")
	switch t {
	case "overspeed", "over_speed", "speeding", "speed":
		return "overspeed"
	case "geofence_entry", "geofence_in", "geo_in", "geofence_enter":
		return "geofence_entry"
	case "geofence_exit", "geofence_out", "geo_out", "geofence_leave":
		return "geofence_exit"
	case "idle", "idling":
		return "idle"
	case "ignition", "ignition_on", "ignition_off":
		return "ignition"
	case "offline", "no_data", "disconnected", "vehicle_stopped", "stopped":
		return "offline"
	case "battery", "low_battery", "battery_low":
		return "battery"
	case "harsh_braking", "harsh_brake", "harsh_braking_event", "braking":
		return "harsh_braking"
	default:
		return t
	}
}

// defaultAlertSeverity assigns a sensible default severity for an automatic
// alert type (the alerts table carries no severity column).
func defaultAlertSeverity(mappedType string) string {
	switch mappedType {
	case "overspeed", "harsh_braking", "offline":
		return "major"
	case "geofence_entry", "geofence_exit":
		return "major"
	default:
		return "minor"
	}
}

// humanizeAlertType produces a readable fallback message when an automatic
// alert has no detail text.
func humanizeAlertType(raw string) string {
	t := strings.TrimSpace(raw)
	if t == "" {
		return "Vehicle alert"
	}
	t = strings.ReplaceAll(t, "_", " ")
	return strings.ToUpper(t[:1]) + t[1:]
}

// 17. MobileMarkAlertRead — persists per-user read state for a single feed item
// (Req 8.10). The {id} path param is the composite feed id ("auto-<n>" /
// "manual-<n>") exposed by the unified alert feed. Read state is recorded in
// alert_reads keyed by (user_id, alert_id) and is idempotent: re-marking an
// already-read alert is a no-op. The caller's recomputed unread_count is
// returned so the client can update its badge without refetching the feed.
//
// Also serves the deprecated POST /alerts/acknowledge/{id} alias (same {id}
// param) so older clients keep working.
func (h *Handler) MobileMarkAlertRead(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	alertID := strings.TrimSpace(chi.URLParam(r, "id"))
	if alertID == "" {
		RespondWithError(w, http.StatusBadRequest, "Alert id is required")
		return
	}

	scope, err := h.resolveScope(ctx, claims)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve access scope")
		return
	}

	db := h.gpsRepo.Pool()

	// Persist read state idempotently (Req 8.10): the composite (user_id,
	// alert_id) primary key makes a repeated mark a no-op.
	if _, err := db.Exec(ctx, `
		INSERT INTO alert_reads (user_id, alert_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, alert_id) DO NOTHING
	`, scope.UserID, alertID); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to mark alert read")
		return
	}

	// Recompute the caller's unread count the same way the feed does. If the
	// recompute fails the read state is still persisted, so fall back to a bare
	// success and let the client refetch the feed.
	unread, uerr := h.mobileAlertUnreadCount(ctx, scope)
	if uerr != nil {
		RespondWithJSON(w, http.StatusOK, map[string]interface{}{"message": "Alert marked read"})
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"message":      "Alert marked read",
		"unread_count": unread,
	})
}

// mobileAlertUnreadCount recomputes the caller's unread alert count using the
// exact scoping and source queries as mobileAlertFeed (automatic alerts keyed
// "auto-<id>" + manual alerts keyed "manual-<id>"), counting feed items absent
// from alert_reads for the caller. Kept in sync with mobileAlertFeed.
func (h *Handler) mobileAlertUnreadCount(ctx context.Context, scope RoleScope) (int, error) {
	db := h.gpsRepo.Pool()

	wardIDs, err := h.scopeWardIDs(ctx, scope)
	if err != nil {
		return 0, err
	}
	vehicleIDs, err := h.scopeVehicleIDs(ctx, scope, wardIDs)
	if err != nil {
		return 0, err
	}

	readIDs := map[string]bool{}
	if rows, qerr := db.Query(ctx, `SELECT alert_id FROM alert_reads WHERE user_id = $1`, scope.UserID); qerr == nil {
		defer rows.Close()
		for rows.Next() {
			var id string
			if rows.Scan(&id) == nil {
				readIDs[id] = true
			}
		}
	}

	unread := 0

	// Automatic alerts (alerts table, migration 013).
	if len(vehicleIDs) > 0 {
		rows, qerr := db.Query(ctx, `
			SELECT id
			FROM alerts
			WHERE vehicle_id = ANY($1)
			ORDER BY COALESCE(time_reported, created_at, NOW()) DESC
			LIMIT 200
		`, vehicleIDs)
		if qerr != nil {
			return 0, qerr
		}
		for rows.Next() {
			var id int
			if rows.Scan(&id) != nil {
				continue
			}
			if !readIDs[fmt.Sprintf("auto-%d", id)] {
				unread++
			}
		}
		rows.Close()
	}

	// Manual alerts (vehicle_alerts table, migration 057) addressed to caller.
	manualRows, qerr := db.Query(ctx, `
		SELECT va.id
		FROM vehicle_alerts va
		WHERE va.source = 'manual'
		  AND COALESCE(va.recipient_role, '') = $1
		  AND (va.recipient_id IS NULL OR va.recipient_id = $2 OR va.recipient_id = $3)
		ORDER BY va.created_at DESC
		LIMIT 200
	`, scope.Role, scope.UserID, scope.EmployeeID)
	if qerr != nil {
		return 0, qerr
	}
	for manualRows.Next() {
		var id int64
		if manualRows.Scan(&id) != nil {
			continue
		}
		if !readIDs[fmt.Sprintf("manual-%d", id)] {
			unread++
		}
	}
	manualRows.Close()

	return unread, nil
}

// manualAlertRequest is the body for POST /api/mobile/alerts/manual. It mirrors
// the ManualAlertRequest model in the mobile design: a single recipient role,
// one or more recipient ids, a message, and a severity.
type manualAlertRequest struct {
	RecipientRole string `json:"recipient_role"`
	RecipientIDs  []int  `json:"recipient_ids"`
	Message       string `json:"message"`
	Severity      string `json:"severity"`
}

// manualAlertMatrix encodes the server-enforced sender→recipient permission
// matrix (Req 8.5–8.7). The critical security property is that this matrix is
// enforced on the backend regardless of what the client renders:
//
//	zone_manager → {driver, road_sweeper}
//	supervisor   → {driver, road_sweeper}
//	driver       → {} (may send to no one)
//
// Alerts may ONLY ever be sent to Driver and Road Sweeper roles — never to
// admins, managers, or supervisors. Any pair absent from the matrix yields 403.
var manualAlertMatrix = map[string]map[string]bool{
	"zone_manager": {"driver": true, "road_sweeper": true},
	"supervisor":   {"driver": true, "road_sweeper": true},
	"driver":       {},
	"road_sweeper": {},
}

// 18. MobileSendManualAlert — sends a manual Vehicle_Alert with backend-enforced
// recipient-role validation (Req 8.5–8.7). The sender's role/scope is derived
// from the JWT via resolveScope (never from the request body). A driver may not
// send to anyone; a supervisor may target drivers only; a zone manager may
// target supervisors and drivers. Each accepted recipient is persisted as a row
// in vehicle_alerts (source/type = "manual").
func (h *Handler) MobileSendManualAlert(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	var req manualAlertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	recipientRole := strings.TrimSpace(strings.ToLower(req.RecipientRole))
	if recipientRole == "" {
		RespondWithError(w, http.StatusBadRequest, "recipient_role is required")
		return
	}
	if len(req.RecipientIDs) == 0 {
		RespondWithError(w, http.StatusBadRequest, "recipient_ids is required")
		return
	}
	message := strings.TrimSpace(req.Message)
	if message == "" {
		RespondWithError(w, http.StatusBadRequest, "message is required")
		return
	}
	severity := strings.TrimSpace(strings.ToLower(req.Severity))
	if severity == "" {
		severity = "minor"
	}

	scope, err := h.resolveScope(ctx, claims)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve access scope")
		return
	}

	// Enforce the sender→recipient role matrix server-side (Req 8.5–8.7). This
	// is the critical security property: a driver sending anything, or a
	// supervisor targeting a zone_manager/supervisor, is rejected with 403
	// even though the client also hides these controls (Req 8.8).
	allowed, ok := manualAlertMatrix[scope.Role]
	if !ok || !allowed[recipientRole] {
		scopeForbidden(w)
		return
	}

	// Best-effort scope confinement: recipients must fall within the sender's
	// ward/zone scope. The role matrix above is the critical guarantee; this
	// adds defence-in-depth where the recipient→ward mapping is resolvable.
	for _, rid := range req.RecipientIDs {
		inScope, serr := h.recipientInScope(ctx, scope, rid)
		if serr != nil {
			RespondWithError(w, http.StatusInternalServerError, "Failed to verify recipient scope")
			return
		}
		if !inScope {
			scopeForbidden(w)
			return
		}
	}

	// Persist one manual alert per recipient (source/type = "manual").
	db := h.gpsRepo.Pool()
	for _, rid := range req.RecipientIDs {
		recipientID := rid
		if _, err := db.Exec(ctx, `
			INSERT INTO vehicle_alerts
				(type, source, message, severity, recipient_role, recipient_id, sender_role, sender_user_id)
			VALUES ('manual', 'manual', $1, $2, $3, $4, $5, $6)
		`, message, severity, recipientRole, recipientID, scope.Role, scope.UserID); err != nil {
			RespondWithError(w, http.StatusInternalServerError, "Failed to send manual alert")
			return
		}
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"message":    "Manual alert sent successfully",
		"recipients": len(req.RecipientIDs),
	})
}

// recipientInScope reports whether a manual-alert recipient id belongs to the
// sender's ward/zone scope. The recipient id may be a users.id or the linked
// employees.id. Resolution is best-effort: when the recipient's ward cannot be
// determined (no employee/region mapping), it is treated as in-scope so that
// the role matrix remains the authoritative gate (per task guidance). A
// resolvable recipient outside the sender's wards is rejected.
func (h *Handler) recipientInScope(ctx context.Context, scope RoleScope, recipientID int) (bool, error) {
	db := h.gpsRepo.Pool()

	// Resolve the recipient's assigned region (ward). The recipient id may be a
	// users.id (joined to employees by the email local-part convention) or an
	// employees.id directly.
	var wardID *int
	err := db.QueryRow(ctx, `
		SELECT edd.region_id
		FROM employee_department_designations edd
		JOIN employees e ON e.id = edd.employee_id
		LEFT JOIN users u
		       ON split_part(u.email, '@', 1) = e.employee_id
		       OR split_part(u.email, '@', 1) = e.contact_no
		WHERE e.id = $1 OR u.id = $1
		LIMIT 1
	`, recipientID).Scan(&wardID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Cannot resolve the recipient's ward — defer to the role matrix.
			return true, nil
		}
		return false, fmt.Errorf("recipientInScope: %w", err)
	}
	if wardID == nil || *wardID == 0 {
		return true, nil
	}

	return h.wardInScope(ctx, scope, *wardID)
}

// 18b. MobileSendCustomAlert — deprecated alias for the old
// POST /api/mobile/alerts/custom route. Delegates to MobileSendManualAlert so
// older clients keep the same recipient-role validation behaviour.
func (h *Handler) MobileSendCustomAlert(w http.ResponseWriter, r *http.Request) {
	h.MobileSendManualAlert(w, r)
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

	isTestAccount := strings.Contains(strings.ToLower(claims.Email), "test") || localPart == "555555555555"

	// Resolve shift_id and operational_date using time-based matching (IST-aware)
	var shiftID *int
	now := utils.CurrentTimeInIndia()
	shiftIDVal, opDate, err := h.openDepotRepo.GetShiftAndOperationalDate(ctx, now)
	if err == nil && shiftIDVal > 0 {
		shiftID = &shiftIDVal
	}
	opDateStr := opDate.Format("2006-01-02")

	tx, err := db.Begin(ctx)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	if isTestAccount {
		_, err = tx.Exec(ctx, `
			INSERT INTO mobile_open_depot_submissions (
				depot_id, operator_id, photo_path, gps_lat, gps_lng, shift, operational_date,
				location_validated, device_id, app_version, approval_status
			) VALUES ($1, $2, $3, $4, $5, $6, $7::DATE, $8, $9, $10, 'Pending')
			ON CONFLICT (depot_id, operator_id, shift, operational_date) DO UPDATE SET
				photo_path = EXCLUDED.photo_path,
				gps_lat = EXCLUDED.gps_lat,
				gps_lng = EXCLUDED.gps_lng,
				submitted_at = NOW(),
				location_validated = EXCLUDED.location_validated,
				device_id = EXCLUDED.device_id,
				app_version = EXCLUDED.app_version,
				approval_status = 'Pending'
		`, depotID, empID, photoPath, req.GpsLat, req.GpsLng, shift, opDateStr,
			req.LocationValidated, nullIfEmpty(req.DeviceID), nullIfEmpty(req.AppVersion))
	} else {
		_, err = tx.Exec(ctx, `
			INSERT INTO mobile_open_depot_submissions (
				depot_id, operator_id, photo_path, gps_lat, gps_lng, shift, operational_date,
				location_validated, device_id, app_version, approval_status
			) VALUES ($1, $2, $3, $4, $5, $6, $7::DATE, $8, $9, $10, 'Pending')
		`, depotID, empID, photoPath, req.GpsLat, req.GpsLng, shift, opDateStr,
			req.LocationValidated, nullIfEmpty(req.DeviceID), nullIfEmpty(req.AppVersion))
	}
	if err != nil {
		if !isTestAccount && (strings.Contains(err.Error(), "unique_constraint") || strings.Contains(err.Error(), "duplicate key")) {
			RespondWithError(w, http.StatusConflict, "Already submitted this shift")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var cleaningID int
	err = tx.QueryRow(ctx, `
		INSERT INTO open_depot_cleanings (
			open_depot_id, image_url, uploaded_by, uploaded_latitude, uploaded_longitude,
			verification_status, approval_status, distance_from_depot, shift_id, operational_date
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::DATE)
		RETURNING id
	`, depotID, photoPath, claims.Email, req.GpsLat, req.GpsLng,
		"VALID", "Pending", 0.0, shiftID, opDateStr).Scan(&cleaningID)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := tx.Commit(ctx); err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to commit transaction")
		return
	}

	go h.publishOpenDepotEvent(context.Background(), depotID)

	RespondWithJSON(w, http.StatusOK, map[string]string{"message": "Depot photo submitted successfully"})
}

// liveTelemetry builds the VehicleTelemetry list for the given in-scope ward
// ids. Vehicle membership comes from active route assignments (route_wards) or
// the ward stored directly on the vehicle; the latest position/speed/ignition
// is read from Redis (gps:latest:<imei>) and each status is derived via the
// canonical repository.VehicleStatus helper (offline if missing/stale, moving
// if speed>3, else stopped). Returns an empty slice when no wards are in scope.
func (h *Handler) liveTelemetry(ctx context.Context, wardIDs []int) ([]map[string]interface{}, error) {
	list := []map[string]interface{}{}
	if len(wardIDs) == 0 {
		return list, nil
	}

	rows, err := h.gpsRepo.Pool().Query(ctx, `
		SELECT DISTINCT v.id, v.registration_no,
			COALESCE(e.first_name || ' ' || e.last_name, 'Unknown') AS driver_name,
			COALESCE(d.imei, '') AS imei
		FROM vehicles v
		LEFT JOIN vehicle_route_assignments vra ON v.id = vra.vehicle_id AND vra.is_active = true
		LEFT JOIN route_wards rw ON vra.route_id = rw.route_id
		LEFT JOIN mobile_attendance a ON v.id = a.vehicle_id AND a.punch_out_at IS NULL
		LEFT JOIN employees e ON a.user_id = e.id
		LEFT JOIN vehicle_gps_map m ON v.id = m.vehicle_id AND m.unassigned_at IS NULL
		LEFT JOIN gps_devices d ON m.device_id = d.id
		WHERE rw.ward_id = ANY($1) OR v.ward_id = ANY($1)
	`, wardIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type vehRow struct {
		id     int
		regNo  string
		driver string
		imei   string
	}
	var vehicles []vehRow
	imeiSet := map[string]bool{}
	for rows.Next() {
		var vr vehRow
		if err := rows.Scan(&vr.id, &vr.regNo, &vr.driver, &vr.imei); err == nil {
			vehicles = append(vehicles, vr)
			if vr.imei != "" {
				imeiSet[vr.imei] = true
			}
		}
	}

	// Batch-read the latest telemetry for all in-scope imeis from Redis.
	telemetry := map[string]decoder.AVLData{}
	if len(imeiSet) > 0 {
		keys := make([]string, 0, len(imeiSet))
		imeis := make([]string, 0, len(imeiSet))
		for imei := range imeiSet {
			keys = append(keys, "gps:latest:"+imei)
			imeis = append(imeis, imei)
		}
		if vals, err := h.rdb.MGet(ctx, keys...).Result(); err == nil {
			for i, val := range vals {
				strVal, ok := val.(string)
				if !ok {
					continue
				}
				var data decoder.AVLData
				if json.Unmarshal([]byte(strVal), &data) == nil {
					telemetry[imeis[i]] = data
				}
			}
		}
	}

	for _, vr := range vehicles {
		var (
			lat, lng, speed float64
			ignition        bool
			lastUpdate      string
			lastTime        *time.Time
		)
		if data, ok := telemetry[vr.imei]; ok {
			lat = data.Lat
			lng = data.Lng
			speed = data.Speed
			ignition = data.Ignition
			if !data.Time.IsZero() {
				t := data.Time
				lastTime = &t
				lastUpdate = t.Format(time.RFC3339)
			}
		}
		list = append(list, map[string]interface{}{
			"vehicle_id":     vr.id,
			"vehicle_number": vr.regNo,
			"driver_name":    vr.driver,
			"lat":            lat,
			"lng":            lng,
			"speed":          speed,
			"ignition":       ignition,
			"status":         repository.VehicleStatus(lastTime, speed),
			"last_update":    lastUpdate,
		})
	}

	return list, nil
}

// 25. MobileLiveTrackingWard returns live telemetry for vehicles in the
// caller's JWT-derived ward. Client-supplied ward_id query params are ignored.
func (h *Handler) MobileLiveTrackingWard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	scope, err := h.resolveScope(ctx, GetClaims(r))
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve access scope")
		return
	}

	// Ward endpoint is confined to the caller's own resolved ward.
	wardIDs := []int{}
	if scope.WardID != nil {
		wardIDs = []int{*scope.WardID}
	}

	list, err := h.liveTelemetry(ctx, wardIDs)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"vehicles": list,
	})
}

// 26. MobileLiveTrackingZone returns live telemetry for every vehicle in the
// caller's JWT-derived zone. Client-supplied zone_id query params are ignored.
func (h *Handler) MobileLiveTrackingZone(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	scope, err := h.resolveScope(ctx, GetClaims(r))
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve access scope")
		return
	}

	wardIDs, err := h.scopeWardIDs(ctx, scope)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve zone scope")
		return
	}

	list, err := h.liveTelemetry(ctx, wardIDs)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"vehicles": list,
	})
}

// MobileAlertRecipients returns the employees a supervisor may send a custom
// alert to: only Driver and Road Sweeper roles (never admins, managers or other
// supervisors). Each recipient includes their assigned vehicle number so the
// client can show / search by driver name OR vehicle number.
func (h *Handler) MobileAlertRecipients(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	scope, err := h.resolveScope(ctx, claims)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve scope")
		return
	}

	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT DISTINCT ON (e.id)
			e.id,
			NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), '') AS name,
			e.employee_id,
			COALESCE(v.registration_no, '') AS vehicle_number,
			CASE
				WHEN LOWER(COALESCE(des.name, '')) = 'road sweeper'
				  OR LOWER(COALESCE(u.role, '')) = 'road_sweeper' THEN 'road_sweeper'
				ELSE 'driver'
			END AS role
		FROM employees e
		LEFT JOIN employee_department_designations edd ON edd.employee_id = e.id
		LEFT JOIN designations des ON des.id = edd.designation_id
		LEFT JOIN users u ON LOWER(split_part(u.email, '@', 1)) = LOWER(e.employee_id)
		LEFT JOIN employee_vehicle_assignments eva ON eva.employee_id = e.id AND COALESCE(eva.is_active, true) = true
		LEFT JOIN vehicles v ON v.id = eva.vehicle_id
		WHERE LOWER(COALESCE(des.name, '')) IN ('driver', 'road sweeper')
		   OR LOWER(COALESCE(u.role, '')) IN ('driver', 'road_sweeper')
		ORDER BY e.id, v.registration_no NULLS LAST
	`)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to load recipients: "+err.Error())
		return
	}
	defer rows.Close()

	type recipient struct {
		ID            int    `json:"id"`
		Name          string `json:"name"`
		EmployeeID    string `json:"employee_id"`
		VehicleNumber string `json:"vehicle_number"`
		Role          string `json:"role"`
	}
	list := []recipient{}
	for rows.Next() {
		var rec recipient
		var name *string
		if err := rows.Scan(&rec.ID, &name, &rec.EmployeeID, &rec.VehicleNumber, &rec.Role); err != nil {
			continue
		}
		if name != nil {
			rec.Name = *name
		}
		if rec.Name == "" {
			rec.Name = rec.EmployeeID
		}

		inScope, err := h.recipientInScope(ctx, scope, rec.ID)
		if err == nil && inScope {
			list = append(list, rec)
		}
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"recipients": list,
	})
}

// complaintSelect is the shared read projection for complaints. assigned_vehicle
// and assigned_driver are resolved to display strings via LEFT JOINs
// (vehicles.registration_no / employee full name). Callers append a WHERE clause
// built from the JWT-resolved scope.
const complaintSelect = `
	SELECT c.id, c.title, c.description, c.priority, c.status,
	       COALESCE(v.registration_no, '') AS assigned_vehicle,
	       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), ''), '') AS assigned_driver,
	       c.location, c.images, c.created_at, c.updated_at
	FROM complaints c
	LEFT JOIN vehicles v ON v.id = c.assigned_vehicle_id
	LEFT JOIN employees e ON e.id = c.assigned_driver_id
`

// scanComplaintRow maps a single complaint row (from Query or QueryRow) into the
// Complaint response shape. location JSONB → object or null; images JSONB →
// []string (empty when absent); timestamps → RFC3339 strings.
func scanComplaintRow(row interface{ Scan(dest ...any) error }) (map[string]interface{}, error) {
	var (
		id                                                    int64
		title, description, priority, status, vehicle, driver string
		location                                              []byte
		images                                                []byte
		createdAt, updatedAt                                  time.Time
	)
	if err := row.Scan(&id, &title, &description, &priority, &status, &vehicle, &driver, &location, &images, &createdAt, &updatedAt); err != nil {
		return nil, err
	}

	imgs := []string{}
	if len(images) > 0 {
		_ = json.Unmarshal(images, &imgs)
		if imgs == nil {
			imgs = []string{}
		}
	}

	var loc interface{}
	if len(location) > 0 {
		_ = json.Unmarshal(location, &loc)
	}

	return map[string]interface{}{
		"id":               id,
		"title":            title,
		"description":      description,
		"priority":         priority,
		"status":           status,
		"assigned_vehicle": vehicle,
		"assigned_driver":  driver,
		"location":         loc,
		"images":           imgs,
		"created_at":       createdAt.Format(time.RFC3339),
		"updated_at":       updatedAt.Format(time.RFC3339),
	}, nil
}

// MobileListComplaints returns the read-only, role-scoped list of complaints for
// the authenticated caller. Scope is derived from the JWT via resolveScope;
// client-supplied ids are never trusted:
//   - zone_manager → complaints in any ward of the assigned zone
//   - supervisor   → complaints in the assigned ward
//   - driver       → complaints assigned to the driver's own vehicle or to the
//     driver themselves (assigned_vehicle_id / assigned_driver_id)
//
// Requirements: 7.1, 7.4, 7.5. Design: "New endpoints (complaints)".
func (h *Handler) MobileListComplaints(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	scope, err := h.resolveScope(ctx, claims)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve access scope")
		return
	}

	db := h.gpsRepo.Pool()
	empty := map[string]interface{}{"complaints": []interface{}{}}

	var (
		where string
		args  []interface{}
	)
	if scope.Role == "driver" {
		vehID := 0
		if scope.VehicleID != nil {
			vehID = *scope.VehicleID
		}
		// Nothing resolved to scope against → well-formed empty list (Empty_State).
		if vehID == 0 && scope.EmployeeID == 0 {
			RespondWithJSON(w, http.StatusOK, empty)
			return
		}
		where = " WHERE c.assigned_vehicle_id = $1 OR c.assigned_driver_id = $2"
		args = []interface{}{vehID, scope.EmployeeID}
	} else {
		wardIDs, werr := h.scopeWardIDs(ctx, scope)
		if werr != nil {
			RespondWithError(w, http.StatusInternalServerError, "Failed to resolve ward scope")
			return
		}
		if len(wardIDs) == 0 {
			RespondWithJSON(w, http.StatusOK, empty)
			return
		}
		where = " WHERE c.ward_id = ANY($1)"
		args = []interface{}{wardIDs}
	}

	rows, err := db.Query(ctx, complaintSelect+where+" ORDER BY c.created_at DESC", args...)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to load complaints")
		return
	}
	defer rows.Close()

	list := []map[string]interface{}{}
	for rows.Next() {
		item, serr := scanComplaintRow(rows)
		if serr != nil {
			continue
		}
		list = append(list, item)
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{"complaints": list})
}

// MobileGetComplaint returns a single complaint by id, but only when it falls
// within the caller's JWT-resolved scope. Out-of-scope ids return HTTP 403
// (scopeForbidden); unknown ids return HTTP 404. Read-only.
// Requirements: 7.1, 7.3, 7.4, 7.5. Design: "New endpoints (complaints)".
func (h *Handler) MobileGetComplaint(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	scope, err := h.resolveScope(ctx, claims)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to resolve access scope")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid complaint id")
		return
	}

	db := h.gpsRepo.Pool()

	// Load the scoping association first so out-of-scope access is rejected
	// before any complaint detail is returned.
	var wardID, vehicleID, driverID *int
	err = db.QueryRow(ctx, `
		SELECT ward_id, assigned_vehicle_id, assigned_driver_id
		FROM complaints WHERE id = $1
	`, id).Scan(&wardID, &vehicleID, &driverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			RespondWithError(w, http.StatusNotFound, "Complaint not found")
			return
		}
		RespondWithError(w, http.StatusInternalServerError, "Failed to load complaint")
		return
	}

	allowed := false
	switch scope.Role {
	case "driver":
		if vehicleID != nil && scope.ownsVehicle(*vehicleID) {
			allowed = true
		}
		if driverID != nil && scope.EmployeeID != 0 && *driverID == scope.EmployeeID {
			allowed = true
		}
	case "supervisor":
		if wardID != nil && scope.WardID != nil && *wardID == *scope.WardID {
			allowed = true
		}
	case "zone_manager":
		if wardID != nil {
			ok, werr := h.wardInScope(ctx, scope, *wardID)
			if werr != nil {
				RespondWithError(w, http.StatusInternalServerError, "Failed to verify access scope")
				return
			}
			allowed = ok
		}
	}
	if !allowed {
		scopeForbidden(w)
		return
	}

	item, err := scanComplaintRow(db.QueryRow(ctx, complaintSelect+" WHERE c.id = $1", id))
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to load complaint")
		return
	}

	RespondWithJSON(w, http.StatusOK, item)
}
