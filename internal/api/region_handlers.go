package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

type RegionTypeResponse struct {
	ID          int    `json:"id"`
	Title       string `json:"title"`
	ParentID    *int   `json:"parent_id"`
	ParentTitle string `json:"parent_title"`
	IsActive    bool   `json:"is_active"`
}

func (h *Handler) GetRegionTypes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	query := `
		SELECT t.id, t.title, t.parent_id, COALESCE(p.title, ''), t.is_active
		FROM region_types t
		LEFT JOIN region_types p ON t.parent_id = p.id
		WHERE t.is_active = true
		ORDER BY t.id ASC
	`
	rows, err := db.Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch region types: " + err.Error()})
		return
	}
	defer rows.Close()

	var types []RegionTypeResponse
	for rows.Next() {
		var rt RegionTypeResponse
		var parentID *int
		if err := rows.Scan(&rt.ID, &rt.Title, &parentID, &rt.ParentTitle, &rt.IsActive); err == nil {
			rt.ParentID = parentID
			types = append(types, rt)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    types,
	})
}

func (h *Handler) CreateRegionType(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		Title    string `json:"title"`
		ParentID *int   `json:"parent_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}

	if req.Title == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Title is required"})
		return
	}

	var newID int
	err := db.QueryRow(ctx, `
		INSERT INTO region_types (title, parent_id) 
		VALUES ($1, $2) 
		RETURNING id
	`, req.Title, req.ParentID).Scan(&newID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create region type: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"id":      newID,
	})
}

func (h *Handler) UpdateRegionType(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid region type ID"})
		return
	}

	var req struct {
		Title    string `json:"title"`
		ParentID *int   `json:"parent_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}

	if req.Title == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Title is required"})
		return
	}

	// Prevent circular reference
	if req.ParentID != nil && *req.ParentID == id {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Region type cannot be its own parent"})
		return
	}

	_, err = db.Exec(ctx, `
		UPDATE region_types 
		SET title = $1, parent_id = $2 
		WHERE id = $3
	`, req.Title, req.ParentID, id)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update region type: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func (h *Handler) DeleteRegionType(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid region type ID"})
		return
	}

	// Try to hard delete first. If it fails due to foreign key violations, soft delete it!
	_, err = db.Exec(ctx, "DELETE FROM region_types WHERE id = $1", id)
	if err != nil {
		// If hard delete fails, we can soft delete
		_, err = db.Exec(ctx, "UPDATE region_types SET is_active = false WHERE id = $1", id)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete region type: " + err.Error()})
			return
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

// ═══════════════════════════════════════
// Region CRUD Handlers
// ═══════════════════════════════════════

type RegionResponse struct {
	ID                  int             `json:"id"`
	RegionName          string          `json:"region_name"`
	RegionCode          string          `json:"region_code"`
	EstimatedPopulation int             `json:"estimated_population"`
	RegionTypeID        int             `json:"region_type_id"`
	RegionTypeTitle     string          `json:"region_type_title"`
	ParentID            *int            `json:"parent_id"`
	ParentRegionName    string          `json:"parent_region_name"`
	GeofenceID          *int            `json:"geofence_id"`
	GeoJSON             json.RawMessage `json:"geojson"`
	Color               string          `json:"color"`
	IsActive            bool            `json:"is_active"`
}

func (h *Handler) GetRegions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	query := `
		SELECT 
			r.id, 
			COALESCE(r.region_name, ''), 
			COALESCE(r.region_code, ''), 
			COALESCE(r.estimated_population, 0), 
			COALESCE(r.region_type_id, 0), 
			COALESCE(rt.title, ''), 
			r.parent_id, 
			COALESCE(rp.region_name, ''), 
			r.geofence_id, 
			g.polygon, 
			COALESCE(g.color, '#fba339'), 
			COALESCE(r.is_active, true)
		FROM regions r
		LEFT JOIN region_types rt ON r.region_type_id = rt.id
		LEFT JOIN regions rp ON r.parent_id = rp.id
		LEFT JOIN geofences g ON r.geofence_id = g.id
		WHERE r.is_active = true
		ORDER BY r.id DESC
	`
	rows, err := db.Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query regions: " + err.Error()})
		return
	}
	defer rows.Close()

	regions := []RegionResponse{}
	for rows.Next() {
		var reg RegionResponse
		var parentID, geofenceID *int
		var geojson []byte
		err := rows.Scan(
			&reg.ID, &reg.RegionName, &reg.RegionCode, &reg.EstimatedPopulation,
			&reg.RegionTypeID, &reg.RegionTypeTitle, &parentID, &reg.ParentRegionName,
			&geofenceID, &geojson, &reg.Color, &reg.IsActive,
		)
		if err == nil {
			reg.ParentID = parentID
			reg.GeofenceID = geofenceID
			if len(geojson) > 0 {
				reg.GeoJSON = json.RawMessage(geojson)
			} else {
				reg.GeoJSON = json.RawMessage("null")
			}
			regions = append(regions, reg)
		} else {
			fmt.Printf("Error scanning region: %v\n", err)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    regions,
	})
}

