package api

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"
)

// Helper to get employee ID from email in JWT claims
func (h *Handler) getEmployeeIDFromClaims(r *http.Request) (int, string, error) {
	claims := GetClaims(r)
	if claims == nil {
		return 0, "", fmt.Errorf("unauthorized")
	}

	localPart := claims.Email
	if idx := strings.Index(localPart, "@"); idx >= 0 {
		localPart = localPart[:idx]
	}

	var empID int
	err := h.gpsRepo.Pool().QueryRow(r.Context(), `
		SELECT id FROM employees
		WHERE employee_id = $1 OR contact_no = $1
		LIMIT 1
	`, localPart).Scan(&empID)
	if err != nil {
		return 0, claims.Role, fmt.Errorf("employee not found for identifier: %s", localPart)
	}

	return empID, claims.Role, nil
}

// Helper to calculate outstanding on-demand
func calculateOutstandingPaisa(registrationDate time.Time, monthlyChargePaisa int, totalPaidPaisa int) int {
	now := time.Now()
	monthsElapsed := (now.Year()-registrationDate.Year())*12 + int(now.Month()) - int(registrationDate.Month()) + 1
	if monthsElapsed < 1 {
		monthsElapsed = 1
	}
	totalExpected := monthsElapsed * monthlyChargePaisa
	outstanding := totalExpected - totalPaidPaisa
	if outstanding < 0 {
		return 0
	}
	return outstanding
}

