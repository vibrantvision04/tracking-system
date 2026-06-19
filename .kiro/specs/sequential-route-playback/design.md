# Design Document: Sequential Route Playback & Dense Area Snapping System

## Overview

This document formalises the technical design for the Sequential Route Playback & Dense Area Snapping System. The feature solves a concrete problem: GPS-equipped waste collection vehicles operating in heritage sectors of Jaipur (dense, narrow-street grids) produce playback trails that jump between parallel streets and skip across non-adjacent road segments due to GPS drift. Standard nearest-point snapping fails in this environment because a drifted GPS point is often closer to a neighbouring parallel street than to the correct road segment.

The solution locks playback to the pre-stored route geometry by processing GPS points through a **sequential snapping engine** (`buildSequentialSnappedPlayback`) that:

1. Extracts an ordered road-coordinate array from a route's GeoJSON geometry.
2. Maps each route checkpoint to a specific index in that array (monotonically).
3. Constrains all nearest-point searches to the *active segment* — the sub-array between the last validated checkpoint and the next expected one.
4. Validates checkpoint hits in strict sequence order via a state machine.
5. Falls back to raw GPS when the vehicle leaves the corridor or violates sequence order.

**Scope boundary**: This is purely a playback visualisation improvement. It does not touch GPS storage, live tracking, checkpoint hit detection for coverage reporting, D2D calculations, or route assignment logic.

---

## Architecture

### High-Level Data Flow

```mermaid
flowchart TD
    A[Operator selects vehicle + date range on Playback Page] --> B{Route is sequential?}
    B -- Yes --> C[GET /api/routes/{id}/playback-geometry]
    B -- No --> D[fetchMapMatchedRouteTurf standard snapping]
    C --> E[PlaybackGeometryResponse\nroute metadata + GeoJSON + checkpoints]
    E --> F[buildSequentialSnappedPlayback\nSnapping Engine]
    F --> G1[parseGeoJSON → Road_Coords]
    G1 --> G2[mapCheckpointsToRoadIndices\nmonotonic forward search]
    G2 --> G3[Point iteration loop\nsequence state machine + active segment lock]
    G3 --> H[snappedCoords: LatLng[]]
    H --> I[Render Polyline on Leaflet map]
    D --> I
```

### Component Boundaries

| Component | Location | Responsibility |
|---|---|---|
| `GetRoutePlaybackGeometry` | `internal/api/route_playback_handlers.go` | HTTP handler; DB join + checkpoint fetch |
| `buildSequentialSnappedPlayback` | `web/src/app/playback/page.tsx` | Core snapping engine (pure function) |
| `parseRouteGeoJSON` | `web/src/app/playback/page.tsx` | GeoJSON → Road_Coords extraction |
| `mapCheckpointsToRoadIndices` | `web/src/app/playback/page.tsx` | Monotonic checkpoint → index mapping |
| Route Editor UI | `web/src/app/vswm/route/page.tsx` | Sequential config fields |
| `routes` table | PostgreSQL | `is_sequential`, `corridor_meters`, `route_direction`, `seq_lookahead` |
| `route_checkpoints` table | PostgreSQL | `sequence_order`, `radius_meters`, `latitude`, `longitude` |
| `geofences` table | PostgreSQL | `polygon` (GeoJSON geometry), `color` |

---

## Components and Interfaces

### Backend: `GetRoutePlaybackGeometry`

**Route**: `GET /api/routes/{id}/playback-geometry`  
**File**: `internal/api/route_playback_handlers.go`

The handler already exists. This section documents the expected contract.

#### Request

| Parameter | Type | Source | Validation |
|---|---|---|---|
| `id` | integer | URL path | Must parse as `int`; return 400 if not |

#### Response Struct

```go
type PlaybackGeometryResponse struct {
    RouteID        int                          `json:"route_id"`
    RouteName      string                       `json:"route_name"`
    IsSequential   bool                         `json:"is_sequential"`
    CorridorMeters float64                      `json:"corridor_meters"`
    RouteDirection string                       `json:"route_direction"`
    SeqLookahead   int                          `json:"seq_lookahead"`
    GeoJSON        string                       `json:"geojson"`
    Color          string                       `json:"color"`
    Checkpoints    []repository.RouteCheckpoint `json:"checkpoints"`
}
```

