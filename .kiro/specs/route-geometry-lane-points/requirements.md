# Requirements Document

## Introduction

This feature replaces the manual lane point system with automatically generated lane points derived directly from route geometry. Currently, operators manually place lane point start/end pairs (stored as a `lanes` JSONB blob on the route record), and a `syncRouteCheckpoints` helper converts these into `route_checkpoints` rows that the `RouteEngine` validates against. This dual-data model causes misplaced points, duplicated data, and maintenance burden.

Under the new system, route geometry (the GeoJSON LineString stored in the `geofences` table) is the sole source of truth. Every coordinate vertex in the route line automatically becomes a lane point with a sequential number. The manual lane placement UI and the `lanes` field-based checkpoint sync are removed. Sequence validation logic is updated to work against the geometry-derived lane points.

**Out of scope**: playback, map-matching/snapping, coverage reports, historical data, and route assignment logic are not modified.

---

## Glossary

- **Route**: A named path stored in the `routes` table, linked to a GeoJSON geometry in the `geofences` table via `geometry_id`.
- **Route_Geometry**: The GeoJSON LineString (or MultiLineString) stored in `geofences.polygon` that describes the physical path of a route.
- **Lane_Point**: An automatically generated point derived from a Route_Geometry coordinate vertex, stored in the `route_lane_points` table. Replaces the legacy manual lane point and `route_checkpoints` concept for sequence validation.
- **Lane_Point_Generator**: The backend service component responsible for reading Route_Geometry coordinates and producing Lane_Points.
- **Sequence_Number**: A 1-based integer assigned to each Lane_Point according to its position in the route geometry vertex order.
- **Lane_Point_Sequence_Validator**: The backend component (part of RouteEngine) responsible for verifying that a vehicle achieves Lane_Points in strictly ascending Sequence_Number order.
- **Sequence_Violation**: The condition recorded when a vehicle reaches a Lane_Point whose Sequence_Number is not the immediate next expected value.
- **Route_Editor**: The frontend UI page used to create and edit routes.
- **Achieved**: The status of a Lane_Point that has been successfully reached by the vehicle in the correct sequence order.
- **Pending**: The status of a Lane_Point that has not yet been reached, or was skipped due to a Sequence_Violation.

---

## Requirements

### Requirement 1: Automatic Lane Point Generation on Route Save

**User Story:** As a system administrator, I want lane points to be generated automatically when a route is saved, so that I do not need to manually place lane points and route geometry is the single source of truth.

#### Acceptance Criteria

1. WHEN a route is created with a non-empty Route_Geometry, THE Lane_Point_Generator SHALL parse every coordinate vertex from the Route_Geometry GeoJSON and insert one Lane_Point per vertex into the `route_lane_points` table.
2. WHEN a route is updated with a new or changed Route_Geometry, THE Lane_Point_Generator SHALL delete all existing Lane_Points for that route and regenerate them from the updated Route_Geometry before the save operation completes.
3. WHEN a route is deleted, THE System SHALL delete all Lane_Points associated with that route.
4. WHEN a route is created or updated with an empty or absent Route_Geometry, THE Lane_Point_Generator SHALL store zero Lane_Points for that route (no error is raised).
5. THE Lane_Point_Generator SHALL assign Sequence_Numbers starting at 1 and incrementing by 1 for each subsequent vertex, following the coordinate order of the Route_Geometry.
6. THE Lane_Point_Generator SHALL store each Lane_Point with the fields: `id`, `route_id`, `sequence_number`, `latitude`, `longitude`, `created_at`.
7. WHEN a Route_Geometry is a GeoJSON `FeatureCollection` or `Feature` wrapping a `LineString`, THE Lane_Point_Generator SHALL unwrap the geometry and extract coordinates from the inner `LineString`.
8. WHEN a Route_Geometry is a GeoJSON `MultiLineString`, THE Lane_Point_Generator SHALL concatenate all segments in order and generate one contiguous sequence of Lane_Points.
9. IF a Route_Geometry contains fewer than 2 coordinate vertices, THEN THE Lane_Point_Generator SHALL log a warning and store whatever vertices are present without raising an error.

---

### Requirement 2: Lane Point Table Structure

**User Story:** As a backend developer, I want a dedicated `route_lane_points` table, so that geometry-derived lane points are stored independently from the legacy `route_checkpoints` table.

#### Acceptance Criteria

1. THE System SHALL store Lane_Points in a table named `route_lane_points` with columns: `id` (serial primary key), `route_id` (integer, foreign key to `routes.id` with `ON DELETE CASCADE`), `sequence_number` (integer, not null), `latitude` (double precision, not null), `longitude` (double precision, not null), `created_at` (timestamp with time zone, default now()).
2. THE System SHALL enforce that `(route_id, sequence_number)` is unique within the `route_lane_points` table.
3. THE System SHALL index `route_lane_points` on `route_id` to support efficient per-route queries.

---

### Requirement 3: Sequential Lane Point Validation

**User Story:** As a route operations manager, I want the system to enforce that vehicles achieve lane points in strict sequence order, so that out-of-order or skipped lane points are flagged rather than silently accepted.

#### Acceptance Criteria

