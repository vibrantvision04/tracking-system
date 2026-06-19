# Requirements Document

## Introduction

This feature improves GPS playback visualization for waste management collection vehicles operating in dense urban areas such as heritage sectors in Jaipur. Standard nearest-point map snapping fails in these environments because GPS drift causes the vehicle trail to jump to nearby parallel streets, travel out of sequence, and connect distant points with diagonal lines instead of following street geometry.

The Sequential Route Playback & Dense Area Snapping System introduces a snapping engine that locks vehicle playback to the pre-defined route geometry, validates checkpoint progression in strict sequence order, and falls back to raw GPS coordinates only when the vehicle genuinely leaves the route corridor or violates the expected checkpoint sequence. The feature covers outbound traversal (ascending checkpoint order) and return traversal (descending checkpoint order), and provides route operators with configuration controls for corridor width, lookahead window, and direction.

The system is strictly a **playback visualization improvement**. It does not alter GPS storage, checkpoint hit detection for coverage reporting, D2D calculations, or route assignment logic.

---

## Glossary

- **Snapping_Engine**: The frontend algorithm (`buildSequentialSnappedPlayback`) that maps raw GPS points to route geometry during playback.
- **Road_Coords**: The ordered array of `[lat, lng]` coordinate pairs extracted from a route's GeoJSON geometry, representing the precise street layout.
- **Checkpoint**: A named waypoint on a route with a `latitude`, `longitude`, `radius_meters`, and `sequence_order`. Stored in `route_checkpoints`.
- **Corridor_Meters**: The maximum perpendicular distance (in metres) from a GPS point to the nearest road coordinate at which snapping is applied. Configured per route; default 50 m.
- **Seq_Lookahead**: The number of future checkpoints the engine is permitted to scan ahead when validating a hit; stored per route; default 5.
- **Route_Direction**: The declared traversal direction for a route: `outbound` (ascending sequence order), `return` (descending sequence order), or `both`.
- **Sequence_State**: Runtime state tracked by the Snapping_Engine for a single playback session — records the last validated checkpoint index and whether a sequence violation has been detected.
- **Active_Segment**: The contiguous sub-array of Road_Coords between the road index mapped to the last validated Checkpoint and the road index mapped to the next target Checkpoint.
- **Playback_Geometry_Endpoint**: `GET /api/routes/{id}/playback-geometry` — returns route metadata, colour, GeoJSON, and ordered checkpoints in a single round-trip.
- **Route_Editor**: The page at `web/src/app/vswm/route/page.tsx` where operators configure route properties including sequential snapping settings.
- **Seq_Badge**: A visual indicator displayed next to a route name in the Route Directory list when `is_sequential = true`.

---

## Requirements

### Requirement 1: Playback Geometry Consolidation Endpoint

**User Story:** As a fleet supervisor, I want the playback page to load all route geometry and checkpoint data in a single request, so that playback initialises quickly without multiple round-trips.

#### Acceptance Criteria

1. WHEN a request is made to `GET /api/routes/{id}/playback-geometry` with a valid integer route ID, THE Playback_Geometry_Endpoint SHALL return a JSON response containing `route_id`, `route_name`, `is_sequential`, `corridor_meters`, `route_direction`, `seq_lookahead`, `geojson`, `color`, and `checkpoints`.
2. WHEN a request is made to `GET /api/routes/{id}/playback-geometry` with a valid integer route ID, THE Playback_Geometry_Endpoint SHALL resolve all fields in a single database round-trip by joining the `routes` table with the `geofences` table and fetching checkpoints from `route_checkpoints`.
3. WHEN the `geojson` column is NULL or empty for a route, THE Playback_Geometry_Endpoint SHALL return an empty string for the `geojson` field rather than failing.
4. WHEN the `route_checkpoints` table contains no rows for the requested route, THE Playback_Geometry_Endpoint SHALL return an empty array for `checkpoints`.
5. IF a route ID does not exist in the `routes` table, THEN THE Playback_Geometry_Endpoint SHALL return HTTP 404 with an `error` field in the response body.
6. IF the route ID path parameter is not a valid integer, THEN THE Playback_Geometry_Endpoint SHALL return HTTP 400 with an `error` field in the response body.