Outer envelope: `{ "success": true, "data": PlaybackGeometryResponse }`.

#### Database Query Structure

The handler resolves the route and its geometry in a single `QueryRow` using a `LEFT JOIN` between `routes` and `geofences`:

```sql
SELECT
    r.id,
    COALESCE(r.route_name, ''),
    COALESCE(r.is_sequential, false),
    COALESCE(r.corridor_meters, 50.0),
    COALESCE(r.route_direction, 'both'),
    COALESCE(r.seq_lookahead, 5),
    COALESCE(g.polygon::text, ''),
    COALESCE(g.color, '')
FROM routes r
LEFT JOIN geofences g ON r.geometry_id = g.id
WHERE r.id = $1
```

After this single round-trip, `GetCheckpointsByRoute` is called to fetch checkpoints ordered by `sequence_order ASC`. If no rows exist, an empty slice is returned — never `null`.

#### Error Handling

| Condition | HTTP Status | Body |
|---|---|---|
| `id` not parseable as int | 400 | `{"error": "Invalid route ID"}` |
| Route not found / query fails | 404 | `{"error": "Route not found or database query failed"}` |
| Checkpoint fetch fails | 200 (graceful) | `checkpoints: []` |

---

### Frontend: `buildSequentialSnappedPlayback`

**File**: `web/src/app/playback/page.tsx`

This is the core pure function. Its signature:

```typescript
function buildSequentialSnappedPlayback(
  gpsPoints:       GpsDataPoint[],
  roadCoords:      [number, number][],   // [lat, lng] ordered
  checkpoints:     RouteCheckpoint[],    // already sorted by sequence_order
  corridorMeters:  number,
  routeDirection:  'outbound' | 'return' | 'both',
): [number, number][]
```

**Invariant**: `output.length === gpsPoints.length` for all inputs.

#### Step 1: GeoJSON Parsing → Road_Coords

`parseRouteGeoJSON(geojson: string): [number, number][]`

The function handles three geometry types and two wrapper types:

```
Input GeoJSON
  └─ Feature? → unwrap to geometry
      └─ FeatureCollection? → unwrap first feature → geometry
          ├─ LineString   → coordinates: [lng, lat][]  → swap → [lat, lng][]
          └─ MultiLineString → coordinates[][]: [lng, lat][]  → swap each → concat → [lat, lng][]
```

**Coordinate swap rule**: GeoJSON stores coordinates as `[longitude, latitude]`. The snapping engine works in `[latitude, longitude]` (matching Leaflet convention). Every coordinate must be swapped on extraction.

**Fallback**: If parsing throws or yields 0 coordinates, `buildSequentialSnappedPlayback` returns the raw GPS coordinates unchanged.

#### Step 2: Direction Normalisation

Before any mapping or iteration:

```typescript
const normalisedCheckpoints = routeDirection === 'return'
  ? [...checkpoints].reverse()
  : checkpoints;  // 'outbound' and 'both' use ascending order
```

All subsequent logic uses `normalisedCheckpoints`. This means for a `return` route, index 0 of `normalisedCheckpoints` is the highest `sequence_order` checkpoint (first to be hit on the return leg).

#### Step 3: Checkpoint → Road_Coords Monotonic Mapping

`mapCheckpointsToRoadIndices(checkpoints, roadCoords): number[]`

Called **once** before the point iteration loop. Returns `checkpointRoadIndices: number[]` where `checkpointRoadIndices[i]` is the index in `roadCoords` nearest to `normalisedCheckpoints[i]`.

**Algorithm** (monotonic forward search):

```
searchFrom = 0
for i = 0 to checkpoints.length - 1:
    bestIndex = searchFrom
    bestDist  = haversine(checkpoints[i], roadCoords[searchFrom])
    for j = searchFrom + 1 to roadCoords.length - 1:
        d = haversine(checkpoints[i], roadCoords[j])
        if d < bestDist:
            bestDist  = d
            bestIndex = j
    checkpointRoadIndices[i] = bestIndex
    searchFrom = bestIndex          // never go backwards
```

**Invariant**: `checkpointRoadIndices[i] <= checkpointRoadIndices[i+1]` for all `i`.  
**Duplicate tolerance**: Two checkpoints may resolve to the same index; this is accepted without error.

