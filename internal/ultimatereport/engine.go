package ultimatereport

import (
	"bytes"
	"fmt"
	"path/filepath"

	"github.com/xuri/excelize/v2"
)

// ─────────────────────────────────────────────────────────────────────────────
// ExcelEngine — template-driven Excel generator
// Opens the template file, injects data into predefined cells, returns bytes.
// NEVER modifies styles/formatting — excelize preserves all existing formatting
// when you open an existing file and only write cell values.
// ─────────────────────────────────────────────────────────────────────────────

// ExcelEngine loads Excel templates from a configurable directory.
type ExcelEngine struct {
	templateDir string
}

func NewExcelEngine(templateDir string) *ExcelEngine {
	return &ExcelEngine{templateDir: templateDir}
}

// GenerateUltimateReport opens ultimate-report.xlsx, injects data, returns []byte.
func (e *ExcelEngine) GenerateUltimateReport(data *ReportData) ([]byte, error) {
	templatePath := filepath.Join(e.templateDir, "ultimate-report.xlsx")
	f, err := excelize.OpenFile(templatePath)
	if err != nil {
		return nil, fmt.Errorf("excel engine: open template: %w", err)
	}
	defer f.Close()

	// ── Inject each sheet ────────────────────────────────────────────────────
	if err := injectZoneSheet(f, "HMZ", data.DateLabel, data.HMZ); err != nil {
		return nil, fmt.Errorf("excel engine: HMZ: %w", err)
	}
	if err := injectZoneSheet(f, "CLZ", data.DateLabel, data.CLZ); err != nil {
		return nil, fmt.Errorf("excel engine: CLZ: %w", err)
	}
	if err := injectZoneSheet(f, "KPZ", data.DateLabel, data.KPZ); err != nil {
		return nil, fmt.Errorf("excel engine: KPZ: %w", err)
	}
	if err := injectZoneSheet(f, "ANZ", data.DateLabel, data.ANZ); err != nil {
		return nil, fmt.Errorf("excel engine: ANZ: %w", err)
	}
	if err := injectSWSheet(f, data.DateLabel, data.SW); err != nil {
		return nil, fmt.Errorf("excel engine: SW: %w", err)
	}
	if err := injectDepartedSheet(f, data.Departed); err != nil {
		return nil, fmt.Errorf("excel engine: DEPARTED: %w", err)
	}
	if err := injectEARSheet(f, data.DateLabel, data.EAR); err != nil {
		return nil, fmt.Errorf("excel engine: EAR: %w", err)
	}
	if err := injectSUMSheet(f, data); err != nil {
		return nil, fmt.Errorf("excel engine: SUM: %w", err)
	}

	// ── Stream to bytes ──────────────────────────────────────────────────────
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, fmt.Errorf("excel engine: write: %w", err)
	}
	return buf.Bytes(), nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet injectors
// Based on template analysis:
//   HMZ/CLZ/KPZ/ANZ:
//     Row 3 = date (merged C3:I3)
//     Row 4 = headers
//     Row 5+ = data: A=key(hidden), C=serial, D=ward, E=reg_no, F=coverage%, G=distance, H=speed, I=remarks
//   SW:
//     Row 4 = date (merged C4:K4)
//     Row 5 = headers
//     Row 6+ = data: A=key(hidden), C=serial, D=ward, E=reg_no, F=start, G=end, H=hours, I=dist, J=speed, K=remarks
//   DEPARTED:
//     Row 1+ = data: A=key, B=serial, C=zone, D=ward, E=reg_no, F=start, G=end, H=hours, I=dist
//   EAR:
//     Row 1 = date (merged A1:H1)
//     Row 3 = headers
//     Row 4+ = data: A=serial, B=zone, C=ward, D=reg_no, E=start, F=end, G=hours, H=distance
//   SUM:
//     Row 4 = date (merged B4:H4)
//     Rows 6–9  = D2D zone rows: B=serial, C=zone, D=hoppers, E=not_worked, F=coverage%, G=distance, H=trips
//     Row 10    = totals
//     Rows 14–17 = SW zone rows
//     Row 18    = SW totals
// ─────────────────────────────────────────────────────────────────────────────

// setCell is a safe wrapper — only writes the value, never touches style.
func setCell(f *excelize.File, sheet, cell string, value interface{}) error {
	return f.SetCellValue(sheet, cell, value)
}

