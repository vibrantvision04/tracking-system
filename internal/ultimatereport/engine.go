package ultimatereport

import (
	"bytes"
	"fmt"
	"path/filepath"

	"gps-tracking-system/internal/utils"

	"github.com/xuri/excelize/v2"
)

// ─────────────────────────────────────────────────────────────────────────────
// ExcelEngine — template-driven Excel generator
// Opens the template file, injects data into predefined cells, returns bytes.
// Preserves all existing formatting and formulas by populating DISTANCE and COV.
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

	// ── Inject raw data sheets first so that VLOOKUP formulas evaluate ─────────
	if err := injectDistanceSheet(f, data.RawMovements); err != nil {
		return nil, fmt.Errorf("excel engine: DISTANCE: %w", err)
	}
	if err := injectCovSheet(f, data.RawCoverages); err != nil {
		return nil, fmt.Errorf("excel engine: COV: %w", err)
	}

	// ── Inject Date Labels and Remarks (Exceptions) ──────────────────────────
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

// setCell is a safe wrapper — only writes the value, never touches style.
func setCell(f *excelize.File, sheet, cell string, value interface{}) error {
	return f.SetCellValue(sheet, cell, value)
}

// injectDistanceSheet populates raw movement report data in the DISTANCE sheet.
func injectDistanceSheet(f *excelize.File, rows []RawMovementInfo) error {
	sheet := "DISTANCE"
	// Clear existing rows (rows 2 to 1000)
	for row := 2; row <= 1000; row++ {
		for _, col := range []string{"A", "B", "C", "D", "E", "F"} {
			_ = f.SetCellValue(sheet, fmt.Sprintf("%s%d", col, row), "")
		}
	}
	// Write new data
	for i, r := range rows {
		row := 2 + i
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", row), r.RegistrationNo)
		if r.StartTime != nil {
			_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", row), r.StartTime.In(utils.IndianLocation).Format("3:04 PM"))
		} else {
			_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", row), "-")
		}
		if r.EndTime != nil {
			_ = f.SetCellValue(sheet, fmt.Sprintf("C%d", row), r.EndTime.In(utils.IndianLocation).Format("3:04 PM"))
		} else {
			_ = f.SetCellValue(sheet, fmt.Sprintf("C%d", row), "-")
		}
		_ = f.SetCellValue(sheet, fmt.Sprintf("D%d", row), r.ActiveHours)
		_ = f.SetCellValue(sheet, fmt.Sprintf("E%d", row), r.Distance)
		_ = f.SetCellValue(sheet, fmt.Sprintf("F%d", row), r.AverageSpeed)
	}
	return nil
}

// injectCovSheet populates raw coverage percentage data in the COV sheet.
func injectCovSheet(f *excelize.File, rows []RawCoverageInfo) error {
	sheet := "COV"
	// Clear existing rows (rows 1 to 1000)
	for row := 1; row <= 1000; row++ {
		for _, col := range []string{"A", "B", "C"} {
			_ = f.SetCellValue(sheet, fmt.Sprintf("%s%d", col, row), "")
		}
	}
	// Write new data
	for i, r := range rows {
		row := 1 + i
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", row), r.Key)
		_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", row), r.RegistrationNo)
		_ = f.SetCellValue(sheet, fmt.Sprintf("C%d", row), r.CoveragePercent)
	}
	return nil
}

// injectZoneSheet populates date label and dynamically writes vehicle keys, serials, wards, and VLOOKUP formulas.
// Keeps the template's AVERAGE row intact at its fixed index.
func injectZoneSheet(f *excelize.File, sheet, dateLabel string, rows []ZoneRow) error {
	if err := setCell(f, sheet, "C3", dateLabel); err != nil {
		return err
	}

	var avgRow int
	switch sheet {
	case "HMZ":
		avgRow = 86
	case "CLZ":
		avgRow = 76
	case "KPZ":
		avgRow = 47
	case "ANZ":
		avgRow = 70
	default:
		return fmt.Errorf("unknown sheet: %s", sheet)
	}

	// Write vehicles
	for i, r := range rows {
		excelRow := 5 + i
		if excelRow >= avgRow {
			break // do not overwrite average row
		}
		
		key := "MORNING_" + r.RegistrationNo
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", excelRow), key)
		_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", excelRow), "")
		_ = f.SetCellValue(sheet, fmt.Sprintf("C%d", excelRow), i+1)
		_ = f.SetCellValue(sheet, fmt.Sprintf("D%d", excelRow), r.Ward)

		// Set VLOOKUP formulas
		_ = f.SetCellFormula(sheet, fmt.Sprintf("E%d", excelRow), fmt.Sprintf("VLOOKUP(A%d,COV!$1:$1048576,2,0)", excelRow))
		_ = f.SetCellFormula(sheet, fmt.Sprintf("F%d", excelRow), fmt.Sprintf("VLOOKUP(A%d,COV!$1:$1048576,3,0)", excelRow))
		_ = f.SetCellFormula(sheet, fmt.Sprintf("G%d", excelRow), fmt.Sprintf("VLOOKUP(E%d,DISTANCE!$1:$1048576,5,0)", excelRow))
		_ = f.SetCellFormula(sheet, fmt.Sprintf("H%d", excelRow), fmt.Sprintf("VLOOKUP(E%d,DISTANCE!$1:$1048576,6,0)", excelRow))

		if r.Remarks != "" {
			_ = f.SetCellFormula(sheet, fmt.Sprintf("I%d", excelRow), "")
			_ = f.SetCellValue(sheet, fmt.Sprintf("I%d", excelRow), r.Remarks)
		} else {
			_ = f.SetCellFormula(sheet, fmt.Sprintf("I%d", excelRow), fmt.Sprintf("IF(F%d<70,\"DRIVER FAULT\",\"\")", excelRow))
		}
	}

	// Clear unused rows
	for row := 5 + len(rows); row < avgRow; row++ {
		for _, col := range []string{"A", "B", "C", "D", "E", "F", "G", "H", "I"} {
			cell := fmt.Sprintf("%s%d", col, row)
			_ = f.SetCellFormula(sheet, cell, "")
			_ = f.SetCellValue(sheet, cell, "")
		}
	}

	return nil
}