#### Step 4: Sequence State Machine

Runtime state per playback session:

```typescript
let lastValidatedCpIdx = -1;   // -1 = no checkpoint validated yet
let isSequenceInvalid  = false;
```

State is **reset** each time a new playback session is initiated (requirement 9.5).

**Per-GPS-point evaluation** (only when `isSequenceInvalid === false`):

```
nextExpected = lastValidatedCpIdx + 1

if nextExpected < normalisedCheckpoints.length:
    cp = normalisedCheckpoints[nextExpected]
    dist = haversine(gpsPoint, cp)

    if dist <= cp.radius_meters (default 30 m if not set):
        lastValidatedCpIdx++          // advance — correct in-order hit
    else:
        // scan within lookahead window for an out-of-order hit
        for k = nextExpected + 1 to min(nextExpected + seqLookahead, checkpoints.length - 1):
            if haversine(gpsPoint, normalisedCheckpoints[k]) <= normalisedCheckpoints[k].radius_meters:
                console.warn(`Sequence violation: skipped cp ${nextExpected}, hit cp ${k}`)
                isSequenceInvalid = true
                break
```

Once `isSequenceInvalid = true`, the remaining loop simply copies raw GPS coordinates without any distance calculations (early-exit for performance).

#### Step 5: Active Segment Lock

The active segment is defined by `lastValidatedCpIdx` at the time each GPS point is processed:

| `lastValidatedCpIdx` | Active Segment |
|---|---|
| `-1` (none validated) | `roadCoords[0 .. checkpointRoadIndices[0]]` inclusive |
| `k` (0 ≤ k < last cp) | `roadCoords[checkpointRoadIndices[k] .. checkpointRoadIndices[k+1]]` inclusive |
| last checkpoint index | `roadCoords[checkpointRoadIndices[last] .. roadCoords.length-1]` |

**Nearest-in-segment search**:

```
segStart = activeSegmentStart(lastValidatedCpIdx)
segEnd   = activeSegmentEnd(lastValidatedCpIdx)

bestRoadIdx  = segStart
bestDist     = haversine(gpsPoint, roadCoords[segStart])
for j = segStart + 1 to segEnd:
    d = haversine(gpsPoint, roadCoords[j])
    if d < bestDist:
        bestDist    = d
        bestRoadIdx = j

if bestDist <= corridorMeters:
    output[i] = roadCoords[bestRoadIdx]   // snapped
else:
    output[i] = [gpsPoint.lat, gpsPoint.lng]  // corridor fallback → raw GPS
```

The engine **never** searches outside the active segment bounds, even if a closer road coordinate exists on a nearby parallel street.

---

## Data Models

### `routes` table — snapping columns

| Column | Type | Default | Description |
|---|---|---|---|
| `is_sequential` | `boolean` | `false` | Enables the sequential snapping engine |
| `corridor_meters` | `float8` | `50.0` | Max perpendicular distance for snapping |
| `route_direction` | `varchar` | `'both'` | `'outbound'`, `'return'`, or `'both'` |
| `seq_lookahead` | `integer` | `5` | Checkpoint lookahead window for violation detection |

### `route_checkpoints` table

| Column | Type | Description |
|---|---|---|
| `id` | `integer` | PK |
| `route_id` | `integer` | FK → `routes.id` |
| `checkpoint_name` | `varchar` | Display label |
| `latitude` | `float8` | WGS84 latitude |
| `longitude` | `float8` | WGS84 longitude |
| `radius_meters` | `float8` | Hit detection radius (default 30 m) |
| `sequence_order` | `integer` | Ascending = outbound order |

### `geofences` table — relevant columns

| Column | Type | Description |
|---|---|---|
| `id` | `integer` | PK, referenced by `routes.geometry_id` |
| `polygon` | `jsonb` | GeoJSON geometry (LineString or MultiLineString) |
| `color` | `varchar` | Hex colour for polyline rendering |

### TypeScript Types