---

### Requirement 2: Sequential Snapping Configuration per Route

**User Story:** As an operator, I want to configure sequential snapping behaviour per route, so that only routes in dense areas use strict sequence-locked playback while other routes continue using standard snapping.

#### Acceptance Criteria

1. THE Route_Editor SHALL provide a boolean toggle labelled "Sequential Validation" that maps to the `is_sequential` field on the route.
2. THE Route_Editor SHALL provide a numeric input labelled "Corridor Width (m)" that maps to the `corridor_meters` field, accepting values greater than 0.
3. THE Route_Editor SHALL provide a numeric input labelled "Lookahead" that maps to the `seq_lookahead` field, accepting positive integer values.
4. THE Route_Editor SHALL provide a dropdown labelled "Direction" with options `outbound`, `return`, and `both` that maps to the `route_direction` field.
5. WHEN a route with `is_sequential = true` is displayed in the Route Directory list, THE Route_Editor SHALL render a `Seq` badge next to the route name.
6. WHEN a route is saved with `is_sequential = true`, THE Route_Editor SHALL persist `corridor_meters`, `route_direction`, and `seq_lookahead` to the database alongside the flag.
7. IF `corridor_meters` is submitted as 0 or a negative number, THEN THE Route_Editor SHALL display a validation error and SHALL NOT submit the value to the backend.

---

### Requirement 3: Road Coordinate Extraction from GeoJSON

**User Story:** As a developer, I want the snapping engine to extract a flat ordered coordinate array from a route's GeoJSON, so that GPS points can be mapped to precise street positions.

#### Acceptance Criteria

1. WHEN the route GeoJSON geometry type is `LineString`, THE Snapping_Engine SHALL extract all coordinate pairs as `[lat, lng]` from the `coordinates` array (noting that GeoJSON stores coordinates as `[lng, lat]`, so the Snapping_Engine SHALL swap the order on extraction).
2. WHEN the route GeoJSON geometry type is `MultiLineString`, THE Snapping_Engine SHALL extract and concatenate coordinate pairs from all line segments in order.
3. WHEN the route GeoJSON is wrapped in a `Feature` or `FeatureCollection`, THE Snapping_Engine SHALL unwrap the geometry before extraction.
4. IF the GeoJSON is malformed or fails to parse, THEN THE Snapping_Engine SHALL fall back to rendering the raw GPS coordinates for the entire playback session and SHALL log an error to the browser console.
5. IF Road_Coords extraction yields zero coordinates, THEN THE Snapping_Engine SHALL fall back to rendering the raw GPS coordinates for the entire playback session.

---

### Requirement 4: Checkpoint-to-Road-Coordinate Monotonic Mapping

**User Story:** As a developer, I want each checkpoint to be mapped to a specific index in Road_Coords monotonically, so that the sequence progression reflects the actual street layout order.

#### Acceptance Criteria

1. WHEN the Snapping_Engine initialises a playback session, THE Snapping_Engine SHALL map each Checkpoint to the nearest Road_Coords index using a monotonic forward search (never searching backwards from the index assigned to the previous Checkpoint).
2. WHEN `route_direction` is `return`, THE Snapping_Engine SHALL reverse the checkpoint array before performing monotonic mapping, so that checkpoint indices ascend in the direction of travel.
3. THE Snapping_Engine SHALL resolve all Checkpoint-to-Road_Coords mappings once at session initialisation and SHALL NOT recompute them during playback iteration.
4. WHEN two or more checkpoints resolve to the same Road_Coords index, THE Snapping_Engine SHALL accept the duplicate mapping and continue; it SHALL NOT error or skip checkpoints.

---

### Requirement 5: Checkpoint Sequence Validation State Machine

**User Story:** As a fleet supervisor, I want playback to detect when a vehicle skips checkpoints out of order, so that I can identify incorrect route traversal.

#### Acceptance Criteria