// 1. Get Mobile/Web Form Config
// GET /api/mobile/rfid/form-config
// GET /api/rfid/form-config
func (h *Handler) GetSurveyFormConfig(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT field_key, label, field_type, options, is_required, display_order, section, placeholder, helper_text, validation_regex
		FROM rfid_survey_form_config
		WHERE is_active = true
		ORDER BY section, display_order ASC
	`)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to fetch form config: "+err.Error())
		return
	}
	defer rows.Close()

	type FieldConfig struct {
		FieldKey        string      `json:"field_key"`
		Label           string      `json:"label"`
		FieldType       string      `json:"field_type"`
		Options         interface{} `json:"options"`
		IsRequired      bool        `json:"is_required"`
		DisplayOrder    int         `json:"display_order"`
		Section         string      `json:"section"`
		Placeholder     *string     `json:"placeholder"`
		HelperText      *string     `json:"helper_text"`
		ValidationRegex *string     `json:"validation_regex"`
	}

	var configs []FieldConfig
	for rows.Next() {
		var fc FieldConfig
		var optionsJSON []byte
		err := rows.Scan(&fc.FieldKey, &fc.Label, &fc.FieldType, &optionsJSON, &fc.IsRequired, &fc.DisplayOrder, &fc.Section, &fc.Placeholder, &fc.HelperText, &fc.ValidationRegex)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, "Error scanning field config: "+err.Error())
			return
		}

		if len(optionsJSON) > 0 {
			var parsedOptions interface{}
			if err := json.Unmarshal(optionsJSON, &parsedOptions); err == nil {
				fc.Options = parsedOptions
			}
		}
		configs = append(configs, fc)
	}

	RespondWithJSON(w, http.StatusOK, configs)
}

// 2. Scan / Lookup RFID ID
// POST /api/mobile/rfid/scan
func (h *Handler) MobileScanRFID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	empID, role, err := h.getEmployeeIDFromClaims(r)
	if err != nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized: "+err.Error())
		return
	}

	var body struct {
		RfidID      string   `json:"rfid_id"`
		ScanMethod  string   `json:"scan_method"`  // camera|manual_entry|hardware
		ScanPurpose string   `json:"scan_purpose"` // registration|coverage|payment|lookup
		Latitude    *float64 `json:"latitude"`
		Longitude   *float64 `json:"longitude"`
		Accuracy    *float64 `json:"accuracy"`
		Altitude    *float64 `json:"altitude"`
		Heading     *float64 `json:"heading"`
		Speed       *float64 `json:"speed"`
		DeviceID    string   `json:"device_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RfidID == "" {
		RespondWithError(w, http.StatusBadRequest, "Invalid request body or missing rfid_id")
		return
	}

	body.RfidID = strings.TrimSpace(body.RfidID)
	if body.ScanMethod == "" {
		body.ScanMethod = "camera"
	}
	if body.ScanPurpose == "" {
		body.ScanPurpose = "lookup"
	}

	// Lookup if exists
	var property struct {
		ID                 int       `json:"id"`
		RfidID             string    `json:"rfid_id"`
		RegistrationStatus string    `json:"registration_status"`
		OwnerFirstName     string    `json:"owner_first_name"`
		OwnerLastName      string    `json:"owner_last_name"`
		Address            string    `json:"address"`
		RegistrationDate   time.Time `json:"registration_date"`
		MonthlyChargePaisa int       `json:"monthly_charge_paisa"`
		WardName           string    `json:"ward_name"`
		ZoneName           string    `json:"zone_name"`
		PhotoPath          string    `json:"photo_path"`
	}

	var propID *int
	var scanResult string

	query := `
		SELECT id, rfid_id, registration_status, owner_first_name, owner_last_name, address, registration_date, monthly_charge_paisa, COALESCE(ward_name, ''), COALESCE(zone_name, ''), COALESCE(photo_path, '')
		FROM rfid_properties
		WHERE rfid_id = $1 AND registration_status != 'deleted'
		LIMIT 1
	`
	err = db.QueryRow(ctx, query, body.RfidID).Scan(
		&property.ID, &property.RfidID, &property.RegistrationStatus,
		&property.OwnerFirstName, &property.OwnerLastName, &property.Address,
		&property.RegistrationDate, &property.MonthlyChargePaisa,
		&property.WardName, &property.ZoneName, &property.PhotoPath,
	)

	if err == pgx.ErrNoRows {
		scanResult = "not_found"
	} else if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Database lookup failed: "+err.Error())
		return
	} else {
		scanResult = "found"
		propID = &property.ID
	}

	// Insert into scan audit log
	_, logErr := db.Exec(ctx, `
		INSERT INTO rfid_scan_log
			(rfid_id, property_id, scanned_by, role, scan_method, scan_purpose, scan_result, latitude, longitude, accuracy, altitude, heading, speed, device_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	`, body.RfidID, propID, empID, role, body.ScanMethod, body.ScanPurpose, scanResult, body.Latitude, body.Longitude, body.Accuracy, body.Altitude, body.Heading, body.Speed, body.DeviceID)
	if logErr != nil {
		log.Error().Err(logErr).Msg("Failed to write to rfid_scan_log")
	}

	if scanResult == "not_found" {
		RespondWithJSON(w, http.StatusOK, map[string]interface{}{
			"exists":  false,
			"rfid_id": body.RfidID,
		})
		return
	}

	// Calculate live payment outstanding
	var totalPaidPaisa int
	_ = db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_paid), 0)
		FROM rfid_payment_transactions
		WHERE property_id = $1 AND payment_status = 'completed'
	`, property.ID).Scan(&totalPaidPaisa)

	outstandingPaisa := calculateOutstandingPaisa(property.RegistrationDate, property.MonthlyChargePaisa, totalPaidPaisa)

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"exists":            true,
		"property":          property,
		"outstanding_paisa": outstandingPaisa,
	})
}

// 3. Register Property
// POST /api/mobile/rfid/register
func (h *Handler) MobileRegisterProperty(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	empID, role, err := h.getEmployeeIDFromClaims(r)
	if err != nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized: "+err.Error())
		return
	}

	var body struct {
		RfidID             string                 `json:"rfid_id"`
		PropertyStatus     string                 `json:"property_status"`
		PropertyType       string                 `json:"property_type"`
		PropertySubType    string                 `json:"property_sub_type"`
		OwnerFirstName     string                 `json:"owner_first_name"`
		OwnerMiddleName    string                 `json:"owner_middle_name"`
		OwnerLastName      string                 `json:"owner_last_name"`
		MobileNumber       string                 `json:"mobile_number"`
		Email              string                 `json:"email"`
		Address            string                 `json:"address"`
		Landmark           string                 `json:"landmark"`
		HouseNo            string                 `json:"house_no"`
		Floor              string                 `json:"floor"`
		NumFlats           int                    `json:"num_flats"`
		NumFloors          int                    `json:"num_floors"`
		FamilyMembers      int                    `json:"family_members"`
		PinCode            string                 `json:"pin_code"`
		Aadhaar            string                 `json:"aadhaar"`
		ZoneID             *int                   `json:"zone_id"`
		WardID             *int                   `json:"ward_id"`
		Area               string                 `json:"area"`
		ColonyName         string                 `json:"colony_name"`
		PlotNo             string                 `json:"plot_no"`
		Latitude           *float64               `json:"latitude"`
		Longitude          *float64               `json:"longitude"`
		GpsAccuracy        *float64               `json:"gps_accuracy"`
		GpsAltitude        *float64               `json:"gps_altitude"`
		GpsHeading         *float64               `json:"gps_heading"`
		GpsSpeed           *float64               `json:"gps_speed"`
		GpsDeviceID        string                 `json:"gps_device_id"`
		PhotoPath          string                 `json:"photo_path"`
		MonthlyChargePaisa int                    `json:"monthly_charge_paisa"`
		BinType            string                 `json:"bin_type"`
		WasteCategory      string                 `json:"waste_category"`
		Remarks            string                 `json:"remarks"`
		FormData           map[string]interface{} `json:"form_data"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	body.RfidID = strings.TrimSpace(body.RfidID)
	if body.RfidID == "" {
		RespondWithError(w, http.StatusBadRequest, "RFID ID is required")
		return
	}

	// Verify RFID ID uniqueness permanently
	var count int
	err = db.QueryRow(ctx, "SELECT COUNT(*) FROM rfid_properties WHERE rfid_id = $1", body.RfidID).Scan(&count)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "DB error: "+err.Error())
		return
	}
	if count > 0 {
		RespondWithError(w, http.StatusConflict, "This RFID Tag is already registered to a property")
		return
	}

	// Get region names if IDs provided
	var zoneName, wardName string
	if body.ZoneID != nil {
		_ = db.QueryRow(ctx, "SELECT region_name FROM regions WHERE id = $1", *body.ZoneID).Scan(&zoneName)
	}
	if body.WardID != nil {
		_ = db.QueryRow(ctx, "SELECT region_name FROM regions WHERE id = $1", *body.WardID).Scan(&wardName)
	}

	formDataJSON, _ := json.Marshal(body.FormData)

	// Save base64 photo to file if provided
	var photoPath string
	if body.PhotoPath != "" {
		var imgErr error
		photoPath, imgErr = saveBase64Image(body.PhotoPath, "rfid_property")
		if imgErr != nil {
			RespondWithError(w, http.StatusBadRequest, "Failed to save property image: "+imgErr.Error())
			return
		}
	}

	// Insert into properties (Auto-approve as status 'approved' initially per design)
	var propID int
	query := `
		INSERT INTO rfid_properties (
			rfid_id, registration_status, registered_by_id, registered_by_role, registration_date,
			approved_by_id, approved_at,
			property_status, property_type, property_sub_type, owner_first_name, owner_middle_name, owner_last_name,
			mobile_number, email, address, landmark, house_no, floor, num_flats, num_floors, family_members, pin_code, aadhaar,
			zone_id, ward_id, area, colony_name, plot_no, zone_name, ward_name,
			latitude, longitude, gps_accuracy, gps_altitude, gps_heading, gps_speed, gps_timestamp, gps_device_id,
			photo_path, monthly_charge_paisa, bin_type, waste_category, remarks, form_data
		) VALUES (
			$1, 'approved', $2, $3, CURRENT_DATE,
			$2, NOW(),
			$4, $5, $6, $7, $8, $9,
			$10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
			$21, $22, $23, $24, $25, $26, $27,
			$28, $29, $30, $31, $32, $33, NOW(), $34,
			$35, $36, $37, $38, $39, $40
		) RETURNING id
	`
	err = db.QueryRow(ctx, query,
		body.RfidID, empID, role,
		body.PropertyStatus, body.PropertyType, body.PropertySubType, body.OwnerFirstName, body.OwnerMiddleName, body.OwnerLastName,
		body.MobileNumber, body.Email, body.Address, body.Landmark, body.HouseNo, body.Floor, body.NumFlats, body.NumFloors, body.FamilyMembers, body.PinCode, body.Aadhaar,
		body.ZoneID, body.WardID, body.Area, body.ColonyName, body.PlotNo, zoneName, wardName,
		body.Latitude, body.Longitude, body.GpsAccuracy, body.GpsAltitude, body.GpsHeading, body.GpsSpeed, body.GpsDeviceID,
		photoPath, body.MonthlyChargePaisa, body.BinType, body.WasteCategory, body.Remarks, formDataJSON,
	).Scan(&propID)

	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to register property: "+err.Error())
		return
	}

	// Insert primary property image if photo path provided
	if photoPath != "" {
		_, imgErr := db.Exec(ctx, `
			INSERT INTO rfid_property_images
				(property_id, photo_path, is_primary, captured_by, latitude, longitude, accuracy, altitude, heading, speed, gps_timestamp, device_id)
			VALUES ($1, $2, true, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
		`, propID, photoPath, empID, body.Latitude, body.Longitude, body.GpsAccuracy, body.GpsAltitude, body.GpsHeading, body.GpsSpeed, body.GpsDeviceID)
		if imgErr != nil {
			log.Error().Err(imgErr).Msg("Failed to insert property image record")
		}
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"property_id": propID,
	})
}

