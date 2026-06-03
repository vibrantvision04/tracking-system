package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

type FuelCompanyResponse struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	ShortName string `json:"short_name"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
}

type FuelStationResponse struct {
	ID             int             `json:"id"`
	Name           string          `json:"name"`
	CompanyID      *int            `json:"company_id"`
	CompanyName    string          `json:"company_name"`
	OwnerName      string          `json:"owner_name"`
	OwnerContact1  string          `json:"owner_contact_1"`
	OwnerContact2  string          `json:"owner_contact_2"`
	Address        string          `json:"address"`
	GeofenceID     *int            `json:"geofence_id"`
	IsActive       bool            `json:"is_active"`
	CreatedAt      string          `json:"created_at"`
	GeoJSON        json.RawMessage `json:"geojson"`
	Color          string          `json:"color"`
}

func (h *Handler) GetFuelCompanies(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	query := `
		SELECT id, name, COALESCE(short_name, ''), COALESCE(is_active, true), TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')
		FROM fuel_companies
		ORDER BY name ASC
	`
	rows, err := db.Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query fuel companies: " + err.Error()})
		return
	}
	defer rows.Close()

	var companies []FuelCompanyResponse
	for rows.Next() {
		var fc FuelCompanyResponse
		if err := rows.Scan(&fc.ID, &fc.Name, &fc.ShortName, &fc.IsActive, &fc.CreatedAt); err == nil {
			companies = append(companies, fc)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    companies,
	})
}

func (h *Handler) CreateFuelCompany(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		Name      string `json:"name"`
		ShortName string `json:"short_name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	if req.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Fuel company name is required"})
		return
	}

	var id int
	err := db.QueryRow(ctx, `
		INSERT INTO fuel_companies (name, short_name)
		VALUES ($1, $2)
		RETURNING id
	`, req.Name, req.ShortName).Scan(&id)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create fuel company: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"id":      id,
	})
}