1. WHILE a vehicle is on an assigned route, THE Lane_Point_Sequence_Validator SHALL track the highest Sequence_Number achieved so far for that vehicle on that route for the current date, starting at 0 (none achieved).
2. WHEN a vehicle reaches a Lane_Point, THE Lane_Point_Sequence_Validator SHALL mark that Lane_Point as Achieved only if its Sequence_Number equals (last achieved Sequence_Number + 1).
3. WHEN a vehicle reaches a Lane_Point whose Sequence_Number is greater than (last achieved Sequence_Number + 1), THE Lane_Point_Sequence_Validator SHALL set the Sequence_Violation flag to TRUE for that vehicle on that route, leave all skipped Lane_Points as Pending, and leave the reached-out-of-order Lane_Point as Pending.
4. WHEN a Sequence_Violation has been recorded, THE Lane_Point_Sequence_Validator SHALL continue tracking subsequent GPS pings but SHALL NOT mark any further Lane_Points as Achieved for the remainder of that route session.
5. IF a vehicle achieves Lane_Points 1 and 2 in order and then reaches Lane_Point 6 before Lane_Points 3, 4, and 5, THEN THE Lane_Point_Sequence_Validator SHALL record: Lane_Points 1 and 2 as Achieved, Lane_Points 3, 4, 5, and 6 as Pending, and Sequence_Violation as TRUE.
6. THE Lane_Point_Sequence_Validator SHALL NOT auto-mark skipped Lane_Points as Achieved when a later Lane_Point is reached.

---

### Requirement 4: Sequence Validation State Per Vehicle Per Day

**User Story:** As a route operations manager, I want sequence validation state to be isolated per vehicle per route per day, so that one vehicle's violation does not affect another vehicle's state.

#### Acceptance Criteria

1. THE Lane_Point_Sequence_Validator SHALL maintain an independent sequence state (last achieved Sequence_Number and Sequence_Violation flag) for each (vehicle_id, route_id, report_date) combination.
2. WHEN a new report date begins, THE Lane_Point_Sequence_Validator SHALL reset the sequence state for all vehicles to: last achieved Sequence_Number = 0, Sequence_Violation = FALSE.
3. THE Lane_Point_Sequence_Validator SHALL persist the Sequence_Violation flag to the database so that it survives server restarts.

---

### Requirement 5: Removal of Manual Lane Point Workflow

**User Story:** As a product owner, I want the manual lane point UI and backend sync to be removed, so that operators can no longer create misplaced lane points and duplicate data is eliminated.

#### Acceptance Criteria

1. THE Route_Editor SHALL NOT provide a UI element for manual lane point placement, lane point set creation, or lane point editing.
2. THE System SHALL NOT call `syncRouteCheckpoints` or any equivalent function that converts the `lanes` JSONB field into `route_checkpoints` rows as part of route save operations.
3. WHEN a route is saved via the Route_Editor, THE System SHALL trigger Lane_Point_Generator instead of any manual lane point sync function.
4. THE System SHALL treat the `lanes` JSONB field on the route record as deprecated; THE System SHALL NOT use it as the source for generating lane points.

---

### Requirement 6: Lane Point Query API

**User Story:** As a frontend developer, I want a read API for lane points, so that the UI and other services can retrieve the generated lane points for a route.

#### Acceptance Criteria

1. WHEN a GET request is made to the lane points endpoint for a valid route ID, THE System SHALL return all Lane_Points for that route ordered by Sequence_Number ascending.
2. WHEN a GET request is made to the lane points endpoint for a route with no Lane_Points, THE System SHALL return an empty array with HTTP 200.
3. IF a GET request is made to the lane points endpoint with an invalid or non-existent route ID, THEN THE System SHALL return HTTP 404 with an error message.
4. THE System SHALL include the following fields in each Lane_Point response object: `id`, `route_id`, `sequence_number`, `latitude`, `longitude`, `created_at`.

---

### Requirement 7: Idempotent Lane Point Regeneration

**User Story:** As a backend developer, I want lane point generation to be idempotent, so that saving a route multiple times with the same geometry produces the same set of lane points without duplicates.

#### Acceptance Criteria

1. WHEN a route is saved with the same Route_Geometry as a previous save, THE Lane_Point_Generator SHALL produce a Lane_Point set that is identical (same count, same coordinates, same sequence numbers) to the previous generation.
2. WHEN lane point generation is triggered for a route that already has Lane_Points, THE Lane_Point_Generator SHALL delete all existing Lane_Points for that route before inserting the new set, ensuring no duplicate rows.

---

### Requirement 8: Geometry Coordinate Extraction Correctness

**User Story:** As a backend developer, I want coordinate extraction from GeoJSON to be correct, so that latitude and longitude values are stored accurately and not swapped.

#### Acceptance Criteria

1. WHEN extracting coordinates from a GeoJSON `LineString`, THE Lane_Point_Generator SHALL interpret the coordinate array as `[longitude, latitude]` per the GeoJSON specification (RFC 7946) and store `latitude` and `longitude` in the correct fields.
2. FOR ALL valid Route_Geometry inputs, THE Lane_Point_Generator SHALL produce Lane_Points such that parsing the Route_Geometry and then reconstructing a GeoJSON LineString from the resulting Lane_Points produces a geometry equivalent to the original (round-trip property).
3. THE Lane_Point_Generator SHALL handle coordinate values with up to 7 decimal places of precision without loss.
