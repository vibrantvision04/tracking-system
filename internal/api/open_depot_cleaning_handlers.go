package api

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"gps-tracking-system/internal/repository"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"golang.org/x/image/webp"
)

// UploadCleaningPhoto handles parsing, checking for empty/corrupted/unsupported formats, compressing to 75% quality JPEG, and storing.
func (h *Handler) UploadCleaningPhoto(w http.ResponseWriter, r *http.Request) {
	// 1. Limit form size to 10MB
	err := r.ParseMultipartForm(10 << 20)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "File size exceeds limit (10MB)"})
		return
	}

	file, header, err := r.FormFile("photo")
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Photo is required"})
		return
	}
	defer file.Close()

	if header.Size == 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Empty file upload"})
		return
	}

	// 2. Read full file to memory to avoid multiple reads and check content type
	var buf bytes.Buffer
	_, err = io.Copy(&buf, file)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to read uploaded file"})
		return
	}
	fileBytes := buf.Bytes()

	// 3. Detect MIME Content-Type
	contentType := http.DetectContentType(fileBytes)
	allowedTypes := []string{"image/jpeg", "image/jpg", "image/png", "image/webp"}
	isValidType := false
	for _, t := range allowedTypes {
		if strings.Contains(contentType, t) || strings.HasSuffix(strings.ToLower(header.Filename), ".webp") || strings.HasSuffix(strings.ToLower(header.Filename), ".png") || strings.HasSuffix(strings.ToLower(header.Filename), ".jpg") || strings.HasSuffix(strings.ToLower(header.Filename), ".jpeg") {
			isValidType = true
			break
		}
	}

	if !isValidType {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Unsupported file format. Only JPG, JPEG, PNG, and WEBP are allowed."})
		return
	}

	// 4. Decode the image to check for corruption and verify validity
	var img image.Image
	var decodeErr error
	if strings.Contains(contentType, "png") || strings.HasSuffix(strings.ToLower(header.Filename), ".png") {
		img, decodeErr = png.Decode(bytes.NewReader(fileBytes))
	} else if strings.Contains(contentType, "webp") || strings.HasSuffix(strings.ToLower(header.Filename), ".webp") {
		img, decodeErr = webp.Decode(bytes.NewReader(fileBytes))
	} else {
		// JPEG or default
		img, decodeErr = jpeg.Decode(bytes.NewReader(fileBytes))
	}

	if decodeErr != nil || img == nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Corrupted image. Unable to decode the file."})
		return
	}

	// 5. Ensure uploads folder exists
	uploadDir := "uploads"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create uploads directory: " + err.Error()})
		return
	}

	// 6. Generate random unique filename with .jpg extension (since we are compressing to JPEG)
	randomBytes := make([]byte, 16)
	if _, err := rand.Read(randomBytes); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to generate random filename"})
		return
	}
	filename := hex.EncodeToString(randomBytes) + ".jpg"
	outPath := filepath.Join(uploadDir, filename)

	// 7. Write compressed image
	outFile, err := os.Create(outPath)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save image to disk: " + err.Error()})
		return
	}
	defer outFile.Close()

	// Compress at 75% quality JPEG
	err = jpeg.Encode(outFile, img, &jpeg.Options{Quality: 75})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to compress image: " + err.Error()})
		return
	}

	// Return successful response with image url path
	imageUrl := "/uploads/" + filename
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":   true,
		"image_url": imageUrl,
	})
}