// 4. Record Manual Coverage
// POST /api/mobile/rfid/coverage
func (h *Handler) MobileRecordCoverage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	empID, _, err := h.getEmployeeIDFromClaims(r)
	if err != nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized: "+err.Error())
		return
	}

	var body struct {
		RfidID    string   `json:"rfid_id"`
		Latitude  *float64 `json:"latitude"`
		Longitude *float64 `json:"longitude"`
		Accuracy  *float64 `json:"accuracy"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RfidID == "" {
		RespondWithError(w, http.StatusBadRequest, "Missing or invalid payload")
		return
	}

	// Resolve property from RFID ID
	var prop struct {
		ID        int
		Latitude  *float64
		Longitude *float64
	}
	err = db.QueryRow(ctx, `
		SELECT id, latitude, longitude FROM rfid_properties
		WHERE rfid_id = $1 AND registration_status = 'approved'
		LIMIT 1
	`, body.RfidID).Scan(&prop.ID, &prop.Latitude, &prop.Longitude)
	if err == pgx.ErrNoRows {
		RespondWithError(w, http.StatusNotFound, "Property not found or not approved")
		return
	} else if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "DB error: "+err.Error())
		return
	}

	// Calculate distance from property coordinates
	var distanceM *float64
	if prop.Latitude != nil && prop.Longitude != nil && body.Latitude != nil && body.Longitude != nil {
		// Quick Haversine distance
		lat1 := *body.Latitude * math.Pi / 180
		lng1 := *body.Longitude * math.Pi / 180
		lat2 := *prop.Latitude * math.Pi / 180
		lng2 := *prop.Longitude * math.Pi / 180
		dlat := lat2 - lat1
		dlng := lng2 - lng1
		a := math.Sin(dlat/2)*math.Sin(dlat/2) + math.Cos(lat1)*math.Cos(lat2)*math.Sin(dlng/2)*math.Sin(dlng/2)
		c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
		dist := 6371000 * c // in metres
		distanceM = &dist
	}

	// Get active driver's vehicle ID
	var vehicleID *int
	_ = db.QueryRow(ctx, `
		SELECT vehicle_id FROM employee_vehicle_assignments
		WHERE employee_id = $1
		LIMIT 1
	`, empID).Scan(&vehicleID)

	// Write manual rfid coverage log
	_, err = db.Exec(ctx, `
		INSERT INTO rfid_coverage_log (property_id, coverage_date, coverage_type, driver_id, vehicle_id, latitude, longitude, accuracy, distance_m)
		VALUES ($1, CURRENT_DATE, 'manual_rfid', $2, $3, $4, $5, $6, $7)
		ON CONFLICT DO NOTHING
	`, prop.ID, empID, vehicleID, body.Latitude, body.Longitude, body.Accuracy, distanceM)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to record coverage: "+err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// 5. Collect Payment (with partial payment support)
// POST /api/mobile/rfid/payment
func (h *Handler) MobileCollectPayment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	empID, role, err := h.getEmployeeIDFromClaims(r)
	if err != nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized: "+err.Error())
		return
	}

	var body struct {
		PropertyID       int    `json:"property_id"`
		AmountPaidPaisa  int    `json:"amount_paid_paisa"`
		PaymentSource    string `json:"payment_source"` // cash|pos|online|waiver
		Remarks          string `json:"remarks"`
		CollectionDevice string `json:"collection_device"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.PropertyID == 0 || body.AmountPaidPaisa <= 0 {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload or zero payment amount")
		return
	}

	// Fetch property to compute live outstanding BEFORE this transaction
	var prop struct {
		RegistrationDate   time.Time
		MonthlyChargePaisa int
	}
	err = db.QueryRow(ctx, `
		SELECT registration_date, monthly_charge_paisa FROM rfid_properties
		WHERE id = $1 AND registration_status = 'approved'
	`, body.PropertyID).Scan(&prop.RegistrationDate, &prop.MonthlyChargePaisa)
	if err == pgx.ErrNoRows {
		RespondWithError(w, http.StatusNotFound, "Property not found or not approved")
		return
	} else if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "DB error: "+err.Error())
		return
	}

	// Calculate total amount paid historically
	var totalPaidPaisa int
	_ = db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_paid), 0)
		FROM rfid_payment_transactions
		WHERE property_id = $1 AND payment_status = 'completed'
	`, body.PropertyID).Scan(&totalPaidPaisa)

	dueBefore := calculateOutstandingPaisa(prop.RegistrationDate, prop.MonthlyChargePaisa, totalPaidPaisa)
	if dueBefore <= 0 {
		RespondWithError(w, http.StatusBadRequest, "No payment outstanding for this property")
		return
	}

	// Cap payment to outstanding
	if body.AmountPaidPaisa > dueBefore {
		body.AmountPaidPaisa = dueBefore
	}

	remaining := dueBefore - body.AmountPaidPaisa
	receiptNo := fmt.Sprintf("RCP-%s-%05d", time.Now().Format("20060102"), rand.Intn(99999))
	now := time.Now()

	_, err = db.Exec(ctx, `
		INSERT INTO rfid_payment_transactions (
			property_id, amount_due_before, amount_paid, remaining_amount,
			payment_month, payment_year, payment_source, payment_status,
			collected_by_id, collected_by_role, collection_device, receipt_number, remarks
		) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $9, $10, $11, $12)
	`, body.PropertyID, dueBefore, body.AmountPaidPaisa, remaining, int(now.Month()), now.Year(), body.PaymentSource, empID, role, body.CollectionDevice, receiptNo, body.Remarks)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to record payment transaction: "+err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"success":        true,
		"receipt_number": receiptNo,
		"remaining":      remaining,
	})
}

// 6. Payment History for property
// GET /api/mobile/rfid/payment/history/{property_id}
func (h *Handler) MobilePaymentHistory(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	propID, err := strconv.Atoi(chi.URLParam(r, "property_id"))
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid property ID")
		return
	}

	rows, err := db.Query(ctx, `
		SELECT receipt_number, amount_paid, remaining_amount, payment_month, payment_year, payment_source, collected_at
		FROM rfid_payment_transactions
		WHERE property_id = $1 AND payment_status = 'completed'
		ORDER BY collected_at DESC
	`, propID)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to query payment history: "+err.Error())
		return
	}
	defer rows.Close()

	type HistoryItem struct {
		ReceiptNumber   string    `json:"receipt_number"`
		AmountPaidPaisa int       `json:"amount_paid_paisa"`
		RemainingPaisa  int       `json:"remaining_paisa"`
		PaymentMonth    int       `json:"payment_month"`
		PaymentYear     int       `json:"payment_year"`
		PaymentSource   string    `json:"payment_source"`
		CollectedAt     time.Time `json:"collected_at"`
	}

	var history []HistoryItem
	for rows.Next() {
		var item HistoryItem
		if err := rows.Scan(&item.ReceiptNumber, &item.AmountPaidPaisa, &item.RemainingPaisa, &item.PaymentMonth, &item.PaymentYear, &item.PaymentSource, &item.CollectedAt); err == nil {
			history = append(history, item)
		}
	}

	RespondWithJSON(w, http.StatusOK, history)
}

// 7. Sync Offline Queue Batch
// POST /api/mobile/rfid/sync
func (h *Handler) MobileSyncQueue(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	empID, _, err := h.getEmployeeIDFromClaims(r)
	if err != nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized: "+err.Error())
		return
	}

	var req struct {
		DeviceID string `json:"device_id"`
		Queue    []struct {
			LocalUUID string          `json:"local_uuid"`
			Action    string          `json:"action_type"` // registration|coverage|payment|scan_log
			Payload   json.RawMessage `json:"payload"`
			Timestamp time.Time       `json:"created_at_device"`
		} `json:"queue"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid sync request body")
		return
	}

	type SyncResult struct {
		LocalUUID string `json:"local_uuid"`
		Synced    bool   `json:"synced"`
		Error     string `json:"error,omitempty"`
	}

	var results []SyncResult

	for _, item := range req.Queue {
		// Idempotency: Check if already processed
		var existsStatus string
		err := db.QueryRow(ctx, "SELECT sync_status FROM rfid_sync_queue WHERE local_uuid = $1", item.LocalUUID).Scan(&existsStatus)
		if err == nil {
			results = append(results, SyncResult{LocalUUID: item.LocalUUID, Synced: existsStatus == "processed"})
			continue
		}

		// Insert into sync queue
		_, _ = db.Exec(ctx, `
			INSERT INTO rfid_sync_queue (device_id, employee_id, action_type, payload, local_uuid, created_at_device)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, req.DeviceID, empID, item.Action, item.Payload, item.LocalUUID, item.Timestamp)

		// Process immediately
		var processErr error
		if item.Action == "coverage" {
			var cov struct {
				RfidID    string   `json:"rfid_id"`
				Latitude  *float64 `json:"latitude"`
				Longitude *float64 `json:"longitude"`
				Accuracy  *float64 `json:"accuracy"`
			}
			if json.Unmarshal(item.Payload, &cov) == nil {
				var propID int
				err := db.QueryRow(ctx, "SELECT id FROM rfid_properties WHERE rfid_id = $1", cov.RfidID).Scan(&propID)
				if err == nil {
					var vehicleID *int
					_ = db.QueryRow(ctx, "SELECT vehicle_id FROM employee_vehicle_assignments WHERE employee_id = $1 LIMIT 1", empID).Scan(&vehicleID)
					_, processErr = db.Exec(ctx, `
						INSERT INTO rfid_coverage_log (property_id, coverage_date, coverage_type, driver_id, vehicle_id, latitude, longitude, accuracy, covered_at)
						VALUES ($1, $2, 'manual_rfid', $3, $4, $5, $6, $7, $8)
						ON CONFLICT DO NOTHING
					`, propID, item.Timestamp.Format("2006-01-02"), empID, vehicleID, cov.Latitude, cov.Longitude, cov.Accuracy, item.Timestamp)
				} else {
					processErr = err
				}
			}
		} else if item.Action == "scan_log" {
			var scan struct {
				RfidID      string   `json:"rfid_id"`
				ScanMethod  string   `json:"scan_method"`
				ScanPurpose string   `json:"scan_purpose"`
				Latitude    *float64 `json:"latitude"`
				Longitude   *float64 `json:"longitude"`
				Accuracy    *float64 `json:"accuracy"`
			}
			if json.Unmarshal(item.Payload, &scan) == nil {
				var propID *int
				var tempID int
				if db.QueryRow(ctx, "SELECT id FROM rfid_properties WHERE rfid_id = $1", scan.RfidID).Scan(&tempID) == nil {
					propID = &tempID
				}
				_, processErr = db.Exec(ctx, `
					INSERT INTO rfid_scan_log
						(rfid_id, property_id, scanned_by, role, scan_method, scan_purpose, scan_result, latitude, longitude, accuracy, scanned_at)
					VALUES ($1, $2, $3, 'driver', $4, $5, 'synced', $6, $7, $8, $9)
				`, scan.RfidID, propID, empID, scan.ScanMethod, scan.ScanPurpose, scan.Latitude, scan.Longitude, scan.Accuracy, item.Timestamp)
			}
		}

		status := "processed"
		var errorMsg string
		if processErr != nil {
			status = "failed"
			errorMsg = processErr.Error()
		}

		_, _ = db.Exec(ctx, `
			UPDATE rfid_sync_queue
			SET sync_status = $1, error_msg = $2, processed_at = NOW()
			WHERE local_uuid = $3
		`, status, errorMsg, item.LocalUUID)

		results = append(results, SyncResult{LocalUUID: item.LocalUUID, Synced: processErr == nil, Error: errorMsg})
	}

	RespondWithJSON(w, http.StatusOK, results)
}

// 8. List Properties (Web Admin with filters & pagination)
// GET /api/rfid/properties
func (h *Handler) WebListProperties(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	page, pageSize := parsePagination(r)
	offset := (page - 1) * pageSize

	// Filters
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	rfid := strings.TrimSpace(r.URL.Query().Get("rfid"))
	zone := strings.TrimSpace(r.URL.Query().Get("zone_id"))
	ward := strings.TrimSpace(r.URL.Query().Get("ward_id"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))

	whereClauses := []string{"registration_status != 'deleted'"}
	args := []interface{}{}
	argIdx := 1

	if search != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("(owner_first_name ILIKE $%d OR owner_last_name ILIKE $%d OR address ILIKE $%d OR mobile_number ILIKE $%d)", argIdx, argIdx+1, argIdx+2, argIdx+3))
		args = append(args, "%"+search+"%", "%"+search+"%", "%"+search+"%", "%"+search+"%")
		argIdx += 4
	}
	if rfid != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("rfid_id = $%d", argIdx))
		args = append(args, rfid)
		argIdx++
	}
	if zone != "" {
		if zID, err := strconv.Atoi(zone); err == nil {
			whereClauses = append(whereClauses, fmt.Sprintf("zone_id = $%d", argIdx))
			args = append(args, zID)
			argIdx++
		}
	}
	if ward != "" {
		if wID, err := strconv.Atoi(ward); err == nil {
			whereClauses = append(whereClauses, fmt.Sprintf("ward_id = $%d", argIdx))
			args = append(args, wID)
			argIdx++
		}
	}
	if status != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("registration_status = $%d", argIdx))
		args = append(args, status)
		argIdx++
	}

	whereSQL := "WHERE " + strings.Join(whereClauses, " AND ")

	// Total count
	var total int
	err := db.QueryRow(ctx, "SELECT COUNT(*) FROM rfid_properties "+whereSQL, args...).Scan(&total)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to count properties: "+err.Error())
		return
	}

	// Fetch query
	queryArgs := append(args, pageSize, offset)
	query := fmt.Sprintf(`
		SELECT rfid_properties.id, rfid_properties.rfid_id, rfid_properties.registration_status, rfid_properties.owner_first_name, rfid_properties.owner_middle_name, rfid_properties.owner_last_name,
		       rfid_properties.mobile_number, rfid_properties.email, rfid_properties.address, rfid_properties.registration_date, rfid_properties.monthly_charge_paisa,
		       COALESCE(rfid_properties.zone_name, ''), COALESCE(rfid_properties.ward_name, ''), rfid_properties.latitude, rfid_properties.longitude, COALESCE(rfid_properties.photo_path, ''),
		       COALESCE(rfid_properties.property_status, ''), COALESCE(rfid_properties.property_type, ''), COALESCE(rfid_properties.property_sub_type, ''),
		       COALESCE(rfid_properties.floor, ''), COALESCE(rfid_properties.house_no, ''), COALESCE(rfid_properties.num_flats, 1), COALESCE(rfid_properties.pin_code, ''),
		       COALESCE(rfid_properties.landmark, ''), COALESCE(rfid_properties.aadhaar, ''), COALESCE(rfid_properties.area, ''), COALESCE(rfid_properties.colony_name, ''),
		       COALESCE(rfid_properties.plot_no, ''),
		       COALESCE(CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name), 'Supervisor') AS registered_by_name
		FROM rfid_properties
		LEFT JOIN employees e ON e.id = rfid_properties.registered_by_id
		%s
		ORDER BY rfid_properties.id DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argIdx, argIdx+1)

	rows, err := db.Query(ctx, query, queryArgs...)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to fetch properties: "+err.Error())
		return
	}
	defer rows.Close()

	type PropertyWebItem struct {
		ID                 int       `json:"id"`
		RfidID             string    `json:"rfid_id"`
		RegistrationStatus string    `json:"registration_status"`
		OwnerFirstName     string    `json:"owner_first_name"`
		OwnerMiddleName    string    `json:"owner_middle_name"`
		OwnerLastName      string    `json:"owner_last_name"`
		MobileNumber       string    `json:"mobile_number"`
		Email              string    `json:"email"`
		Address            string    `json:"address"`
		RegistrationDate   time.Time `json:"registration_date"`
		MonthlyChargePaisa int       `json:"monthly_charge_paisa"`
		ZoneName           string    `json:"zone_name"`
		WardName           string    `json:"ward_name"`
		Latitude           *float64  `json:"latitude"`
		Longitude          *float64  `json:"longitude"`
		PhotoPath          string    `json:"photo_path"`
		PropertyStatus     string    `json:"property_status"`
		PropertyType       string    `json:"property_type"`
		PropertySubType    string    `json:"property_sub_type"`
		Floor              string    `json:"floor"`
		HouseNo            string    `json:"house_no"`
		NumFlats           int       `json:"num_flats"`
		PinCode            string    `json:"pin_code"`
		Landmark           string    `json:"landmark"`
		Aadhaar            string    `json:"aadhaar"`
		Area               string    `json:"area"`
		ColonyName         string    `json:"colony_name"`
		PlotNo             string    `json:"plot_no"`
		RegisteredByName   string    `json:"registered_by_name"`
	}

	var list []PropertyWebItem
	for rows.Next() {
		var p PropertyWebItem
		err := rows.Scan(
			&p.ID, &p.RfidID, &p.RegistrationStatus, &p.OwnerFirstName, &p.OwnerMiddleName, &p.OwnerLastName,
			&p.MobileNumber, &p.Email, &p.Address, &p.RegistrationDate, &p.MonthlyChargePaisa,
			&p.ZoneName, &p.WardName, &p.Latitude, &p.Longitude, &p.PhotoPath,
			&p.PropertyStatus, &p.PropertyType, &p.PropertySubType,
			&p.Floor, &p.HouseNo, &p.NumFlats, &p.PinCode,
			&p.Landmark, &p.Aadhaar, &p.Area, &p.ColonyName,
			&p.PlotNo, &p.RegisteredByName,
		)
		if err == nil {
			list = append(list, p)
		}
	}

	totalPages := int(math.Ceil(float64(total) / float64(pageSize)))

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"data":        list,
		"total":       total,
		"page":        page,
		"page_size":   pageSize,
		"total_pages": totalPages,
	})
}

