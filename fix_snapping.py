import re

with open("web/src/lib/snapping.ts", "r") as f:
    content = f.read()

pattern = r"export function buildSequentialSnappedPlaybackDetailed\(.*?\nexport function buildSequentialSnappedPlayback\("

replacement = """export function buildSequentialSnappedPlaybackDetailed(
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
  const LOOKAHEAD_WINDOW = 150; // robust window to prevent backwards/return-trip jumping

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
      // Windowed forward search
      const searchEnd = Math.min(lastMatchedIdx + LOOKAHEAD_WINDOW, roadCoords.length - 1);
      for (let i = lastMatchedIdx; i <= searchEnd; i++) {
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
        // If it drifted too far even within lookahead, don't advance idx
        coords.push([p.lat, p.lng]);
        roadIndices.push(-1);
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

export function buildSequentialSnappedPlayback("""

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open("web/src/lib/snapping.ts", "w") as f:
    f.write(new_content)
