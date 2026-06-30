package api

import (
	"encoding/json"
	"net/http"
	"time"
)

// ListComplaints returns all complaints from the database (admin web access, no scope filtering).
func (h *Handler) ListComplaints(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT c.id, c.title, c.description, c.priority, c.status,
		       COALESCE(v.registration_no, '') AS assigned_vehicle,
		       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), ''), '') AS assigned_driver,
		       c.location, c.images, c.created_at, c.updated_at
		FROM complaints c
		LEFT JOIN vehicles v ON v.id = c.assigned_vehicle_id
		LEFT JOIN employees e ON e.id = c.assigned_driver_id
		ORDER BY c.created_at DESC
	`)
	if err != nil {
		RespondWithJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": []interface{}{}})
		return
	}
	defer rows.Close()

	list := []map[string]interface{}{}
	for rows.Next() {
		var (
			id                                                    int64
			title, description, priority, status, vehicle, driver string
			location, images                                      []byte
			createdAt, updatedAt                                  time.Time
		)
		if err := rows.Scan(&id, &title, &description, &priority, &status, &vehicle, &driver, &location, &images, &createdAt, &updatedAt); err != nil {
			continue
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

		list = append(list, map[string]interface{}{
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
		})
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": list})
}