// CreateCleaningSubmission computes Haversine distance, runs validation logic, and inserts log.
func (h *Handler) CreateCleaningSubmission(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req struct {
		OpenDepotID       int     `json:"open_depot_id"`
		ImageUrl          string  `json:"image_url"`
		UploadedBy        string  `json:"uploaded_by"`
		UploadedLatitude  float64 `json:"uploaded_latitude"`
		UploadedLongitude float64 `json:"uploaded_longitude"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	// Extract user claims if authenticated via JWT token
	claims := GetClaims(r)
	if claims != nil {
		if req.UploadedBy == "" {
			req.UploadedBy = claims.Email
		}
	}

	// Validation
	if req.OpenDepotID == 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Open depot selection is required"})
		return
	}
	if req.ImageUrl == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Image URL is required. Please upload a photo first."})
		return
	}
	if req.UploadedBy == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Uploaded by (User ID) is required"})
		return
	}
	if req.UploadedLatitude == 0.0 || req.UploadedLongitude == 0.0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Valid geolocation coordinates (Latitude and Longitude) are required"})
		return
	}

	// Fetch depot to verify coordinates and radius
	depot, err := h.openDepotRepo.GetByID(ctx, req.OpenDepotID)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Selected open depot not found"})
		return
	}

	// Compute Haversine Distance in meters
	distance := haversineDistance(req.UploadedLatitude, req.UploadedLongitude, depot.Latitude, depot.Longitude)

	// Determine verification status
	// Inside radius -> VALID, Outside -> OUTSIDE_RADIUS
	verificationStatus := "VALID"
	if distance > depot.Radius {
		verificationStatus = "OUTSIDE_RADIUS"
	}

	cleaning := &repository.OpenDepotCleaning{
		OpenDepotID:        req.OpenDepotID,
		ImageUrl:           req.ImageUrl,
		UploadedBy:         req.UploadedBy,
		UploadedLatitude:   req.UploadedLatitude,
		UploadedLongitude:  req.UploadedLongitude,
		VerificationStatus: verificationStatus,
		ApprovalStatus:     "Pending",
		DistanceFromDepot:  distance,
	}

	if err := h.openDepotRepo.CreateCleaning(ctx, cleaning); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create cleaning record: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"message": "Cleaning proof submitted successfully",
		"data":    cleaning,
	})
}

// ReviewCleaningSubmission updates the submission status and triggers depot metrics updates.
func (h *Handler) ReviewCleaningSubmission(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid cleaning submission ID"})
		return
	}

	var req struct {
		ApprovalStatus  string `json:"approval_status"` // "Approved" or "Rejected"
		JhalliPattiUsed *bool  `json:"jhalli_patti_used"`
		ApprovedBy      string `json:"approved_by"`
		Remarks         string `json:"remarks"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if req.ApprovalStatus != "Approved" && req.ApprovalStatus != "Rejected" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "approval_status must be 'Approved' or 'Rejected'"})
		return
	}

	if req.ApprovalStatus == "Approved" && req.JhalliPattiUsed == nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "jhalli_patti_used selection is required when approving"})
		return
	}

	if req.ApprovalStatus == "Rejected" && strings.TrimSpace(req.Remarks) == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Remarks are required when rejecting"})
		return
	}

	approvedBy := req.ApprovedBy
	if approvedBy == "" {
		approvedBy = "Admin"
	}

	err = h.openDepotRepo.ReviewCleaning(ctx, id, req.ApprovalStatus, req.JhalliPattiUsed, approvedBy, req.Remarks)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to submit review: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Review submitted successfully",
	})
}

// GetCleaningSubmissions lists cleaning submissions using the filter structure.
func (h *Handler) GetCleaningSubmissions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	filters := make(map[string]interface{})

	// Parse filters
	q := r.URL.Query()
	if depotIDStr := q.Get("open_depot_id"); depotIDStr != "" {
		if id, err := strconv.Atoi(depotIDStr); err == nil {
			filters["open_depot_id"] = id
		}
	}
	if zoneIDStr := q.Get("zone_id"); zoneIDStr != "" {
		if id, err := strconv.Atoi(zoneIDStr); err == nil {
			filters["zone_id"] = id
		}
	}
	if wardIDStr := q.Get("ward_id"); wardIDStr != "" {
		if id, err := strconv.Atoi(wardIDStr); err == nil {
			filters["ward_id"] = id
		}
	}
	if status := q.Get("approval_status"); status != "" {
		filters["approval_status"] = status
	}
	if startDate := q.Get("start_date"); startDate != "" {
		filters["start_date"] = startDate
	}
	if endDate := q.Get("end_date"); endDate != "" {
		filters["end_date"] = endDate
	}
	if shiftIDStr := q.Get("shift_id"); shiftIDStr != "" {
		if id, err := strconv.Atoi(shiftIDStr); err == nil {
			filters["shift_id"] = id
		}
	}
	if dateStr := q.Get("date"); dateStr != "" {
		filters["date"] = dateStr
	}

	cleanings, err := h.openDepotRepo.GetCleaningsReport(ctx, filters)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch cleanings: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    cleanings,
	})
}

// Helper: Haversine distance in meters
func haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000.0 // Earth radius in meters
	phi1 := lat1 * math.Pi / 180.0
	phi2 := lat2 * math.Pi / 180.0
	dphi := (lat2 - lat1) * math.Pi / 180.0
	dlambda := (lon2 - lon1) * math.Pi / 180.0

	a := math.Sin(dphi/2)*math.Sin(dphi/2) +
		math.Cos(phi1)*math.Cos(phi2)*
			math.Sin(dlambda/2)*math.Sin(dlambda/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}
