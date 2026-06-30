package api

import "context"

// TestEmployeeRegion is an exported wrapper around the unexported employeeRegion method,
// allowing external test packages (e.g., tests/properties) to call it directly.
func (h *Handler) TestEmployeeRegion(ctx context.Context, employeeID int) (int, int, *int, error) {
	return h.employeeRegion(ctx, employeeID)
}