// injectSWSheet populates date label and dynamically populates SW sheet sections.
func injectSWSheet(f *excelize.File, dateLabel string, rows []SWRow) error {
	sheet := "SW"
	if err := setCell(f, sheet, "C4", dateLabel); err != nil {
		return err
	}

	swByZone := make(map[string][]SWRow)
	for _, r := range rows {
		code := r.ZoneCode
		if code == "" {
			code = "HMZ" // fallback
		}
		swByZone[code] = append(swByZone[code], r)
	}

	sections := []struct {
		ZoneCode string
		StartRow int
		EndRow   int
	}{
		{"HMZ", 6, 50},
		{"CLZ", 57, 90},
		{"KPZ", 97, 147},
		{"ANZ", 154, 198},
	}

	for _, sec := range sections {
		zoneRows := swByZone[sec.ZoneCode]
		for i, r := range zoneRows {
			excelRow := sec.StartRow + i
			if excelRow > sec.EndRow {
				break // do not overwrite next headers or average
			}

			key := "SWEEPING_" + r.RegistrationNo
			_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", excelRow), key)
			_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", excelRow), "")
			_ = f.SetCellValue(sheet, fmt.Sprintf("C%d", excelRow), i+1)
			_ = f.SetCellValue(sheet, fmt.Sprintf("D%d", excelRow), r.Ward)

			// Set formulas
			_ = f.SetCellFormula(sheet, fmt.Sprintf("E%d", excelRow), fmt.Sprintf("VLOOKUP(A%d,COV!$1:$1048576,2,0)", excelRow))
			_ = f.SetCellFormula(sheet, fmt.Sprintf("F%d", excelRow), fmt.Sprintf("VLOOKUP(E%d,DISTANCE!$1:$1048576,2,0)", excelRow))
			_ = f.SetCellFormula(sheet, fmt.Sprintf("G%d", excelRow), fmt.Sprintf("VLOOKUP(E%d,DISTANCE!$1:$1048576,3,0)", excelRow))
			_ = f.SetCellFormula(sheet, fmt.Sprintf("H%d", excelRow), fmt.Sprintf("VLOOKUP(E%d,DISTANCE!$1:$1048576,4,0)", excelRow))
			_ = f.SetCellFormula(sheet, fmt.Sprintf("I%d", excelRow), fmt.Sprintf("VLOOKUP(E%d,DISTANCE!$1:$1048576,5,0)", excelRow))
			_ = f.SetCellFormula(sheet, fmt.Sprintf("J%d", excelRow), fmt.Sprintf("VLOOKUP(E%d,DISTANCE!$1:$1048576,6,0)", excelRow))

			if r.Remarks != "" {
				_ = f.SetCellFormula(sheet, fmt.Sprintf("K%d", excelRow), "")
				_ = f.SetCellValue(sheet, fmt.Sprintf("K%d", excelRow), r.Remarks)
			} else {
				_ = f.SetCellFormula(sheet, fmt.Sprintf("K%d", excelRow), "")
				_ = f.SetCellValue(sheet, fmt.Sprintf("K%d", excelRow), "")
			}
		}

		// Clear unused rows in this section
		for row := sec.StartRow + len(zoneRows); row <= sec.EndRow; row++ {
			for _, col := range []string{"A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"} {
				cell := fmt.Sprintf("%s%d", col, row)
				_ = f.SetCellFormula(sheet, cell, "")
				_ = f.SetCellValue(sheet, cell, "")
			}
		}
	}

	return nil
}

// injectDepartedSheet populates the DEPARTED sheet.
// Data starts at row 1 (no header rows in template).
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
			if err := setCell(f, sheet, fmt.Sprintf("F%d", excelRow), row.StartTime.In(utils.IndianLocation).Format("3:04 PM")); err != nil {
				return err
			}
		}
		if row.EndTime != nil {
			if err := setCell(f, sheet, fmt.Sprintf("G%d", excelRow), row.EndTime.In(utils.IndianLocation).Format("3:04 PM")); err != nil {
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
func injectEARSheet(f *excelize.File, dateLabel string, rows []EARRow) error {
	sheet := "EAR"
	if err := setCell(f, sheet, "A1", dateLabel); err != nil {
		return err
	}
	// Clear existing data rows (row 4 onwards)
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
			if err := setCell(f, sheet, fmt.Sprintf("E%d", excelRow), row.StartTime.In(utils.IndianLocation).Format("3:04 PM")); err != nil {
				return err
			}
		}
		if row.EndTime != nil {
			if err := setCell(f, sheet, fmt.Sprintf("F%d", excelRow), row.EndTime.In(utils.IndianLocation).Format("3:04 PM")); err != nil {
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
// Only overwrites non-formula values (NO. OF HOPPERS, TRIPS).
// Leaves all COUNTIF, SUM, and AVERAGE formulas intact.
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
		if err := setCell(f, sheet, fmt.Sprintf("H%d", row), z.Trips); err != nil {
			return err
		}
	}

	// SW zone rows (rows 14–17)
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
		if err := setCell(f, sheet, fmt.Sprintf("H%d", row), z.Trips); err != nil {
			return err
		}
	}

	return nil
}