// injectZoneSheet populates one of HMZ / CLZ / KPZ / ANZ.
// Data starts at row 5, with the row key in col A (used by Excel formulas — we
// clear it since we're not relying on formulas; we leave existing keys and just
// overwrite the visible data columns C through I).
func injectZoneSheet(f *excelize.File, sheet, dateLabel string, rows []ZoneRow) error {
	// Update date cell (row 3, merged C3:I3 — write to C3 only)
	if err := setCell(f, sheet, "C3", dateLabel); err != nil {
		return err
	}

	// Clear all existing data rows first (rows 5 onwards, up to 300)
	// We clear cols C–I to avoid stale data from the template sample
	for row := 5; row <= 300; row++ {
		colsToClear := []string{"A", "C", "D", "E", "F", "G", "H", "I"}
		for _, col := range colsToClear {
			cell := fmt.Sprintf("%s%d", col, row)
			_ = f.SetCellValue(sheet, cell, "")
		}
	}

	// Write new data
	for i, row := range rows {
		excelRow := 5 + i
		serial := i + 1
		if err := setCell(f, sheet, fmt.Sprintf("C%d", excelRow), serial); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("D%d", excelRow), row.Ward); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("E%d", excelRow), row.RegistrationNo); err != nil {
			return err
		}

		// If there's an exception remark that replaces the numeric fields, merge into F
		if row.Remarks != "" && row.CoveragePercent == 0 && row.Distance == 0 {
			// Set remark spanning F:I (like GPS TAMPERED does in template)
			if err := setCell(f, sheet, fmt.Sprintf("F%d", excelRow), row.Remarks); err != nil {
				return err
			}
		} else {
			if err := setCell(f, sheet, fmt.Sprintf("F%d", excelRow), row.CoveragePercent); err != nil {
				return err
			}
			if err := setCell(f, sheet, fmt.Sprintf("G%d", excelRow), row.Distance); err != nil {
				return err
			}
			if err := setCell(f, sheet, fmt.Sprintf("H%d", excelRow), row.AverageSpeed); err != nil {
				return err
			}
			if err := setCell(f, sheet, fmt.Sprintf("I%d", excelRow), row.Remarks); err != nil {
				return err
			}
		}
	}
	return nil
}

// injectSWSheet populates the SW sheet.
// Headers at row 5; data starts at row 6.
func injectSWSheet(f *excelize.File, dateLabel string, rows []SWRow) error {
	sheet := "SW"
	if err := setCell(f, sheet, "C4", dateLabel); err != nil {
		return err
	}
	// Clear existing data rows
	for row := 6; row <= 300; row++ {
		for _, col := range []string{"A", "C", "D", "E", "F", "G", "H", "I", "J", "K"} {
			_ = f.SetCellValue(sheet, fmt.Sprintf("%s%d", col, row), "")
		}
	}
	for i, row := range rows {
		excelRow := 6 + i
		if err := setCell(f, sheet, fmt.Sprintf("C%d", excelRow), i+1); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("D%d", excelRow), row.Ward); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("E%d", excelRow), row.RegistrationNo); err != nil {
			return err
		}
		if row.StartTime != nil {
			if err := setCell(f, sheet, fmt.Sprintf("F%d", excelRow), row.StartTime.Format("3:04 PM")); err != nil {
				return err
			}
		}
		if row.EndTime != nil {
			if err := setCell(f, sheet, fmt.Sprintf("G%d", excelRow), row.EndTime.Format("3:04 PM")); err != nil {
				return err
			}
		}
		if err := setCell(f, sheet, fmt.Sprintf("H%d", excelRow), row.ActiveHours); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("I%d", excelRow), row.Distance); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("J%d", excelRow), row.AverageSpeed); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("K%d", excelRow), row.Remarks); err != nil {
			return err
		}
	}
	return nil
}

// injectDepartedSheet populates the DEPARTED sheet.
// Data starts at row 1 (no header rows in template).
// Columns: A=key, B=serial, C=zone, D=ward, E=reg_no, F=start, G=end, H=hours, I=dist
func injectDepartedSheet(f *excelize.File, rows []DepartedRow) error {
	sheet := "DEPARTED"
	// Clear existing data
	for row := 1; row <= 400; row++ {
		for _, col := range []string{"A", "B", "C", "D", "E", "F", "G", "H", "I"} {
			_ = f.SetCellValue(sheet, fmt.Sprintf("%s%d", col, row), "")
		}
	}
	for i, row := range rows {
		excelRow := 1 + i
		if err := setCell(f, sheet, fmt.Sprintf("B%d", excelRow), i+1); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("C%d", excelRow), row.Zone); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("D%d", excelRow), row.Ward); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("E%d", excelRow), row.RegistrationNo); err != nil {
			return err
		}
		if row.StartTime != nil {
			if err := setCell(f, sheet, fmt.Sprintf("F%d", excelRow), row.StartTime.Format("3:04 PM")); err != nil {
				return err
			}
		}
		if row.EndTime != nil {
			if err := setCell(f, sheet, fmt.Sprintf("G%d", excelRow), row.EndTime.Format("3:04 PM")); err != nil {
				return err
			}
		}
		if err := setCell(f, sheet, fmt.Sprintf("H%d", excelRow), row.ActiveHours); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("I%d", excelRow), row.Distance); err != nil {
			return err
		}
	}
	return nil
}

