package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"gps-tracking-system/internal/geofence"
)

type TransferStationResponse struct {
	ID                int             `json:"id"`
	Name              string          `json:"name"`
	Address           string          `json:"address"`
	GeofenceID        *int            `json:"geofence_id"`
	IsActive          bool            `json:"is_active"`
	CreatedAt         string          `json:"created_at"`
	GeoJSON           json.RawMessage `json:"geojson"`
	Color             string          `json:"color"`
	DumpZoneLatitude  *float64        `json:"dump_zone_latitude"`
	DumpZoneLongitude *float64        `json:"dump_zone_longitude"`
	DumpZoneRadius    *float64        `json:"dump_zone_radius"`
	EntryLatitude     *float64        `json:"entry_latitude"`
	EntryLongitude    *float64        `json:"entry_longitude"`
	ExitLatitude      *float64        `json:"exit_latitude"`
	ExitLongitude     *float64        `json:"exit_longitude"`
}

func (h *Handler) GetTransferStations(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	query := `
		SELECT 
			ts.id, 
			ts.name, 
			COALESCE(ts.address, ''), 
			ts.geofence_id, 
			COALESCE(ts.is_active, true),
			TO_CHAR(ts.created_at, 'YYYY-MM-DD HH24:MI:SS'),
			g.polygon,
			COALESCE(g.color, '#000000'),
			ts.dump_zone_latitude,
			ts.dump_zone_longitude,
			ts.dump_zone_radius,
			ts.entry_latitude,
			ts.entry_longitude,
			ts.exit_latitude,
			ts.exit_longitude
		FROM transfer_stations ts
		LEFT JOIN geofences g ON ts.geofence_id = g.id
		ORDER BY ts.id DESC
	`
	rows, err := db.Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query transfer stations: " + err.Error()})
		return
	}
	defer rows.Close()

	var stations []TransferStationResponse
	for rows.Next() {
		var ts TransferStationResponse
		var geojson []byte
		err := rows.Scan(
			&ts.ID, &ts.Name, &ts.Address, &ts.GeofenceID, &ts.IsActive, &ts.CreatedAt, &geojson, &ts.Color,
			&ts.DumpZoneLatitude, &ts.DumpZoneLongitude, &ts.DumpZoneRadius,
			&ts.EntryLatitude, &ts.EntryLongitude,
			&ts.ExitLatitude, &ts.ExitLongitude,
		)
		if err == nil {
			if len(geojson) > 0 {
				ts.GeoJSON = json.RawMessage(geojson)
			} else {
				ts.GeoJSON = json.RawMessage("null")
			}
			stations = append(stations, ts)
		} else {
			fmt.Printf("Error scanning transfer station: %v\n", err)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    stations,
	})
}

func parsePolygonCoordinates(geoJSON []byte) ([][]float64, error) {
	// Try parsing as FeatureCollection
	var featureColl struct {
		Type     string `json:"type"`
		Features []struct {
			Geometry struct {
				Type        string        `json:"type"`
				Coordinates [][][]float64 `json:"coordinates"`
			} `json:"geometry"`
		} `json:"features"`
	}
	if err := json.Unmarshal(geoJSON, &featureColl); err == nil && featureColl.Type == "FeatureCollection" && len(featureColl.Features) > 0 {
		geom := featureColl.Features[0].Geometry
		if geom.Type == "Polygon" && len(geom.Coordinates) > 0 {
			return geom.Coordinates[0], nil
		}
	}

	// Try parsing as Feature
	var feature struct {
		Type     string `json:"type"`
		Geometry struct {
			Type        string        `json:"type"`
			Coordinates [][][]float64 `json:"coordinates"`
		} `json:"geometry"`
	}
	if err := json.Unmarshal(geoJSON, &feature); err == nil && (feature.Type == "Feature" || feature.Geometry.Type == "Polygon") {
		if feature.Geometry.Type == "Polygon" && len(feature.Geometry.Coordinates) > 0 {
			return feature.Geometry.Coordinates[0], nil
		}
	}

	// Try parsing as Polygon geometry directly
	var polyGeom struct {
		Type        string        `json:"type"`
		Coordinates [][][]float64 `json:"coordinates"`
	}
	if err := json.Unmarshal(geoJSON, &polyGeom); err == nil && polyGeom.Type == "Polygon" && len(polyGeom.Coordinates) > 0 {
		return polyGeom.Coordinates[0], nil
	}

	return nil, fmt.Errorf("unable to parse polygon coordinates from GeoJSON")
}

func validatePointsInBoundary(geoJSON []byte, dumpZoneLat, dumpZoneLng, entryLat, entryLng, exitLat, exitLng float64) error {
	if len(geoJSON) == 0 || string(geoJSON) == "null" || string(geoJSON) == "" {
		return fmt.Errorf("transfer station boundary (geojson) is required")
	}

	coords, err := parsePolygonCoordinates(geoJSON)
	if err != nil {
		return fmt.Errorf("invalid boundary GEOJSON: %w", err)
	}

	if len(coords) == 0 {
		return fmt.Errorf("boundary polygon must contain coordinates")
	}

	var polygonPoints []geofence.Point
	for _, c := range coords {
		if len(c) >= 2 {
			// coordinates are [longitude, latitude] in GeoJSON
			polygonPoints = append(polygonPoints, geofence.Point{Lng: c[0], Lat: c[1]})
		}
	}

	// 1. Dump zone center must be inside transfer station boundary.
	if !geofence.PointInPolygon(geofence.Point{Lat: dumpZoneLat, Lng: dumpZoneLng}, polygonPoints) {
		return fmt.Errorf("dump zone center must be inside the transfer station boundary")
	}

	// 2. Entry point must be inside transfer station boundary.
	if !geofence.PointInPolygon(geofence.Point{Lat: entryLat, Lng: entryLng}, polygonPoints) {
		return fmt.Errorf("entry point must be inside the transfer station boundary")
	}

	// 3. Exit point must be inside transfer station boundary.
	if !geofence.PointInPolygon(geofence.Point{Lat: exitLat, Lng: exitLng}, polygonPoints) {
		return fmt.Errorf("exit point must be inside the transfer station boundary")
	}

	return nil
}