func (h *Handler) CreateRegion(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		RegionName          string          `json:"region_name"`
		RegionCode          string          `json:"region_code"`
		EstimatedPopulation int             `json:"estimated_population"`
		RegionTypeID        int             `json:"region_type_id"`
		ParentID            *int            `json:"parent_id"`
		GeoJSON             json.RawMessage `json:"geojson"`
		Color               string          `json:"color"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	if req.RegionName == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Region name is required"})
		return
	}

	if req.RegionTypeID <= 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Valid region type is required"})
		return
	}

	// 1. Create geofence if GeoJSON is provided
	var geofenceID *int
	if len(req.GeoJSON) > 0 && string(req.GeoJSON) != "null" && string(req.GeoJSON) != "" {
		var gID int
		geofenceColor := req.Color
		if geofenceColor == "" {
			geofenceColor = "#fba339"
		}
		err := db.QueryRow(ctx, `
			INSERT INTO geofences (name, type, polygon, color)
			VALUES ($1, 'polygon', $2::jsonb, $3)
			RETURNING id
		`, req.RegionName+"_geom", req.GeoJSON, geofenceColor).Scan(&gID)

		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create geofence geometry: " + err.Error()})
			return
		}
		geofenceID = &gID
	}

	// 2. Create region
	var regionID int
	err := db.QueryRow(ctx, `
		INSERT INTO regions (region_name, region_code, estimated_population, region_type_id, parent_id, geofence_id, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, true)
		RETURNING id
	`, req.RegionName, req.RegionCode, req.EstimatedPopulation, req.RegionTypeID, req.ParentID, geofenceID).Scan(&regionID)

	if err != nil {
		// Clean up geofence if region insertion failed
		if geofenceID != nil {
			_, _ = db.Exec(ctx, "DELETE FROM geofences WHERE id = $1", *geofenceID)
		}
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create region: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"id":      regionID,
	})
}

func (h *Handler) UpdateRegion(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	idStr := chi.URLParam(r, "id")
	regionID, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid region ID"})
		return
	}

	var req struct {
		RegionName          string          `json:"region_name"`
		RegionCode          string          `json:"region_code"`
		EstimatedPopulation int             `json:"estimated_population"`
		RegionTypeID        int             `json:"region_type_id"`
		ParentID            *int            `json:"parent_id"`
		GeoJSON             json.RawMessage `json:"geojson"`
		Color               string          `json:"color"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	if req.RegionName == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Region name is required"})
		return
	}

	// Prevent self-parenting
	if req.ParentID != nil && *req.ParentID == regionID {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Region cannot be its own parent"})
		return
	}

	// 1. Fetch current geofence_id
	var currentGeofenceID *int
	err = db.QueryRow(ctx, "SELECT geofence_id FROM regions WHERE id = $1", regionID).Scan(&currentGeofenceID)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Region not found"})
		return
	}

	// 2. Handle geofence creation, update or deletion
	var newGeofenceID *int = currentGeofenceID
	hasNewGeometry := len(req.GeoJSON) > 0 && string(req.GeoJSON) != "null" && string(req.GeoJSON) != ""

	geofenceColor := req.Color
	if geofenceColor == "" {
		geofenceColor = "#fba339"
	}

	if hasNewGeometry {
		if currentGeofenceID != nil {
			// Update existing geofence
			_, err = db.Exec(ctx, `
				UPDATE geofences 
				SET name = $1, polygon = $2::jsonb, color = $3 
				WHERE id = $4
			`, req.RegionName+"_geom", req.GeoJSON, geofenceColor, *currentGeofenceID)
			if err != nil {
				sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update geofence geometry: " + err.Error()})
				return
			}
		} else {
			// Create new geofence
			var gID int
			err = db.QueryRow(ctx, `
				INSERT INTO geofences (name, type, polygon, color)
				VALUES ($1, 'polygon', $2::jsonb, $3)
				RETURNING id
			`, req.RegionName+"_geom", req.GeoJSON, geofenceColor).Scan(&gID)
			if err != nil {
				sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create geofence geometry: " + err.Error()})
				return
			}
			newGeofenceID = &gID
		}
	} else if currentGeofenceID != nil {
		// If geometry was cleared, unlink from region and delete geofence row
		_, err = db.Exec(ctx, "UPDATE regions SET geofence_id = NULL WHERE id = $1", regionID)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to unlink geofence: " + err.Error()})
			return
		}
		_, _ = db.Exec(ctx, "DELETE FROM geofences WHERE id = $1", *currentGeofenceID)
		newGeofenceID = nil
	}

	// 3. Update region details
	_, err = db.Exec(ctx, `
		UPDATE regions 
		SET region_name = $1, region_code = $2, estimated_population = $3, 
		    region_type_id = $4, parent_id = $5, geofence_id = $6, updated_at = NOW()
		WHERE id = $7
	`, req.RegionName, req.RegionCode, req.EstimatedPopulation, req.RegionTypeID, req.ParentID, newGeofenceID, regionID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update region: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func (h *Handler) DeleteRegion(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	idStr := chi.URLParam(r, "id")
	regionID, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid region ID"})
		return
	}

	// 1. Fetch current geofence_id
	var geofenceID *int
	_ = db.QueryRow(ctx, "SELECT geofence_id FROM regions WHERE id = $1", regionID).Scan(&geofenceID)

	// 2. Delete region (or soft delete)
	_, err = db.Exec(ctx, "DELETE FROM regions WHERE id = $1", regionID)
	if err != nil {
		// If hard delete fails, soft-delete it!
		_, err = db.Exec(ctx, "UPDATE regions SET is_active = false, updated_at = NOW() WHERE id = $1", regionID)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete region: " + err.Error()})
			return
		}
	} else {
		// In case of hard delete, clean up the associated geofence too
		if geofenceID != nil {
			_, _ = db.Exec(ctx, "DELETE FROM geofences WHERE id = $1", *geofenceID)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
