package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"time"

	"gps-tracking-system/internal/ultimatereport"
	"gps-tracking-system/internal/utils"
)

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ultimate-reports/daily-excel?date=YYYY-MM-DD
// Downloads the generated Ultimate Report Excel workbook for the given date.
// ─────────────────────────────────────────────────────────────────────────────
func (h *Handler) GetUltimateDailyExcelReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	dateStr := r.URL.Query().Get("date")
	var date time.Time
	var err error

	if dateStr == "" {
		// Default to yesterday (most recent complete day)
		date = utils.CurrentTimeInIndia().AddDate(0, 0, -1)
	} else {
		date, err = time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid date format — use YYYY-MM-DD",
			})
			return
		}
	}

	// Build report data
	data, err := h.ultimateReportService.BuildReportData(ctx, date)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to assemble report data: " + err.Error(),
		})
		return
	}

	// Generate Excel workbook
	excelBytes, err := h.excelEngine.GenerateUltimateReport(data)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to generate Excel report: " + err.Error(),
		})
		return
	}

	filename := fmt.Sprintf("ultimate-report-%s.xlsx", date.Format("2006-01-02"))
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(excelBytes)))
	w.WriteHeader(http.StatusOK)
	w.Write(excelBytes)
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ultimate-reports/template
// Serves the raw template file for direct download.
// ─────────────────────────────────────────────────────────────────────────────
func (h *Handler) DownloadUltimateTemplate(w http.ResponseWriter, r *http.Request) {
	templatePath := filepath.Join(h.reportTemplatePath, "ultimate-report.xlsx")
	w.Header().Set("Content-Disposition", `attachment; filename="ultimate-report-template.xlsx"`)
	http.ServeFile(w, r, templatePath)
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ultimate-reports/list
// Returns the list of registered report types (for the UI menu).
// ─────────────────────────────────────────────────────────────────────────────
func (h *Handler) GetUltimateReportList(w http.ResponseWriter, r *http.Request) {
	defs := ultimatereport.List()
	type item struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	var items []item
	for _, d := range defs {
		items = append(items, item{ID: d.ID, Name: d.Name, Description: d.Description})
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    items,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Exception CRUD endpoints
// ─────────────────────────────────────────────────────────────────────────────

func (h *Handler) GetDailyExceptions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	dateStr := r.URL.Query().Get("date")
	if dateStr == "" {
		dateStr = utils.CurrentTimeInIndia().Format("2006-01-02")
	}
	date, err := time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid date"})
		return
	}

	exceptions, err := h.ultimateReportService.GetExceptions(ctx, date)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": exceptions})
}

func (h *Handler) CreateDailyException(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var payload struct {
		ReportDate         string `json:"report_date"`
		VehicleRegNo       string `json:"vehicle_reg_no"`
		ExceptionType      string `json:"exception_type"`
		ReplacementVehicle string `json:"replacement_vehicle"`
		Remarks            string `json:"remarks"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid payload"})
		return
	}

	_, err := h.ultimateReportService.UpsertException(ctx, payload.ReportDate, payload.VehicleRegNo,
		payload.ExceptionType, payload.ReplacementVehicle, payload.Remarks)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true})
}

func (h *Handler) DeleteDailyException(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	dateStr := r.URL.Query().Get("date")
	regNo := r.URL.Query().Get("vehicle_reg_no")
	if dateStr == "" || regNo == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "date and vehicle_reg_no required"})
		return
	}
	if err := h.ultimateReportService.DeleteException(ctx, dateStr, regNo); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