```typescript
interface RouteCheckpoint {
  id:             number;
  route_id:       number;
  checkpoint_name: string;
  latitude:       number;
  longitude:      number;
  radius_meters:  number;
  sequence_order: number;
}

interface PlaybackGeometryData {
  route_id:        number;
  route_name:      string;
  is_sequential:   boolean;
  corridor_meters: number;
  route_direction: 'outbound' | 'return' | 'both';
  seq_lookahead:   number;
  geojson:         string;
  color:           string;
  checkpoints:     RouteCheckpoint[];
}

interface SequenceState {
  lastValidatedCpIdx: number;   // -1 = none
  isSequenceInvalid:  boolean;
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Output Length Invariant

*For any* non-empty array of GPS points, the snapping engine SHALL return an array whose length is exactly equal to the length of the input GPS array, regardless of route configuration, corridor size, or sequence state.

**Validates: Requirements 8.4, 10.1, 10.3**

---

### Property 2: GeoJSON LineString Coordinate Extraction Round-Trip

*For any* array of `[lat, lng]` coordinate pairs encoded as a GeoJSON `LineString` (stored as `[lng, lat]` per the GeoJSON spec), extracting coordinates via `parseRouteGeoJSON` SHALL yield exactly the original `[lat, lng]` array with the coordinate order swapped back.

**Validates: Requirements 3.1**

---

### Property 3: GeoJSON MultiLineString Concatenation

*For any* sequence of coordinate segments encoded as a GeoJSON `MultiLineString`, extracting coordinates via `parseRouteGeoJSON` SHALL yield the concatenation of all segment arrays (in order) with each coordinate's `[lng, lat]` swapped to `[lat, lng]`.

**Validates: Requirements 3.2**

---

### Property 4: Feature and FeatureCollection Wrapper Transparency

*For any* GeoJSON geometry (LineString or MultiLineString), wrapping it in a `Feature` or `FeatureCollection` envelope SHALL produce exactly the same extraction result as calling `parseRouteGeoJSON` on the bare geometry object.

**Validates: Requirements 3.3**

---

### Property 5: Checkpoint-to-Road-Index Monotonicity

*For any* array of road coordinates and any array of checkpoints, the mapping produced by `mapCheckpointsToRoadIndices` SHALL assign non-decreasing indices: for all `i < j`, `checkpointRoadIndices[i] <= checkpointRoadIndices[j]`. The forward-only search SHALL never assign a smaller index to a later checkpoint.

**Validates: Requirements 4.1**

---

### Property 6: Valid In-Order Sequence Preserves State

*For any* route with `is_sequential = true`, if every GPS point in a playback trace hits checkpoints in the expected ascending index order (no skips, each within `radius_meters`), then `isSequenceInvalid` SHALL remain `false` throughout the entire snapping pass and `lastValidatedCpIdx` SHALL equal `normalisedCheckpoints.length - 1` at the end of the trace.

**Validates: Requirements 5.1, 5.2**

---

### Property 7: Out-of-Order Hit Triggers Sequence Violation

*For any* GPS trace where a point falls within `radius_meters` of checkpoint `k` while the next expected checkpoint is some `j < k` (a skip), the engine SHALL set `isSequenceInvalid = true` at that point. The value of `lastValidatedCpIdx` SHALL NOT advance beyond `j - 1` as a result of the out-of-order hit.

**Validates: Requirements 5.3**

---

### Property 8: Post-Violation Output Equals Raw GPS

*For any* playback trace where `isSequenceInvalid` transitions to `true` at GPS point index `v`, every output coordinate at indices `v, v+1, ..., n-1` SHALL be exactly equal to the raw GPS input coordinate `[gpsPoints[i].lat, gpsPoints[i].lng]` for those same indices — no snapping or distance calculation shall modify them.

**Validates: Requirements 5.4, 11.3**

---

### Property 9: Active Segment Lock

*For any* route geometry where a road coordinate `r_outside` exists **outside** the current active segment and is closer to a GPS point than the nearest in-segment road coordinate `r_inside`, the engine SHALL snap to `r_inside` (or fall back to raw GPS) and SHALL NOT snap to `r_outside`. The segment boundary is never crossed during a nearest-point search.

**Validates: Requirements 6.1, 6.6**

---

### Property 10: Corridor Fallback Produces Raw GPS

*For any* GPS point whose distance to every road coordinate within the active segment exceeds `corridor_meters`, the engine SHALL output the exact raw GPS coordinate `[lat, lng]` for that point — identical to the input value — without modifying `lastValidatedCpIdx` or `isSequenceInvalid`.

**Validates: Requirements 6.4, 6.5, 8.1**

---

### Property 11: Snapping Idempotence

*For any* array of GPS points, running `buildSequentialSnappedPlayback` twice in sequence — first on the raw GPS input, then on the output of the first run — SHALL produce a result identical to a single run. Because snapped points already lie on road coordinates, re-snapping with the same configuration SHALL not move them.

**Validates: Requirements 10.4**

---

### Property 12: Jaipur Bounding Box Numeric Stability

*For any* GPS coordinate array whose values lie within the Jaipur geographic bounding box (latitude 26.7°–27.1°N, longitude 75.6°–75.95°E), the snapping engine SHALL produce an output array containing no `NaN`, `Infinity`, or `-Infinity` values in any coordinate position, for any route configuration.

**Validates: Requirements 10.5**

---

## Error Handling

### Backend

| Error | Handling |
|---|---|
| Non-integer route ID in path | Return HTTP 400 immediately; `strconv.Atoi` guards this |
| Route not found / DB query error | `pgx.ErrNoRows` or scan error → HTTP 404 |
| Checkpoint fetch failure | Graceful fallback: `resp.Checkpoints = []`; return HTTP 200 with empty array |
| NULL `geojson` | `COALESCE(g.polygon::text, '')` returns `""` → no error |
| NULL `corridor_meters` / `seq_lookahead` | `COALESCE` defaults applied in SQL (50.0 m, 5) |

### Frontend Snapping Engine

| Error | Handling |
|---|---|
| `JSON.parse` throws on malformed GeoJSON | Catch block → return raw GPS coordinates for full session; `console.error` |
| Geometry type not LineString or MultiLineString | Return empty `roadCoords`; engine falls back to raw GPS |
| `roadCoords.length === 0` | Skip all snapping; return raw GPS coordinates; `console.warn` |
| `checkpoints.length === 0` with `is_sequential = true` | Fall back to raw GPS; `console.warn` |
| `haversine` receives `NaN` lat/lng | Guard with `isFinite` check before distance call; emit `console.error`; use raw GPS for that point |
| `isSequenceInvalid = true` triggers | Emit `console.warn` with skipped index and hit index; short-circuit remaining loop |

### Playback Page Orchestration

| Error | Handling |
|---|---|
| `GET /api/routes/{id}/playback-geometry` returns non-2xx | Log warning; fall back to standard `fetchMapMatchedRouteTurf` snapping (as if `is_sequential = false`) |
| Network timeout | Same as above; display non-blocking toast notification |

---

## Testing Strategy

### Unit and Example-Based Tests (TypeScript / Vitest)

These cover specific scenarios and edge cases that complement the property-based tests.

**`parseRouteGeoJSON`**:
- LineString with known coordinates → expected `[lat, lng]` array
- MultiLineString with two segments → concatenated result
- Feature-wrapped LineString → same result as bare LineString
- FeatureCollection with single feature → same result
- Invalid JSON string → empty array returned, no throw
- Empty `coordinates` array → empty result

**`mapCheckpointsToRoadIndices`**:
- Checkpoints collocated with road coords → exact indices returned
- Two checkpoints closest to the same road coord → duplicate index accepted, no error
- `return` direction: reversed checkpoint array produces monotonically increasing indices

**State machine (sequence validation)**:
- GPS trace hitting all checkpoints in order → `isSequenceInvalid = false` at end
- GPS trace skipping checkpoint 2 and hitting checkpoint 3 → `isSequenceInvalid = true`
- After violation, all remaining outputs are raw GPS values
- Initial state (`lastValidatedCpIdx = -1`) searches segment `[0..checkpointRoadIndices[0]]`
- Post-final-checkpoint state searches `[checkpointRoadIndices[last]..end]`

**Integration tests (Go / `httptest`)**:
- Valid route ID → HTTP 200, all fields present, correct types
- Non-existent route ID → HTTP 404
- Non-integer ID string → HTTP 400
- Route with no geometry (NULL `polygon`) → HTTP 200, `geojson: ""`
- Route with no checkpoints → HTTP 200, `checkpoints: []`

### Property-Based Tests (TypeScript / `fast-check`)

Each test runs a **minimum of 100 iterations** with randomly generated inputs.

Tag format: `// Feature: sequential-route-playback, Property {N}: {property_text}`

