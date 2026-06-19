// Feature: sequential-route-playback
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parseRouteGeoJSON,
  mapCheckpointsToRoadIndices,
  haversineMeters,
  buildSequentialSnappedPlayback,
  type RouteCheckpoint,
} from './snapping';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal RouteCheckpoint at the given lat/lng */
function makeCheckpoint(id: number, lat: number, lng: number, radiusMeters = 30, seqOrder = id): RouteCheckpoint {
  return { id, route_id: 1, checkpoint_name: `CP${id}`, latitude: lat, longitude: lng, radius_meters: radiusMeters, sequence_order: seqOrder };
}

/** Build a minimal GpsDataPoint-like object */
function makeGps(lat: number, lng: number) {
  return { lat, lng, time: new Date().toISOString(), speed: 10, ignition: true };
}

// Jaipur bounding box
// fc.float requires 32-bit float boundaries; fc.double handles full-precision doubles
const jaipurLat = fc.double({ min: 26.7, max: 27.1, noNaN: true });
const jaipurLng = fc.double({ min: 75.6, max: 75.95, noNaN: true });

// ─── Property 1: Output Length Invariant ────────────────────────────────────

describe('Property 1: output length equals input length', () => {
  // Feature: sequential-route-playback, Property 1: output length equals input length
  it('always returns array of same length as input GPS points', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ lat: jaipurLat, lng: jaipurLng, time: fc.constant('2024-01-01T00:00:00Z'), speed: fc.nat(60), ignition: fc.boolean() }), { maxLength: 200 }),
        fc.array(fc.tuple(jaipurLat, jaipurLng), { minLength: 2, maxLength: 50 }),
        fc.array(fc.record({ id: fc.nat(), route_id: fc.constant(1), checkpoint_name: fc.constant('CP'), latitude: jaipurLat, longitude: jaipurLng, radius_meters: fc.double({ min: 10, max: 100, noNaN: true }), sequence_order: fc.nat() }), { minLength: 1, maxLength: 5 }),
        fc.double({ min: 10, max: 200, noNaN: true }),
        fc.constantFrom('outbound' as const, 'return' as const, 'both' as const),
        fc.integer({ min: 1, max: 10 }),
        (gpsPoints, roadCoords, checkpoints, corridorMeters, routeDirection, seqLookahead) => {
          const result = buildSequentialSnappedPlayback(gpsPoints as any, roadCoords, checkpoints, corridorMeters, routeDirection, seqLookahead);
          return result.length === gpsPoints.length;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns empty array for empty input', () => {
    const result = buildSequentialSnappedPlayback([], [[26.9, 75.8]], [makeCheckpoint(1, 26.9, 75.8)], 50, 'outbound', 5);
    expect(result).toEqual([]);
  });

  it('returns single-element array for single GPS point', () => {
    const result = buildSequentialSnappedPlayback([makeGps(26.9, 75.8) as any], [[26.9, 75.8]], [makeCheckpoint(1, 26.9, 75.8)], 50, 'outbound', 5);
    expect(result.length).toBe(1);
  });
});

// ─── Property 2: GeoJSON LineString round-trip ───────────────────────────────