// injectEARSheet populates the EAR (Early Departure) sheet.
// Row 1 = date, Row 2 = title, Row 3 = headers, Row 4+ = data.
// Columns: A=serial, B=zone, C=ward, D=reg_no, E=start, F=end, G=hours, H=distance
func injectEARSheet(f *excelize.File, dateLabel string, rows []EARRow) error {
	sheet := "EAR"
	if err := setCell(f, sheet, "A1", dateLabel); err != nil {
		return err
	}
	// Clear existing data rows
	for row := 4; row <= 300; row++ {
		for _, col := range []string{"A", "B", "C", "D", "E", "F", "G", "H"} {
			_ = f.SetCellValue(sheet, fmt.Sprintf("%s%d", col, row), "")
		}
	}
	for i, row := range rows {
		excelRow := 4 + i
		if err := setCell(f, sheet, fmt.Sprintf("A%d", excelRow), i+1); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("B%d", excelRow), row.Zone); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("C%d", excelRow), row.Ward); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("D%d", excelRow), row.RegistrationNo); err != nil {
			return err
		}
		if row.StartTime != nil {
			if err := setCell(f, sheet, fmt.Sprintf("E%d", excelRow), row.StartTime.Format("3:04 PM")); err != nil {
				return err
			}
		}
		if row.EndTime != nil {
			if err := setCell(f, sheet, fmt.Sprintf("F%d", excelRow), row.EndTime.Format("3:04 PM")); err != nil {
				return err
			}
		}
		if err := setCell(f, sheet, fmt.Sprintf("G%d", excelRow), row.ActiveHours); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("H%d", excelRow), row.Distance); err != nil {
			return err
		}
	}
	return nil
}

// injectSUMSheet populates the SUM summary sheet.
// D2D section: rows 6–9 (4 zones), totals row 10
// SW section: rows 14–17 (4 zones), totals row 18
// Columns: B=serial, C=zone, D=hoppers, E=notWorked, F=coverage%, G=avgDist, H=trips
func injectSUMSheet(f *excelize.File, data *ReportData) error {
	sheet := "SUM"
	// Update date
	if err := setCell(f, sheet, "B4", data.DateLabel); err != nil {
		return err
	}

	// D2D zone rows (rows 6–9)
	for i, z := range data.D2DSummary {
		row := 6 + i
		if err := setCell(f, sheet, fmt.Sprintf("B%d", row), i+1); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("C%d", row), z.ZoneName); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("D%d", row), z.NoOfHoppers); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("E%d", row), z.NotWorked); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("F%d", row), fmt.Sprintf("%.2f", z.AvgCoverage)); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("G%d", row), fmt.Sprintf("%.2f", z.AvgDistance)); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("H%d", row), z.Trips); err != nil {
			return err
		}
	}

	// D2D totals row (row 10)
	if err := setCell(f, sheet, "D10", data.TotalD2DHoppers); err != nil {
		return err
	}
	if err := setCell(f, sheet, "E10", data.TotalNotWorked); err != nil {
		return err
	}
	if err := setCell(f, sheet, "F10", fmt.Sprintf("%.2f%%", data.OverallAvgCov)); err != nil {
		return err
	}
	if err := setCell(f, sheet, "G10", fmt.Sprintf("%.2fKM", data.OverallAvgDist)); err != nil {
		return err
	}
	if err := setCell(f, sheet, "H10", data.TotalTrips); err != nil {
		return err
	}

	// SW zone rows (rows 14–17)
	swTotalHoppers, swTotalNotWorked, swTotalTrips := 0, 0, 0
	var swTotalDist float64
	for i, z := range data.SWSummary {
		row := 14 + i
		if err := setCell(f, sheet, fmt.Sprintf("B%d", row), i+1); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("C%d", row), z.ZoneName); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("D%d", row), z.NoOfHoppers); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("E%d", row), z.NotWorked); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("G%d", row), fmt.Sprintf("%.2f", z.AvgDistance)); err != nil {
			return err
		}
		if err := setCell(f, sheet, fmt.Sprintf("H%d", row), z.Trips); err != nil {
			return err
		}
		swTotalHoppers += z.NoOfHoppers
		swTotalNotWorked += z.NotWorked
		swTotalDist += z.AvgDistance
		swTotalTrips += z.Trips
	}

	// SW totals row (row 18)
	if err := setCell(f, sheet, "D18", swTotalHoppers); err != nil {
		return err
	}
	if err := setCell(f, sheet, "E18", swTotalNotWorked); err != nil {
		return err
	}
	avgSWDist := 0.0
	if len(data.SWSummary) > 0 {
		avgSWDist = swTotalDist / float64(len(data.SWSummary))
	}
	if err := setCell(f, sheet, "G18", fmt.Sprintf("%.2fKM", avgSWDist)); err != nil {
		return err
	}
	if err := setCell(f, sheet, "H18", swTotalTrips); err != nil {
		return err
	}

	return nil
}