1. WHILE a playback session has `is_sequential = true` and `isSequenceInvalid = false`, THE Snapping_Engine SHALL evaluate each GPS point against the next expected Checkpoint (the one immediately following the last validated Checkpoint).
2. WHEN a GPS point falls within the `radius_meters` (defaulting to 30 m if not set) of the next expected Checkpoint, THE Snapping_Engine SHALL advance `lastValidatedCpIdx` by one and SHALL continue snapping.
3. WHEN a GPS point falls within the `radius_meters` of a Checkpoint that is not the immediately next expected one (i.e., one or more Checkpoints are skipped), THE Snapping_Engine SHALL set `isSequenceInvalid = true` and SHALL NOT advance `lastValidatedCpIdx`.
4. WHEN `isSequenceInvalid` is `true`, THE Snapping_Engine SHALL output the raw GPS coordinate for all subsequent points in the playback session without attempting snapping.
5. THE Snapping_Engine SHALL evaluate Checkpoint hit conditions in ascending index order of the normalised checkpoint array (after direction reversal if applicable), so that a `return` traversal validates descending `sequence_order` values in the expected order of travel.
6. WHEN `isSequenceInvalid` transitions to `true`, THE Snapping_Engine SHALL emit a console warning identifying the skipped Checkpoint index and the out-of-order hit index.

---

### Requirement 6: Active Segment Lock for Snapping

**User Story:** As a fleet supervisor, I want the vehicle trail to stay locked to the street segment between the last validated checkpoint and the next target checkpoint, so that GPS drift to nearby parallel streets is suppressed.

#### Acceptance Criteria

1. WHILE `isSequenceInvalid = false`, THE Snapping_Engine SHALL search for the nearest road coordinate only within the Active_Segment (the sub-array of Road_Coords between `checkpointRoadIndices[lastValidatedCpIdx]` and `checkpointRoadIndices[lastValidatedCpIdx + 1]`).
2. WHEN no Checkpoint has yet been validated (`lastValidatedCpIdx = -1`), THE Snapping_Engine SHALL search within Road_Coords from index 0 to `checkpointRoadIndices[0]` inclusive.
3. WHEN the last Checkpoint has been validated and no further Checkpoints remain, THE Snapping_Engine SHALL search within Road_Coords from `checkpointRoadIndices[lastValidatedCpIdx]` to the end of the Road_Coords array.
4. WHEN the nearest road coordinate within the Active_Segment is within `corridor_meters`, THE Snapping_Engine SHALL snap the playback point to that road coordinate.
5. WHEN the nearest road coordinate within the Active_Segment is farther than `corridor_meters`, THE Snapping_Engine SHALL fall back to the raw GPS coordinate for that point without modifying `Sequence_State`.
6. THE Snapping_Engine SHALL NOT search outside the Active_Segment for a closer road coordinate, even if one exists on a nearby parallel street within the corridor distance.

---

### Requirement 7: Outbound and Return Direction Support

**User Story:** As a fleet supervisor, I want sequential snapping to work correctly for both the outbound and return legs of a collection route, so that playback is accurate regardless of the direction of travel.

#### Acceptance Criteria

1. WHEN `route_direction` is `outbound`, THE Snapping_Engine SHALL validate checkpoints in ascending `sequence_order`.
2. WHEN `route_direction` is `return`, THE Snapping_Engine SHALL validate checkpoints in descending `sequence_order` by reversing the checkpoint array before processing.
3. WHEN `route_direction` is `both`, THE Snapping_Engine SHALL treat checkpoints in ascending `sequence_order` (outbound) for the purpose of monotonic mapping and sequence validation.
4. WHEN `route_direction` is `outbound`, THE Snapping_Engine SHALL only snap GPS points to road coordinates that belong to outbound lane points and SHALL NOT snap to road coordinates of the opposing return direction.
5. WHEN `route_direction` is `return`, THE Snapping_Engine SHALL only snap GPS points to road coordinates that belong to return lane points and SHALL NOT snap to road coordinates of the opposing outbound direction.

---

### Requirement 8: Corridor-Based Fallback to Raw GPS

