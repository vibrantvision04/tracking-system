package ultimatereport

import (
	"bytes"
	"fmt"
	"path/filepath"
	"strings"

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

// injectZoneSheet populates date label and overrides Remarks (Column I) if a daily exception exists.
// Keeps the template's pre-populated rows and formulas intact.
func injectZoneSheet(f *excelize.File, sheet, dateLabel string, rows []ZoneRow) error {
	if err := setCell(f, sheet, "C3", dateLabel); err != nil {
		return err
	}

	remarksMap := make(map[string]string)
	for _, r := range rows {
		if r.Remarks != "" {
			remarksMap[r.RegistrationNo] = r.Remarks
		}
	}

	sheetRows, err := f.GetRows(sheet)
	if err != nil {
		return err
	}

	// Iterate through rows starting from row 5
	for i := 4; i < len(sheetRows); i++ {
		excelRow := i + 1
		if len(sheetRows[i]) > 0 {
			key := sheetRows[i][0] // Column A key (e.g. MORNING_RJ47GA7242)
			if key != "" && strings.Contains(key, "_") {
				parts := strings.Split(key, "_")
				regNo := parts[len(parts)-1]
				
				if remark, found := remarksMap[regNo]; found {
					cellI := fmt.Sprintf("I%d", excelRow)
					_ = f.SetCellValue(sheet, cellI, remark)
				}
			}
		}
	}

	return nil
}

// injectSWSheet populates date label and overrides Remarks (Column K) if an exception exists.
func injectSWSheet(f *excelize.File, dateLabel string, rows []SWRow) error {
	sheet := "SW"
	if err := setCell(f, sheet, "C4", dateLabel); err != nil {
		return err
	}

	remarksMap := make(map[string]string)
	for _, r := range rows {
		if r.Remarks != "" {
			remarksMap[r.RegistrationNo] = r.Remarks
		}
	}

	sheetRows, err := f.GetRows(sheet)
	if err != nil {
		return err
	}

	// SW data starts at row 6
	for i := 5; i < len(sheetRows); i++ {
		excelRow := i + 1
		if len(sheetRows[i]) > 0 {
			key := sheetRows[i][0] // Column A key
			if key != "" && strings.Contains(key, "_") {
				parts := strings.Split(key, "_")
				regNo := parts[len(parts)-1]
				
				if remark, found := remarksMap[regNo]; found {
					cellK := fmt.Sprintf("K%d", excelRow)
					_ = f.SetCellValue(sheet, cellK, remark)
				}
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
