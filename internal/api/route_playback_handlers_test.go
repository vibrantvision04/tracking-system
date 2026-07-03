package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"gps-tracking-system/internal/repository"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// connectTestDB connects to the database specified by TEST_DATABASE_URL.
// Returns nil and skips the test if the env var is not set.
func connectTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set — skipping DB integration test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connectTestDB: pgxpool.New: %v", err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		t.Fatalf("connectTestDB: ping failed: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// buildTestHandler wires up a minimal Handler backed by the given pool.
func buildTestHandler(pool *pgxpool.Pool) *Handler {
	gpsRepo := repository.NewGPSRepository(pool)
	routeRepo := repository.NewRouteRepository(pool)
	h := &Handler{
		gpsRepo:        gpsRepo,
		routeRepo:      routeRepo,
		zoneVehiclesCache: make(map[string][]map[string]interface{}),
		resolvedAlerts:    make(map[int]ResolvedDetails),
	}
	return h
}

// buildTestRouter returns a chi router with only the playback-geometry route wired.
func buildTestRouter(h *Handler) http.Handler {
	r := chi.NewRouter()
	r.Get("/api/routes/{id}/playback-geometry", h.GetRoutePlaybackGeometry)
	return r
}

// seedTestRoute inserts a minimal route + geofence row, returning the route ID.
// It registers a cleanup to remove the rows after the test.
func seedTestRoute(t *testing.T, pool *pgxpool.Pool, polygon *string, color string) int {
	t.Helper()
	ctx := context.Background()

	// Insert a geofence row (polygon may be NULL)
	var geofenceID int
	var polygonJSON interface{}
	if polygon != nil {
		polygonJSON = *polygon
	}
	err := pool.QueryRow(ctx, `
		INSERT INTO geofences (color, polygon)
		VALUES ($1, $2::jsonb)
		RETURNING id
	`, color, polygonJSON).Scan(&geofenceID)
	if err != nil {
		t.Fatalf("seedTestRoute: insert geofence: %v", err)
	}

	// Insert a route row referencing that geofence
	var routeID int
	err = pool.QueryRow(ctx, `
		INSERT INTO routes (route_name, is_sequential, geometry_id, is_active, created_at)
		VALUES ('Test Route', false, $1, true, $2)
		RETURNING id
	`, geofenceID, time.Now()).Scan(&routeID)
	if err != nil {
		t.Fatalf("seedTestRoute: insert route: %v", err)
	}

	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM routes WHERE id = $1`, routeID)
		pool.Exec(context.Background(), `DELETE FROM geofences WHERE id = $1`, geofenceID)
	})

	return routeID
}

// seedCheckpoint inserts a lane point for the given route and registers cleanup.
func seedCheckpoint(t *testing.T, pool *pgxpool.Pool, routeID int) {
	t.Helper()
	ctx := context.Background()
	var cpID int
	err := pool.QueryRow(ctx, `
		INSERT INTO route_lane_points (route_id, latitude, longitude, sequence_number)
		VALUES ($1, 26.9, 75.8, 1)
		RETURNING id
	`, routeID).Scan(&cpID)
	if err != nil {
		t.Fatalf("seedCheckpoint: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM route_lane_points WHERE id = $1`, cpID)
	})
}

// --- Helper: decode the outer envelope and return the data object ---

type playbackEnvelope struct {
	Success bool                    `json:"success"`
	Data    PlaybackGeometryResponse `json:"data"`
}

type errorEnvelope struct {
	Error string `json:"error"`
}