func (h *Handler) UpdateFuelCompany(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	var req struct {
		Name      string `json:"name"`
		ShortName string `json:"short_name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	if req.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Fuel company name is required"})
		return
	}

	_, err = db.Exec(ctx, `
		UPDATE fuel_companies 
		SET name = $1, short_name = $2
		WHERE id = $3
	`, req.Name, req.ShortName, id)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update fuel company: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func (h *Handler) DeleteFuelCompany(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	_, err = db.Exec(ctx, "DELETE FROM fuel_companies WHERE id = $1", id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete fuel company: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func (h *Handler) GetFuelStations(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	query := `
		SELECT 
			fs.id, 
			fs.name, 
			fs.company_id,
			COALESCE(fc.name, ''),
			COALESCE(fs.owner_name, ''),
			COALESCE(fs.owner_contact_1, ''),
			COALESCE(fs.owner_contact_2, ''),
			COALESCE(fs.address, ''), 
			fs.geofence_id, 
			COALESCE(fs.is_active, true),
			TO_CHAR(fs.created_at, 'YYYY-MM-DD HH24:MI:SS'),
			g.polygon,
			COALESCE(g.color, '#000000')
		FROM fuel_stations fs
		LEFT JOIN fuel_companies fc ON fs.company_id = fc.id
		LEFT JOIN geofences g ON fs.geofence_id = g.id
		ORDER BY fs.id DESC
	`
	rows, err := db.Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query fuel stations: " + err.Error()})
		return
	}
	defer rows.Close()

	var stations []FuelStationResponse
	for rows.Next() {
		var fs FuelStationResponse
		var geojson []byte
		err := rows.Scan(&fs.ID, &fs.Name, &fs.CompanyID, &fs.CompanyName, &fs.OwnerName, &fs.OwnerContact1, &fs.OwnerContact2, &fs.Address, &fs.GeofenceID, &fs.IsActive, &fs.CreatedAt, &geojson, &fs.Color)
		if err == nil {
			if len(geojson) > 0 {
				fs.GeoJSON = json.RawMessage(geojson)
			} else {
				fs.GeoJSON = json.RawMessage("null")
			}
			stations = append(stations, fs)
		} else {
			fmt.Printf("Error scanning fuel station: %v\n", err)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    stations,
	})
}

func (h *Handler) CreateFuelStation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		Name          string          `json:"name"`
		CompanyID     *int            `json:"company_id"`
		OwnerName     string          `json:"owner_name"`
		OwnerContact1 string          `json:"owner_contact_1"`
		OwnerContact2 string          `json:"owner_contact_2"`
		Address       string          `json:"address"`
		GeoJSON       json.RawMessage `json:"geojson"`
		Color         string          `json:"color"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	if req.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Fuel station name is required"})
		return
	}

	// 1. Create geofence if GeoJSON is provided
	var geofenceID *int
	if len(req.GeoJSON) > 0 && string(req.GeoJSON) != "null" && string(req.GeoJSON) != "" {
		var gID int
		geofenceColor := req.Color
		if geofenceColor == "" {
			geofenceColor = "#000000"
		}
		err := db.QueryRow(ctx, `
			INSERT INTO geofences (name, type, polygon, color)
			VALUES ($1, 'polygon', $2::jsonb, $3)
			RETURNING id
		`, req.Name+"_geom", req.GeoJSON, geofenceColor).Scan(&gID)

		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create geofence geometry: " + err.Error()})
			return
		}
		geofenceID = &gID
	}

	// 2. Create fuel station
	var fsID int
	err := db.QueryRow(ctx, `
		INSERT INTO fuel_stations (name, company_id, owner_name, owner_contact_1, owner_contact_2, address, geofence_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, req.Name, req.CompanyID, req.OwnerName, req.OwnerContact1, req.OwnerContact2, req.Address, geofenceID).Scan(&fsID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create fuel station: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"id":      fsID,
	})
}

func (h *Handler) UpdateFuelStation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	var req struct {
		Name          string          `json:"name"`
		CompanyID     *int            `json:"company_id"`
		OwnerName     string          `json:"owner_name"`
		OwnerContact1 string          `json:"owner_contact_1"`
		OwnerContact2 string          `json:"owner_contact_2"`
		Address       string          `json:"address"`
		GeoJSON       json.RawMessage `json:"geojson"`
		Color         string          `json:"color"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	if req.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Fuel station name is required"})
		return
	}

	// 1. Get current geofence ID
	var currentGeofenceID *int
	err = db.QueryRow(ctx, "SELECT geofence_id FROM fuel_stations WHERE id = $1", id).Scan(&currentGeofenceID)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Fuel station not found"})
		return
	}

	// 2. Handle Geofence Update/Create
	var newGeofenceID *int = currentGeofenceID
	if len(req.GeoJSON) > 0 && string(req.GeoJSON) != "null" && string(req.GeoJSON) != "" {
		geofenceColor := req.Color
		if geofenceColor == "" {
			geofenceColor = "#000000"
		}

		if currentGeofenceID != nil {
			// Update existing geofence
			_, err = db.Exec(ctx, `
				UPDATE geofences 
				SET name = $1, polygon = $2::jsonb, color = $3
				WHERE id = $4
			`, req.Name+"_geom", req.GeoJSON, geofenceColor, *currentGeofenceID)
			
			if err != nil {
				sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update geofence: " + err.Error()})
				return
			}
		} else {
			// Create new geofence
			var gID int
			err := db.QueryRow(ctx, `
				INSERT INTO geofences (name, type, polygon, color)
				VALUES ($1, 'polygon', $2::jsonb, $3)
				RETURNING id
			`, req.Name+"_geom", req.GeoJSON, geofenceColor).Scan(&gID)

			if err != nil {
				sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create geofence: " + err.Error()})
				return
			}
			newGeofenceID = &gID
		}
	} else if currentGeofenceID != nil {
		// They cleared the GeoJSON, so delete the geofence
		_, err = db.Exec(ctx, "DELETE FROM geofences WHERE id = $1", *currentGeofenceID)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete old geofence: " + err.Error()})
			return
		}
		newGeofenceID = nil
	}

	// 3. Update fuel station
	_, err = db.Exec(ctx, `
		UPDATE fuel_stations 
		SET name = $1, company_id = $2, owner_name = $3, owner_contact_1 = $4, owner_contact_2 = $5, address = $6, geofence_id = $7
		WHERE id = $8
	`, req.Name, req.CompanyID, req.OwnerName, req.OwnerContact1, req.OwnerContact2, req.Address, newGeofenceID, id)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update fuel station: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func (h *Handler) DeleteFuelStation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	// First get the geofence_id
	var geofenceID *int
	err = db.QueryRow(ctx, "SELECT geofence_id FROM fuel_stations WHERE id = $1", id).Scan(&geofenceID)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Fuel station not found"})
		return
	}

	// Delete fuel station
	_, err = db.Exec(ctx, "DELETE FROM fuel_stations WHERE id = $1", id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete fuel station: " + err.Error()})
		return
	}

	// Delete geofence
	if geofenceID != nil {
		_, _ = db.Exec(ctx, "DELETE FROM geofences WHERE id = $1", *geofenceID)
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