**Property 1 — Output Length Invariant**  
Generator: arbitrary `GpsDataPoint[]` of length 0–2000, random route configs.  
Assert: `result.length === input.length`.  
*Feature: sequential-route-playback, Property 1: output length equals input length*

**Property 2 — LineString Extraction Round-Trip**  
Generator: random `[lat, lng][]` arrays; encode as GeoJSON LineString (swap to `[lng, lat]`).  
Assert: `parseRouteGeoJSON(encode(arr))` deep-equals `arr`.  
*Feature: sequential-route-playback, Property 2: GeoJSON LineString extraction round-trip*

**Property 3 — MultiLineString Concatenation**  
Generator: random arrays of coordinate segments; encode as GeoJSON MultiLineString.  
Assert: extracted result equals the flat concatenation of all segments with coordinates swapped.  
*Feature: sequential-route-playback, Property 3: GeoJSON MultiLineString concatenation*

**Property 4 — Wrapper Transparency**  
Generator: random geometry; wrap in `Feature` or `FeatureCollection` (chosen randomly).  
Assert: `parseRouteGeoJSON(wrapped)` deep-equals `parseRouteGeoJSON(bare)`.  
*Feature: sequential-route-playback, Property 4: Feature/FeatureCollection wrapper transparency*

**Property 5 — Checkpoint Monotonicity**  
Generator: random `roadCoords` (5–500 coords), random checkpoints (1–20).  
Assert: `indices[i] <= indices[i+1]` for all adjacent pairs.  
*Feature: sequential-route-playback, Property 5: checkpoint-to-road-index monotonicity*