**User Story:** As a fleet supervisor, I want the playback trail to show the vehicle's real GPS position when the vehicle leaves the route corridor, so that off-route travel is visible and not hidden by forced snapping.

#### Acceptance Criteria

1. WHEN the perpendicular distance from a GPS point to the nearest road coordinate in the Active_Segment exceeds `corridor_meters`, THE Snapping_Engine SHALL render the raw GPS coordinate `[lat, lng]` for that playback point.
2. WHEN `is_sequential = false` for a route, THE Snapping_Engine SHALL apply standard nearest-point snapping using the full `fetchMapMatchedRouteTurf` function with the route's `corridor_meters` as the tolerance.
3. WHEN `is_sequential = true` and the route has no GeoJSON geometry or no Checkpoints, THE Snapping_Engine SHALL fall back to rendering raw GPS coordinates for the entire session.
4. THE Snapping_Engine SHALL preserve the timestamp ordering of GPS points after snapping; the output coordinate array SHALL have the same length as the input GPS point array.

---

### Requirement 9: Playback Page Route Data Fetching

**User Story:** As a fleet supervisor, I want the playback page to automatically fetch the sequential snapping configuration when a route is selected, so that playback behaviour reflects the route's configured settings.

#### Acceptance Criteria

1. WHEN a route is selected on the playback page and `is_sequential = true`, THE Playback_Page SHALL fetch the route's geometry from `GET /api/routes/{id}/playback-geometry` before beginning playback.
2. WHEN the Playback_Geometry_Endpoint returns successfully, THE Playback_Page SHALL pass `corridor_meters`, `seq_lookahead`, `route_direction`, `checkpoints`, and the parsed GeoJSON to the Snapping_Engine.
3. IF the Playback_Geometry_Endpoint returns an error, THEN THE Playback_Page SHALL fall back to standard snapping (as if `is_sequential = false`) and SHALL display a non-blocking warning to the user.
4. WHEN playback is initiated, THE Playback_Page SHALL apply the Snapping_Engine to the GPS point array before rendering the polyline on the map.
5. THE Playback_Page SHALL reset `Sequence_State` (clearing `lastValidatedCpIdx` and `isSequenceInvalid`) each time a new playback session is started.

---

### Requirement 10: Snapping Engine Output Integrity

**User Story:** As a developer, I want the snapping engine to produce a well-formed coordinate array of the same length as the input, so that the playback animation index remains aligned with the GPS data array.

#### Acceptance Criteria

1. THE Snapping_Engine SHALL return a `[number, number][]` array whose length equals the length of the input `GpsDataPoint[]` array for every possible valid input.
2. THE Snapping_Engine SHALL return an empty array when the input `GpsDataPoint[]` array is empty.
3. WHEN the input array contains a single GPS point, THE Snapping_Engine SHALL return an array containing exactly one coordinate pair.
4. FOR ALL valid inputs, parsing the route GeoJSON then running the Snapping_Engine then re-running it on its own output SHALL produce an identical result to a single run (idempotence — the snapped output is already on road coordinates, so re-snapping SHALL not change positions).
5. THE Snapping_Engine SHALL handle coordinates located in the Jaipur geographic bounding box (approximately 26.7°N–27.1°N, 75.6°E–75.95°E) without numeric overflow or NaN results.

---

### Requirement 11: Performance Constraints for Playback Snapping

**User Story:** As a fleet supervisor, I want playback snapping to complete quickly so that the playback animation starts without noticeable delay.

#### Acceptance Criteria

1. WHEN the Snapping_Engine processes a GPS trace of up to 2,000 points against a route with up to 500 Road_Coords and up to 20 Checkpoints, THE Snapping_Engine SHALL complete the full snapping pass in under 500 milliseconds on a modern browser.
2. THE Snapping_Engine SHALL pre-compute the Checkpoint-to-Road_Coords mapping once before the point iteration loop and SHALL NOT re-compute it per GPS point.
3. WHEN `isSequenceInvalid = true`, THE Snapping_Engine SHALL skip all snapping logic and assign raw coordinates for remaining points without executing further distance calculations.