// 9. Household Monitoring Map View (live status, Green/Yellow/Red)
// GET /api/rfid/household-monitoring
func (h *Handler) WebHouseholdMonitoring(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT p.id, p.rfid_id, p.owner_first_name, p.owner_last_name, p.address, p.latitude, p.longitude,
		       p.zone_name, p.ward_name, COALESCE(p.photo_path, ''),
		       -- Latest Coverage Today
		       c.covered_at AS last_coverage_time,
		       c.coverage_type AS last_coverage_source,
		       c.driver_id AS last_driver_id,
		       c.vehicle_id AS last_vehicle_id,
		       v.registration_no AS last_vehicle_reg,
		       CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name) AS last_driver_name,
		       -- Yesterday Coverage Check
		       EXISTS(
		         SELECT 1 FROM rfid_coverage_log
		         WHERE property_id = p.id AND coverage_date = CURRENT_DATE - 1
		       ) AS covered_yesterday
		FROM rfid_properties p
		LEFT JOIN LATERAL (
			SELECT covered_at, coverage_type, driver_id, vehicle_id
			FROM rfid_coverage_log
			WHERE property_id = p.id AND coverage_date = CURRENT_DATE
			ORDER BY covered_at DESC
			LIMIT 1
		) c ON true
		LEFT JOIN vehicles v ON c.vehicle_id = v.id
		LEFT JOIN employees e ON c.driver_id = e.id
		WHERE p.registration_status = 'approved' AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
	`)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to fetch household monitoring data: "+err.Error())
		return
	}
	defer rows.Close()

	type MonitorItem struct {
		ID                 int        `json:"id"`
		RfidID             string     `json:"rfid_id"`
		Name               string     `json:"name"`
		Address            string     `json:"address"`
		Latitude           float64    `json:"latitude"`
		Longitude          float64    `json:"longitude"`
		ZoneName           string     `json:"zone_name"`
		WardName           string     `json:"ward_name"`
		PhotoPath          string     `json:"photo_path"`
		LastCoverageTime   *time.Time `json:"last_coverage_time"`
		LastCoverageSource *string    `json:"last_coverage_source"`
		LastVehicleReg     *string    `json:"last_vehicle_reg"`
		LastDriverName     *string    `json:"last_driver_name"`
		Status             string     `json:"status"` // green | yellow | red
	}

	var households []MonitorItem
	for rows.Next() {
		var item MonitorItem
		var fName, lName string
		var coveredYesterday bool
		var lastDriverID, lastVehicleID *int

		err := rows.Scan(
			&item.ID, &item.RfidID, &fName, &lName, &item.Address, &item.Latitude, &item.Longitude,
			&item.ZoneName, &item.WardName, &item.PhotoPath,
			&item.LastCoverageTime, &item.LastCoverageSource, &lastDriverID, &lastVehicleID,
			&item.LastVehicleReg, &item.LastDriverName,
			&coveredYesterday,
		)
		if err != nil {
			// Skip scans with errors, just read next
			continue
		}

		item.Name = strings.TrimSpace(fName + " " + lName)

		if item.LastCoverageTime != nil {
			item.Status = "green"
		} else if coveredYesterday {
			item.Status = "yellow"
		} else {
			item.Status = "red"
		}

		households = append(households, item)
	}

	RespondWithJSON(w, http.StatusOK, households)
}

// 10. RFID Coverage Report
// GET /api/rfid/coverage-report
func (h *Handler) WebCoverageReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	dateStr := r.URL.Query().Get("date")
	if dateStr == "" {
		dateStr = time.Now().Format("2006-01-02")
	}

	query := `
		SELECT c.id, c.coverage_type, c.covered_at, c.distance_m,
		       p.rfid_id, p.owner_first_name, p.owner_last_name, p.address, p.zone_name, p.ward_name,
		       v.registration_no, CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name) AS driver_name
		FROM rfid_coverage_log c
		JOIN rfid_properties p ON c.property_id = p.id
		LEFT JOIN vehicles v ON c.vehicle_id = v.id
		LEFT JOIN employees e ON c.driver_id = e.id
		WHERE c.coverage_date = $1
		ORDER BY c.covered_at DESC
	`
	rows, err := db.Query(ctx, query, dateStr)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to fetch coverage report: "+err.Error())
		return
	}
	defer rows.Close()

	type CoverageReportItem struct {
		ID             int       `json:"id"`
		CoverageType   string    `json:"coverage_type"`
		CoveredAt      time.Time `json:"covered_at"`
		DistanceM      *float64  `json:"distance_m"`
		RfidID         string    `json:"rfid_id"`
		OwnerName      string    `json:"owner_name"`
		Address        string    `json:"address"`
		ZoneName       string    `json:"zone_name"`
		WardName       string    `json:"ward_name"`
		VehicleReg     *string   `json:"vehicle_reg"`
		DriverName     *string   `json:"driver_name"`
	}

	var report []CoverageReportItem
	for rows.Next() {
		var item CoverageReportItem
		var fName, lName string
		err := rows.Scan(&item.ID, &item.CoverageType, &item.CoveredAt, &item.DistanceM,
			&item.RfidID, &fName, &lName, &item.Address, &item.ZoneName, &item.WardName,
			&item.VehicleReg, &item.DriverName)
		if err == nil {
			item.OwnerName = strings.TrimSpace(fName + " " + lName)
			report = append(report, item)
		}
	}

	RespondWithJSON(w, http.StatusOK, report)
}

// 11. Survey / Registration Report (Supervisor Performance)
// GET /api/rfid/survey-report
func (h *Handler) WebSurveyReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	// Aggregates registration numbers by employee (supervisors only)
	query := `
		SELECT e.id, CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name) AS name, e.employee_id, e.contact_no,
		       COUNT(p.id) AS total_installed,
		       COUNT(CASE WHEN p.registration_date = CURRENT_DATE THEN 1 END) AS today_installations,
		       COUNT(CASE WHEN date_trunc('month', p.registration_date) = date_trunc('month', CURRENT_DATE) THEN 1 END) AS monthly_installations,
		       MAX(p.registration_date) AS last_installation_date,
		       COALESCE(esc.zone_name, '') AS assigned_zone,
		       COALESCE(esc.ward_name, '') AS assigned_ward
		FROM employees e
		LEFT JOIN rfid_properties p ON p.registered_by_id = e.id AND p.registration_status = 'approved'
		LEFT JOIN (
			SELECT DISTINCT ON (es.employee_id) es.employee_id,
			       COALESCE(pz.region_name, CASE WHEN r.region_type_id = 2 THEN r.region_name END, '') AS zone_name,
			       COALESCE(CASE WHEN r.region_type_id = 3 THEN r.region_name END, '') AS ward_name
			FROM employee_scopes es
			JOIN regions r ON r.id = es.region_id
			LEFT JOIN regions pz ON pz.id = r.parent_id AND r.region_type_id = 3
			ORDER BY es.employee_id, r.region_type_id DESC
		) esc ON esc.employee_id = e.id
		WHERE e.id IN (
			SELECT edd.employee_id FROM employee_department_designations edd
			JOIN designations d ON d.id = edd.designation_id
			WHERE d.name ILIKE '%supervisor%'
		)
		GROUP BY e.id, e.first_name, e.middle_name, e.last_name, e.employee_id, e.contact_no, esc.zone_name, esc.ward_name
		ORDER BY total_installed DESC
	`
	rows, err := db.Query(ctx, query)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to generate supervisor performance report: "+err.Error())
		return
	}
	defer rows.Close()

	type SupervisorPerf struct {
		ID                   int        `json:"id"`
		Name                 string     `json:"name"`
		EmployeeID           string     `json:"employee_id"`
		MobileNumber         string     `json:"mobile_number"`
		TotalRfidInstalled   int        `json:"total_rfid_installed"`
		TodayInstallations   int        `json:"today_installations"`
		MonthlyInstallations int        `json:"monthly_installations"`
		LastInstallationDate *time.Time `json:"last_installation_date"`
		AssignedZone         string     `json:"assigned_zone"`
		AssignedWard         string     `json:"assigned_ward"`
	}

	var list []SupervisorPerf
	for rows.Next() {
		var s SupervisorPerf
		if err := rows.Scan(&s.ID, &s.Name, &s.EmployeeID, &s.MobileNumber, &s.TotalRfidInstalled, &s.TodayInstallations, &s.MonthlyInstallations, &s.LastInstallationDate, &s.AssignedZone, &s.AssignedWard); err == nil {
			list = append(list, s)
		}
	}

	RespondWithJSON(w, http.StatusOK, list)
}

// 12. Payment & Collection Report
// GET /api/rfid/payment-report
func (h *Handler) WebPaymentReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	// Detailed transactions list
	rows, err := db.Query(ctx, `
		SELECT t.id, t.receipt_number, t.amount_paid, t.payment_month, t.payment_year, t.payment_source, t.collected_at,
		       p.rfid_id, p.owner_first_name, p.owner_last_name, p.address, CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name) AS collector_name
		FROM rfid_payment_transactions t
		JOIN rfid_properties p ON t.property_id = p.id
		LEFT JOIN employees e ON t.collected_by_id = e.id
		WHERE t.payment_status = 'completed'
		ORDER BY t.collected_at DESC
		LIMIT 500
	`)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to fetch payment list: "+err.Error())
		return
	}
	defer rows.Close()

	type PaymentWebItem struct {
		ID            int       `json:"id"`
		ReceiptNumber string    `json:"receipt_number"`
		AmountPaid    float64   `json:"amount_paid"` // in Rupee
		Month         int       `json:"month"`
		Year          int       `json:"year"`
		Source        string    `json:"source"`
		CollectedAt   time.Time `json:"collected_at"`
		RfidID        string    `json:"rfid_id"`
		OwnerName     string    `json:"owner_name"`
		Address       string    `json:"address"`
		CollectorName string    `json:"collector_name"`
	}

	var transactions []PaymentWebItem
	var totalCollectedPaisa int64

	for rows.Next() {
		var t PaymentWebItem
		var fName, lName string
		var amtPaisa int

		err := rows.Scan(&t.ID, &t.ReceiptNumber, &amtPaisa, &t.Month, &t.Year, &t.Source, &t.CollectedAt,
			&t.RfidID, &fName, &lName, &t.Address, &t.CollectorName)
		if err == nil {
			t.AmountPaid = float64(amtPaisa) / 100.0
			t.OwnerName = strings.TrimSpace(fName + " " + lName)
			totalCollectedPaisa += int64(amtPaisa)
			transactions = append(transactions, t)
		}
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"transactions":           transactions,
		"total_collected_rupee":  float64(totalCollectedPaisa) / 100.0,
	})
}

// 13. Property Update (Web and Mobile Admin)
// PUT /api/rfid/properties/{id}
func (h *Handler) WebUpdateProperty(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	propID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid property ID")
		return
	}

	var body struct {
		PropertyStatus     string                 `json:"property_status"`
		PropertyType       string                 `json:"property_type"`
		PropertySubType    string                 `json:"property_sub_type"`
		OwnerFirstName     string                 `json:"owner_first_name"`
		OwnerMiddleName    string                 `json:"owner_middle_name"`
		OwnerLastName      string                 `json:"owner_last_name"`
		MobileNumber       string                 `json:"mobile_number"`
		Email              string                 `json:"email"`
		Address            string                 `json:"address"`
		Landmark           string                 `json:"landmark"`
		HouseNo            string                 `json:"house_no"`
		Floor              string                 `json:"floor"`
		NumFlats           int                    `json:"num_flats"`
		NumFloors          int                    `json:"num_floors"`
		FamilyMembers      int                    `json:"family_members"`
		PinCode            string                 `json:"pin_code"`
		Aadhaar            string                 `json:"aadhaar"`
		MonthlyChargePaisa int                    `json:"monthly_charge_paisa"`
		Remarks            string                 `json:"remarks"`
		FormData           map[string]interface{} `json:"form_data"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	formDataJSON, _ := json.Marshal(body.FormData)

	query := `
		UPDATE rfid_properties
		SET property_status = $1, property_type = $2, property_sub_type = $3,
		    owner_first_name = $4, owner_middle_name = $5, owner_last_name = $6,
		    mobile_number = $7, email = $8, address = $9, landmark = $10,
		    house_no = $11, floor = $12, num_flats = $13, num_floors = $14,
		    family_members = $15, pin_code = $16, aadhaar = $17,
		    monthly_charge_paisa = $18, remarks = $19, form_data = $20, updated_at = NOW()
		WHERE id = $21 AND registration_status != 'deleted'
	`
	_, err = db.Exec(ctx, query,
		body.PropertyStatus, body.PropertyType, body.PropertySubType,
		body.OwnerFirstName, body.OwnerMiddleName, body.OwnerLastName,
		body.MobileNumber, body.Email, body.Address, body.Landmark,
		body.HouseNo, body.Floor, body.NumFlats, body.NumFloors,
		body.FamilyMembers, body.PinCode, body.Aadhaar,
		body.MonthlyChargePaisa, body.Remarks, formDataJSON, propID,
	)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to update property details: "+err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// 14. Scan Audit Log View
