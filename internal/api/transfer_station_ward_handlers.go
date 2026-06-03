package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

type TransferStationWard struct {
	ID                  int    `json:"id"`
	TransferStationID   int    `json:"transfer_station_id"`
	TransferStationName string `json:"transfer_station_name"`
	WardID              int    `json:"ward_id"`
	WardName            string `json:"ward_name"`
}

func (h *Handler) GetTransferStationWards(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	query := `
		SELECT tsw.id, tsw.transfer_station_id, ts.name, tsw.ward_id, rg.region_name
		FROM transfer_station_wards tsw
		JOIN transfer_stations ts ON tsw.transfer_station_id = ts.id
		JOIN regions rg ON tsw.ward_id = rg.id
		ORDER BY tsw.id ASC
	`
	rows, err := db.Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch transfer station-wards: " + err.Error()})
		return
	}
	defer rows.Close()

	var list []TransferStationWard
	for rows.Next() {
		var tsw TransferStationWard
		if err := rows.Scan(&tsw.ID, &tsw.TransferStationID, &tsw.TransferStationName, &tsw.WardID, &tsw.WardName); err == nil {
			list = append(list, tsw)
		}
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": list})
}

func (h *Handler) CreateTransferStationWard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var body struct {
		TransferStationID int `json:"transfer_station_id"`
		WardID            int `json:"ward_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if body.TransferStationID == 0 || body.WardID == 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "transfer_station_id and ward_id are required"})
		return
	}

	_, err := db.Exec(ctx, `
		INSERT INTO transfer_station_wards (transfer_station_id, ward_id) VALUES ($1, $2)
		ON CONFLICT (transfer_station_id, ward_id) DO NOTHING
	`, body.TransferStationID, body.WardID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to assign transfer station to ward: " + err.Error()})
		return
	}
	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true})
}

func (h *Handler) DeleteTransferStationWard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	_, err = db.Exec(ctx, `DELETE FROM transfer_station_wards WHERE id = $1`, id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete mapping: " + err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
