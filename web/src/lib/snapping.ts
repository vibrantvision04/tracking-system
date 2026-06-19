/**
 * snapping.ts
 *
 * Standalone utilities for the Sequential Route Playback & Dense Area Snapping System.
 * Extracted from web/src/app/playback/page.tsx to be unit-testable and reusable.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared TypeScript Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface RouteCheckpoint {
  id: number;
  route_id: number;
  checkpoint_name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  sequence_order: number;
}

export interface PlaybackGeometryData {
  route_id: number;
  route_name: string;
  is_sequential: boolean;
  corridor_meters: number;
  route_direction: "outbound" | "return" | "both";
  seq_lookahead: number;
  geojson: string;
  color: string;
  checkpoints: RouteCheckpoint[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Haversine Distance Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the great-circle distance in metres between two WGS-84 coordinates.
 * Uses Earth radius 6 371 000 m (standard haversine formula).
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
    Math.cos(phi2) *
    Math.sin(deltaLambda / 2) *
    Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─────────────────────────────────────────────────────────────────────────────
// GeoJSON Coordinate Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts an ordered `[lat, lng]` coordinate array from a GeoJSON string.
 *
 * Supported geometry types: `LineString`, `MultiLineString`.
 * Supported wrapper types:  `Feature`, `FeatureCollection` (first feature used).
 *
 * GeoJSON stores coordinates as `[longitude, latitude]`; this function swaps
 * the order to `[latitude, longitude]` to match the Leaflet / snapping engine
 * convention.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
export function parseRouteGeoJSON(geojson: string): [number, number][] {
  // Req 3.4 – malformed input: catch parse errors, log, return empty array.
  let parsed: unknown;
  try {
    parsed = JSON.parse(geojson);
  } catch (err) {
    console.error(
      "[parseRouteGeoJSON] Failed to parse GeoJSON string:",
      err
    );
    return [];
  }

  // Unwrap Feature / FeatureCollection (Req 3.3)
  let geometry: unknown = parsed;

  if (isObject(geometry) && geometry.type === "FeatureCollection") {
    const features = (geometry as Record<string, unknown>).features;
    if (!Array.isArray(features) || features.length === 0) {
      console.warn(
        "[parseRouteGeoJSON] FeatureCollection has no features; returning []"
      );
      return [];
    }
    // Use the first feature's geometry
    const firstFeature = features[0] as Record<string, unknown>;
    geometry = firstFeature.geometry ?? null;
  } else if (isObject(geometry) && geometry.type === "Feature") {
    geometry = (geometry as Record<string, unknown>).geometry ?? null;
  }

  if (!isObject(geometry)) {
    console.warn(
      "[parseRouteGeoJSON] No valid geometry object found; returning []"
    );
    return [];
  }

  const geomType = (geometry as Record<string, unknown>).type;
  const coordinates = (geometry as Record<string, unknown>).coordinates;

  // Req 3.1 – LineString
  if (geomType === "LineString") {
    if (!Array.isArray(coordinates)) {
      console.warn(
        "[parseRouteGeoJSON] LineString has no coordinates array; returning []"
      );
      return [];
    }
    return extractLineStringCoords(coordinates);
  }

  // Req 3.2 – MultiLineString
  if (geomType === "MultiLineString") {
    if (!Array.isArray(coordinates)) {
      console.warn(
        "[parseRouteGeoJSON] MultiLineString has no coordinates array; returning []"
      );
      return [];
    }
    const result: [number, number][] = [];
    for (const segment of coordinates) {
      if (Array.isArray(segment)) {
        result.push(...extractLineStringCoords(segment));
      }
    }
    return result;
  }

  // Unsupported geometry type (Req 3.5 / design error handling)
  console.warn(
    `[parseRouteGeoJSON] Unsupported geometry type "${String(geomType)}"; returning []`
  );
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Type guard: value is a non-null object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Converts a raw GeoJSON coordinates array (where each entry is `[lng, lat, ...]`)
 * into a `[lat, lng][]` array, skipping any malformed entries.
 */