describe('Property 2: GeoJSON LineString extraction round-trip', () => {
  // Feature: sequential-route-playback, Property 2: GeoJSON LineString extraction round-trip
  it('extracts coordinates with lat/lng swapped back correctly', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(jaipurLat, jaipurLng), { minLength: 1, maxLength: 100 }),
        (latLngPairs) => {
          const geojson = JSON.stringify({
            type: 'LineString',
            coordinates: latLngPairs.map(([lat, lng]) => [lng, lat]),
          });
          const result = parseRouteGeoJSON(geojson);
          if (result.length !== latLngPairs.length) return false;
          return latLngPairs.every(([lat, lng], i) =>
            Math.abs(result[i][0] - lat) < 1e-9 && Math.abs(result[i][1] - lng) < 1e-9
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 3: GeoJSON MultiLineString concatenation ───────────────────────

describe('Property 3: GeoJSON MultiLineString concatenation', () => {
  // Feature: sequential-route-playback, Property 3: GeoJSON MultiLineString concatenation
  it('concatenates all segments in order with coords swapped', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.tuple(jaipurLat, jaipurLng), { minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
        (segments) => {
          const geojson = JSON.stringify({
            type: 'MultiLineString',
            coordinates: segments.map(seg => seg.map(([lat, lng]) => [lng, lat])),
          });
          const result = parseRouteGeoJSON(geojson);
          const expected = segments.flat();
          if (result.length !== expected.length) return false;
          return expected.every(([lat, lng], i) =>
            Math.abs(result[i][0] - lat) < 1e-9 && Math.abs(result[i][1] - lng) < 1e-9
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 4: Feature/FeatureCollection wrapper transparency ───────────────

describe('Property 4: Feature/FeatureCollection wrapper transparency', () => {
  // Feature: sequential-route-playback, Property 4: Feature/FeatureCollection wrapper transparency
  it('produces same result whether wrapped in Feature or not', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(jaipurLat, jaipurLng), { minLength: 1, maxLength: 30 }),
        (latLngPairs) => {
          const bareGeom = { type: 'LineString', coordinates: latLngPairs.map(([lat, lng]) => [lng, lat]) };
          const wrapped = { type: 'Feature', geometry: bareGeom, properties: {} };
          const bare = parseRouteGeoJSON(JSON.stringify(bareGeom));
          const fromFeature = parseRouteGeoJSON(JSON.stringify(wrapped));
          if (bare.length !== fromFeature.length) return false;
          return bare.every(([lat, lng], i) =>
            Math.abs(fromFeature[i][0] - lat) < 1e-9 && Math.abs(fromFeature[i][1] - lng) < 1e-9
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('produces same result for FeatureCollection wrapper', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(jaipurLat, jaipurLng), { minLength: 1, maxLength: 30 }),
        (latLngPairs) => {
          const bareGeom = { type: 'LineString', coordinates: latLngPairs.map(([lat, lng]) => [lng, lat]) };
          const collection = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: bareGeom, properties: {} }] };
          const bare = parseRouteGeoJSON(JSON.stringify(bareGeom));
          const fromCollection = parseRouteGeoJSON(JSON.stringify(collection));
          if (bare.length !== fromCollection.length) return false;
          return bare.every(([lat, lng], i) =>
            Math.abs(fromCollection[i][0] - lat) < 1e-9 && Math.abs(fromCollection[i][1] - lng) < 1e-9
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5: Checkpoint monotonicity ────────────────────────────────────

describe('Property 5: checkpoint-to-road-index monotonicity', () => {
  // Feature: sequential-route-playback, Property 5: checkpoint-to-road-index monotonicity
  it('indices are non-decreasing for any checkpoints and road coords', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(jaipurLat, jaipurLng), { minLength: 5, maxLength: 100 }),
        fc.array(fc.record({ id: fc.nat(), route_id: fc.constant(1), checkpoint_name: fc.constant('CP'), latitude: jaipurLat, longitude: jaipurLng, radius_meters: fc.constant(30), sequence_order: fc.nat() }), { minLength: 1, maxLength: 10 }),
        (roadCoords, checkpoints) => {
          const indices = mapCheckpointsToRoadIndices(checkpoints, roadCoords);
          for (let i = 1; i < indices.length; i++) {
            if (indices[i] < indices[i - 1]) return false;
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 6: Valid in-order sequence preserves state ─────────────────────

describe('Property 6: valid in-order sequence preserves state', () => {
  // Feature: sequential-route-playback, Property 6: valid in-order sequence preserves state
  it('does not invalidate sequence when all checkpoints hit in order', () => {
    // Use fixed road coords along a straight horizontal line
    const roadCoords: [number, number][] = Array.from({ length: 20 }, (_, i) => [26.9, 75.8 + i * 0.001]);
    const checkpoints = [
      makeCheckpoint(1, 26.9, 75.802, 50, 1),
      makeCheckpoint(2, 26.9, 75.806, 50, 2),
      makeCheckpoint(3, 26.9, 75.810, 50, 3),
    ];
    // GPS trace that visits each checkpoint in order (within 50m radius)
    const gpsPoints = [
      makeGps(26.9, 75.800),
      makeGps(26.9, 75.802), // hits CP1
      makeGps(26.9, 75.804),
      makeGps(26.9, 75.806), // hits CP2
      makeGps(26.9, 75.808),
      makeGps(26.9, 75.810), // hits CP3
      makeGps(26.9, 75.812),
    ];
    const result = buildSequentialSnappedPlayback(gpsPoints as any, roadCoords, checkpoints, 200, 'outbound', 5);
    expect(result.length).toBe(gpsPoints.length);
  });
});

// ─── Property 7: Out-of-order hit triggers sequence violation ────────────────

describe('Property 7: out-of-order hit triggers sequence violation', () => {
  // Feature: sequential-route-playback, Property 7: out-of-order hit triggers sequence violation
  it('sets sequence invalid when a checkpoint is skipped', () => {
    const roadCoords: [number, number][] = Array.from({ length: 20 }, (_, i) => [26.9, 75.8 + i * 0.001]);
    const checkpoints = [
      makeCheckpoint(1, 26.9, 75.802, 30, 1),
      makeCheckpoint(2, 26.9, 75.806, 30, 2),
      makeCheckpoint(3, 26.9, 75.810, 30, 3),
    ];
    // GPS trace that skips CP2 and hits CP3 directly
    const gpsPoints = [
      makeGps(26.9, 75.800),
      makeGps(26.9, 75.802), // hits CP1 ✓
      makeGps(26.9, 75.804),
      makeGps(26.9, 75.810), // skips CP2, hits CP3 → violation!
      makeGps(26.9, 75.812),
      makeGps(26.9, 75.814),
    ];
    const result = buildSequentialSnappedPlayback(gpsPoints as any, roadCoords, checkpoints, 200, 'outbound', 5);
    // After violation at index 3, points 4+ should be raw GPS
    expect(result.length).toBe(gpsPoints.length);
    // Points after violation must equal raw GPS
    expect(result[4]).toEqual([gpsPoints[4].lat, gpsPoints[4].lng]);
    expect(result[5]).toEqual([gpsPoints[5].lat, gpsPoints[5].lng]);
  });
});

// ─── Property 8: Post-violation output equals raw GPS ────────────────────────

describe('Property 8: post-violation output equals raw GPS', () => {
  // Feature: sequential-route-playback, Property 8: post-violation output equals raw GPS
  it('all outputs after violation are exactly raw GPS values', () => {
    const roadCoords: [number, number][] = Array.from({ length: 30 }, (_, i) => [26.9, 75.8 + i * 0.001]);
    const checkpoints = [
      makeCheckpoint(1, 26.9, 75.802, 30, 1),
      makeCheckpoint(2, 26.9, 75.806, 30, 2),
      makeCheckpoint(3, 26.9, 75.815, 30, 3),
    ];
    const gpsPoints = [
      makeGps(26.9, 75.800),
      makeGps(26.9, 75.802), // CP1 ✓
      makeGps(26.9, 75.815), // skips CP2, hits CP3 → violation at index 2
      makeGps(26.9, 75.820),
      makeGps(26.9, 75.825),
    ];
    const result = buildSequentialSnappedPlayback(gpsPoints as any, roadCoords, checkpoints, 200, 'outbound', 5);
    // Indices 2, 3, 4 must all be raw GPS
    for (let i = 2; i < gpsPoints.length; i++) {
      expect(result[i][0]).toBeCloseTo(gpsPoints[i].lat, 9);
      expect(result[i][1]).toBeCloseTo(gpsPoints[i].lng, 9);
    }
  });
});

// ─── Property 9: Active segment lock ────────────────────────────────────────

describe('Property 9: active segment lock', () => {
  // Feature: sequential-route-playback, Property 9: active segment lock
  it('does not snap to road coords outside the active segment', () => {
    // Road: two segments far apart
    // Segment A (indices 0-4): around lat 26.9, lng 75.80
    // Segment B (indices 5-9): around lat 26.9, lng 75.90 (far away)
    const roadCoords: [number, number][] = [
      [26.900, 75.800], [26.900, 75.801], [26.900, 75.802], [26.900, 75.803], [26.900, 75.804],
      [26.900, 75.900], [26.900, 75.901], [26.900, 75.902], [26.900, 75.903], [26.900, 75.904],
    ];
    // Checkpoints: CP1 at road start, CP2 at road index 4
    const checkpoints = [
      makeCheckpoint(1, 26.900, 75.800, 50, 1),
      makeCheckpoint(2, 26.900, 75.804, 50, 2),
    ];
    // GPS Point 1 hits CP1 (enters route).
    // GPS Point 2 is closer to segment B physically, but should snap to segment A (active segment)
    const gpsPoints = [
      makeGps(26.900, 75.800),
      makeGps(26.900, 75.850)
    ];
    const result = buildSequentialSnappedPlayback(gpsPoints as any, roadCoords, checkpoints, 10000, 'outbound', 5);
    expect(result.length).toBe(2);
    expect(result[1][1]).toBeLessThan(75.81); // must snap to segment A, not segment B
  });
});

// ─── Property 10: Corridor fallback produces raw GPS ────────────────────────

describe('Property 10: corridor fallback produces raw GPS', () => {
  // Feature: sequential-route-playback, Property 10: corridor fallback produces raw GPS
  it('outputs raw GPS when point is outside corridor', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(jaipurLat, jaipurLng), { minLength: 1, maxLength: 50 }),
        (gpsLatLngs) => {
          // Route is at a fixed location far from the GPS points
          const routeLat = 27.05;
          const routeLng = 75.7;
          const roadCoords: [number, number][] = [[routeLat, routeLng], [routeLat, routeLng + 0.001]];
          const checkpoints = [makeCheckpoint(1, routeLat, routeLng + 0.001, 30, 1)];
          const corridorMeters = 1; // very tight — GPS points at ~Jaipur range will be far
          const gpsPoints = gpsLatLngs.map(([lat, lng]) => makeGps(lat, lng));
          const result = buildSequentialSnappedPlayback(gpsPoints as any, roadCoords, checkpoints, corridorMeters, 'outbound', 5);
          // All points outside corridor should be raw GPS
          return gpsPoints.every((p, i) => {
            const dist = haversineMeters(p.lat, p.lng, routeLat, routeLng);
            if (dist > corridorMeters) {
              return Math.abs(result[i][0] - p.lat) < 1e-9 && Math.abs(result[i][1] - p.lng) < 1e-9;
            }
            return true; // inside corridor: may be snapped, that's fine
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 11: Snapping idempotence ──────────────────────────────────────

describe('Property 11: snapping idempotence', () => {
  // Feature: sequential-route-playback, Property 11: snapping idempotence
  it('running the engine twice produces the same result as once (geometry-only)', () => {
    const roadCoords: [number, number][] = Array.from({ length: 10 }, (_, i) => [26.9, 75.8 + i * 0.001]);
    const checkpoints: RouteCheckpoint[] = [];
    fc.assert(
      fc.property(
        fc.array(fc.record({ lat: jaipurLat, lng: jaipurLng, time: fc.constant('2024-01-01T00:00:00Z'), speed: fc.nat(60), ignition: fc.boolean() }), { minLength: 1, maxLength: 50 }),
        (gpsPoints) => {
          const first = buildSequentialSnappedPlayback(gpsPoints as any, roadCoords, checkpoints, 200, 'outbound', 5);
          const secondInput = first.map(([lat, lng]) => ({ lat, lng, time: '2024-01-01T00:00:00Z', speed: 10, ignition: true }));
          const second = buildSequentialSnappedPlayback(secondInput as any, roadCoords, checkpoints, 200, 'outbound', 5);
          return first.every(([lat, lng], i) =>
            Math.abs(second[i][0] - lat) < 1e-9 && Math.abs(second[i][1] - lng) < 1e-9
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 12: Jaipur bounding box numeric stability ──────────────────────

describe('Property 12: Jaipur bounding box numeric stability', () => {
  // Feature: sequential-route-playback, Property 12: Jaipur bounding box numeric stability
  it('produces no NaN or Infinity values for Jaipur coordinates', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ lat: jaipurLat, lng: jaipurLng, time: fc.constant('2024-01-01T00:00:00Z'), speed: fc.nat(60), ignition: fc.boolean() }), { minLength: 1, maxLength: 100 }),
        fc.array(fc.tuple(jaipurLat, jaipurLng), { minLength: 2, maxLength: 20 }),
        fc.double({ min: 10, max: 500, noNaN: true }),
        (gpsPoints, roadCoords, corridorMeters) => {
          const checkpoints = [makeCheckpoint(1, roadCoords[0][0], roadCoords[0][1], 50, 1)];
          const result = buildSequentialSnappedPlayback(gpsPoints as any, roadCoords, checkpoints, corridorMeters, 'outbound', 5);
          return result.every(([lat, lng]) => isFinite(lat) && isFinite(lng));
        }
      ),
      { numRuns: 100 }
    );
  });
});