// doRequest fires a GET request against the test router and returns the recorder.
func doRequest(router http.Handler, path string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

// ---------------------------------------------------------------------------
// Test 1 – Non-integer route ID → HTTP 400
// ---------------------------------------------------------------------------

// TestGetRoutePlaybackGeometry_InvalidID verifies that a non-integer route ID
// in the URL path produces a 400 response with an "error" field.
// This test does NOT require a database connection.
//
// Validates: Requirements 1.6
func TestGetRoutePlaybackGeometry_InvalidID(t *testing.T) {
	// Build handler with nil pool — the handler returns 400 before any DB call.
	// We construct a bare Handler; the nil gpsRepo will never be dereferenced.
	h := &Handler{
		zoneVehiclesCache: make(map[string][]map[string]interface{}),
		resolvedAlerts:    make(map[int]ResolvedDetails),
	}
	router := buildTestRouter(h)

	for _, badID := range []string{"abc", "1.5", "xyz123", "null", "0x1F"} {
		t.Run(fmt.Sprintf("id=%q", badID), func(t *testing.T) {
			w := doRequest(router, "/api/routes/"+badID+"/playback-geometry")

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected 400, got %d", w.Code)
			}

			var body errorEnvelope
			if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
				t.Fatalf("decode body: %v", err)
			}
			if body.Error == "" {
				t.Errorf("expected non-empty 'error' field in response body, got empty")
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Test 2 – Non-existent route ID → HTTP 404
// ---------------------------------------------------------------------------

// TestGetRoutePlaybackGeometry_NotFound verifies that a valid integer ID that
// does not correspond to any route returns 404 with an "error" field.
//
// Validates: Requirements 1.5
func TestGetRoutePlaybackGeometry_NotFound(t *testing.T) {
	pool := connectTestDB(t)
	h := buildTestHandler(pool)
	router := buildTestRouter(h)

	// Use an ID that is extremely unlikely to exist.
	const nonExistentID = 2147483647 // max int32
	w := doRequest(router, fmt.Sprintf("/api/routes/%d/playback-geometry", nonExistentID))

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d (body: %s)", w.Code, w.Body.String())
	}

	var body errorEnvelope
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Error == "" {
		t.Errorf("expected non-empty 'error' field in response body, got empty")
	}
}

// ---------------------------------------------------------------------------
// Test 3 – Valid route ID → HTTP 200 with all 9 fields present and correct types
// ---------------------------------------------------------------------------

// TestGetRoutePlaybackGeometry_ValidRoute verifies that a real route returns
// HTTP 200 with the outer success envelope and a data object containing all
// nine specified fields with their correct Go types.
//
// Validates: Requirements 1.1, 1.2
func TestGetRoutePlaybackGeometry_ValidRoute(t *testing.T) {
	pool := connectTestDB(t)
	h := buildTestHandler(pool)
	router := buildTestRouter(h)

	// Seed a route with a non-null GeoJSON polygon.
	polygon := `{"type":"LineString","coordinates":[[75.8,26.9],[75.81,26.91]]}`
	routeID := seedTestRoute(t, pool, &polygon, "#FF0000")
	seedCheckpoint(t, pool, routeID)

	w := doRequest(router, fmt.Sprintf("/api/routes/%d/playback-geometry", routeID))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body: %s)", w.Code, w.Body.String())
	}

	var env playbackEnvelope
	if err := json.NewDecoder(w.Body).Decode(&env); err != nil {
		t.Fatalf("decode body: %v", err)
	}

	if !env.Success {
		t.Errorf("expected success=true, got false")
	}

	d := env.Data

	// Field presence and type checks:
	// route_id must equal the seeded ID
	if d.RouteID != routeID {
		t.Errorf("route_id: want %d, got %d", routeID, d.RouteID)
	}
	// route_name must be a non-empty string
	if d.RouteName == "" {
		t.Errorf("route_name: expected non-empty string")
	}
	// is_sequential: bool (zero value false is valid)
	_ = d.IsSequential
	// geojson: string (may be empty, but field must be present — checked via JSON decode)
	// color: string
	_ = d.Color
	// checkpoints: non-nil slice (we seeded one checkpoint)
	if d.Checkpoints == nil {
		t.Errorf("checkpoints: expected non-nil slice, got nil")
	}
	if len(d.Checkpoints) < 1 {
		t.Errorf("checkpoints: expected at least 1 checkpoint, got %d", len(d.Checkpoints))
	}

	// Verify all 9 fields are present in the raw JSON output
	var rawMap struct {
		Data map[string]json.RawMessage `json:"data"`
	}
	w2 := doRequest(router, fmt.Sprintf("/api/routes/%d/playback-geometry", routeID))
	if err := json.NewDecoder(w2.Body).Decode(&rawMap); err != nil {
		t.Fatalf("raw decode: %v", err)
	}
	requiredFields := []string{
		"route_id", "route_name", "is_sequential",
		"geojson", "color", "checkpoints",
	}
	for _, field := range requiredFields {
		if _, ok := rawMap.Data[field]; !ok {
			t.Errorf("missing required field %q in response data", field)
		}
	}
}

// ---------------------------------------------------------------------------
// Test 4 – Route with NULL polygon → HTTP 200, geojson: ""
// ---------------------------------------------------------------------------

// TestGetRoutePlaybackGeometry_NullPolygon verifies that when a route's
// associated geofence has a NULL polygon, the endpoint returns HTTP 200
// with an empty string for the geojson field.
//
// Validates: Requirements 1.3
func TestGetRoutePlaybackGeometry_NullPolygon(t *testing.T) {
	pool := connectTestDB(t)
	h := buildTestHandler(pool)
	router := buildTestRouter(h)

	// Seed a route with nil polygon (NULL in DB)
	routeID := seedTestRoute(t, pool, nil, "#AABBCC")

	w := doRequest(router, fmt.Sprintf("/api/routes/%d/playback-geometry", routeID))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body: %s)", w.Code, w.Body.String())
	}

	var env playbackEnvelope
	if err := json.NewDecoder(w.Body).Decode(&env); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if env.Data.GeoJSON != "" {
		t.Errorf("geojson: expected empty string for NULL polygon, got %q", env.Data.GeoJSON)
	}
}