function extractLineStringCoords(
  rawCoords: unknown[]
): [number, number][] {
  const result: [number, number][] = [];
  for (const c of rawCoords) {
    if (Array.isArray(c) && c.length >= 2) {
      const lng = c[0] as number;
      const lat = c[1] as number;
      // Swap [lng, lat] → [lat, lng] per Req 3.1
      result.push([lat, lng]);
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkpoint → Road Index Mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps each checkpoint to the index of its nearest point in `roadCoords` using
 * a monotonic forward-search algorithm — the search cursor (`searchFrom`) only
 * ever advances, ensuring the returned indices are non-decreasing (i.e.
 * `indices[i] <= indices[i+1]` for all adjacent pairs).
 *
 * Duplicate indices are allowed: two checkpoints may resolve to the same road
 * index when they are both closest to the same point on the road.
 *
 * Returns an empty array when either input is empty.
 *
 * Requirements: 4.1, 4.3, 4.4
 */
export function mapCheckpointsToRoadIndices(
  checkpoints: RouteCheckpoint[],
  roadCoords: [number, number][]
): number[] {
  if (checkpoints.length === 0 || roadCoords.length === 0) {
    return [];
  }

  const checkpointRoadIndices: number[] = new Array(checkpoints.length);
  let searchFrom = 0;

  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];

    let bestIndex = searchFrom;
    let bestDist = haversineMeters(
      cp.latitude,
      cp.longitude,
      roadCoords[searchFrom][0],
      roadCoords[searchFrom][1]
    );

    for (let j = searchFrom + 1; j < roadCoords.length; j++) {
      const d = haversineMeters(
        cp.latitude,
        cp.longitude,
        roadCoords[j][0],
        roadCoords[j][1]
      );
      if (d < bestDist) {
        bestDist = d;
        bestIndex = j;
      }
    }

    checkpointRoadIndices[i] = bestIndex;
    searchFrom = bestIndex; // never go backwards
  }

  return checkpointRoadIndices;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sequential Snapping Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal GPS data point shape required by the snapping engine.
 * Matches the GpsDataPoint interface in @/lib/types (subset used here).
 */
export interface SnappableGpsPoint {
  lat: number;
  lng: number;
  time: string;
  speed: number;
  ignition: boolean | null;
}

export function buildSequentialSnappedPlaybackDetailed(
  gpsPoints: SnappableGpsPoint[],
  roadCoords: [number, number][],
  checkpoints: RouteCheckpoint[],
  corridorMeters: number,
  routeDirection: "outbound" | "return" | "both",
  seqLookahead: number = 5
): {
  coords: [number, number][];
  roadIndices: number[];
  checkpointRoadIndices: number[];
  normalisedCheckpoints: RouteCheckpoint[];
} {
  if (gpsPoints.length === 0) {
    return { coords: [], roadIndices: [], checkpointRoadIndices: [], normalisedCheckpoints: [] };
  }

  const coords: [number, number][] = [];
  const roadIndices: number[] = [];

  // Fallback to raw GPS points if no road geometry
  if (roadCoords.length === 0) {
    return {
      coords: gpsPoints.map((p) => [p.lat, p.lng] as [number, number]),
      roadIndices: gpsPoints.map(() => -1),
      checkpointRoadIndices: [],
      normalisedCheckpoints: []
    };
  }

  // If no checkpoints, run in "geometry-only" mode:
  // snap each GPS point to the nearest road coordinate within the corridor.
  if (checkpoints.length === 0) {
    gpsPoints.forEach((p) => {
      if (!isFinite(p.lat) || !isFinite(p.lng)) {
        coords.push([p.lat, p.lng]);
        roadIndices.push(-1);
        return;
      }
      let bestDist = Infinity;
      let bestIdx = -1;
      for (let i = 0; i < roadCoords.length; i++) {
        const d = haversineMeters(p.lat, p.lng, roadCoords[i][0], roadCoords[i][1]);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      if (bestIdx !== -1 && bestDist <= corridorMeters) {
        coords.push([roadCoords[bestIdx][0], roadCoords[bestIdx][1]]);
        roadIndices.push(bestIdx);
      } else {
        coords.push([p.lat, p.lng]);
        roadIndices.push(-1);
      }
    });
    return { coords, roadIndices, checkpointRoadIndices: [], normalisedCheckpoints: [] };
  }

  // 1. Normalise checkpoints for direction (always validate in ascending index order)
  const normalisedCheckpoints =
    routeDirection === "return" ? [...checkpoints].reverse() : checkpoints;

  // 2. Map checkpoints to nearest roadCoords indices via monotonic forward-search
  const checkpointRoadIndices = mapCheckpointsToRoadIndices(
    normalisedCheckpoints,
    roadCoords
  );

  let lastValidatedCpIdx = -1;
  let isSequenceInvalid = false;
  const lastCpIdx = normalisedCheckpoints.length - 1;
  let lastMatchedRoadIdx = 0;

  for (let idx = 0; idx < gpsPoints.length; idx++) {
    const p = gpsPoints[idx];

    // 5.4 — isFinite guard: skip distance calculations for non-finite coordinates
    if (!isFinite(p.lat) || !isFinite(p.lng)) {
      coords.push([p.lat, p.lng]);
      roadIndices.push(-1);
      continue;
    }

    // Evaluate against next expected checkpoint first (to allow entry validation)
    if (!isSequenceInvalid) {
      const nextExpected = lastValidatedCpIdx + 1;

      if (nextExpected < normalisedCheckpoints.length) {
        const nextCp = normalisedCheckpoints[nextExpected];
        const distToNext = haversineMeters(
          p.lat,
          p.lng,
          nextCp.latitude,
          nextCp.longitude
        );
        const radius = Math.max(nextCp.radius_meters || 30, 30);

        if (distToNext <= radius) {
          // Valid in-order hit
          lastValidatedCpIdx++;
        } else if (lastValidatedCpIdx >= 0) {
          // Scan lookahead window for out-of-order hits
          // ONLY scan lookahead if we have already entered the route (lastValidatedCpIdx >= 0)
          const scanEnd = Math.min(nextExpected + seqLookahead, lastCpIdx);
          for (let cIdx = nextExpected + 1; cIdx <= scanEnd; cIdx++) {
            const cp = normalisedCheckpoints[cIdx];
            const dist = haversineMeters(p.lat, p.lng, cp.latitude, cp.longitude);
            const cpRadius = Math.max(cp.radius_meters || 30, 30);
            if (dist <= cpRadius) {
              // Out-of-order hit detected — sequence violation
              isSequenceInvalid = true;
              console.warn(
                `[Snapping Engine] Sequence violation! Skipped checkpoint index ${nextExpected} and hit index ${cIdx}. Playback trail invalidated.`
              );
              break;
            }
          }
        }
      }
    }

    // Case A: Sequence is invalid -> Snap globally if within corridor, else raw GPS
    if (isSequenceInvalid) {
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < roadCoords.length; i++) {
        const d = haversineMeters(p.lat, p.lng, roadCoords[i][0], roadCoords[i][1]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx !== -1 && bestDist <= corridorMeters) {
        coords.push([roadCoords[bestIdx][0], roadCoords[bestIdx][1]]);
        roadIndices.push(bestIdx);
      } else {
        coords.push([p.lat, p.lng]);
        roadIndices.push(-1);
      }
      continue;
    }

    // Case B: Not entered the route yet (lastValidatedCpIdx === -1) -> Keep raw GPS (no snapping before entry point)
    if (lastValidatedCpIdx === -1) {
      coords.push([p.lat, p.lng]);
      roadIndices.push(-1);
      continue;
    }

    // Case C: Exited the route (lastValidatedCpIdx === lastCpIdx) -> Keep raw GPS (no snapping after exit point)
    if (lastValidatedCpIdx === lastCpIdx) {
      coords.push([p.lat, p.lng]);
      roadIndices.push(-1);
      continue;
    }

    // Case D: On the route (lastValidatedCpIdx >= 0 and < lastCpIdx) -> Snap strictly to active segment and ensure sequential progression
    const startRoadIdx = checkpointRoadIndices[lastValidatedCpIdx];
    const endRoadIdx = checkpointRoadIndices[lastValidatedCpIdx + 1];

    // Ensure search starts at or after the last matched index to maintain sequence order
    lastMatchedRoadIdx = Math.max(lastMatchedRoadIdx, startRoadIdx);

    let activeRoadIdx = -1;
    let activeDist = Infinity;

    for (let rIdx = lastMatchedRoadIdx; rIdx <= endRoadIdx; rIdx++) {
      const roadPt = roadCoords[rIdx];
      const dist = haversineMeters(p.lat, p.lng, roadPt[0], roadPt[1]);
      if (dist < activeDist) {
        activeDist = dist;
        activeRoadIdx = rIdx;
      }
    }

    // Fallback in case range is small or activeRoadIdx is not found
    if (activeRoadIdx === -1) {
      activeRoadIdx = lastMatchedRoadIdx;
    }

    coords.push([roadCoords[activeRoadIdx][0], roadCoords[activeRoadIdx][1]]);
    roadIndices.push(activeRoadIdx);
    lastMatchedRoadIdx = activeRoadIdx;
  }

  console.log(
    `[Sequential Snapping Engine] Snapped ${gpsPoints.length} GPS points. finalPolylinePointCount: ${coords.length}, corridorMeters: ${corridorMeters}, sequenceInvalid: ${isSequenceInvalid}`
  );
  return { coords, roadIndices, checkpointRoadIndices, normalisedCheckpoints };
}

export function buildSequentialSnappedPlayback(
  gpsPoints: SnappableGpsPoint[],
  roadCoords: [number, number][],
  checkpoints: RouteCheckpoint[],
  corridorMeters: number,
  routeDirection: "outbound" | "return" | "both",
  seqLookahead: number = 5
): [number, number][] {
  return buildSequentialSnappedPlaybackDetailed(
    gpsPoints,
    roadCoords,
    checkpoints,
    corridorMeters,
    routeDirection,
    seqLookahead
  ).coords;
}