**Property 6 — Valid Sequence Stays Valid**  
Generator: random road geometry + checkpoints; synthesise GPS trace that hits each checkpoint in order within `radius_meters`.  
Assert: `isSequenceInvalid === false` after full pass; `lastValidatedCpIdx === checkpoints.length - 1`.  
*Feature: sequential-route-playback, Property 6: valid in-order sequence preserves state*

**Property 7 — Out-of-Order Triggers Violation**  
Generator: random route config; synthesise trace with a deliberate skip at a random checkpoint index.  
Assert: `isSequenceInvalid === true` after the skipped point; `lastValidatedCpIdx` did not advance past the skipped index.  
*Feature: sequential-route-playback, Property 7: out-of-order hit triggers sequence violation*

**Property 8 — Post-Violation Output Equals Raw GPS**  
Generator: trace with violation injected at random index `v`.  
Assert: for all indices `i >= v`, `output[i]` equals `[gpsPoints[i].lat, gpsPoints[i].lng]` exactly.  
*Feature: sequential-route-playback, Property 8: post-violation output equals raw GPS*

**Property 9 — Active Segment Lock**  
Generator: construct scenario with `r_outside` closer to GPS point than `r_inside`; place `r_outside` beyond segment boundary.  
Assert: output is `r_inside` (if within corridor) or raw GPS (if `r_inside` outside corridor), never `r_outside`.  
*Feature: sequential-route-playback, Property 9: active segment lock*

**Property 10 — Corridor Fallback**  
Generator: GPS points placed farther than `corridorMeters` from all segment road coords.  
Assert: `output[i]` equals `[gpsPoints[i].lat, gpsPoints[i].lng]` for every such point.  
*Feature: sequential-route-playback, Property 10: corridor fallback produces raw GPS*

**Property 11 — Idempotence**  
Generator: arbitrary GPS arrays and route configs.  
Assert: `snap(snap(input)) deep-equals snap(input)`.  
*Feature: sequential-route-playback, Property 11: snapping idempotence*

**Property 12 — Jaipur Bounding Box Numeric Stability**  
Generator: coordinates uniformly sampled from `[26.7..27.1, 75.6..75.95]`.  
Assert: no element of `output` is `NaN` or non-finite.  
*Feature: sequential-route-playback, Property 12: Jaipur bounding box numeric stability*

### Performance Benchmark (Manual / Browser DevTools)

Run once against a representative dataset: 2,000 GPS points, 500 road coords, 20 checkpoints.  
Target: full snapping pass completes in < 500 ms.  
This is a manual timing benchmark, not an automated test suite item.