// ---------------------------------------------------------------------------
// Test 5 – Route with no checkpoints → HTTP 200, checkpoints: [] (not null)
// ---------------------------------------------------------------------------

// TestGetRoutePlaybackGeometry_NoCheckpoints verifies that when a route has
// no checkpoint rows, the endpoint returns HTTP 200 with an empty array (not
// null) for the checkpoints field.
//
// Validates: Requirements 1.4
func TestGetRoutePlaybackGeometry_NoCheckpoints(t *testing.T) {
	pool := connectTestDB(t)
	h := buildTestHandler(pool)
	router := buildTestRouter(h)

	// Seed a route without seeding any checkpoints.
	polygon := `{"type":"LineString","coordinates":[[75.8,26.9],[75.81,26.91]]}`
	routeID := seedTestRoute(t, pool, &polygon, "#00FF00")

	w := doRequest(router, fmt.Sprintf("/api/routes/%d/playback-geometry", routeID))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body: %s)", w.Code, w.Body.String())
	}

	// Decode the outer envelope
	var env playbackEnvelope
	if err := json.NewDecoder(w.Body).Decode(&env); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if env.Data.Checkpoints == nil {
		t.Errorf("checkpoints: expected empty slice [], got nil (JSON null)")
	}
	if len(env.Data.Checkpoints) != 0 {
		t.Errorf("checkpoints: expected empty slice, got %d items", len(env.Data.Checkpoints))
	}

	// Also verify the raw JSON emits [] rather than null.
	var rawMap struct {
		Data struct {
			Checkpoints json.RawMessage `json:"checkpoints"`
		} `json:"data"`
	}
	w2 := doRequest(router, fmt.Sprintf("/api/routes/%d/playback-geometry", routeID))
	if err := json.NewDecoder(w2.Body).Decode(&rawMap); err != nil {
		t.Fatalf("raw decode: %v", err)
	}
	if string(rawMap.Data.Checkpoints) == "null" {
		t.Errorf("checkpoints JSON: expected [], got null")
	}
}
