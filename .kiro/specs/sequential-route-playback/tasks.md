# Implementation Plan: Sequential Route Playback & Dense Area Snapping System

## Overview

Implementation is structured in five dependency layers: (1) backend handler verification, (2) extracting standalone frontend utility functions, (3) refactoring the snapping engine to match the design contract, (4) wiring the playback page, and (5) test infrastructure setup followed by all 12 property-based tests.

The backend `GetRoutePlaybackGeometry` handler, the route `/routes/{id}/playback-geometry` registration, and the DB persistence of sequential config fields are already correctly implemented. The tasks below focus on what still needs work.

## Tasks

- [x] 1. Verify and harden the `GetRoutePlaybackGeometry` Go handler
  - [x] 1.1 Add a Go `httptest`-based integration test file for `GetRoutePlaybackGeometry`
    - Create `internal/api/route_playback_handlers_test.go`
    - Test: valid route ID → HTTP 200, all 9 fields present with correct types
    - Test: non-existent route ID → HTTP 404, `error` field in body
    - Test: non-integer ID string (e.g. `"abc"`) → HTTP 400, `error` field in body
    - Test: route with NULL `polygon` → HTTP 200, `geojson: ""`
    - Test: route with no checkpoints → HTTP 200, `checkpoints: []` (not `null`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Add `corridor_meters` validation to the Route Editor
  - [x] 2.1 Add a `> 0` guard in `handleSubmit` inside `web/src/app/vswm/route/page.tsx`
    - When `form.isSequential` is `true` and `form.corridorMeters <= 0`, call `toast.error(...)` and return early without submitting
    - Add `min="0.1"` attribute to the Corridor Width input element to also block the browser from accepting 0
    - _Requirements: 2.7_

- [x] 3. Extract `parseRouteGeoJSON` as a standalone exported function
  - [x] 3.1 Create `web/src/lib/snapping.ts` and implement `parseRouteGeoJSON`
    - Export `function parseRouteGeoJSON(geojson: string): [number, number][]`
    - Handle `Feature` and `FeatureCollection` wrapper unwrapping
    - Handle `LineString`: swap `[lng, lat]` → `[lat, lng]` for each coordinate
    - Handle `MultiLineString`: swap and concatenate all segments in order
    - If `JSON.parse` throws: catch the error, emit `console.error`, return `[]`
    - If geometry type is unsupported: emit `console.warn`, return `[]`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Extract `mapCheckpointsToRoadIndices` as a standalone exported function
  - [x] 4.1 Add `mapCheckpointsToRoadIndices` to `web/src/lib/snapping.ts`
    - Export `function mapCheckpointsToRoadIndices(checkpoints: RouteCheckpoint[], roadCoords: [number, number][]): number[]`
    - Implement the monotonic forward-search algorithm from the design: `searchFrom` cursor never decreases
    - Use the local `haversineMeters` helper (also in `snapping.ts`) for distance
    - Accepts duplicate resolved indices without error
    - _Requirements: 4.1, 4.3, 4.4_

- [x] 5. Refactor `buildSequentialSnappedPlayback` to match the design contract
  - [x] 5.1 Update the function signature in `web/src/app/playback/page.tsx`
    - Change signature to: `buildSequentialSnappedPlayback(gpsPoints, roadCoords, checkpoints, corridorMeters, routeDirection)`
    - Remove the `routeGeoJSON` and `lookahead` parameters — GeoJSON parsing is now done by the caller using `parseRouteGeoJSON`; `seqLookahead` is now used for the lookahead window scan
    - Import `parseRouteGeoJSON`, `mapCheckpointsToRoadIndices`, and `haversineMeters` from `web/src/lib/snapping.ts`
    - _Requirements: 3.1, 4.1, 5.1_

  - [x] 5.2 Implement direction normalisation and correct active-segment boundaries
    - Apply `routeDirection === 'return'` reversal on checkpoints before calling `mapCheckpointsToRoadIndices`
    - Correctly resolve the three segment cases: pre-first-checkpoint, between checkpoints, post-last-checkpoint (as per design Step 5 table)
    - _Requirements: 4.2, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3_

  - [x] 5.3 Implement the sequence state machine with lookahead violation detection
    - `lastValidatedCpIdx` starts at `-1`; advances on in-order hits
    - Scan from `nextExpected + 1` up to `min(nextExpected + seqLookahead, checkpoints.length - 1)` for out-of-order hits
    - On out-of-order hit: set `isSequenceInvalid = true`, emit `console.warn` with skipped index and hit index
    - Once `isSequenceInvalid = true`, short-circuit: copy raw GPS for all remaining points without further distance computation
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 11.3_

  - [x] 5.4 Add `isFinite` guard for NaN/Infinity coordinate values
    - Before each `haversineMeters` call, check both lat and lng with `isFinite()`
    - If either is non-finite: emit `console.error`, push raw GPS for that point, continue loop
    - _Requirements: 10.5_

  - [x] 5.5 Apply corridor fallback without mutating sequence state
    - When nearest in-segment distance exceeds `corridorMeters`: push `[p.lat, p.lng]` without modifying `lastValidatedCpIdx` or `isSequenceInvalid`
    - _Requirements: 6.4, 6.5, 8.1_

- [x] 6. Wire the playback page to use the refactored engine
  - [x] 6.1 Update the playback initiation block in `web/src/app/playback/page.tsx`
    - On playback start: call `parseRouteGeoJSON(assignedRouteData.geojson)` to produce `roadCoords`
    - If `roadCoords.length === 0` or `checkpoints.length === 0` with `is_sequential = true`: emit `console.warn`, fall back to `fetchMapMatchedRouteTurf`
    - Call updated `buildSequentialSnappedPlayback(validPoints, roadCoords, checkpoints, corridor_meters, route_direction)`
    - Reset `sequenceState` (`lastValidatedCpIdx = -1`, `isSequenceInvalid = false`) each time a new playback session begins
    - _Requirements: 8.3, 9.1, 9.4, 9.5_

  - [x] 6.2 Handle `/playback-geometry` fetch errors gracefully
    - If the API returns non-2xx: log warning, fall back to `fetchMapMatchedRouteTurf`, show a non-blocking toast notification
    - _Requirements: 9.3_

- [x] 7. Checkpoint: Ensure backend compiles and frontend builds cleanly
  - Run `go build ./...` in the workspace root to verify no Go compile errors
  - Run `npm run build` in `web/` to verify no TypeScript errors
  - Ask the user if any questions arise before proceeding to tests.

- [x] 8. Set up Vitest and fast-check test infrastructure
  - [x] 8.1 Install Vitest and fast-check as dev dependencies in `web/`
    - Add `"vitest": "^2.0.0"` and `"fast-check": "^3.22.0"` to `devDependencies` in `web/package.json`
    - Create `web/vitest.config.ts` with environment `node` and include pattern `src/**/*.test.ts`
    - Add `"test": "vitest --run"` to `scripts` in `web/package.json`
    - _Requirements: (infrastructure for all test tasks below)_

  - [x] 8.2 Create the test file scaffold
    - Create `web/src/lib/snapping.test.ts`
    - Import `parseRouteGeoJSON`, `mapCheckpointsToRoadIndices`, `buildSequentialSnappedPlayback` from `snapping.ts` and `playback/page.tsx` respectively
    - Import `fc` from `fast-check`
    - Add the tag comment: `// Feature: sequential-route-playback`
    - _Requirements: (scaffold for all property tests)_

- [x] 9. Write property-based tests for GeoJSON parsing (Properties 1–4)
  - [x] 9.1 Write property test for Output Length Invariant (Property 1)
    - `// Feature: sequential-route-playback, Property 1: output length equals input length`
    - Generator: `fc.array(fc.record({ lat: fc.float({...jaipur range}), lng: fc.float({...jaipur range}), ... }), { maxLength: 2000 })`, random route configs
    - Assert: `result.length === gpsPoints.length` for all inputs including empty array
    - **Property 1: Output Length Invariant**
    - **Validates: Requirements 8.4, 10.1, 10.3**

  - [x] 9.2 Write property test for GeoJSON LineString round-trip (Property 2)
    - `// Feature: sequential-route-playback, Property 2: GeoJSON LineString extraction round-trip`
    - Generator: `fc.array(fc.tuple(fc.float({min:26.7,max:27.1}), fc.float({min:75.6,max:75.95})), { minLength: 1 })`
    - Encode as `{ type: "LineString", coordinates: arr.map(([lat,lng]) => [lng, lat]) }`
    - Assert: `parseRouteGeoJSON(JSON.stringify(geojson))` deep-equals original `[lat, lng][]`
    - **Property 2: GeoJSON LineString Coordinate Extraction Round-Trip**
    - **Validates: Requirements 3.1**

  - [x] 9.3 Write property test for GeoJSON MultiLineString concatenation (Property 3)
    - `// Feature: sequential-route-playback, Property 3: GeoJSON MultiLineString concatenation`
    - Generator: array of segments (each segment is array of `[lat, lng]` pairs)
    - Encode as `MultiLineString` with `[lng, lat]` coordinate order
    - Assert: extracted result equals flat concatenation of all segments (coordinates swapped back)
    - **Property 3: GeoJSON MultiLineString Concatenation**
    - **Validates: Requirements 3.2**

  - [x] 9.4 Write property test for Feature/FeatureCollection wrapper transparency (Property 4)
    - `// Feature: sequential-route-playback, Property 4: Feature/FeatureCollection wrapper transparency`
    - Generator: random geometry; randomly wrap in `Feature` or `FeatureCollection`
    - Assert: `parseRouteGeoJSON(JSON.stringify(wrapped))` deep-equals `parseRouteGeoJSON(JSON.stringify(bare))`
    - **Property 4: Feature and FeatureCollection Wrapper Transparency**
    - **Validates: Requirements 3.3**

- [x] 10. Write property-based tests for checkpoint mapping and state machine (Properties 5–8)
  - [x] 10.1 Write property test for checkpoint-to-road-index monotonicity (Property 5)
    - `// Feature: sequential-route-playback, Property 5: checkpoint-to-road-index monotonicity`
    - Generator: `fc.array` of road coords (5–500 entries), `fc.array` of checkpoints (1–20)
    - Assert: `indices[i] <= indices[i+1]` for all adjacent pairs in the result
    - **Property 5: Checkpoint-to-Road-Index Monotonicity**
    - **Validates: Requirements 4.1**

  - [x] 10.2 Write property test for valid in-order sequence preserves state (Property 6)
    - `// Feature: sequential-route-playback, Property 6: valid in-order sequence preserves state`
    - Synthesise GPS trace that hits each checkpoint in ascending order within `radius_meters`
    - Assert: engine completes with `isSequenceInvalid === false` and `lastValidatedCpIdx === checkpoints.length - 1`
    - **Property 6: Valid In-Order Sequence Preserves State**
    - **Validates: Requirements 5.1, 5.2**

  - [x] 10.3 Write property test for out-of-order hit triggers sequence violation (Property 7)
    - `// Feature: sequential-route-playback, Property 7: out-of-order hit triggers sequence violation`
    - Generator: random route config; inject deliberate skip at a random checkpoint index `k` (skip checkpoint `k`, hit `k+1`)
    - Assert: `isSequenceInvalid === true` after the violation point; `lastValidatedCpIdx < k`
    - **Property 7: Out-of-Order Hit Triggers Sequence Violation**
    - **Validates: Requirements 5.3**

  - [x] 10.4 Write property test for post-violation output equals raw GPS (Property 8)
    - `// Feature: sequential-route-playback, Property 8: post-violation output equals raw GPS`
    - Generator: trace with violation injected at random GPS index `v`
    - Assert: for all `i >= v`, `output[i]` equals `[gpsPoints[i].lat, gpsPoints[i].lng]` exactly
    - **Property 8: Post-Violation Output Equals Raw GPS**
    - **Validates: Requirements 5.4, 11.3**

- [x] 11. Write property-based tests for active segment lock and corridor fallback (Properties 9–12)
  - [x] 11.1 Write property test for active segment lock (Property 9)
    - `// Feature: sequential-route-playback, Property 9: active segment lock`
    - Construct scenario: place `r_outside` closer to GPS point than nearest in-segment `r_inside`, but outside segment bounds
    - Assert: output is `r_inside` (if within corridor) or raw GPS — never `r_outside`
    - **Property 9: Active Segment Lock**
    - **Validates: Requirements 6.1, 6.6**

  - [x] 11.2 Write property test for corridor fallback produces raw GPS (Property 10)
    - `// Feature: sequential-route-playback, Property 10: corridor fallback produces raw GPS`
    - Generator: GPS points placed farther than `corridorMeters` from all road coords in active segment
    - Assert: `output[i]` equals `[gpsPoints[i].lat, gpsPoints[i].lng]` for every such point
    - **Property 10: Corridor Fallback Produces Raw GPS**
    - **Validates: Requirements 6.4, 6.5, 8.1**

  - [x] 11.3 Write property test for snapping idempotence (Property 11)
    - `// Feature: sequential-route-playback, Property 11: snapping idempotence`
    - Generator: arbitrary GPS arrays and route configs
    - Run `snap(input)` → `firstPass`; run `snap(firstPass as GpsDataPoint[])` → `secondPass`
    - Assert: `secondPass` deep-equals `firstPass`
    - **Property 11: Snapping Idempotence**
    - **Validates: Requirements 10.4**

  - [x] 11.4 Write property test for Jaipur bounding box numeric stability (Property 12)
    - `// Feature: sequential-route-playback, Property 12: Jaipur bounding box numeric stability`
    - Generator: coordinates uniformly sampled from `lat ∈ [26.7, 27.1]`, `lng ∈ [75.6, 75.95]`
    - Assert: every element `[lat, lng]` in output satisfies `isFinite(lat) && isFinite(lng)` — no `NaN` or `Infinity`
    - **Property 12: Jaipur Bounding Box Numeric Stability**
    - **Validates: Requirements 10.5**

- [x] 12. Final checkpoint — run full test suite
  - Run `npm run test` in `web/` (executes `vitest --run`) — all property tests must pass
  - Run `go test ./internal/api/...` to confirm Go integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The backend handler (`GetRoutePlaybackGeometry`) is already correct — task 1.1 is integration test coverage only, not a fix
- The route editor sequential fields already persist correctly to the DB — task 2.1 adds only the missing `corridor_meters > 0` validation
- `parseRouteGeoJSON` and `mapCheckpointsToRoadIndices` exist inline in `playback/page.tsx` but must be extracted to `web/src/lib/snapping.ts` to be unit-testable
- Do NOT modify: GPS storage, checkpoint hit detection (`LogCheckpointHit`), D2D/coverage calculations, route assignment logic, or `fetchMapMatchedRouteTurf`
- `seqLookahead` is used in the lookahead scan window in task 5.3 — it was missing from the existing `buildSequentialSnappedPlayback` implementation even though the parameter was accepted
- The `lastSnappedRoadIdx` tracking variable in the existing implementation is unused by the design and should be removed during refactor

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["4.1"] },
    { "id": 2, "tasks": ["5.1"] },
    { "id": 3, "tasks": ["5.2", "5.3", "5.4", "5.5"] },
    { "id": 4, "tasks": ["6.1", "6.2"] },
    { "id": 5, "tasks": ["8.1"] },
    { "id": 6, "tasks": ["8.2"] },
    { "id": 7, "tasks": ["9.1", "9.2", "9.3", "9.4", "10.1"] },
    { "id": 8, "tasks": ["10.2", "10.3", "10.4", "11.1", "11.2", "11.3", "11.4"] }
  ]
}
```