// GET /api/rfid/scan-log
func (h *Handler) WebRFIDScanLog(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT l.id, l.rfid_id, l.scan_method, l.scan_purpose, l.scan_result, l.scanned_at,
		       l.latitude, l.longitude, l.device_id, CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name) AS scanned_by_name
		FROM rfid_scan_log l
		LEFT JOIN employees e ON l.scanned_by = e.id
		ORDER BY l.scanned_at DESC
		LIMIT 500
	`)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to load scan log: "+err.Error())
		return
	}
	defer rows.Close()

	type ScanLogItem struct {
		ID            int64     `json:"id"`
		RfidID        string    `json:"rfid_id"`
		ScanMethod    string    `json:"scan_method"`
		ScanPurpose   string    `json:"scan_purpose"`
		ScanResult    string    `json:"scan_result"`
		ScannedAt     time.Time `json:"scanned_at"`
		Latitude      *float64  `json:"latitude"`
		Longitude     *float64  `json:"longitude"`
		DeviceID      string    `json:"device_id"`
		ScannedByName *string   `json:"scanned_by_name"`
	}

	var list []ScanLogItem
	for rows.Next() {
		var s ScanLogItem
		if err := rows.Scan(&s.ID, &s.RfidID, &s.ScanMethod, &s.ScanPurpose, &s.ScanResult, &s.ScannedAt, &s.Latitude, &s.Longitude, &s.DeviceID, &s.ScannedByName); err == nil {
			list = append(list, s)
		}
	}

	RespondWithJSON(w, http.StatusOK, list)
}

// 15. Property Status Update (Approve/Reject/Deactivate)
// PUT /api/rfid/properties/{id}/status
func (h *Handler) WebUpdatePropertyStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	propID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid property ID")
		return
	}

	empID, _, err := h.getEmployeeIDFromClaims(r)
	if err != nil {
		RespondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		Status           string `json:"status"` // approved|rejected|inactive|deleted
		RejectionReason  string `json:"rejection_reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		RespondWithError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	var query string
	if body.Status == "approved" {
		query = `
			UPDATE rfid_properties
			SET registration_status = 'approved', approved_by_id = $1, approved_at = NOW(), rejection_reason = NULL, updated_at = NOW()
			WHERE id = $2
		`
	} else if body.Status == "rejected" {
		query = `
			UPDATE rfid_properties
			SET registration_status = 'rejected', approved_by_id = $1, approved_at = NOW(), rejection_reason = $3, updated_at = NOW()
			WHERE id = $2
		`
	} else {
		query = `
			UPDATE rfid_properties
			SET registration_status = $1, updated_at = NOW()
			WHERE id = $2
		`
	}

	var errUpdate error
	if body.Status == "rejected" {
		_, errUpdate = db.Exec(ctx, query, empID, propID, body.RejectionReason)
	} else if body.Status == "approved" {
		_, errUpdate = db.Exec(ctx, query, empID, propID)
	} else {
		_, errUpdate = db.Exec(ctx, query, body.Status, propID)
	}

	if errUpdate != nil {
		RespondWithError(w, http.StatusInternalServerError, "Failed to update property status: "+errUpdate.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// 16. Ward & Zone Reports
// GET /api/rfid/reports/ward
func (h *Handler) WebWardRFIDReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT r.id, r.region_name,
		       COUNT(p.id) AS total_properties,
		       COUNT(c.id) AS covered_today
		FROM regions r
		LEFT JOIN rfid_properties p ON p.ward_id = r.id AND p.registration_status = 'approved'
		LEFT JOIN rfid_coverage_log c ON c.property_id = p.id AND c.coverage_date = CURRENT_DATE
		WHERE r.region_type_id = (SELECT id FROM region_types WHERE type_name ILIKE '%ward%' LIMIT 1)
		GROUP BY r.id, r.region_name
		ORDER BY r.region_name ASC
	`)
	if err != nil {
		RespondWithError(w, http.StatusInternalServerError, "DB error: "+err.Error())
		return
	}
	defer rows.Close()

	type WardReport struct {
		WardID          int    `json:"ward_id"`
		WardName        string `json:"ward_name"`
		TotalProperties int    `json:"total_properties"`
		CoveredToday    int    `json:"covered_today"`
	}

	var res []WardReport
	for rows.Next() {
		var w WardReport
		if err := rows.Scan(&w.WardID, &w.WardName, &w.TotalProperties, &w.CoveredToday); err == nil {
			res = append(res, w)
		}
	}
	RespondWithJSON(w, http.StatusOK, res)
}