func (h *Handler) CreateTransferStation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		Name    string          `json:"name"`
		Address string          `json:"address"`
		GeoJSON json.RawMessage `json:"geojson"`
		Color   string          `json:"color"`

		DumpZone *struct {
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
			Radius    float64 `json:"radius"`
		} `json:"dumpZone"`

		EntryPoint *struct {
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		} `json:"entryPoint"`

		ExitPoint *struct {
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		} `json:"exitPoint"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	fmt.Printf("DEBUG CreateTransferStation: Name=%q, DumpZone=%+v, EntryPoint=%+v, ExitPoint=%+v\n", req.Name, req.DumpZone, req.EntryPoint, req.ExitPoint)

	if req.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Transfer station name is required"})
		return
	}

	if req.DumpZone == nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Dump zone configuration is required"})
		return
	}
	if req.EntryPoint == nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Entry point configuration is required"})
		return
	}
	if req.ExitPoint == nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Exit point configuration is required"})
		return
	}

	// Validate points are inside boundary
	err := validatePointsInBoundary(
		req.GeoJSON,
		req.DumpZone.Latitude, req.DumpZone.Longitude,
		req.EntryPoint.Latitude, req.EntryPoint.Longitude,
		req.ExitPoint.Latitude, req.ExitPoint.Longitude,
	)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
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

	// 2. Create transfer station
	var tsID int
	err = db.QueryRow(ctx, `
		INSERT INTO transfer_stations (
			name, address, geofence_id,
			dump_zone_latitude, dump_zone_longitude, dump_zone_radius,
			entry_latitude, entry_longitude,
			exit_latitude, exit_longitude
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id
	`,
		req.Name, req.Address, geofenceID,
		req.DumpZone.Latitude, req.DumpZone.Longitude, req.DumpZone.Radius,
		req.EntryPoint.Latitude, req.EntryPoint.Longitude,
		req.ExitPoint.Latitude, req.ExitPoint.Longitude,
	).Scan(&tsID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create transfer station: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"id":      tsID,
	})
}

func (h *Handler) UpdateTransferStation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	var req struct {
		Name    string          `json:"name"`
		Address string          `json:"address"`
		GeoJSON json.RawMessage `json:"geojson"`
		Color   string          `json:"color"`

		DumpZone *struct {
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
			Radius    float64 `json:"radius"`
		} `json:"dumpZone"`

		EntryPoint *struct {
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		} `json:"entryPoint"`

		ExitPoint *struct {
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		} `json:"exitPoint"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	fmt.Printf("DEBUG UpdateTransferStation: Name=%q, DumpZone=%+v, EntryPoint=%+v, ExitPoint=%+v\n", req.Name, req.DumpZone, req.EntryPoint, req.ExitPoint)

	if req.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Transfer station name is required"})
		return
	}

	if req.DumpZone == nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Dump zone configuration is required"})
		return
	}
	if req.EntryPoint == nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Entry point configuration is required"})
		return
	}
	if req.ExitPoint == nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Exit point configuration is required"})
		return
	}

	// Validate points are inside boundary
	err = validatePointsInBoundary(
		req.GeoJSON,
		req.DumpZone.Latitude, req.DumpZone.Longitude,
		req.EntryPoint.Latitude, req.EntryPoint.Longitude,
		req.ExitPoint.Latitude, req.ExitPoint.Longitude,
	)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// 1. Get current geofence ID
	var currentGeofenceID *int
	err = db.QueryRow(ctx, "SELECT geofence_id FROM transfer_stations WHERE id = $1", id).Scan(&currentGeofenceID)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Transfer station not found"})
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
		newGeofenceID = nullGeofenceTS()
	}

	// 3. Update transfer station
	_, err = db.Exec(ctx, `
		UPDATE transfer_stations 
		SET name = $1, address = $2, geofence_id = $3,
			dump_zone_latitude = $4, dump_zone_longitude = $5, dump_zone_radius = $6,
			entry_latitude = $7, entry_longitude = $8,
			exit_latitude = $9, exit_longitude = $10
		WHERE id = $11
	`,
		req.Name, req.Address, newGeofenceID,
		req.DumpZone.Latitude, req.DumpZone.Longitude, req.DumpZone.Radius,
		req.EntryPoint.Latitude, req.EntryPoint.Longitude,
		req.ExitPoint.Latitude, req.ExitPoint.Longitude,
		id,
	)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update transfer station: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func nullGeofenceTS() *int { return nil }

func (h *Handler) DeleteTransferStation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	// First get the geofence_id
	var geofenceID *int
	err = db.QueryRow(ctx, "SELECT geofence_id FROM transfer_stations WHERE id = $1", id).Scan(&geofenceID)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Transfer station not found"})
		return
	}

	// Delete transfer station
	_, err = db.Exec(ctx, "DELETE FROM transfer_stations WHERE id = $1", id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete transfer station: " + err.Error()})
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
