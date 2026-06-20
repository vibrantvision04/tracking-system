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

export interface RouteLanePoint {
  id: number;
  route_id: number;
  sequence_number: number;
  latitude: number;
  longitude: number;
  status: "pending" | "achieved" | "missed";
  color: "gray" | "green" | "red";
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
  lane_points: RouteLanePoint[];
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

  if (roadCoords.length === 0) {
    return {
      coords: gpsPoints.map((p) => [p.lat, p.lng] as [number, number]),
      roadIndices: gpsPoints.map(() => -1),
      checkpointRoadIndices: [],
      normalisedCheckpoints: []
    };
  }

  let hasEntered = false;
  let lastMatchedIdx = 0;
  const LOOKAHEAD_WINDOW = 40; // tighter window to prevent jumps to parallel lanes/opposite direction segments

  for (let idx = 0; idx < gpsPoints.length; idx++) {
    const p = gpsPoints[idx];

    if (!isFinite(p.lat) || !isFinite(p.lng)) {
      coords.push([p.lat, p.lng]);
      roadIndices.push(-1);
      continue;
    }

    let bestDist = Infinity;
    let bestIdx = -1;

    if (!hasEntered) {
      // Global search for entry point
      for (let i = 0; i < roadCoords.length; i++) {
        const d = haversineMeters(p.lat, p.lng, roadCoords[i][0], roadCoords[i][1]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }

      if (bestIdx !== -1 && bestDist <= corridorMeters) {
        hasEntered = true;
        lastMatchedIdx = bestIdx;
        coords.push([roadCoords[bestIdx][0], roadCoords[bestIdx][1]]);
        roadIndices.push(bestIdx);
      } else {
        coords.push([p.lat, p.lng]);
        roadIndices.push(-1);
      }
    } else {
      // Bidirectional windowed search to support both outbound and return movements
      const searchStart = Math.max(0, lastMatchedIdx - LOOKAHEAD_WINDOW);
      const searchEnd = Math.min(lastMatchedIdx + LOOKAHEAD_WINDOW, roadCoords.length - 1);
      for (let i = searchStart; i <= searchEnd; i++) {
        const d = haversineMeters(p.lat, p.lng, roadCoords[i][0], roadCoords[i][1]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }

      if (bestIdx !== -1 && bestDist <= corridorMeters) {
        lastMatchedIdx = bestIdx;
        coords.push([roadCoords[bestIdx][0], roadCoords[bestIdx][1]]);
        roadIndices.push(bestIdx);
      } else {
        // Secondary search: if local window fails, search the entire route
        // to allow re-entry anywhere on the route after long detours or gaps.
        let secondaryBestDist = Infinity;
        let secondaryBestIdx = -1;
        for (let i = 0; i < roadCoords.length; i++) {
          const d = haversineMeters(p.lat, p.lng, roadCoords[i][0], roadCoords[i][1]);
          if (d < secondaryBestDist) {
            secondaryBestDist = d;
            secondaryBestIdx = i;
          }
        }

        if (secondaryBestIdx !== -1 && secondaryBestDist <= corridorMeters) {
          lastMatchedIdx = secondaryBestIdx;
          coords.push([roadCoords[secondaryBestIdx][0], roadCoords[secondaryBestIdx][1]]);
          roadIndices.push(secondaryBestIdx);
        } else {
          coords.push([p.lat, p.lng]);
          roadIndices.push(-1);
        }
      }
    }
  }

  return {
    coords,
    roadIndices,
    checkpointRoadIndices: [],
    normalisedCheckpoints: checkpoints
  };
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
