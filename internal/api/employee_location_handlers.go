package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// MobileSubmitLocation stores a periodic GPS ping from the mobile app.
// POST /api/mobile/location
// Body: { "lat": 26.9123, "lng": 75.7872 }
func (h *Handler) MobileSubmitLocation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetClaims(r)
	if claims == nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	localPart := claims.Email
	if i := strings.Index(localPart, "@"); i >= 0 {
		localPart = localPart[:i]
	}

	var empID int
	err := h.gpsRepo.Pool().QueryRow(ctx, `
		SELECT id FROM employees
		WHERE employee_id = $1 OR contact_no = $1
		LIMIT 1
	`, localPart).Scan(&empID)
	if err != nil {
		RespondWithJSON(w, http.StatusOK, map[string]interface{}{"success": true})
		return
	}

	var body struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	_, err = h.gpsRepo.Pool().Exec(ctx, `
		INSERT INTO employee_live_locations (employee_id, lat, lng, captured_at)
		VALUES ($1, $2, $3, NOW())
	`, empID, body.Lat, body.Lng)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to store location")
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// GetEmployeeLocations returns the latest location ping for each employee active
// within the last 5 minutes, along with their profile info.
// GET /api/employee-locations
func (h *Handler) GetEmployeeLocations(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT DISTINCT ON (ell.employee_id)
			ell.employee_id,
			ell.lat,
			ell.lng,
			ell.captured_at,
			e.first_name,
			e.middle_name,
			e.last_name,
			e.employee_id,
			e.contact_no,
			COALESCE(edd.designation_id, 0) AS designation_id,
			COALESCE(d.name, '') AS designation_name,
			COALESCE(edd.department_id, 0) AS department_id,
			COALESCE(dept.name, '') AS department_name,
			COALESCE(edd.region_id, 0) AS region_id
		FROM employee_live_locations ell
		JOIN employees e ON e.id = ell.employee_id
		LEFT JOIN employee_department_designations edd ON edd.employee_id = ell.employee_id
		LEFT JOIN designations d ON d.id = edd.designation_id
		LEFT JOIN departments dept ON dept.id = edd.department_id
		WHERE ell.captured_at > NOW() - INTERVAL '5 minutes'
		ORDER BY ell.employee_id, ell.captured_at DESC
	`)
	if err != nil {
		RespondWithJSON(w, http.StatusOK, []interface{}{})
		return
	}
	defer rows.Close()

	list := []map[string]interface{}{}
	for rows.Next() {
		var (
			empID, desigID, deptID, regionID int
			lat, lng                         float64
			capturedAt                       time.Time
			firstName, lastName, empCode, contactNo string
			middleName, desigName, deptName        string
		)
		if err := rows.Scan(
			&empID, &lat, &lng, &capturedAt,
			&firstName, &middleName, &lastName,
			&empCode, &contactNo,
			&desigID, &desigName,
			&deptID, &deptName,
			&regionID,
		); err != nil {
			continue
		}

		fullName := firstName
		if middleName != "" {
			fullName += " " + middleName
		}
		fullName += " " + lastName

		status := "Online"
		if time.Since(capturedAt) > 2*time.Minute {
			status = "Offline"
		}

		list = append(list, map[string]interface{}{
			"employee_id":      empID,
			"name":             fullName,
			"employee_code":    empCode,
			"contact_no":       contactNo,
			"lat":              lat,
			"lng":              lng,
			"captured_at":      capturedAt.Format(time.RFC3339),
			"status":           status,
			"designation_id":   desigID,
			"designation_name": desigName,
			"department_id":    deptID,
			"department_name":  deptName,
			"region_id":        regionID,
		})
	}

	RespondWithJSON(w, http.StatusOK, list)
}
