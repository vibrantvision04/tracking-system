package export

import (
	"encoding/csv"
	"fmt"
	"gps-tracking-system/internal/repository"
	"io"
)

func ExportMovementReportsCSV(reports []repository.MovementReport, w io.Writer) error {
	writer := csv.NewWriter(w)
	defer writer.Flush()

	// Header
	header := []string{"Date", "IMEI", "Distance (km)", "Avg Speed", "Max Speed", "Active Duration", "Idle Duration", "Stoppage Duration", "Ignition Duration"}
	if err := writer.Write(header); err != nil {
		return err
	}

	// Data
	for _, r := range reports {
		row := []string{
			r.ReportDate.Format("2006-01-02"),
			r.IMEI,
			fmt.Sprintf("%.2f", r.TotalDistance),
			fmt.Sprintf("%.2f", r.AverageSpeed),
			fmt.Sprintf("%.2f", r.MaxSpeed),
			r.TotalActiveDuration,
			r.TotalIdleDuration,
			r.TotalStoppageDuration,
			r.TotalIgnitionOnDuration,
		}
		if err := writer.Write(row); err != nil {
			return err
		}
	}

	return nil
}
