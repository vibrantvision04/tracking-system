package export

import (
	"fmt"
	"gps-tracking-system/internal/repository"
	"io"

	"github.com/jung-kurt/gofpdf"
)

func ExportMovementReportPDF(reports []repository.MovementReport, w io.Writer) error {
	pdf := gofpdf.New("L", "mm", "A4", "")
	pdf.AddPage()
	pdf.SetFont("Arial", "B", 16)
	pdf.Cell(0, 10, "ISWM Jaipur Heritage - Movement Report")
	pdf.Ln(12)

	// Table Header
	pdf.SetFont("Arial", "B", 10)
	headers := []string{"Date", "IMEI", "Distance (km)", "Avg Speed", "Active Dur", "Idle Dur", "Stop Dur", "Ignition Dur"}
	widths := []float64{25, 40, 30, 25, 30, 30, 30, 30}

	for i, h := range headers {
		pdf.CellFormat(widths[i], 7, h, "1", 0, "C", false, 0, "")
	}
	pdf.Ln(-1)

	// Table Body
	pdf.SetFont("Arial", "", 9)
	for _, r := range reports {
		pdf.CellFormat(widths[0], 6, r.ReportDate.Format("2006-01-02"), "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[1], 6, r.IMEI, "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[2], 6, fmt.Sprintf("%.2f", r.TotalDistance), "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[3], 6, fmt.Sprintf("%.2f", r.AverageSpeed), "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[4], 6, r.TotalActiveDuration, "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[5], 6, r.TotalIdleDuration, "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[6], 6, r.TotalStoppageDuration, "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[7], 6, r.TotalIgnitionOnDuration, "1", 0, "C", false, 0, "")
		pdf.Ln(-1)
	}

	return pdf.Output(w)
}
