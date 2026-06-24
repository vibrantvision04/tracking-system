"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { api, post } from "@/lib/api";
import type { Vehicle, GpsDataPoint } from "@/lib/types";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { populateOpenDepotLayer } from "@/components/OpenDepotMapLayer";
import { FilterBar } from "@/components/shared/FilterBar";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import Button from "@/components/ui/Button";
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar,
  Layers,
  Gauge,
  Activity
} from "lucide-react";

interface StoppagePoint {
  startIndex: number;
  endIndex: number;
  lat: number;
  lng: number;
  durationSeconds: number;
  startTime: string;
  endTime: string;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function distanceToSegment(pLat: number, pLng: number, aLat: number, aLng: number, bLat: number, bLng: number): number {
  if (aLat === bLat && aLng === bLng) {
    return haversineDistance(pLat, pLng, aLat, aLng) * 1000;
  }
  const latMid = ((aLat + bLat) / 2) * Math.PI / 180;
  const kx = Math.cos(latMid);
  const bx = (bLng - aLng) * kx;
  const by = bLat - aLat;
  const px = (pLng - aLng) * kx;
  const py = pLat - aLat;
  const segmentLenSq = bx * bx + by * by;
  if (segmentLenSq === 0) {
    return haversineDistance(pLat, pLng, aLat, aLng) * 1000;
  }
  let t = (px * bx + py * by) / segmentLenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cLat = aLat + t * (bLat - aLat);
  const cLng = aLng + t * (bLng - aLng);
  return haversineDistance(pLat, pLng, cLat, cLng) * 1000;
}

function smoothGpsTrace(points: GpsDataPoint[]): GpsDataPoint[] {
  if (points.length < 3) return points;

  // 1. Outlier Filtering (Remove impossible jumps > 120 km/h)
  const filtered: GpsDataPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = filtered[filtered.length - 1];
    const curr = points[i];

    const distKm = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
    const timeDiffHrs = (new Date(curr.time).getTime() - new Date(prev.time).getTime()) / (1000 * 60 * 60);

    if (timeDiffHrs > 0) {
      const speedKmh = distKm / timeDiffHrs;
      if (speedKmh > 120 && distKm > 0.05) {
        continue; // Skip outlier
      }
    }
    filtered.push(curr);
  }

  // 2. Downsampling (Remove redundant stationary and highly dense points)
  const downsampled: GpsDataPoint[] = [filtered[0]];
  for (let i = 1; i < filtered.length - 1; i++) {
    const lastKept = downsampled[downsampled.length - 1];
    const curr = filtered[i];

    const distKm = haversineDistance(lastKept.lat, lastKept.lng, curr.lat, curr.lng);
    const timeDiffSec = (new Date(curr.time).getTime() - new Date(lastKept.time).getTime()) / 1000;

    // If stationary, keep at most one point per 30 seconds
    if (curr.speed === 0 && lastKept.speed === 0 && distKm < 0.005) {
      if (timeDiffSec < 30) {
        continue; // Skip redundant stopped point
      }
    }

    // If moving, keep points that are at least 5 meters apart or 10 seconds apart
    if (distKm < 0.005 && timeDiffSec < 10) {
      // Keep if speed or ignition state changed significantly
      const speedDiff = Math.abs(curr.speed - lastKept.speed);
      const ignitionChanged = curr.ignition !== lastKept.ignition;
      if (speedDiff < 5 && !ignitionChanged) {
        continue; // Skip dense point
      }
    }

    downsampled.push(curr);
  }

  // Always append the last point if it's not already added
  if (filtered.length > 1) {
    const lastPoint = filtered[filtered.length - 1];
    const lastKept = downsampled[downsampled.length - 1];
    if (lastKept.time !== lastPoint.time) {
      downsampled.push(lastPoint);
    }
  }

  return downsampled;
}

import * as turf from "@turf/turf";
import { RouteCheckpoint, haversineMeters, mapCheckpointsToRoadIndices, parseRouteGeoJSON, buildSequentialSnappedPlayback, buildSequentialSnappedPlaybackDetailed } from "@/lib/snapping";
import { toast } from "react-toastify";

function fetchMapMatchedRouteTurf(points: GpsDataPoint[], routeGeoJSON: any, toleranceMeters: number = 15): [number, number][] {
  if (points.length === 0) return [];
  if (!routeGeoJSON) {
    return points.map(p => [p.lat, p.lng] as [number, number]);
  }

  let routePts: [number, number][] = [];
  try {
    const geom = typeof routeGeoJSON === "string" ? JSON.parse(routeGeoJSON) : routeGeoJSON;

    const extractCoords = (g: any) => {
      if (!g) return;
      if (g.type === "LineString") {
        if (Array.isArray(g.coordinates)) {
          g.coordinates.forEach((c: any) => {
            if (Array.isArray(c) && c.length >= 2) {
              routePts.push([c[1], c[0]]);
            }
          });
        }
      } else if (g.type === "MultiLineString") {
        if (Array.isArray(g.coordinates)) {
          g.coordinates.forEach((line: any) => {
            if (Array.isArray(line)) {
              line.forEach((c: any) => {
                if (Array.isArray(c) && c.length >= 2) {
                  routePts.push([c[1], c[0]]);
                }
              });
            }
          });
        }
      }
    };

    if (geom.type === "FeatureCollection") {
      if (Array.isArray(geom.features)) {
        geom.features.forEach((f: any) => {
          if (f.geometry) extractCoords(f.geometry);
        });
      }
    } else if (geom.type === "Feature") {
      if (geom.geometry) extractCoords(geom.geometry);
    } else {
      extractCoords(geom);
    }
  } catch (e) {
    console.error("Error extracting coordinates in fetchMapMatchedRouteTurf:", e);
    return points.map(p => [p.lat, p.lng] as [number, number]);
  }

  if (routePts.length === 0) {
    return points.map(p => [p.lat, p.lng] as [number, number]);
  }

  // Pre-calculate scaling factor for longitude based on latitude of Jaipur (~26.9 deg)
  const kx = 0.89; // cos(26.9 degrees)

  const matchedCoords: [number, number][] = [];
  let lastRawLat = -999;
  let lastRawLng = -999;
  let lastMatched: [number, number] = [0, 0];
  let lastMatchedSegmentIdx = -1;

  points.forEach(p => {
    // 1. Caching: If the point is very close to the last computed point (less than 5 meters), reuse the matched result
    if (lastRawLat !== -999 && haversineDistance(p.lat, p.lng, lastRawLat, lastRawLng) < 0.005) {
      matchedCoords.push(lastMatched);
      return;
    }

    // Define function to find the closest segment in a specific index range
    const findClosestSegment = (startIdx: number, endIdx: number) => {
      let minDistanceSq = Infinity;
      let bestLat = p.lat;
      let bestLng = p.lng;
      let bestSegmentIdx = -1;

      for (let i = startIdx; i <= endIdx; i++) {
        if (i < 0 || i >= routePts.length - 1) continue;

        const p1 = routePts[i];
        const p2 = routePts[i + 1];

        const y = p.lat;
        const x = p.lng;
        const y1 = p1[0];
        const x1 = p1[1];
        const y2 = p2[0];
        const x2 = p2[1];

        const dy = y2 - y1;
        const dx = (x2 - x1) * kx;

        const py = y - y1;
        const px = (x - x1) * kx;

        const segmentLenSq = dx * dx + dy * dy;
        let t = 0;
        if (segmentLenSq > 0) {
          t = (px * dx + py * dy) / segmentLenSq;
          t = Math.max(0, Math.min(1, t));
        }

        const snapLat = y1 + t * dy;
        const snapLng = x1 + t * (x2 - x1);

        const diffLat = snapLat - y;
        const diffLng = (snapLng - x) * kx;
        const distSq = diffLat * diffLat + diffLng * diffLng;

        if (distSq < minDistanceSq) {
          minDistanceSq = distSq;
          bestLat = snapLat;
          bestLng = snapLng;
          bestSegmentIdx = i;
        }
      }
      return { minDistanceSq, bestLat, bestLng, bestSegmentIdx };
    };

    // 2. Perform snapping
    let snapResult: { minDistanceSq: number; bestLat: number; bestLng: number; bestSegmentIdx: number } | null = null;

    if (lastMatchedSegmentIdx !== -1) {
      // Local search: check segments around last matched index (-2 to +5)
      const localStart = lastMatchedSegmentIdx - 2;
      const localEnd = lastMatchedSegmentIdx + 5;
      const res = findClosestSegment(localStart, localEnd);
      
      const distMeters = Math.sqrt(res.minDistanceSq) * 111000;
      if (distMeters <= toleranceMeters) {
        snapResult = res;
      }
    }

    if (!snapResult) {
      // Global search if no local match (or first point)
      const res = findClosestSegment(0, routePts.length - 2);
      const distMeters = Math.sqrt(res.minDistanceSq) * 111000;
      if (distMeters <= toleranceMeters) {
        snapResult = res;
      }
    }

    if (snapResult) {
      lastMatched = [snapResult.bestLat, snapResult.bestLng];
      lastMatchedSegmentIdx = snapResult.bestSegmentIdx;
    } else {
      // If too far from any segment, do not snap (use raw coordinates)
      lastMatched = [p.lat, p.lng];
    }

    lastRawLat = p.lat;
    lastRawLng = p.lng;
    matchedCoords.push(lastMatched);
  });

  return matchedCoords;
}

function detectStoppages(points: GpsDataPoint[]): StoppagePoint[] {
  const stoppages: StoppagePoint[] = [];
  const minStoppageDuration = 60;
  const maxStoppageRadiusKm = 0.03;

  let startIndex = -1;

  for (let i = 0; i < points.length; i++) {
    if (points[i].speed === 0) {
      if (startIndex === -1) {
        startIndex = i;
      } else {
        const dist = haversineDistance(
          points[startIndex].lat, points[startIndex].lng,
          points[i].lat, points[i].lng
        );
        if (dist > maxStoppageRadiusKm) {
          const startT = new Date(points[startIndex].time).getTime();
          const endT = new Date(points[i - 1].time).getTime();
          const dur = (endT - startT) / 1000;
          if (dur >= minStoppageDuration) {
            stoppages.push({
              startIndex,
              endIndex: i - 1,
              lat: points[startIndex].lat,
              lng: points[startIndex].lng,
              durationSeconds: dur,
              startTime: points[startIndex].time,
              endTime: points[i - 1].time
            });
          }
          startIndex = i;
        }
      }
    } else {
      if (startIndex !== -1) {
        const startT = new Date(points[startIndex].time).getTime();
        const endT = new Date(points[i - 1].time).getTime();
        const dur = (endT - startT) / 1000;
        if (dur >= minStoppageDuration) {
          stoppages.push({
            startIndex,
            endIndex: i - 1,
            lat: points[startIndex].lat,
            lng: points[startIndex].lng,
            durationSeconds: dur,
            startTime: points[startIndex].time,
            endTime: points[i - 1].time
          });
        }
        startIndex = -1;
      }
    }
  }

  if (startIndex !== -1) {
    const startT = new Date(points[startIndex].time).getTime();
    const endT = new Date(points[points.length - 1].time).getTime();
    const dur = (endT - startT) / 1000;
    if (dur >= minStoppageDuration) {
      stoppages.push({
        startIndex,
        endIndex: points.length - 1,
        lat: points[startIndex].lat,
        lng: points[startIndex].lng,
        durationSeconds: dur,
        startTime: points[startIndex].time,
        endTime: points[points.length - 1].time
      });
    }
  }

  return stoppages;
}

function formatStoppageDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getPopupContent(p: GpsDataPoint) {
  if (!p) return "";
  return `
    <div style="color: #0f172a; font-family: sans-serif; font-size: 13px; line-height: 1.4; min-width: 160px; padding: 2px;">
      <div style="font-weight: 700; border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; margin-bottom: 8px; color: #4f46e5; font-size: 14px; display: flex; align-items: center; gap: 4px;">
        🚚 <span>Vehicle Details</span>
      </div>
      <div style="margin-bottom: 4px; display: flex; justify-content: space-between; gap: 12px;">
        <span style="color: #64748b;">Time:</span>
        <span style="font-weight: 600; color: #1e293b;">${new Date(p.time).toLocaleTimeString()}</span>
      </div>
      <div style="margin-bottom: 4px; display: flex; justify-content: space-between; gap: 12px;">
        <span style="color: #64748b;">Speed:</span>
        <span style="font-weight: 600; color: #1e293b;">${p.speed} km/h</span>
      </div>
      <div style="margin-bottom: 4px; display: flex; justify-content: space-between; gap: 12px;">
        <span style="color: #64748b;">Ignition:</span>
        <span style="color: ${p.ignition ? '#16a34a' : '#dc2626'}; font-weight: 700;">${p.ignition ? 'ON' : 'OFF'}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px;">
        <span style="color: #64748b;">Coord:</span>
        <span style="font-weight: 500; color: #334155; font-size: 11px;">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>
      </div>
    </div>
  `;
}

function formatCheckpointName(name: string, seq: number): string {
  if (name.includes("_Lane") && (name.includes("_Start") || name.includes("_End"))) {
    const match = name.match(/_Lane(\d+)_(Start|End)/);
    if (match) {
      return `Lane ${match[1]} ${match[2]}`;
    }
  }
  return name;
}

function formatDateTo12H(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = String(hours).padStart(2, '0');

  return `${day}-${month}-${year} ${hoursStr}:${minutes}:${seconds} ${ampm}`;
}

function getTracePopupContent(regNo: string, p: GpsDataPoint) {
  if (!p) return "";
  const timeStr = formatDateTo12H(p.time);
  const speedStr = `${Math.round(p.speed)} KM/H`;
  const ignitionStr = p.ignition ? 'Yes' : 'No';
  return `
    <div style="color: #0f172a; font-family: sans-serif; font-size: 13px; line-height: 1.4; min-width: 180px; padding: 2px;">
      <div style="font-weight: 700; border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; margin-bottom: 8px; color: #0f172a; font-size: 14px;">
        ${regNo}
      </div>
      <div style="margin-bottom: 4px; display: flex; justify-content: space-between; gap: 12px;">
        <span style="color: #64748b;">Time</span>
        <span style="font-weight: 600; color: #1e293b;">${timeStr}</span>
      </div>
      <div style="margin-bottom: 4px; display: flex; justify-content: space-between; gap: 12px;">
        <span style="color: #64748b;">Speed</span>
        <span style="font-weight: 600; color: #1e293b;">${speedStr}</span>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 12px;">
        <span style="color: #64748b;">IGNITION</span>
        <span style="font-weight: 600; color: #1e293b;">${ignitionStr}</span>
      </div>
    </div>
  `;
}

export default function PlaybackPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [regionsList, setRegionsList] = useState<any[]>([]);

  const [aiRouteCorrectionActive, setAiRouteCorrectionActive] = useState<boolean>(false);
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);
  const lastLoadedRouteIdRef = useRef<string | null>(null);

  // Filtering States
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [selectedWardId, setSelectedWardId] = useState<string>("");
  const [selectedShift, setSelectedShift] = useState<string>("Morning Shift");
  const [selectedImei, setSelectedImei] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(4);
  const [aggressiveSnapping, setAggressiveSnapping] = useState<boolean>(false);
  const [routeIdParam, setRouteIdParam] = useState<string | null>(null);

  // Driver Details States
  const [driverDetails, setDriverDetails] = useState<any>(null);
  const [transferStationTrips, setTransferStationTrips] = useState<number>(0);

  // Snapping Diagnostics States
  const [totalGpsPoints, setTotalGpsPoints] = useState<number>(0);
  const [snappedPointsCount, setSnappedPointsCount] = useState<number>(0);
  const [rawPointsCount, setRawPointsCount] = useState<number>(0);
  const [activeCorridor, setActiveCorridor] = useState<string>("N/A");

  const [routesList, setRoutesList] = useState<any[]>([]);
  const [shiftsList, setShiftsList] = useState<any[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const allRoutesLayerRef = useRef<any>(null);

  const resolveRouteAndSyncFilters = useCallback((vehImei: string, shiftName: string) => {
    if (!vehImei || vehicles.length === 0 || routesList.length === 0) return;

    const veh = vehicles.find(v => v.gps_device?.imei === vehImei);
    if (!veh) return;

    const selectZoneForWard = (wardId: number) => {
      const wardRegion = regionsList.find(reg => reg.id === wardId);
      if (wardRegion && wardRegion.parent_id) {
        setSelectedZoneId(String(wardRegion.parent_id));
      }
    };

    const applyRoute = (route: any) => {
      setSelectedRouteId(String(route.id));
      if (route.ward_id) {
        setSelectedWardId(String(route.ward_id));
        selectZoneForWard(route.ward_id);
      }
    };

    const shiftWord = (shiftName || "").toLowerCase().split(" ")[0]; // "morning", "afternoon", "night", "all"

    // 1. Fetch specific assignment from DB first (Priority 1)
    api<{ success: boolean; data: any[] }>(`/api/vehicle-route-assignments?date=${date}`)
      .then((res) => {
        if (res.success && res.data) {
          const assignment = res.data.find((a: any) => {
            const matchesVeh = a.vehicle_id === veh.id;
            if (!matchesVeh) return false;
            if (shiftWord === "all") return true;
            const aShift = (a.shift_name || "").toLowerCase();
            return aShift.includes(shiftWord);
          });

          if (assignment) {
            const route = routesList.find(r => r.id === assignment.route_id);
            if (route) {
              applyRoute(route);
              return;
            }
          }
        }

        // 2. Fallback: Try matching by name convention (Priority 2)
        const regNoClean = veh.registration_no.toLowerCase().replace(/[^a-z0-9]/g, "");
        let matchedRoute = routesList.find(r => {
          const name = r.route_name.toLowerCase();
          const matchesShift = shiftWord === "all" || name.includes(shiftWord);
          return matchesShift && name.replace(/[^a-z0-9]/g, "").includes(regNoClean);
        });

        if (matchedRoute) {
          applyRoute(matchedRoute);
          return;
        }

        // 3. Fallback: Find any route in the vehicle's allotted ward (Priority 3)
        if ((veh as any).ward_id) {
          setSelectedWardId(String((veh as any).ward_id));
          if ((veh as any).zone_id) {
            setSelectedZoneId(String((veh as any).zone_id));
          } else {
            selectZoneForWard((veh as any).ward_id);
          }

          const fallbackRoute = routesList.find(r => r.ward_id === (veh as any).ward_id);
          if (fallbackRoute) {
            setSelectedRouteId(String(fallbackRoute.id));
          } else {
            setSelectedRouteId("");
          }
        } else if ((veh as any).zone_id) {
          setSelectedZoneId(String((veh as any).zone_id));
        }
      })
      .catch(() => {
        // Fallback on database fetch error (name convention match)
        const regNoClean = veh.registration_no.toLowerCase().replace(/[^a-z0-9]/g, "");
        let matchedRoute = routesList.find(r => {
          const name = r.route_name.toLowerCase();
          const matchesShift = shiftWord === "all" || name.includes(shiftWord);
          return matchesShift && name.replace(/[^a-z0-9]/g, "").includes(regNoClean);
        });

        if (matchedRoute) {
          applyRoute(matchedRoute);
          return;
        }

        // Fallback to vehicle's allotted ward/zone
        if ((veh as any).ward_id) {
          setSelectedWardId(String((veh as any).ward_id));
          if ((veh as any).zone_id) {
            setSelectedZoneId(String((veh as any).zone_id));
          } else {
            selectZoneForWard((veh as any).ward_id);
          }

          const fallbackRoute = routesList.find(r => r.ward_id === (veh as any).ward_id);
          if (fallbackRoute) {
            setSelectedRouteId(String(fallbackRoute.id));
          } else {
            setSelectedRouteId("");
          }
        } else if ((veh as any).zone_id) {
          setSelectedZoneId(String((veh as any).zone_id));
        }
      });
  }, [vehicles, routesList, regionsList, date]);

  const [showPlannedRoute, setShowPlannedRoute] = useState(true);
  const [showActualMovement, setShowActualMovement] = useState(true);
  const [showRawPlayback, setShowRawPlayback] = useState(true);
  const [showRawGpsTrace, setShowRawGpsTrace] = useState(false);
  const [showRegionBoundary, setShowRegionBoundary] = useState(true);
  const [showStartEndPoint, setShowStartEndPoint] = useState(true);
  const [showStoppages, setShowStoppages] = useState(true);
  const [showMapIndicationMenu, setShowMapIndicationMenu] = useState(false);
  const [checkpointsCollapsed, setCheckpointsCollapsed] = useState(false);
  const [stoppagesCollapsed, setStoppagesCollapsed] = useState(false);
  const [showMajorStoppages, setShowMajorStoppages] = useState(true);
  const [showMiniStoppages, setShowMiniStoppages] = useState(true);
  const [showCoveredCheckpoints, setShowCoveredCheckpoints] = useState(true);
  const [showUncoveredCheckpoints, setShowUncoveredCheckpoints] = useState(true);

  // POI Layer Toggles
  const [showParking, setShowParking] = useState(true);
  const [showTransfer, setShowTransfer] = useState(true);
  const [showFuel, setShowFuel] = useState(true);
  const [showWorkshop, setShowWorkshop] = useState(true);
  const [showOpenDepots, setShowOpenDepots] = useState(false);

  // POI Data States
  const [parkingSpots, setParkingSpots] = useState<any[]>([]);
  const [transferStations, setTransferStations] = useState<any[]>([]);
  const [fuelStations, setFuelStations] = useState<any[]>([]);
  const [workshops, setWorkshops] = useState<any[]>([]);

  // Playback States
  const [points, setPoints] = useState<GpsDataPoint[]>([]);
  const [playbackSteps, setPlaybackSteps] = useState<{
    lat: number;
    lng: number;
    time: string;
    speed: number;
    ignition: boolean | null;
    gpsIndex: number;
  }[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [stoppages, setStoppages] = useState<StoppagePoint[]>([]);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [activeRightTab, setActiveRightTab] = useState<"checkpoints" | "stoppages">("checkpoints");
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState<boolean>(false);

  const assignedRouteColorRef = useRef<string>("#f97316");
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const mkRef = useRef<any>(null);
  const stoppageMarkersRef = useRef<any[]>([]);
  const checkpointMarkersRef = useRef<any[]>([]);
  const checkpointMarkersMapRef = useRef<Record<number, any>>({});
  const checkpointsWithStatusRef = useRef<any[]>([]);
  const assignedRouteLayerRef = useRef<any>(null);
  const boundaryLayerRef = useRef<any>(null); // For selected zone/ward boundaries
  const intervalRef = useRef<any>(null);

  const parkingSpotsLayerRef = useRef<any>(null);
  const transferStationsLayerRef = useRef<any>(null);
  const fuelStationsLayerRef = useRef<any>(null);
  const workshopsLayerRef = useRef<any>(null);
  const openDepotsLayerRef = useRef<any>(null);

  const matchedCoordsRef = useRef<[number, number][]>([]);
  const roadCoordsRef = useRef<[number, number][]>([]);
  const matchedRoadIndicesRef = useRef<number[]>([]);
  const checkpointRoadIndicesRef = useRef<number[]>([]);
  const checkpointsRef = useRef<any[]>([]);
  const activeLineRef = useRef<any>(null);
  const startMarkerRef = useRef<any>(null);
  const endMarkerRef = useRef<any>(null);
  const rawTraceLineRef = useRef<any>(null);

  const pointsRef = useRef<GpsDataPoint[]>([]);
  const vehiclesRef = useRef<Vehicle[]>([]);
  const selectedImeiRef = useRef<string>("");

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  useEffect(() => {
    selectedImeiRef.current = selectedImei;
  }, [selectedImei]);

  const jumpToKeyframe = useCallback((index: number) => {
    setPlaying(false);
    const stepIdx = playbackSteps.findIndex(step => step.gpsIndex === index);
    if (stepIdx !== -1) {
      setIdx(stepIdx);
      const step = playbackSteps[stepIdx];
      const map = mapRef.current;
      if (map) {
        map.panTo([step.lat, step.lng]);
      }
      if (mkRef.current) {
        if (mkRef.current._icon) mkRef.current._icon.style.transition = 'none';
        mkRef.current.setLatLng([step.lat, step.lng]);

        const originalPoint = pointsRef.current[index] || {};
        const p: GpsDataPoint = {
          ...originalPoint,
          lat: step.lat,
          lng: step.lng,
          time: step.time,
          speed: step.speed,
          ignition: step.ignition,
        };
        mkRef.current.setPopupContent(getPopupContent(p));
        mkRef.current.openPopup();
      }
    }
  }, [playbackSteps]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).jumpToKeyframe = jumpToKeyframe;
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).jumpToKeyframe;
      }
    };
  }, [jumpToKeyframe]);

  const handleLineClick = useCallback((e: any) => {
    if (matchedCoordsRef.current.length === 0 || pointsRef.current.length === 0) return;
    const clickLatLng = e.latlng;
    const L = require("leaflet");
    let minDistance = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < matchedCoordsRef.current.length; i++) {
      const coord = matchedCoordsRef.current[i];
      const latlng = L.latLng(coord[0], coord[1]);
      const dist = clickLatLng.distanceTo(latlng);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }

    const closestPoint = pointsRef.current[closestIndex];
    if (closestPoint) {
      const selectedVeh = vehiclesRef.current.find(v => v.gps_device?.imei === selectedImeiRef.current);
      const regNo = selectedVeh ? selectedVeh.registration_no : "Vehicle";
      const popupContent = getTracePopupContent(regNo, closestPoint);

      L.popup()
        .setLatLng(clickLatLng)
        .setContent(popupContent)
        .openOn(mapRef.current);
    }
  }, []);

  // Toggling visibility of playback layers in response to checkbox states
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // 1. Raw Playback (Dashed gray line)
    if (lineRef.current) {
      if (showRawPlayback) {
        if (!map.hasLayer(lineRef.current)) map.addLayer(lineRef.current);
      } else {
        if (map.hasLayer(lineRef.current)) map.removeLayer(lineRef.current);
      }
    }

    // 2. Actual Movement (Solid orange line)
    if (activeLineRef.current) {
      if (showActualMovement) {
        if (!map.hasLayer(activeLineRef.current)) map.addLayer(activeLineRef.current);
      } else {
        if (map.hasLayer(activeLineRef.current)) map.removeLayer(activeLineRef.current);
      }
    }

    // 3. Start/End Points
    if (startMarkerRef.current) {
      if (showStartEndPoint) {
        if (!map.hasLayer(startMarkerRef.current)) map.addLayer(startMarkerRef.current);
      } else {
        if (map.hasLayer(startMarkerRef.current)) map.removeLayer(startMarkerRef.current);
      }
    }
    if (endMarkerRef.current) {
      if (showStartEndPoint) {
        if (!map.hasLayer(endMarkerRef.current)) map.addLayer(endMarkerRef.current);
      } else {
        if (map.hasLayer(endMarkerRef.current)) map.removeLayer(endMarkerRef.current);
      }
    }

    // 4. Stoppages
    stoppageMarkersRef.current.forEach((marker: any) => {
      const isMajor = marker.isMajor;
      const shouldShow = showStoppages && (isMajor ? showMajorStoppages : showMiniStoppages);
      if (shouldShow) {
        if (!map.hasLayer(marker)) map.addLayer(marker);
      } else {
        if (map.hasLayer(marker)) map.removeLayer(marker);
      }
    });

    // 5. Planned Route (Assigned Route Layer)
    if (assignedRouteLayerRef.current) {
      if (showPlannedRoute) {
        if (!map.hasLayer(assignedRouteLayerRef.current)) map.addLayer(assignedRouteLayerRef.current);
      } else {
        if (map.hasLayer(assignedRouteLayerRef.current)) map.removeLayer(assignedRouteLayerRef.current);
      }
    }

    // 6. Checkpoints
    checkpointMarkersRef.current.forEach((marker: any) => {
      const isVisited = marker.isVisited;
      const shouldShow = showPlannedRoute && (isVisited ? showCoveredCheckpoints : showUncoveredCheckpoints);
      if (shouldShow) {
        if (!map.hasLayer(marker)) map.addLayer(marker);
      } else {
        if (map.hasLayer(marker)) map.removeLayer(marker);
      }
    });
  }, [
    showRawPlayback,
    showActualMovement,
    showStartEndPoint,
    showStoppages,
    showPlannedRoute,
    showMajorStoppages,
    showMiniStoppages,
    showCoveredCheckpoints,
    showUncoveredCheckpoints,
    points
  ]);

  // ─── Draw Filtered Routes and Lanes on Playback Map ───
  useEffect(() => {
    const map = mapRef.current;
    const layer = allRoutesLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    if (!showPlannedRoute) return;

    const L = require("leaflet");

    // Helper to snap coordinates to a route segment
    const snapToRoute = (latlng: any, coords: any[]): { snapped: any; index: number } => {
      if (coords.length === 0) return { snapped: latlng, index: -1 };
      if (coords.length === 1) return { snapped: coords[0], index: 0 };

      let minDistance = Infinity;
      let bestPoint = coords[0];
      let bestIndex = 0;

      for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i + 1];

        const x = latlng.lng;
        const y = latlng.lat;
        const x1 = p1.lng;
        const y1 = p1.lat;
        const x2 = p2.lng;
        const y2 = p2.lat;

        const dx = x2 - x1;
        const dy = y2 - y1;

        let t = 0;
        if (dx !== 0 || dy !== 0) {
          t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
          t = Math.max(0, Math.min(1, t));
        }

        const snapped = L.latLng(y1 + t * dy, x1 + t * dx);
        const d = latlng.distanceTo(snapped);

        if (d < minDistance) {
          minDistance = d;
          bestPoint = snapped;
          bestIndex = i;
        }
      }

      return { snapped: bestPoint, index: bestIndex };
    };



    const selectedVeh = selectedImei ? vehicles.find(v => v.gps_device?.imei === selectedImei) : null;
    let filtered: any[] = [];

    if (selectedImei) {
      // If a vehicle is selected, show ONLY its dedicated route
      if (selectedRouteId && selectedRouteId !== "all") {
        filtered = routesList.filter(route => String(route.id) === selectedRouteId);
      } else if (selectedVeh && (selectedVeh as any).ward_id) {
        filtered = routesList.filter(route => route.ward_id === (selectedVeh as any).ward_id);
      }
    } else if (selectedWardId) {
      // If a ward is selected, show all routes in that ward (or filter by specific route if chosen)
      filtered = routesList.filter(route => route.ward_id === parseInt(selectedWardId));
      if (selectedRouteId && selectedRouteId !== "all") {
        filtered = filtered.filter(route => String(route.id) === selectedRouteId);
      }
    } else {
      // No ward or vehicle selected -> do not draw any routes
      filtered = [];
    }

    // Shift Filter (only apply when not filtered to a single vehicle)
    if (selectedShift && selectedShift !== "all" && !selectedImei) {
      filtered = filtered.filter(route => {
        return route.shift_name === selectedShift ||
          (route.shift_name && route.shift_name.toLowerCase().includes(selectedShift.toLowerCase().split(" ")[0]));
      });
    }

    // Determine if we are rendering a single route with detailed lane/pin elements
    const isSingleRouteSelected = (selectedRouteId && selectedRouteId !== "all") || (selectedImei !== "");

    filtered.forEach((route) => {
      if (!route.geojson) return;
      try {
        let feature = route.geojson;
        if (typeof feature === "string") {
          feature = JSON.parse(feature);
        }

        const routeColor = route.color || "#fba339";

        // When a vehicle is selected for playback, the route line is rendered by assignedRouteLayerRef
        // inside loadRoute() at a lighter ghost opacity. Skip drawing it here to prevent a thick
        // colored overlay competing with the vehicle's actual path trace.
        if (!selectedImei) {
          const routeGeo = L.geoJSON(feature, {
            style: {
              color: routeColor,
              weight: isSingleRouteSelected ? 6 : 4,
              opacity: isSingleRouteSelected ? 0.95 : 0.65,
            }
          }).addTo(layer);

          routeGeo.bindPopup(`
            <div style="font-family:Inter,sans-serif;font-size:12px;padding:4px;color:#1e293b;">
              <b style="font-size:14px;color:${routeColor};">${route.route_name}</b><br/>
              <span style="color:#64748b;font-weight:bold;">ID: ${route.identification}</span><br/>
              <span style="color:#64748b;">Distance: ${route.distance} km</span><br/>
              ${route.shift_name ? `<span style="color:#4f46e5;">Shift: ${route.shift_name}</span>` : ''}
            </div>
          `);
        }


      } catch (err) {
        console.error("Failed to render route on Playback Map:", err);
      }
    });

    // Auto-fit bounds if a specific route is selected
    if (isSingleRouteSelected && filtered.length > 0 && filtered[0].geojson) {
      try {
        let feature = filtered[0].geojson;
        if (typeof feature === "string") {
          feature = JSON.parse(feature);
        }
        const tempLayer = L.geoJSON(feature);
        const bounds = tempLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50] });
        }
      } catch {
        // ignore
      }
    }
  }, [routesList, selectedZoneId, selectedWardId, selectedShift, selectedRouteId, regionsList, showPlannedRoute, selectedImei, vehicles]);

  const filteredRoutesDropdownList = (() => {
    if (!selectedWardId) {
      return [];
    }
    let filtered = routesList.filter(route => route.ward_id === parseInt(selectedWardId));

    // Shift Filter
    if (selectedShift && selectedShift !== "all") {
      filtered = filtered.filter(route => {
        return route.shift_name === selectedShift ||
          (route.shift_name && route.shift_name.toLowerCase().includes(selectedShift.toLowerCase().split(" ")[0]));
      });
    }

    return filtered;
  })();

  // Load Initial Metadata
  useEffect(() => {
    api<{ data: Vehicle[] }>("/api/vehicles").then((r) => setVehicles(r.data || [])).catch(() => { });
    api<{ data: any[] }>("/api/zones").then((res) => setZones(res.data || [])).catch(() => { });
    api<{ success: boolean; data: any[] }>("/api/regions").then((res) => {
      if (res.success) setRegionsList(res.data || []);
    }).catch(() => { });
    api<{ success: boolean; data: any[] }>("/api/routes").then((res) => {
      if (res.success) setRoutesList(res.data || []);
    }).catch(() => { });
    api<{ success: boolean; data: any[] }>("/api/shifts?group=VEHICLE_MOVEMENT").then((res) => {
      if (res.success) setShiftsList(res.data || []);
    }).catch(() => { });

    api<{ data: any[] }>("/api/parking-spots").then((res) => setParkingSpots(res.data || [])).catch(() => { });
    api<{ data: any[] }>("/api/transfer-stations").then((res) => setTransferStations(res.data || [])).catch(() => { });
    api<{ data: any[] }>("/api/fuel-stations").then((res) => setFuelStations(res.data || [])).catch(() => { });
    api<{ data: any[] }>("/api/workshops").then((res) => setWorkshops(res.data || [])).catch(() => { });

    if (typeof window !== "undefined") {
      try {
        const cachedRoutes = localStorage.getItem("d2d_routes");
        const cachedShifts = localStorage.getItem("d2d_shifts");
        if (cachedRoutes) setRoutesList(JSON.parse(cachedRoutes));
        if (cachedShifts) setShiftsList(JSON.parse(cachedShifts));

        const cachedParking = localStorage.getItem("d2d_parking_spots");
        const cachedTransfer = localStorage.getItem("d2d_transfer_stations");
        const cachedFuel = localStorage.getItem("d2d_fuel_stations");
        const cachedWorkshops = localStorage.getItem("d2d_workshops");
        if (cachedParking) setParkingSpots(JSON.parse(cachedParking));
        if (cachedTransfer) setTransferStations(JSON.parse(cachedTransfer));
        if (cachedFuel) setFuelStations(JSON.parse(cachedFuel));
        if (cachedWorkshops) setWorkshops(JSON.parse(cachedWorkshops));
      } catch (e) {
        console.warn("Failed to load cached routes/shifts/POIs:", e);
      }
    }

    // Parse URL parameters if present
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlImei = params.get("imei");
      const urlDate = params.get("date");
      const urlRouteId = params.get("route_id");
      if (urlImei) setSelectedImei(urlImei);
      if (urlDate) setDate(urlDate);
      if (urlRouteId) setRouteIdParam(urlRouteId);
    }
  }, []);

  // Fetch driver details for selected vehicle
  const fetchDriverDetails = useCallback(async (vehicleId: number, selectedDate: string) => {
    try {
      // Fetch driver assignment
      const driverRes = await api<any>(`/api/employee-vehicle-assignments?vehicle_id=${vehicleId}`);
      if (driverRes.success && driverRes.data && driverRes.data.length > 0) {
        const activeAssignment = driverRes.data.find((a: any) => a.is_active !== false);
        if (activeAssignment) {
          setDriverDetails({
            driverName: activeAssignment.employee_name || 
              [activeAssignment.employee?.first_name, activeAssignment.employee?.last_name].filter(Boolean).join(" ") || 
              "N/A",
            helperName: activeAssignment.helper_name || "N/A",
            employeeId: activeAssignment.employee_id
          });
        } else {
          setDriverDetails(null);
        }
      } else {
        setDriverDetails(null);
      }

      // Fetch transfer station trips from GTS trip report
      const tripRes = await api<any>(`/api/reports?vehicle_id=${vehicleId}&from=${selectedDate}&to=${selectedDate}&limit=1`);
      if (tripRes.success && tripRes.data && tripRes.data.length > 0) {
        const report = tripRes.data[0];
        setTransferStationTrips(report.transfer_station_trips || 0);
      } else {
        setTransferStationTrips(0);
      }
    } catch (error) {
      // Handle 404 and other errors gracefully - just set to null/0
      setDriverDetails(null);
      setTransferStationTrips(0);
    }
  }, []);

  // Fetch driver details when vehicle or date changes
  useEffect(() => {
    if (selectedImei && date) {
      const vehicle = vehicles.find(v => v.gps_device?.imei === selectedImei);
      if (vehicle) {
        fetchDriverDetails(vehicle.id, date);
      }
    } else {
      setDriverDetails(null);
      setTransferStationTrips(0);
    }
  }, [selectedImei, date, vehicles, fetchDriverDetails]);

  // Synchronize route and filters when vehicle, shift, or list changes
  useEffect(() => {
    if (selectedImei && vehicles.length > 0 && routesList.length > 0) {
      resolveRouteAndSyncFilters(selectedImei, selectedShift);
    }
  }, [selectedImei, selectedShift, vehicles, routesList, resolveRouteAndSyncFilters]);

  // Set selected route, ward, and zone when routeIdParam URL argument is present
  useEffect(() => {
    if (routeIdParam && routesList.length > 0) {
      const route = routesList.find(r => String(r.id) === routeIdParam);
      if (route) {
        setSelectedRouteId(routeIdParam);
        if (route.ward_id) {
          setSelectedWardId(String(route.ward_id));
          const wardRegion = regionsList.find(reg => reg.id === route.ward_id);
          if (wardRegion && wardRegion.parent_id) {
            setSelectedZoneId(String(wardRegion.parent_id));
          }
        }
        if (route.shift_name) {
          setSelectedShift(route.shift_name);
        }
      }
    }
  }, [routeIdParam, routesList, regionsList]);

  const redrawCheckpoints = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const L = require("leaflet");

    const points = checkpointsWithStatusRef.current || [];
    if (points.length === 0 || !showPlannedRoute) {
      if (checkpointMarkersRef.current) {
        checkpointMarkersRef.current.forEach((marker: any) => {
          if (marker.isPopupOpen && marker.isPopupOpen()) return;
          map.removeLayer(marker);
        });
      }
      checkpointMarkersMapRef.current = {};
      checkpointMarkersRef.current = [];
      return;
    }

    const zoom = map.getZoom();
    const bounds = map.getBounds();

    if (zoom < 14) {
      // Clear checkpoints at zoom < 14 to avoid UI clutter and GPU/CPU compositing lag
      if (checkpointMarkersRef.current) {
        checkpointMarkersRef.current.forEach((marker: any) => {
          if (marker.isPopupOpen && marker.isPopupOpen()) return;
          map.removeLayer(marker);
        });
      }
      checkpointMarkersMapRef.current = {};
      checkpointMarkersRef.current = [];
      return;
    }

    const desiredType = zoom >= 18 ? 'marker' : 'circleMarker';

    const newMarkersMap: Record<number, any> = {};
    const newMarkersList: any[] = [];

    points.forEach((cp) => {
      const visited = cp.visited;
      const reason = cp.reason;
      const color = visited ? '#10b981' : '#ef4444';

      const shouldShow = visited ? showCoveredCheckpoints : showUncoveredCheckpoints;
      if (!shouldShow) return;

      const latlng = L.latLng(cp.latitude, cp.longitude);
      const inBounds = bounds.contains(latlng);

      const existing = checkpointMarkersMapRef.current[cp.id];
      const hasOpenPopup = existing && existing.isPopupOpen && existing.isPopupOpen();
      const shouldBeOnMap = inBounds || hasOpenPopup;

      if (existing && existing.checkpointType === desiredType) {
        if (shouldBeOnMap) {
          if (!map.hasLayer(existing)) {
            existing.addTo(map);
          }
        } else {
          if (map.hasLayer(existing)) {
            map.removeLayer(existing);
          }
        }
        newMarkersMap[cp.id] = existing;
        newMarkersList.push(existing);
        return;
      }

      if (existing) {
        if (hasOpenPopup) {
          newMarkersMap[cp.id] = existing;
          newMarkersList.push(existing);
          return;
        }
        map.removeLayer(existing);
      }

      let marker: any;
      if (desiredType === 'marker') {
        const cpIcon = L.divIcon({
          html: `
            <div style="
              width: 14px;
              height: 14px;
              background: #ffffff;
              border: 2px solid ${color};
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            ">
              <span style="
                color: ${color};
                font-family: 'Inter', sans-serif;
                font-size: 7.5px;
                font-weight: 900;
                line-height: 1;
              ">
                ${cp.sequence_order}
              </span>
            </div>
          `,
          className: "",
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        marker = L.marker(latlng, { icon: cpIcon });
        marker.bindPopup(`
          <div style="color: #0f172a; font-family: sans-serif; font-size: 13px; line-height: 1.4; padding: 2px; min-width: 150px;">
            <div style="font-weight: 700; border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; margin-bottom: 8px; color: ${color}; font-size: 14px;">
              📍 Point #${cp.sequence_order}
            </div>
            <div style="margin-bottom: 4px; display: flex; justify-content: space-between; gap: 12px;">
              <span style="color: #64748b;">Status:</span>
              <span style="font-weight: 700; color: ${color};">${visited ? '✅ Visited' : '❌ Not Visited'}</span>
            </div>
            ${!visited && reason ? `
            <div style="margin-bottom: 4.5px; display: flex; flex-direction: column; gap: 2px; background: #fef2f2; border: 1px solid #fee2e2; border-radius: 6px; padding: 6px 8px; margin-top: 4px;">
              <span style="color: #dc2626; font-size: 10px; font-weight: 800; text-transform: uppercase;">⚠️ Miss Reason:</span>
              <span style="font-weight: 700; color: #991b1b; font-size: 11px;">${reason}</span>
            </div>
            ` : ''}
          </div>
        `, { autoPan: false });
      } else {
        let radius = 1.0;
        if (zoom >= 17) {
          radius = 2.5;
        } else if (zoom >= 16) {
          radius = 2.0;
        } else if (zoom >= 15) {
          radius = 1.5;
        }

        marker = L.circleMarker(latlng, {
          radius: radius,
          fillColor: color,
          color: '#ffffff',
          weight: zoom >= 16 ? 0.8 : 0.5,
          opacity: 0.8,
          fillOpacity: 0.85
        });
        marker.bindPopup(`
          <div style="color: #0f172a; font-family: sans-serif; font-size: 12px; padding: 2px;">
            <strong>Point #${cp.sequence_order}</strong><br/>
            Status: <span style="font-weight:750; color:${color};">${visited ? 'Visited' : 'Not Visited'}</span>
            ${!visited && reason ? `<br/><span style="color:#b91c1c;">Reason: ${reason}</span>` : ''}
          </div>
        `, { autoPan: false });
      }

      marker.checkpointType = desiredType;
      marker.checkpointId = cp.id;
      marker.isVisited = visited;
      marker.sequenceOrder = cp.sequence_order;

      if (shouldBeOnMap) {
        marker.addTo(map);
      }
      newMarkersMap[cp.id] = marker;
      newMarkersList.push(marker);
    });

    Object.keys(checkpointMarkersMapRef.current).forEach((idStr) => {
      const id = parseInt(idStr);
      const marker = checkpointMarkersMapRef.current[id];
      if (marker && !newMarkersMap[id]) {
        if (marker.isPopupOpen && marker.isPopupOpen()) {
          newMarkersMap[id] = marker;
          newMarkersList.push(marker);
          return;
        }
        map.removeLayer(marker);
      }
    });

    checkpointMarkersRef.current = newMarkersList;
    checkpointMarkersMapRef.current = newMarkersMap;
  }, [showPlannedRoute, showCoveredCheckpoints, showUncoveredCheckpoints]);


  const redrawCheckpointsRef = useRef(redrawCheckpoints);
  useEffect(() => {
    redrawCheckpointsRef.current = redrawCheckpoints;
  }, [redrawCheckpoints]);

  useEffect(() => {
    redrawCheckpoints();
  }, [redrawCheckpoints]);

  // Init Leaflet map
  useEffect(() => {
    if (typeof window === "undefined" || !box.current || mapRef.current) return;
    const L = require("leaflet");

    mapRef.current = L.map(box.current, { zoomControl: false, preferCanvas: true }).setView([26.9124, 75.7873], 13);
    L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);

    const googleMapLayer = L.tileLayer("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      attribution: "© Google Maps", maxZoom: 20, noWrap: true
    });

    const googleHybridLayer = L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
      attribution: "© Google Maps Satellite", maxZoom: 20, noWrap: true
    });

    const darkLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© CARTO", maxZoom: 19, noWrap: true
    });

    googleMapLayer.addTo(mapRef.current);
    boundaryLayerRef.current = L.layerGroup().addTo(mapRef.current);
    allRoutesLayerRef.current = L.layerGroup().addTo(mapRef.current);

    parkingSpotsLayerRef.current = L.layerGroup().addTo(mapRef.current);
    transferStationsLayerRef.current = L.layerGroup().addTo(mapRef.current);
    fuelStationsLayerRef.current = L.layerGroup().addTo(mapRef.current);
    workshopsLayerRef.current = L.layerGroup().addTo(mapRef.current);
    openDepotsLayerRef.current = L.layerGroup().addTo(mapRef.current);

    L.control.layers({
      "Google Maps (Default)": googleMapLayer,
      "Google Satellite": googleHybridLayer,
      "Dark Map": darkLayer
    }, {}, { position: 'bottomleft' }).addTo(mapRef.current);

    const handleMapChange = () => {
      if (redrawCheckpointsRef.current) {
        redrawCheckpointsRef.current();
      }
    };

    mapRef.current.on("zoomend", handleMapChange);
    mapRef.current.on("moveend", handleMapChange);

    return () => {
      if (mapRef.current) {
        mapRef.current.off("zoomend", handleMapChange);
        mapRef.current.off("moveend", handleMapChange);
        mapRef.current.remove();
        mapRef.current = null;
        allRoutesLayerRef.current = null;
        boundaryLayerRef.current = null;
        parkingSpotsLayerRef.current = null;
        transferStationsLayerRef.current = null;
        fuelStationsLayerRef.current = null;
        workshopsLayerRef.current = null;
        openDepotsLayerRef.current = null;
      }
    };
  }, []);

  // ─── Render Geofence Boundary overlays on map ───
  useEffect(() => {
    const layer = boundaryLayerRef.current;
    if (!layer || !mapRef.current || regionsList.length === 0) return;

    layer.clearLayers();
    const L = require("leaflet");

    if (!showRegionBoundary) return;

    if (selectedWardId) {
      // 1. Draw specifically selected Ward
      const wardRegion = regionsList.find(r => r.region_type_id === 3 && r.id === parseInt(selectedWardId));
      if (wardRegion && wardRegion.geojson) {
        try {
          const wardColor = wardRegion.color || "#fba339";
          const wardGeoJSON = L.geoJSON(wardRegion.geojson, {
            style: {
              color: wardColor,
              weight: 3.5,
              fillColor: wardColor,
              fillOpacity: 0.15,
            },
            interactive: false
          }).addTo(layer);

          const bounds = wardGeoJSON.getBounds();
          if (bounds.isValid()) {
            mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
          }
        } catch (e) {
          console.error("Failed to render ward geofence on playback page", e);
        }
      }
    } else if (selectedZoneId) {
      // 2. Draw selected Zone
      const zoneRegion = regionsList.find(r => r.region_type_id === 2 && r.id === parseInt(selectedZoneId));
      if (zoneRegion && zoneRegion.geojson) {
        try {
          const zoneColor = zoneRegion.color || "#8b5cf6";
          const zoneGeoJSON = L.geoJSON(zoneRegion.geojson, {
            style: {
              color: zoneColor,
              weight: 4,
              fillColor: zoneColor,
              fillOpacity: 0.1,
            },
            interactive: false
          }).addTo(layer);

          const bounds = zoneGeoJSON.getBounds();
          if (bounds.isValid()) {
            mapRef.current.fitBounds(bounds, { padding: [40, 40] });
          }
        } catch (e) {
          console.error("Failed to render zone geofence on playback page", e);
        }
      }
    }
  }, [selectedZoneId, selectedWardId, regionsList]);

  // ─── Render POIs (Parking, Transfer Stations, Fuel, Workshops) ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (parkingSpotsLayerRef.current) parkingSpotsLayerRef.current.clearLayers();
    if (transferStationsLayerRef.current) transferStationsLayerRef.current.clearLayers();
    if (fuelStationsLayerRef.current) fuelStationsLayerRef.current.clearLayers();
    if (workshopsLayerRef.current) workshopsLayerRef.current.clearLayers();

    const L = require("leaflet");
    const renderFacility = (item: any, typeName: string, iconSymbol: string, defaultColor: string, layer: any) => {
      if (!item.geojson) return;
      try {
        let feature = item.geojson;
        if (typeof feature === "string") {
          feature = JSON.parse(feature);
        }
        const center = turf.centroid(feature);
        if (!center || !center.geometry || !center.geometry.coordinates) return;
        const coords = center.geometry.coordinates;
        const latLng = [coords[1], coords[0]] as [number, number];

        const color = item.color || defaultColor;

        // Draw Polygon Fencing Border
        L.geoJSON(feature, {
          style: {
            color: color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.15,
            dashArray: "3, 3"
          }
        }).addTo(layer);

        const iconHtml = `<div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${iconSymbol}</div>`;

        const icon = L.divIcon({
          html: iconHtml,
          className: "facility-marker",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const m = L.marker(latLng, { icon }).addTo(layer);
        m.bindPopup(`
          <div style="font-family:Inter,sans-serif;font-size:12px;padding:4px;color:#1e293b;text-align:center;">
            <b style="font-size:14px;color:${color};">${item.name}</b><br/>
            <span style="color:#64748b;font-weight:bold;">${typeName}</span><br/>
            ${item.address ? `<span style="color:#64748b;">${item.address}</span>` : ''}
          </div>
        `);
      } catch (err) {
        console.error("Failed to render facility on Playback Page:", err);
      }
    };

    if (showParking && parkingSpotsLayerRef.current) {
      parkingSpots.forEach(p => renderFacility(p, "Parking Spot", "P", "#10b981", parkingSpotsLayerRef.current));
    }
    if (showTransfer && transferStationsLayerRef.current) {
      transferStations.forEach(t => renderFacility(t, "Transfer Station", "T", "#3b82f6", transferStationsLayerRef.current));
    }
    if (showFuel && fuelStationsLayerRef.current) {
      fuelStations.forEach(f => renderFacility(f, "Fuel Station", "F", "#eab308", fuelStationsLayerRef.current));
    }
    if (showWorkshop && workshopsLayerRef.current) {
      workshops.forEach(w => renderFacility(w, "Workshop", "W", "#8b5cf6", workshopsLayerRef.current));
    }
  }, [parkingSpots, transferStations, fuelStations, workshops, showParking, showTransfer, showFuel, showWorkshop]);

  // ─── Render Open Depots ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !openDepotsLayerRef.current) return;

    openDepotsLayerRef.current.clearLayers();
    if (showOpenDepots) {
      const L = require("leaflet");
      populateOpenDepotLayer(L, openDepotsLayerRef.current);
    }
  }, [showOpenDepots]);

  // Toggle visibility of raw GPS trace
  useEffect(() => {
    const map = mapRef.current;
    const line = rawTraceLineRef.current;
    if (!map || !line) return;
    if (showRawGpsTrace) {
      line.addTo(map);
    } else {
      map.removeLayer(line);
    }
  }, [showRawGpsTrace]);

  // Reusable helper to clear all playback state and layers from Leaflet map
  const clearPlaybackLayers = useCallback(() => {
    setPoints([]);
    setPlaybackSteps([]);
    assignedRouteColorRef.current = "#f97316";
    setIdx(0);
    setPlaying(false);
    setStoppages([]);
    setCheckpoints([]);
    setTotalGpsPoints(0);
    setSnappedPointsCount(0);
    setRawPointsCount(0);
    setActiveCorridor("N/A");
    setAiConfidence(null);
    lastLoadedRouteIdRef.current = null;
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }

    const map = mapRef.current;
    if (!map) return;

    // Clear all line layers
    if (lineRef.current) {
      map.removeLayer(lineRef.current);
      lineRef.current = null;
    }
    if (mkRef.current) {
      map.removeLayer(mkRef.current);
      mkRef.current = null;
    }
    if (activeLineRef.current) {
      map.removeLayer(activeLineRef.current);
      activeLineRef.current = null;
    }
    if (startMarkerRef.current) {
      map.removeLayer(startMarkerRef.current);
      startMarkerRef.current = null;
    }
    if (endMarkerRef.current) {
      map.removeLayer(endMarkerRef.current);
      endMarkerRef.current = null;
    }
    if (rawTraceLineRef.current) {
      map.removeLayer(rawTraceLineRef.current);
      rawTraceLineRef.current = null;
    }

    // Clear all markers
    if (stoppageMarkersRef.current) {
      stoppageMarkersRef.current.forEach((marker: any) => map.removeLayer(marker));
      stoppageMarkersRef.current = [];
    }
    if (checkpointMarkersRef.current) {
      checkpointMarkersRef.current.forEach((marker: any) => map.removeLayer(marker));
      checkpointMarkersRef.current = [];
    }
    checkpointMarkersMapRef.current = {};

    // Clear all route layers
    if (assignedRouteLayerRef.current) {
      map.removeLayer(assignedRouteLayerRef.current);
      assignedRouteLayerRef.current = null;
    }
    if (allRoutesLayerRef.current) {
      allRoutesLayerRef.current.clearLayers();
    }

    // Clear boundary layer
    if (boundaryLayerRef.current) {
      boundaryLayerRef.current.clearLayers();
    }

    // Clear POI layers
    if (parkingSpotsLayerRef.current) {
      map.removeLayer(parkingSpotsLayerRef.current);
      parkingSpotsLayerRef.current = null;
    }
    if (transferStationsLayerRef.current) {
      map.removeLayer(transferStationsLayerRef.current);
      transferStationsLayerRef.current = null;
    }
    if (fuelStationsLayerRef.current) {
      map.removeLayer(fuelStationsLayerRef.current);
      fuelStationsLayerRef.current = null;
    }
    if (workshopsLayerRef.current) {
      map.removeLayer(workshopsLayerRef.current);
      workshopsLayerRef.current = null;
    }
    if (openDepotsLayerRef.current) {
      openDepotsLayerRef.current.clearLayers();
    }

    // Clear refs
    matchedCoordsRef.current = [];
    matchedRoadIndicesRef.current = [];
    roadCoordsRef.current = [];
    checkpointRoadIndicesRef.current = [];
    checkpointsRef.current = [];
    checkpointsWithStatusRef.current = [];

    // Reset map view to default
    map.setView([26.9124, 75.7873], 12);
  }, []);

  // Load Route Playback Trace
  const loadRoute = useCallback(async (autoplay = false) => {
    if (!selectedImei || !date) return;
    const from = `${date}T00:00:00.000Z`;
    const to = `${date}T23:59:59.999Z`;

    clearPlaybackLayers();

    try {
      const r = await api<{ data: GpsDataPoint[] }>(`/api/gps-data/${selectedImei}?from=${from}&to=${to}`);
      const data = r.data || [];
      const validPointsRaw = data.filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number' && p.lat !== 0);

      // Determine shift times
      let shiftStart: Date | null = null;
      let shiftEnd: Date | null = null;
      if (selectedShift && selectedShift !== "all" && shiftsList.length > 0) {
        const shiftObj = shiftsList.find(s => s.shift_name === selectedShift);
        if (shiftObj) {
          const [sh, sm, ss] = (shiftObj.start_time || "00:00:00").split(":").map(Number);
          const [eh, em, es] = (shiftObj.end_time || "23:59:59").split(":").map(Number);
          const [year, month, day] = date.split("-").map(Number);
          shiftStart = new Date(year, month - 1, day, sh || 0, sm || 0, ss || 0);
          shiftEnd = new Date(year, month - 1, day, eh || 0, em || 0, es || 0);
          if (shiftEnd.getTime() <= shiftStart.getTime()) {
            shiftEnd.setDate(shiftEnd.getDate() + 1);
          }
        }
      }

      // Filter raw points by shift if shift is selected
      let filteredPointsRaw = validPointsRaw;
      if (shiftStart && shiftEnd) {
        filteredPointsRaw = validPointsRaw.filter(p => {
          const t = new Date(p.time).getTime();
          return t >= shiftStart!.getTime() && t <= shiftEnd!.getTime();
        });
      }

      const validPoints = smoothGpsTrace(filteredPointsRaw);
      setPoints(validPoints);
      setIdx(0);
      setPlaying(autoplay);

      const L = require("leaflet");
      const map = mapRef.current;
      if (!map) return;
      if (lineRef.current) map.removeLayer(lineRef.current);
      if (mkRef.current) map.removeLayer(mkRef.current);

      if (activeLineRef.current) {
        map.removeLayer(activeLineRef.current);
        activeLineRef.current = null;
      }
      if (startMarkerRef.current) {
        map.removeLayer(startMarkerRef.current);
        startMarkerRef.current = null;
      }
      if (endMarkerRef.current) {
        map.removeLayer(endMarkerRef.current);
        endMarkerRef.current = null;
      }
      matchedCoordsRef.current = [];
      matchedRoadIndicesRef.current = [];
      if (rawTraceLineRef.current) {
        map.removeLayer(rawTraceLineRef.current);
        rawTraceLineRef.current = null;
      }

      if (stoppageMarkersRef.current) {
        stoppageMarkersRef.current.forEach((marker: any) => map.removeLayer(marker));
        stoppageMarkersRef.current = [];
      }
      if (checkpointMarkersRef.current) {
        checkpointMarkersRef.current.forEach((marker: any) => map.removeLayer(marker));
        checkpointMarkersRef.current = [];
      }
      checkpointMarkersMapRef.current = {};
      if (assignedRouteLayerRef.current) {
        map.removeLayer(assignedRouteLayerRef.current);
        assignedRouteLayerRef.current = null;
      }
      setStoppages([]);
      setCheckpoints([]);

      if (validPoints.length === 0) return;

      const baseCoords = validPoints.map((p) => [p.lat, p.lng] as [number, number]);

      // Fetch vehicle movement report from API or fallback
      let reportData: any = null;
      const targetVehicle = vehicles.find(v => v.gps_device?.imei === selectedImei);
      if (targetVehicle) {
        try {
          const shiftObj = selectedShift && selectedShift !== "all" && shiftsList.length > 0
            ? shiftsList.find(s => s.shift_name === selectedShift)
            : null;
          const shiftQuery = shiftObj ? `&shift_id=${shiftObj.id}` : "";
          const repRes = await api<any>(`/api/reports?vehicle_id=${targetVehicle.id}&from=${date}&to=${date}${shiftQuery}&limit=1`);
          if (repRes && repRes.success && repRes.data && repRes.data.length > 0) {
            reportData = repRes.data[0];
          }
        } catch (err) {
          console.warn("[Playback] Failed to fetch report data for marker popups:", err);
        }
      }

      // Calculate fallback values in case the API report is missing
      const totalSecs = validPoints.length >= 2 
        ? Math.round((new Date(validPoints[validPoints.length - 1].time).getTime() - new Date(validPoints[0].time).getTime()) / 1000)
        : 0;
      const formatSecs = (s: number) => {
        const hrs = Math.floor(s / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const secs = s % 60;
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      };

      const calculatedDist = (() => {
        let d = 0;
        for (let i = 1; i < validPoints.length; i++) {
          d += haversineDistance(validPoints[i-1].lat, validPoints[i-1].lng, validPoints[i].lat, validPoints[i].lng);
        }
        return d;
      })();

      const calculatedAvgSpeed = totalSecs > 0 ? (calculatedDist / (totalSecs / 3600)) : 0;

      const finalReport = reportData || {
        registration_no: targetVehicle?.registration_no || "N/A",
        start_time: validPoints.length > 0 ? validPoints[0].time : null,
        end_time: validPoints.length > 0 ? validPoints[validPoints.length - 1].time : null,
        total_distance: calculatedDist,
        average_speed: calculatedAvgSpeed,
        total_active_duration: formatSecs(totalSecs),
        total_stoppage_duration: "00:00:00",
        total_idle_duration: "00:00:00",
        in_parking_duration: "00:00:00"
      };

      // Detect starting parking lot dynamically
      let startingParkingLot = "N/A";
      const startingPos = baseCoords[0];
      if (startingPos && parkingSpots && parkingSpots.length > 0) {
        const pt = turf.point([startingPos[1], startingPos[0]]); // [lng, lat]
        let insideSpot = null;
        for (const spot of parkingSpots) {
          if (spot.geojson) {
            try {
              let geojson = spot.geojson;
              if (typeof geojson === "string") {
                geojson = JSON.parse(geojson);
              }
              let geometry = geojson;
              if (geojson.type === "Feature") {
                geometry = geojson.geometry;
              } else if (geojson.type === "FeatureCollection") {
                geometry = geojson.features[0]?.geometry;
              }
              if (geometry && (geometry.type === "Polygon" || geometry.type === "MultiPolygon")) {
                if (turf.booleanPointInPolygon(pt, geometry)) {
                  insideSpot = spot;
                  break;
                }
              }
            } catch (e) {
              // ignore
            }
          }
        }
        if (insideSpot) {
          startingParkingLot = insideSpot.name;
        } else {
          // Fallback: closest parking spot within 150m
          let closestSpot = null;
          let minDistance = Infinity;
          for (const spot of parkingSpots) {
            if (spot.geojson) {
              try {
                let geojson = spot.geojson;
                if (typeof geojson === "string") {
                  geojson = JSON.parse(geojson);
                }
                const center = turf.centroid(geojson);
                if (center && center.geometry && center.geometry.coordinates) {
                  const coords = center.geometry.coordinates;
                  const dist = haversineDistance(startingPos[0], startingPos[1], coords[1], coords[0]) * 1000;
                  if (dist < minDistance) {
                    minDistance = dist;
                    closestSpot = spot;
                  }
                }
              } catch (e) {
                // ignore
              }
            }
          }
          if (closestSpot && minDistance < 150) {
            startingParkingLot = closestSpot.name;
          }
        }
      }

      // Fetch the assigned route for this vehicle today to snap against
      let routeCheckpoints: any[] = [];
      let assignedRouteData: any = null;
      let visitedCheckpointsList: any[] = [];
      const targetRouteId = selectedRouteId || routeIdParam;
      if (targetRouteId) {
        try {
          // Fetch route geometry directly — no dependency on coverage endpoint succeeding
          const rRes = await api<any>(`/api/routes/${targetRouteId}/playback-geometry`);
          if (rRes.success && rRes.data) {
            assignedRouteData = rRes.data;
            if (rRes.data.lane_points && rRes.data.lane_points.length > 0) {
              routeCheckpoints = rRes.data.lane_points.map((lp: any) => ({
                id: lp.id,
                route_id: lp.route_id,
                checkpoint_name: `Point #${lp.sequence_number}`,
                latitude: lp.latitude,
                longitude: lp.longitude,
                radius_meters: 10.0,
                sequence_order: lp.sequence_number,
              }));
            }
          } else {
            console.warn("[Playback] /playback-geometry returned non-success — falling back to raw GPS");
            toast.warn("Route geometry unavailable — using standard map snapping.");
          }
        } catch (geoErr) {
          console.warn("[Playback] Failed to fetch /playback-geometry:", geoErr);
          toast.warn("Could not load route geometry — using standard map snapping.");
        }

        // Also fetch coverage details (for checkpoint visited state display)
        try {
          const vehicle = vehicles.find(v => v.gps_device?.imei === selectedImei);
          if (vehicle) {
            const cov = await api<any>(`/api/vehicles/${vehicle.id}/lane-point-coverage?date=${date}&route_id=${targetRouteId}&use_reconstructed=${aiRouteCorrectionActive}`);
            if (cov.success && cov.details) {
              visitedCheckpointsList = cov.details.map((d: any) => ({
                checkpoint_id: d.lane_point_id,
                visited: d.status === "achieved",
                reason: d.status === "missed" ? "Missed" : (d.status === "pending" ? "Pending" : ""),
              }));
            }
          }
        } catch (err) {
          console.warn("[Playback] Failed to load coverage details", err);
        }
      }

      let matchedCoords: [number, number][] = [];
      let defaultAggressive = false;
      let matchedRoadIndices: number[] = [];
      let averageConfidence: number | null = null;
      let loadedViaAI = false;
      const vehicle = vehicles.find(v => v.gps_device?.imei === selectedImei);
      let useAI = aiRouteCorrectionActive;
      let reconstructedPoints: any[] = [];
      if (targetRouteId && targetRouteId !== lastLoadedRouteIdRef.current) {
        lastLoadedRouteIdRef.current = targetRouteId;
        if (assignedRouteData) {
          const defaultAi = false; // Always default to false as requested
          setAiRouteCorrectionActive(defaultAi);
          useAI = defaultAi;

          const defaultAgg = false; // Always default to false as requested
          setAggressiveSnapping(defaultAgg);
          defaultAggressive = defaultAgg;
        } else {
          setAiRouteCorrectionActive(false);
          useAI = false;
          setAggressiveSnapping(false);
          defaultAggressive = false;
        }
      }

      if (useAI && vehicle && targetRouteId) {
        try {
          const reconRes = await post<any>(`/api/vehicles/${vehicle.id}/reconstruct-route?date=${date}&route_id=${targetRouteId}`, {});
          if (reconRes.success && reconRes.data) {
            const reconData = reconRes.data;
            averageConfidence = reconData.average_confidence;
            reconstructedPoints = reconData.reconstructed_path || [];

            const rawRoadCoords =
              assignedRouteData && assignedRouteData.geojson
                ? parseRouteGeoJSON(assignedRouteData.geojson)
                : (assignedRouteData && assignedRouteData.lane_points && assignedRouteData.lane_points.length > 0
                    ? assignedRouteData.lane_points.map((lp: any) => [lp.latitude, lp.longitude] as [number, number])
                    : []);

            let roadCoords: [number, number][] = [];
            if (rawRoadCoords.length >= 2) {
              roadCoords.push(rawRoadCoords[0]);
              for (let i = 0; i < rawRoadCoords.length - 1; i++) {
                const p1 = rawRoadCoords[i];
                const p2 = rawRoadCoords[i + 1];
                const dist = haversineDistance(p1[0], p1[1], p2[0], p2[1]) * 1000;
                if (dist > 10.0) {
                  const stepsCount = Math.ceil(dist / 10.0);
                  for (let s = 1; s < stepsCount; s++) {
                    const fraction = s / stepsCount;
                    const lat = p1[0] + (p2[0] - p1[0]) * fraction;
                    const lng = p1[1] + (p2[1] - p1[1]) * fraction;
                    roadCoords.push([lat, lng]);
                  }
                }
                roadCoords.push(p2);
              }
            } else {
              roadCoords = rawRoadCoords;
            }
            roadCoordsRef.current = roadCoords;

            // Map reconstructed points to roadCoords indices. Use route_index from backend when available
            matchedRoadIndices = reconstructedPoints.map((p: any) => {
              if (typeof p.route_index === 'number') {
                return p.route_index;
              }
              if (roadCoords.length === 0) return -1;
              let closestIdx = -1;
              let closestDist = Infinity;
              for (let i = 0; i < roadCoords.length; i++) {
                const rc = roadCoords[i];
                const d = haversineDistance(p.lat, p.lng, rc[0], rc[1]);
                if (d < closestDist) {
                  closestDist = d;
                  closestIdx = i;
                }
              }
              return closestIdx;
            });

            matchedCoords = reconstructedPoints.map((p: any) => [p.lat, p.lng] as [number, number]);
            checkpointRoadIndicesRef.current = [];
            checkpointsRef.current = routeCheckpoints;
            loadedViaAI = true;
            console.log("[Playback DEBUG] AI reconstruction matched trail loaded successfully. Confidence:", averageConfidence);
          }
        } catch (err) {
          console.warn("[Playback] Failed to load AI reconstruction - falling back to standard snapping:", err);
          toast.warn("AI Route Correction failed — falling back to standard snapping.");
        }
      }

      setAiConfidence(averageConfidence);

      if (!loadedViaAI) {
        if (assignedRouteData && (assignedRouteData.geojson || (assignedRouteData.lane_points && assignedRouteData.lane_points.length > 0))) {
          defaultAggressive = assignedRouteData.aggressive_snapping === true;
          const rawRoadCoords =
            assignedRouteData.geojson
              ? parseRouteGeoJSON(assignedRouteData.geojson)
              : (assignedRouteData.lane_points && assignedRouteData.lane_points.length > 0
                  ? assignedRouteData.lane_points.map((lp: any) => [lp.latitude, lp.longitude] as [number, number])
                  : []);

          let roadCoords: [number, number][] = [];
          if (rawRoadCoords.length >= 2) {
            roadCoords.push(rawRoadCoords[0]);
            for (let i = 0; i < rawRoadCoords.length - 1; i++) {
              const p1 = rawRoadCoords[i];
              const p2 = rawRoadCoords[i + 1];
              const dist = haversineDistance(p1[0], p1[1], p2[0], p2[1]) * 1000;
              if (dist > 10.0) {
                const stepsCount = Math.ceil(dist / 10.0);
                for (let s = 1; s < stepsCount; s++) {
                  const fraction = s / stepsCount;
                  const lat = p1[0] + (p2[0] - p1[0]) * fraction;
                  const lng = p1[1] + (p2[1] - p1[1]) * fraction;
                  roadCoords.push([lat, lng]);
                }
              }
              roadCoords.push(p2);
            }
          } else {
            roadCoords = rawRoadCoords;
          }
          roadCoordsRef.current = roadCoords;

          if (roadCoords.length === 0) {
            console.warn("[Playback] Route has geojson but roadCoords extracted as empty — falling back to raw GPS");
            matchedCoords = validPoints.map(p => [p.lat, p.lng] as [number, number]);
            matchedRoadIndices = validPoints.map(() => -1);
            checkpointRoadIndicesRef.current = [];
            checkpointsRef.current = [];
          } else {
            if (aggressiveSnapping) {
              const snapResult = buildSequentialSnappedPlaybackDetailed(
                validPoints,
                roadCoords,
                routeCheckpoints,
                35.0,
                (assignedRouteData.route_direction as 'outbound' | 'return' | 'both') || "both",
                assignedRouteData.seq_lookahead || 5
              );
              matchedCoords = snapResult.coords;
              matchedRoadIndices = snapResult.roadIndices;
              checkpointRoadIndicesRef.current = snapResult.checkpointRoadIndices || [];
              checkpointsRef.current = snapResult.normalisedCheckpoints || routeCheckpoints;
            } else {
              // Default Mode: Turf.js light correction is active
              const tolerance = 14.0;
              const geojsonObj = assignedRouteData.geojson || {
                type: "LineString",
                coordinates: rawRoadCoords.map((c: any) => [c[1], c[0]]) // GeoJSON is [lng, lat]
              };
              matchedCoords = fetchMapMatchedRouteTurf(
                validPoints,
                geojsonObj,
                tolerance
              );
              matchedRoadIndices = matchedCoords.map((coord, idx) => {
                const raw = validPoints[idx];
                if (coord[0] === raw.lat && coord[1] === raw.lng) {
                  return -1;
                }
                if (roadCoords.length === 0) return -1;
                let closestIdx = -1;
                let closestDist = Infinity;
                for (let i = 0; i < roadCoords.length; i++) {
                  const rc = roadCoords[i];
                  const d = haversineDistance(coord[0], coord[1], rc[0], rc[1]);
                  if (d < closestDist) {
                    closestDist = d;
                    closestIdx = i;
                  }
                }
                return closestIdx;
              });
              checkpointRoadIndicesRef.current = [];
              checkpointsRef.current = routeCheckpoints;
            }
          }
        } else {
          console.warn("[Playback DEBUG] No geojson on route — rendering raw GPS. assignedRouteData:", assignedRouteData);
          matchedCoords = validPoints.map(p => [p.lat, p.lng] as [number, number]);
          matchedCoordsRef.current = matchedCoords;
          matchedRoadIndicesRef.current = matchedCoords.map(() => -1);
          checkpointRoadIndicesRef.current = [];
          checkpointsRef.current = [];
        }
      }
      matchedCoordsRef.current = matchedCoords;
      matchedRoadIndicesRef.current = matchedRoadIndices;

      const pointsToUse = loadedViaAI ? reconstructedPoints : validPoints;
      const roadIndices = matchedRoadIndices;

      const total = pointsToUse.length;
      const snapped = roadIndices.filter(idx => idx !== -1).length;
      const raw = total - snapped;
      setTotalGpsPoints(total);
      setSnappedPointsCount(snapped);
      setRawPointsCount(raw);
      if (loadedViaAI) {
        setActiveCorridor("N/A");
      } else {
        setActiveCorridor(`${aggressiveSnapping ? 35.0 : 13.0} m`);
      }

      if (loadedViaAI) {
        setPoints(reconstructedPoints);
      }

      // Pre-compute detailed steps for smooth animation along snapped roadCoords
      const steps: {
        lat: number;
        lng: number;
        time: string;
        speed: number;
        ignition: boolean | null;
        gpsIndex: number;
      }[] = [];

      if (matchedCoords.length > 0) {
        steps.push({
          lat: matchedCoords[0][0],
          lng: matchedCoords[0][1],
          time: pointsToUse[0].time,
          speed: pointsToUse[0].speed,
          ignition: pointsToUse[0].ignition,
          gpsIndex: 0,
        });

        const roadCoords = roadCoordsRef.current;

        // Pre-compute average spacing between consecutive road coords (sampled from first 50 pairs)
        const sampleN = Math.min(roadCoords.length - 1, 10);
        let totalSpacingM = 0;
        for (let s = 0; s < sampleN; s++) {
          totalSpacingM += haversineDistance(
            roadCoords[s][0], roadCoords[s][1],
            roadCoords[s + 1][0], roadCoords[s + 1][1]
          ) * 1000;
        }
        const avgCoordSpacingM = sampleN > 0 ? totalSpacingM / sampleN : 10;

        for (let i = 1; i < pointsToUse.length; i++) {
          const prevIdx = roadIndices[i - 1] ?? -1;
          const currIdx = roadIndices[i] ?? -1;
          const pPrev = pointsToUse[i - 1];
          const pCurr = pointsToUse[i];

          const tPrev = new Date(pPrev.time).getTime();
          const tCurr = new Date(pCurr.time).getTime();
          const sPrev = pPrev.speed;
          const sCurr = pCurr.speed;

          let intermediateCoords: [number, number][] = [];

          if (prevIdx !== -1 && currIdx !== -1 && roadCoords.length > 0) {
            const gap = Math.abs(currIdx - prevIdx);
            const p1 = roadCoords[prevIdx];
            const p2 = roadCoords[currIdx];
            if (p1 && p2) {
              const directDistM = haversineDistance(p1[0], p1[1], p2[0], p2[1]) * 1000;

              const timeDiffSec = Math.abs(tCurr - tPrev) / 1000;
              const MAX_SPEED_MPS = 10;
              const maxAllowedGap = timeDiffSec > 0
                ? Math.ceil(timeDiffSec * MAX_SPEED_MPS / avgCoordSpacingM) + 10
                : 30;

              const isPhysicallyImpossible = gap > maxAllowedGap;

              if (!isPhysicallyImpossible) {
                if (prevIdx <= currIdx) {
                  for (let j = prevIdx + 1; j <= currIdx; j++) {
                    if (roadCoords[j]) {
                      intermediateCoords.push(roadCoords[j]);
                    }
                  }
                } else {
                  for (let j = prevIdx - 1; j >= currIdx; j--) {
                    if (roadCoords[j]) {
                      intermediateCoords.push(roadCoords[j]);
                    }
                  }
                }
              }
            }
          }

          if (intermediateCoords.length > 0) {
            const totalSteps = intermediateCoords.length;
            intermediateCoords.forEach((coord, stepIdx) => {
              const fraction = (stepIdx + 1) / (totalSteps + 1);
              const interpTime = new Date(tPrev + (tCurr - tPrev) * fraction).toISOString();
              const interpSpeed = sPrev + (sCurr - sPrev) * fraction;
              steps.push({
                lat: coord[0],
                lng: coord[1],
                time: interpTime,
                speed: interpSpeed,
                ignition: pCurr.ignition,
                gpsIndex: i,
              });
            });
          } else if (matchedCoords[i]) {
            steps.push({
              lat: matchedCoords[i][0],
              lng: matchedCoords[i][1],
              time: pCurr.time,
              speed: pCurr.speed,
              ignition: pCurr.ignition,
              gpsIndex: i,
            });
          }
        }
      }

      setPlaybackSteps(steps);

      if (assignedRouteData && assignedRouteData.color) {
        assignedRouteColorRef.current = assignedRouteData.color;
      } else {
        assignedRouteColorRef.current = "#f97316";
      }

      // Create custom low-index background pane for the planned route to prevent overlapping redraw flickering
      if (!map.getPane("backgroundPathPane")) {
        map.createPane("backgroundPathPane");
        map.getPane("backgroundPathPane").style.zIndex = "350";
        map.getPane("backgroundPathPane").style.pointerEvents = "none";
      }

      // 1. Draw planned path as a faint background dashed polyline in the background pane
      lineRef.current = L.polyline(roadCoordsRef.current, {
        color: "#cbd5e1",
        weight: 4,
        opacity: 0.65,
        dashArray: "4, 6",
        lineCap: "round",
        lineJoin: "round",
        pane: "backgroundPathPane"
      });
      lineRef.current.on('click', handleLineClick);
      if (showRawPlayback) {
        lineRef.current.addTo(map);
        lineRef.current.bringToBack();
      }

      // Draw raw GPS trace as a dashed purple line
      const rawCoords = validPoints.map(p => [p.lat, p.lng] as [number, number]);
      rawTraceLineRef.current = L.polyline(rawCoords, {
        color: "#c084fc", // Dashed purple line
        weight: 3,
        opacity: 0.85,
        dashArray: "4, 6",
        lineCap: "round",
        lineJoin: "round"
      });
      if (showRawGpsTrace) {
        rawTraceLineRef.current.addTo(map);
      }

      if (roadCoordsRef.current && roadCoordsRef.current.length > 0) {
        map.fitBounds(lineRef.current.getBounds(), { padding: [50, 50] });
      } else if (rawCoords.length > 0) {
        map.fitBounds(rawTraceLineRef.current.getBounds(), { padding: [50, 50] });
      }

      // 2. Draw dynamic covered route trail — color resolved later from assignedRouteData
      // Initialise with a fallback; color will be updated once assignedRouteData is resolved below
      activeLineRef.current = L.polyline([matchedCoords[0], matchedCoords[0]], {
        color: useAI ? "#0d9488" : "#f97316", // Temporary fallback; replaced below when route color is known
        weight: 5.5,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round"
      });
      activeLineRef.current.on('click', handleLineClick);
      if (showActualMovement) {
        activeLineRef.current.addTo(map);
        activeLineRef.current.bringToFront();
      }

      // 3. Draw Start Marker Badge
      const startIcon = L.divIcon({
        html: `
          <div style="
            background: #10b981;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            font-size: 8.5px;
            font-weight: 900;
            border: 2px solid #ffffff;
            box-shadow: 0 3px 8px rgba(0,0,0,0.25);
            border-radius: 50%;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            line-height: 1;
          ">
            START
          </div>
        `,
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      const formattedStartTime = finalReport.start_time ? formatDateTo12H(finalReport.start_time) : "N/A";
      const formattedEndTime = finalReport.end_time ? formatDateTo12H(finalReport.end_time) : "N/A";
      const totalDistanceStr = typeof finalReport.total_distance === "number"
        ? `${finalReport.total_distance.toFixed(2)}KM(s)`
        : `${parseFloat(finalReport.total_distance || "0").toFixed(2)}KM(s)`;
      const avgSpeedStr = typeof finalReport.average_speed === "number"
        ? `${finalReport.average_speed.toFixed(2)}KM(s)/Hour`
        : `${parseFloat(finalReport.average_speed || "0").toFixed(2)}KM(s)/Hour`;

      const routeObj = routesList.find(r => String(r.id) === String(targetRouteId));
      const routeLengthStr = routeObj ? `${Number(routeObj.distance).toFixed(2)}KM(s)` : "N/A";

      const startPopupContent = `
        <div style="font-family: Arial, sans-serif; padding: 4px 8px; min-width: 320px; line-height: 1.5; color: #333;">
          <div style="text-align: center; color: #00cc00; font-size: 16px; font-weight: bold; margin-bottom: 6px;">
            Start Point
          </div>
          <div style="font-size: 16px; font-weight: bold; color: #000000; margin-bottom: 6px;">
            ${finalReport.registration_no || vehicle?.registration_no || "N/A"}
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <tr>
              <td style="color: #4b5563; padding: 2px 0; width: 140px; font-weight: normal; vertical-align: top;">Start Time</td>
              <td style="color: #000000; font-weight: bold; padding: 2px 0; vertical-align: top;">${formattedStartTime}</td>
            </tr>
            <tr>
              <td style="color: #4b5563; padding: 2px 0; vertical-align: top;">Parking Lot(s)</td>
              <td style="color: #000000; font-weight: bold; padding: 2px 0; vertical-align: top;">${startingParkingLot}</td>
            </tr>
          </table>
        </div>
      `;

      startMarkerRef.current = L.marker(baseCoords[0], { icon: startIcon, zIndexOffset: 3000 })
        .bindPopup(startPopupContent);
      if (showStartEndPoint) {
        startMarkerRef.current.addTo(map);
      }

      // 4. Draw End Marker Badge
      const endIcon = L.divIcon({
        html: `
          <div style="
            background: #ef4444;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            font-size: 8.5px;
            font-weight: 900;
            border: 2px solid #ffffff;
            box-shadow: 0 3px 8px rgba(0,0,0,0.25);
            border-radius: 50%;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            line-height: 1;
          ">
            END
          </div>
        `,
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const endPopupContent = `
        <div style="font-family: Arial, sans-serif; padding: 4px 8px; min-width: 380px; line-height: 1.5; color: #333;">
          <div style="text-align: center; color: #ff0000; font-size: 16px; font-weight: bold; margin-bottom: 6px;">
            End Point
          </div>
          <div style="font-size: 16px; font-weight: bold; color: #000000; margin-bottom: 6px;">
            ${finalReport.registration_no || vehicle?.registration_no || "N/A"}
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <tr>
              <td style="color: #4b5563; padding: 2px 0; width: 190px; vertical-align: top;">Start Time</td>
              <td style="color: #000000; font-weight: bold; padding: 2px 0; vertical-align: top;">${formattedStartTime}</td>
            </tr>
            <tr>
              <td style="color: #4b5563; padding: 2px 0; vertical-align: top;">End Time</td>
              <td style="color: #000000; font-weight: bold; padding: 2px 0; vertical-align: top;">${formattedEndTime}</td>
            </tr>
            <tr>
              <td style="color: #4b5563; padding: 2px 0; vertical-align: top;">Distance(km)</td>
              <td style="color: #000000; font-weight: bold; padding: 2px 0; vertical-align: top;">${totalDistanceStr}</td>
            </tr>
            <tr>
              <td style="color: #4b5563; padding: 2px 0; vertical-align: top;">Average Speed</td>
              <td style="color: #000000; font-weight: bold; padding: 2px 0; vertical-align: top;">${avgSpeedStr}</td>
            </tr>
            <tr>
              <td style="color: #4b5563; padding: 2px 0; vertical-align: top;">ROUTE LENGTH Distance(km)</td>
              <td style="color: #000000; font-weight: bold; padding: 2px 0; vertical-align: top;">${routeLengthStr}</td>
            </tr>
            <tr>
              <td style="color: #4b5563; padding: 2px 0; vertical-align: top;">ACTIVE DURATION</td>
              <td style="color: #000000; font-weight: bold; padding: 2px 0; vertical-align: top;">${finalReport.total_active_duration || "00:00:00"}</td>
            </tr>
            <tr>
              <td style="color: #4b5563; padding: 2px 0; vertical-align: top;">STOPPAGE DURATION</td>
              <td style="color: #000000; font-weight: bold; padding: 2px 0; vertical-align: top;">${finalReport.total_stoppage_duration || "00:00:00"}</td>
            </tr>
            <tr>
              <td style="color: #4b5563; padding: 2px 0; vertical-align: top;">Monitor.IDLE DURATION</td>
              <td style="color: #000000; font-weight: bold; padding: 2px 0; vertical-align: top;">${finalReport.total_idle_duration || "00:00:00"}</td>
            </tr>
            <tr>
              <td style="color: #4b5563; padding: 2px 0; vertical-align: top;">PARKED DURATION</td>
              <td style="color: #000000; font-weight: bold; padding: 2px 0; vertical-align: top;">${finalReport.in_parking_duration || "00:00:00"}</td>
            </tr>
          </table>
        </div>
      `;

      let endMarkerPos = baseCoords[baseCoords.length - 1];
      if (shiftStart && shiftEnd) {
        let lastOffIndex = -1;
        for (let idx = validPoints.length - 1; idx >= 0; idx--) {
          if (validPoints[idx].ignition === false) {
            lastOffIndex = idx;
            break;
          }
        }
        if (lastOffIndex !== -1) {
          endMarkerPos = baseCoords[lastOffIndex];
        }
      }
      endMarkerRef.current = L.marker(endMarkerPos, { icon: endIcon, zIndexOffset: 3000 })
        .bindPopup(endPopupContent);
      if (showStartEndPoint) {
        endMarkerRef.current.addTo(map);
      }

      // 5. Draw Vehicle Marker with premium green-border black circle style
      const vehicleIcon = L.divIcon({
        html: `
          <div style="
            background: #1e293b;
            border: 3px solid #10b981;
            border-radius: 50%;
            width: 34px;
            height: 34px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 15px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
          ">
            🚚
          </div>
        `,
        className: "",
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      const startPos = matchedCoords.length > 0 ? matchedCoords[0] : baseCoords[0];
      mkRef.current = L.marker(startPos, { icon: vehicleIcon, zIndexOffset: 2000 })
        .bindPopup(getPopupContent(pointsToUse[0]))
        .addTo(map);

      // 6. Detect and draw stoppages using color/gradient & centered duration in minutes
      const detectedStoppages = detectStoppages(pointsToUse);
      setStoppages(detectedStoppages);

      detectedStoppages.forEach((s, i) => {
        const mins = Math.max(1, Math.round(s.durationSeconds / 60));
        const isRed = mins >= 10;

        const stopIcon = L.divIcon({
          html: `
            <div style="
              width: 36px;
              height: 36px;
              background: ${isRed ? 'rgba(153, 27, 27, 0.22)' : 'rgba(245, 158, 11, 0.22)'};
              border: 2px solid ${isRed ? 'rgba(153, 27, 27, 0.38)' : 'rgba(245, 158, 11, 0.38)'};
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 5px rgba(0,0,0,0.12);
              animation: stop-pulse 2s infinite ease-in-out;
            ">
              <div style="
                width: 22px;
                height: 22px;
                background: ${isRed ? '#991b1b' : '#f59e0b'};
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: ${isRed ? '#ffffff' : '#1e293b'};
                font-family: 'Inter', sans-serif;
                font-size: 10px;
                font-weight: 800;
              ">
                ${mins}
              </div>
            </div>
          `,
          className: "",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const marker = L.marker([s.lat, s.lng], { icon: stopIcon, zIndexOffset: 100 });
        (marker as any).isMajor = isRed;

        const stopPopupContent = `
          <div style="color: #0f172a; font-family: sans-serif; font-size: 13px; line-height: 1.4; min-width: 160px; padding: 2px;">
            <div style="font-weight: 700; border-bottom: 1px dashed ${isRed ? '#ef4444' : '#f59e0b'}; padding-bottom: 6px; margin-bottom: 8px; color: ${isRed ? '#dc2626' : '#d97706'}; font-size: 14px; display: flex; align-items: center; gap: 4px;">
              🛑 <span>Stoppage #${i + 1} (${isRed ? 'Major Stop' : 'Mini Stop'})</span>
            </div>
            <div style="margin-bottom: 4px; display: flex; justify-content: space-between; gap: 12px;">
              <span style="color: #64748b;">Start:</span>
              <span style="font-weight: 600; color: #1e293b;">${new Date(s.startTime).toLocaleTimeString()}</span>
            </div>
            <div style="margin-bottom: 4px; display: flex; justify-content: space-between; gap: 12px;">
              <span style="color: #64748b;">End:</span>
              <span style="font-weight: 600; color: #1e293b;">${new Date(s.endTime).toLocaleTimeString()}</span>
            </div>
            <div style="margin-bottom: 4px; display: flex; justify-content: space-between; gap: 12px;">
              <span style="color: #64748b;">Duration:</span>
              <span style="font-weight: 700; color: ${isRed ? '#dc2626' : '#d97706'};">${formatStoppageDuration(s.durationSeconds)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px;">
              <span style="color: #64748b;">Coord:</span>
              <span style="font-weight: 500; color: #334155; font-size: 11px;">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</span>
            </div>
            <div style="border-top: 1px solid #f1f5f9; padding-top: 6px;">
              <button 
                onclick="window.jumpToKeyframe(${s.startIndex})"
                style="background: ${isRed ? '#991b1b' : '#f59e0b'}; color: ${isRed ? '#fff' : '#1e293b'}; border: none; padding: 6px 8px; font-size: 11px; font-weight: 600; cursor: pointer; border-radius: 6px; width: 100%; transition: background 0.2s;"
              >
                🔍 Focus on Playback
              </button>
            </div>
          </div>
        `;
        marker.bindPopup(stopPopupContent);
        stoppageMarkersRef.current.push(marker);

        const shouldShow = showStoppages && (isRed ? showMajorStoppages : showMiniStoppages);
        if (shouldShow) {
          marker.addTo(map);
        }
      });

      // 7. Draw the planned assigned route geometry if it exists
      if (assignedRouteData && assignedRouteData.geojson) {
        try {
          const parsedGeoJSON = JSON.parse(assignedRouteData.geojson);

          if (!map.getPane("assignedRoutePane")) {
            map.createPane("assignedRoutePane");
            map.getPane("assignedRoutePane").style.zIndex = "340";
            map.getPane("assignedRoutePane").style.pointerEvents = "none";
          }

          const routeColor = assignedRouteData.color || "#3b82f6";

          // Update the vehicle coverage trace to use the same color as the assigned route
          // at full opacity so it stands out clearly against the faint route background.
          if (activeLineRef.current) {
            activeLineRef.current.setStyle({ color: useAI ? "#0d9488" : routeColor, opacity: 0.95 });
          }

          // Draw planned route in the SAME color but at a much lighter opacity so it acts
          // as a faint ghost/guide that doesn't compete visually with the vehicle path.
          assignedRouteLayerRef.current = L.geoJSON(parsedGeoJSON, {
            style: {
              color: routeColor,
              weight: 5,
              opacity: 0.30, // Light ghost — same color as vehicle path but clearly behind it
              lineCap: "round",
              lineJoin: "round"
            },
            pointToLayer: function (feature: any, latlng: any) {
              return L.circleMarker(latlng, { radius: 0, opacity: 0, fillOpacity: 0 });
            },
            pane: "assignedRoutePane"
          });
          if (showPlannedRoute) {
            assignedRouteLayerRef.current.addTo(map);
          }

          assignedRouteLayerRef.current.bindPopup(`
            <div style="font-family: sans-serif; font-size: 13px; color: #0f172a; padding: 2px;">
              <span style="font-weight: 700; color: ${routeColor};">Planned Route:</span> ${assignedRouteData.route_name}
            </div>
          `);
        } catch (e) {
          console.error("Failed to parse and render assigned route geometry:", e);
        }
      }

      // 8. Draw Checkpoints on map
      const checkedCheckpointsMap: Record<number, { visited: boolean; reason: string }> = {};
      if (assignedRouteData && assignedRouteData.is_sequential) {
        // Run outbound check (ascending sequence_order)
        const outboundCheckpoints = [...routeCheckpoints].sort((a, b) => a.sequence_order - b.sequence_order);
        let outBroken = false;
        const outMap: Record<number, { visited: boolean; reason: string }> = {};
        let outVisitedCount = 0;
        outboundCheckpoints.forEach((cp) => {
          const visitedDetail = visitedCheckpointsList.find(vd => vd.checkpoint_id === cp.id);
          const originallyVisited = visitedDetail ? visitedDetail.visited : false;
          if (outBroken) {
            outMap[cp.id] = { visited: false, reason: "Not Sequential" };
          } else if (!originallyVisited) {
            outBroken = true;
            outMap[cp.id] = { visited: false, reason: (visitedDetail && visitedDetail.reason) || "Missed" };
          } else {
            outVisitedCount++;
            outMap[cp.id] = { visited: true, reason: (visitedDetail && visitedDetail.reason) || "" };
          }
        });

        // Run return check (descending sequence_order)
        const returnCheckpoints = [...routeCheckpoints].sort((a, b) => b.sequence_order - a.sequence_order);
        let retBroken = false;
        const retMap: Record<number, { visited: boolean; reason: string }> = {};
        let retVisitedCount = 0;
        returnCheckpoints.forEach((cp) => {
          const visitedDetail = visitedCheckpointsList.find(vd => vd.checkpoint_id === cp.id);
          const originallyVisited = visitedDetail ? visitedDetail.visited : false;
          if (retBroken) {
            retMap[cp.id] = { visited: false, reason: "Not Sequential" };
          } else if (!originallyVisited) {
            retBroken = true;
            retMap[cp.id] = { visited: false, reason: (visitedDetail && visitedDetail.reason) || "Missed" };
          } else {
            retVisitedCount++;
            retMap[cp.id] = { visited: true, reason: (visitedDetail && visitedDetail.reason) || "" };
          }
        });

        // Determine best direction based on config or auto-detect if "both"
        const dir = assignedRouteData.route_direction;
        let useReturn = false;
        if (dir === "return") {
          useReturn = true;
        } else if (dir === "outbound") {
          useReturn = false;
        } else {
          // "both" -> auto detect based on visited count
          useReturn = retVisitedCount > outVisitedCount;
        }

        const bestMap = useReturn ? retMap : outMap;
        Object.assign(checkedCheckpointsMap, bestMap);
      } else {
        routeCheckpoints.forEach((cp) => {
          const visitedDetail = visitedCheckpointsList.find(vd => vd.checkpoint_id === cp.id);
          checkedCheckpointsMap[cp.id] = {
            visited: visitedDetail ? visitedDetail.visited : false,
            reason: (visitedDetail && visitedDetail.reason) || ""
          };
        });
      }

      const checkpointData = routeCheckpoints.map(cp => {
        const cpStatus = checkedCheckpointsMap[cp.id] || { visited: false, reason: "" };
        return {
          ...cp,
          visited: cpStatus.visited,
          reason: cpStatus.reason
        };
      });
      checkpointsWithStatusRef.current = checkpointData;
      setCheckpoints(checkpointData);
      redrawCheckpoints();

    } catch (err) {
      console.error("Playback load error:", err);
    }
  }, [selectedImei, date, routeIdParam, selectedRouteId, vehicles, aiRouteCorrectionActive, aggressiveSnapping, selectedShift, shiftsList, parkingSpots, routesList]);

  const recalculatePlaybackSteps = useCallback((isAggressive: boolean) => {
    const validPoints = points;
    const roadCoords = roadCoordsRef.current || [];
    const roadIndices = matchedRoadIndicesRef.current || [];
    const matchedCoords = matchedCoordsRef.current || [];

    if (validPoints.length === 0 || matchedCoords.length === 0) return;

    // Pre-compute detailed steps for smooth animation along snapped roadCoords
    const steps: {
      lat: number;
      lng: number;
      time: string;
      speed: number;
      ignition: boolean | null;
      gpsIndex: number;
    }[] = [];

    steps.push({
      lat: matchedCoords[0][0],
      lng: matchedCoords[0][1],
      time: validPoints[0].time,
      speed: validPoints[0].speed,
      ignition: validPoints[0].ignition,
      gpsIndex: 0,
    });

    const sampleN = Math.min(roadCoords.length - 1, 50);
    let totalSpacingM = 0;
    for (let s = 0; s < sampleN; s++) {
      totalSpacingM += haversineDistance(
        roadCoords[s][0], roadCoords[s][1],
        roadCoords[s + 1][0], roadCoords[s + 1][1]
      ) * 1000;
    }
    const avgCoordSpacingM = sampleN > 0 ? totalSpacingM / sampleN : 10;

    for (let i = 1; i < validPoints.length; i++) {
      const prevIdx = roadIndices[i - 1] ?? -1;
      const currIdx = roadIndices[i] ?? -1;
      const pPrev = validPoints[i - 1];
      const pCurr = validPoints[i];

      const tPrev = new Date(pPrev.time).getTime();
      const tCurr = new Date(pCurr.time).getTime();
      const sPrev = pPrev.speed;
      const sCurr = pCurr.speed;

      let intermediateCoords: [number, number][] = [];

      if (prevIdx !== -1 && currIdx !== -1 && roadCoords.length > 0) {
        const gap = Math.abs(currIdx - prevIdx);
        const p1 = roadCoords[prevIdx];
        const p2 = roadCoords[currIdx];
        if (p1 && p2) {
          const directDistM = haversineDistance(p1[0], p1[1], p2[0], p2[1]) * 1000;

          const timeDiffSec = Math.abs(tCurr - tPrev) / 1000;
          const MAX_SPEED_MPS = 10;
          const maxAllowedGap = timeDiffSec > 0
            ? Math.ceil(timeDiffSec * MAX_SPEED_MPS / avgCoordSpacingM) + 10
            : 30;

          const isPhysicallyImpossible = gap > maxAllowedGap;

          if (!isPhysicallyImpossible || aiRouteCorrectionActive) {
            if (prevIdx <= currIdx) {
              for (let j = prevIdx + 1; j <= currIdx; j++) {
                if (roadCoords[j]) {
                  intermediateCoords.push(roadCoords[j]);
                }
              }
            } else {
              for (let j = prevIdx - 1; j >= currIdx; j--) {
                if (roadCoords[j]) {
                  intermediateCoords.push(roadCoords[j]);
                }
              }
            }
          }
        }
      }

      if (intermediateCoords.length > 0) {
        const totalSteps = intermediateCoords.length;
        intermediateCoords.forEach((coord, stepIdx) => {
          const fraction = (stepIdx + 1) / (totalSteps + 1);
          const interpTime = new Date(tPrev + (tCurr - tPrev) * fraction).toISOString();
          const interpSpeed = sPrev + (sCurr - sPrev) * fraction;
          steps.push({
            lat: coord[0],
            lng: coord[1],
            time: interpTime,
            speed: interpSpeed,
            ignition: pCurr.ignition,
            gpsIndex: i,
          });
        });
      } else if (matchedCoords[i]) {
        steps.push({
          lat: matchedCoords[i][0],
          lng: matchedCoords[i][1],
          time: pCurr.time,
          speed: pCurr.speed,
          ignition: pCurr.ignition,
          gpsIndex: i,
        });
      }
    }

    setPlaybackSteps(steps);
    setIdx(0);
    setPlaying(false);
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
  }, [points]);

  // Automatically load route playback and checkpoints whenever vehicle, date, or route changes
  useEffect(() => {
    if (selectedImei && date) {
      loadRoute(false);
    } else {
      clearPlaybackLayers();
    }
  }, [selectedImei, date, selectedRouteId, loadRoute, clearPlaybackLayers, aiRouteCorrectionActive]);

  const handleStop = () => {
    setPlaying(false);
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    if (playbackSteps.length > 0) {
      setIdx(playbackSteps.length - 1);
    }
  };

  const handleReset = () => {
    setSelectedZoneId("");
    setSelectedWardId("");
    setSelectedShift("Morning Shift");
    setSelectedImei("");
    setDate(new Date().toISOString().split("T")[0]);
    setSelectedRouteId("");
    setRouteIdParam(null);
    setDriverDetails(null);
    setTransferStationTrips(0);
    
    // Reset all visibility toggles
    setShowPlannedRoute(true);
    setShowActualMovement(true);
    setShowRawPlayback(true);
    setShowRawGpsTrace(false);
    setShowRegionBoundary(true);
    setShowStartEndPoint(true);
    setShowStoppages(true);
    setShowMajorStoppages(true);
    setShowMiniStoppages(true);
    setShowCoveredCheckpoints(true);
    setShowUncoveredCheckpoints(true);
    
    clearPlaybackLayers();
  };

  // Dynamic active trail updating helper
  const updateActiveCoveredLine = useCallback((currentIndex: number) => {
    const L = require("leaflet");
    const map = mapRef.current;
    if (!map || playbackSteps.length === 0 || !playbackSteps[currentIndex]) return;

    const coveredCoords = playbackSteps.slice(0, currentIndex + 1).map(step => [step.lat, step.lng] as [number, number]);

    if (activeLineRef.current) {
      activeLineRef.current.setLatLngs(coveredCoords);
    } else {
      activeLineRef.current = L.polyline(coveredCoords, {
        color: aiRouteCorrectionActive ? "#0d9488" : assignedRouteColorRef.current,
        weight: 5.5,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round"
      }).addTo(map);
      activeLineRef.current.on('click', handleLineClick);
      activeLineRef.current.bringToFront();
    }
  }, [playbackSteps, handleLineClick, aiRouteCorrectionActive]);

  // Handle Playback Intervals (Adjusted by Speed Multiplier)
  useEffect(() => {
    if (!playing || idx >= playbackSteps.length - 1 || !mapRef.current || !mkRef.current) return;

    const baseInterval = (points.length * 50) / playbackSteps.length;
    const intervalDuration = Math.max(8, baseInterval / speedMultiplier);

    if (mkRef.current && mkRef.current._icon) {
      mkRef.current._icon.style.transition = `transform ${intervalDuration}ms linear`;
    }

    const timer = setTimeout(() => {
      setIdx((prev) => {
        const next = prev + 1;
        if (next >= playbackSteps.length) {
          setPlaying(false);
          if (intervalRef.current) {
            clearTimeout(intervalRef.current);
            intervalRef.current = null;
          }
          if (mkRef.current && mkRef.current._icon) {
            mkRef.current._icon.style.transition = 'none';
          }
          return prev;
        }
        const step = playbackSteps[next];
        if (mkRef.current) {
          mkRef.current.setLatLng([step.lat, step.lng]);

          const originalPoint = pointsRef.current[step.gpsIndex] || {};
          const p: GpsDataPoint = {
            ...originalPoint,
            lat: step.lat,
            lng: step.lng,
            time: step.time,
            speed: step.speed,
            ignition: step.ignition,
          };
          mkRef.current.setPopupContent(getPopupContent(p));
        }
        updateActiveCoveredLine(next);
        return next;
      });
    }, intervalDuration);

    intervalRef.current = timer;

    return () => {
      clearTimeout(timer);
      if (mkRef.current && mkRef.current._icon) {
        mkRef.current._icon.style.transition = 'none';
      }
    };
  }, [playing, playbackSteps, points.length, speedMultiplier, idx, updateActiveCoveredLine]);

  // Scrub Scrubbed Point Sync
  useEffect(() => {
    if (playing) return;

    if (playbackSteps[idx] && mkRef.current) {
      if (mkRef.current._icon) {
        mkRef.current._icon.style.transition = 'none';
      }
      const step = playbackSteps[idx];
      mkRef.current.setLatLng([step.lat, step.lng]);

      const originalPoint = pointsRef.current[step.gpsIndex] || {};
      const p: GpsDataPoint = {
        ...originalPoint,
        lat: step.lat,
        lng: step.lng,
        time: step.time,
        speed: step.speed,
        ignition: step.ignition,
      };

      mkRef.current.setPopupContent(getPopupContent(p));
      updateActiveCoveredLine(idx);
    }
  }, [idx, playbackSteps, updateActiveCoveredLine, playing]);

  // Filter Dropdowns Lists
  const filteredWards = selectedZoneId
    ? regionsList.filter(r => r.region_type_id === 3 && r.parent_id === parseInt(selectedZoneId))
    : regionsList.filter(r => r.region_type_id === 3);

  const filteredVehicles = vehicles.filter(v => {
    if (v.gps_device?.imei === selectedImei) return true;

    if (selectedZoneId) {
      const zoneIdNum = parseInt(selectedZoneId);
      const hasZoneMatch = (v.zone_id === zoneIdNum) || (v.assigned_zone_id === zoneIdNum);
      if (!hasZoneMatch) return false;
    }

    if (selectedWardId) {
      const wardIdNum = parseInt(selectedWardId);
      const hasWardMatch = (v.ward_id === wardIdNum) || (v.assigned_ward_id === wardIdNum);
      if (!hasWardMatch) return false;
    }

    return true;
  });

  const zoneOptions = [
    { value: "", label: "Select Zone" },
    ...zones.map(z => ({ value: String(z.id), label: z.region_name }))
  ];

  const wardOptions = [
    { value: "", label: "Select Ward" },
    ...filteredWards.map(w => ({ value: String(w.id), label: w.region_name }))
  ];

  const shiftOptions = [
    { value: "all", label: "All Shifts" },
    ...shiftsList.map(s => ({ value: s.shift_name, label: s.shift_name }))
  ];

  const routeOptions = [
    { value: "", label: "All Routes" },
    ...routesList.map(r => ({ value: String(r.id), label: r.route_name }))
  ];

  const vehicleOptions = [
    { value: "", label: "Select Vehicle" },
    ...filteredVehicles.filter(v => v.gps_device).map(v => ({
      value: v.gps_device!.imei,
      label: `${v.registration_no} (${v.vehicle_type?.name || "Tipper"})`
    }))
  ];



  const handleVehicleSelect = (imei: string) => {
    setSelectedImei(imei);
    setRouteIdParam(null);
    if (imei) {
      resolveRouteAndSyncFilters(imei, selectedShift);
    }
  };

  const currentStep = playbackSteps[idx];
  const p = currentStep ? (points[currentStep.gpsIndex] || points[0]) : points[0];
  const progressPct = playbackSteps.length > 0 ? (idx / (playbackSteps.length - 1)) * 100 : 0;
  const totalCheckpoints = checkpoints.length;
  const visitedCheckpoints = checkpoints.filter(cp => cp.visited).length;
  const coveragePct = totalCheckpoints > 0 ? (visitedCheckpoints / totalCheckpoints) * 100 : 0;

  // Helper format time
  const formatTimeStr = (t?: string) => {
    if (!t) return "00:00:00";
    return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-theme-base text-theme-text font-sans">
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes stop-pulse {
          0% { transform: scale(0.95); opacity: 0.9; }
          50% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.9; }
        }
        @keyframes highlight-pulse-anim {
          0% { transform: scale(1); filter: drop-shadow(0 0 0px rgba(99, 102, 241, 0.8)); }
          50% { transform: scale(1.4); filter: drop-shadow(0 0 12px rgba(99, 102, 241, 0.95)); }
          100% { transform: scale(1); filter: drop-shadow(0 0 0px rgba(99, 102, 241, 0)); }
        }
        .highlight-pulse {
          animation: highlight-pulse-anim 1.5s ease-in-out;
        }
      `}} />

      {/* Sub-header / Playback Title with Green Line */}
      <div className="bg-theme-surface px-3 sm:px-6 py-3 border-b border-theme-border shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-theme-text">Playback</h2>
          <div className="h-[3px] w-8 bg-emerald-500 mt-1"></div>
        </div>
      </div>

      {/* Map and Floating Panels Area */}
      <div className="flex-1 relative overflow-hidden">
        
        {/* Leaflet Map takes full size and serves as the background */}
        <div ref={box} className="absolute inset-0 z-0 bg-theme-base w-full h-full" />

        {/* Left Panel: Collapsible Configuration & Telemetry */}
        <div className={`absolute top-4 left-2 sm:left-4 z-[1000] h-[calc(100%-32px)] w-[calc(100%-16px)] sm:w-72 md:w-80 flex transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          leftPanelCollapsed ? '-translate-x-[calc(100%-16px)]' : 'translate-x-0'
        }`}>
          {/* Main Card */}
          <div className="w-full bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-2xl p-3 sm:p-4 flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-base">🚚</span>
                <h3 className="font-extrabold text-slate-800 tracking-tight uppercase text-[11px]">Configure Playback</h3>
              </div>
            </div>

            {/* Scrollable Filters */}
            <div className="flex-1 overflow-y-auto pr-0.5 custom-scrollbar min-h-0 space-y-4 text-slate-800">
              {/* Search Filters */}
              <div className="space-y-3.5">
                {/* Date Picker */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" /> Date
                  </label>
                  <DatePicker
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setRouteIdParam(null);
                    }}
                    className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs text-slate-750 focus:border-emerald-500 outline-none transition cursor-pointer font-medium shadow-sm"
                  />
                </div>

                {/* Select Zone */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Zone</label>
                  <SearchableSelect
                    value={selectedZoneId}
                    onChange={(val) => {
                      setSelectedZoneId(val);
                      setSelectedWardId("");
                      setSelectedImei("");
                      setRouteIdParam(null);
                      setSelectedRouteId("");
                    }}
                    options={zoneOptions}
                    placeholder="Select Zone"
                    className="w-full text-slate-800"
                  />
                </div>

                {/* Select Ward */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ward</label>
                  <SearchableSelect
                    value={selectedWardId}
                    onChange={(val) => {
                      setSelectedWardId(val);
                      setSelectedImei("");
                      setRouteIdParam(null);
                      setSelectedRouteId("");
                    }}
                    options={wardOptions}
                    placeholder="Select Ward"
                    className="w-full text-slate-800"
                  />
                </div>

                {/* Select Shift */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Shift</label>
                  <SearchableSelect
                    value={selectedShift}
                    onChange={(val) => {
                      setSelectedShift(val);
                      setRouteIdParam(null);
                      if (selectedImei) {
                        resolveRouteAndSyncFilters(selectedImei, val);
                      }
                    }}
                    options={shiftOptions}
                    placeholder="Select Shift"
                    className="w-full text-slate-800"
                  />
                </div>

                {/* Select Vehicle */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vehicle</label>
                  <SearchableSelect
                    value={selectedImei}
                    onChange={handleVehicleSelect}
                    options={vehicleOptions}
                    placeholder="Select Vehicle"
                    className="w-full text-slate-800"
                  />
                </div>
              </div>

              {/* Driver Details */}
              {selectedImei && (
                <div className="border-t border-slate-100 pt-4 space-y-3.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Driver Details
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 text-slate-600 font-mono text-[11px] bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Driver</span>
                      <span className="font-bold text-slate-700 text-sm truncate">{driverDetails?.driverName || "N/A"}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Helper</span>
                      <span className="font-bold text-slate-700 text-sm truncate">{driverDetails?.helperName || "N/A"}</span>
                    </div>
                    <div className="flex flex-col col-span-2 border-t border-slate-200/55 pt-1.5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">TS Trips</span>
                      <span className="font-bold text-emerald-600 text-sm">{transferStationTrips}</span>
                    </div>
                    <div className="flex flex-col col-span-2 border-t border-slate-200/55 pt-1.5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Coverage</span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${coveragePct}%`,
                              background: `linear-gradient(to right, #f59e0b, #10B981)`
                            }}
                          />
                        </div>
                        <span className="font-bold text-slate-700 text-sm shrink-0">
                          {totalCheckpoints > 0 ? `${Math.round(coveragePct)}%` : "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Toggle Handle */}
          <button
            onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
            className="self-center -mr-3.5 w-7 h-14 bg-white hover:bg-slate-50 border border-slate-200/80 shadow-lg rounded-r-xl flex items-center justify-center text-slate-500 hover:text-slate-800 transition z-10 focus:outline-none"
          >
            {leftPanelCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Right Panel: Collapsible tabbed Checkpoints & Stoppages */}
        {(checkpoints.length > 0 || stoppages.length > 0) && (
          <div className={`absolute top-4 right-2 sm:right-4 z-[1000] h-[calc(100%-32px)] w-[calc(100%-16px)] sm:w-72 md:w-80 flex transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            rightPanelCollapsed ? 'translate-x-[calc(100%-16px)]' : 'translate-x-0'
          }`}>
            {/* Toggle Handle */}
            <button
              onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
              className="self-center -ml-3.5 w-7 h-14 bg-white hover:bg-slate-50 border border-slate-200/80 shadow-lg rounded-l-xl flex items-center justify-center text-slate-500 hover:text-slate-800 transition z-10 focus:outline-none"
            >
              {rightPanelCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>

            {/* Main Card */}
            <div className="w-full bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-2xl p-3 sm:p-4 flex flex-col h-full text-slate-800">
              {/* Tab Selector */}
              <div className="flex border-b border-slate-100 pb-2 mb-3 gap-1 shrink-0">
                <button
                  onClick={() => setActiveRightTab("checkpoints")}
                  className={`flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider rounded-lg transition ${
                    activeRightTab === "checkpoints"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-100/50"
                      : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  📍 Checkpoints ({checkpoints.filter(cp => cp.visited).length}/{checkpoints.length})
                </button>
                <button
                  onClick={() => setActiveRightTab("stoppages")}
                  className={`flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider rounded-lg transition ${
                    activeRightTab === "stoppages"
                      ? "bg-rose-50 text-rose-700 border border-rose-100/50"
                      : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  🛑 Stoppages ({stoppages.length})
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto pr-0.5 custom-scrollbar min-h-0">
                {activeRightTab === "checkpoints" ? (
                  checkpoints.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                      <span className="text-2xl mb-2">📍</span>
                      <p className="text-xs">No checkpoints loaded</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {checkpoints
                        .filter(cp => {
                          if (cp.visited && !showCoveredCheckpoints) return false;
                          if (!cp.visited && !showUncoveredCheckpoints) return false;
                          return true;
                        })
                        .sort((a, b) => a.sequence_order - b.sequence_order)
                        .map((cp, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              const map = mapRef.current;
                              if (!map) return;
                              map.panTo([cp.latitude, cp.longitude]);
                              const marker = checkpointMarkersMapRef.current[cp.id];
                              if (marker) {
                                if (!map.hasLayer(marker)) {
                                  marker.addTo(map);
                                  checkpointMarkersRef.current.push(marker);
                                }
                                marker.openPopup();
                                const el = marker.getElement();
                                if (el) {
                                  const child = el.firstElementChild;
                                  if (child) {
                                    child.classList.add("highlight-pulse");
                                    setTimeout(() => child.classList.remove("highlight-pulse"), 1500);
                                  }
                                }
                              }
                            }}
                            className={`w-full text-left p-3 border rounded-xl text-xs transition flex items-center justify-between group active:scale-98 ${
                              cp.visited
                                ? 'bg-[#f0fdf4]/50 hover:bg-[#f0fdf4] border-[#dcfce7] hover:border-[#bbf7d0]'
                                : 'bg-rose-50/25 hover:bg-rose-50 border-rose-100 hover:border-rose-200'
                            }`}
                          >
                            <div className="space-y-1 max-w-[70%] text-left">
                              <span className={`font-extrabold block truncate ${cp.visited ? 'text-[#16a34a]' : 'text-rose-500'}`}>
                                #{cp.sequence_order} {formatCheckpointName(cp.checkpoint_name, cp.sequence_order)}
                              </span>
                              <span className="text-[10px] text-slate-400 block font-normal">
                                Radius: {cp.radius_meters || 100}m
                              </span>
                              {!cp.visited && cp.reason && (
                                <span className="text-[9.5px] text-rose-650 font-semibold block mt-1.5 leading-tight italic bg-rose-50/70 border border-rose-100 px-1.5 py-0.5 rounded">
                                  ⚠️ {cp.reason}
                                </span>
                              )}
                            </div>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg transition duration-200 shrink-0 ${
                              cp.visited
                                ? 'bg-[#dcfce7] text-[#15803d] group-hover:bg-[#bbf7d0]'
                                : 'bg-rose-100 text-rose-600 group-hover:bg-rose-200'
                            }`}>
                              {cp.visited ? 'HIT' : 'MISSED'}
                            </span>
                          </button>
                        ))}
                    </div>
                  )
                ) : (
                  stoppages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                      <span className="text-2xl mb-2">🛑</span>
                      <p className="text-xs">No stoppages detected</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {stoppages
                        .filter(s => {
                          const mins = Math.max(1, Math.round(s.durationSeconds / 60));
                          const isMajor = mins >= 10;
                          if (isMajor && !showMajorStoppages) return false;
                          if (!isMajor && !showMiniStoppages) return false;
                          return true;
                        })
                        .map((s, i) => (
                          <button
                            key={i}
                            onClick={() => jumpToKeyframe(s.startIndex)}
                            className="w-full text-left p-3 bg-slate-50 hover:bg-rose-50 border border-slate-100 hover:border-rose-200 rounded-xl text-xs transition flex items-center justify-between group active:scale-98"
                          >
                            <div className="space-y-1">
                              <span className="font-extrabold text-rose-500 block">Stoppage #{i + 1}</span>
                              <span className="text-[10px] text-slate-400 block font-normal">
                                ⏱. {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <span className="text-[10px] font-black bg-rose-100 text-rose-600 group-hover:bg-rose-200 px-2 py-0.5 rounded-lg transition duration-200">
                              {formatStoppageDuration(s.durationSeconds)}
                            </span>
                          </button>
                        ))}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Map Indication Dropdown positioning */}
        <div className={`absolute top-4 z-[1000] flex flex-col items-end transition-all duration-300 ${
          (checkpoints.length > 0 || stoppages.length > 0) && !rightPanelCollapsed
            ? 'right-[calc(100%-16px)] sm:right-[308px] md:right-[346px]'
            : 'right-2 sm:right-4'
        }`}>
          <div
            onClick={() => setShowMapIndicationMenu(!showMapIndicationMenu)}
            className="bg-[#f59e0b] hover:bg-amber-600 text-white px-3.5 py-2 text-xs font-bold uppercase rounded-xl shadow-lg tracking-wider flex items-center gap-1.5 cursor-pointer transition select-none border border-amber-400/20"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Map Layers</span>
          </div>

          {showMapIndicationMenu && (
            <div className="mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 w-64 flex flex-col gap-2.5 z-[1000] animate-fade-in text-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5">Map Layers</span>

              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none py-0.5 hover:text-slate-900 font-semibold">
                  <input
                    type="checkbox"
                    checked={showPlannedRoute}
                    onChange={(e) => setShowPlannedRoute(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                  />
                  <span>Planned Route & Checkpoints</span>
                </label>

                {showPlannedRoute && (
                  <div className="pl-5 flex flex-col gap-1.5 border-l border-slate-150 ml-1.5 mb-1 mt-0.5">
                    <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer select-none hover:text-slate-800">
                      <input
                        type="checkbox"
                        checked={showCoveredCheckpoints}
                        onChange={(e) => setShowCoveredCheckpoints(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>Covered Lane Points (Hit)</span>
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer select-none hover:text-slate-800">
                      <input
                        type="checkbox"
                        checked={showUncoveredCheckpoints}
                        onChange={(e) => setShowUncoveredCheckpoints(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>Uncovered Lane Points (Missed)</span>
                    </label>
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none py-0.5 hover:text-slate-900 font-semibold">
                <input
                  type="checkbox"
                  checked={showActualMovement}
                  onChange={(e) => setShowActualMovement(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Actual Movement</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none py-0.5 hover:text-slate-900 font-semibold">
                <input
                  type="checkbox"
                  checked={showRawPlayback}
                  onChange={(e) => setShowRawPlayback(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Raw Playback (Unsnapped)</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none py-0.5 hover:text-slate-900 font-semibold">
                <input
                  type="checkbox"
                  checked={showRawGpsTrace}
                  onChange={(e) => setShowRawGpsTrace(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                />
                <span className="text-purple-600 font-bold">Raw GPS Trace (Original)</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none py-0.5 hover:text-slate-900 font-semibold">
                <input
                  type="checkbox"
                  checked={showRegionBoundary}
                  onChange={(e) => setShowRegionBoundary(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Region Boundary</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none py-0.5 hover:text-slate-900 font-semibold">
                <input
                  type="checkbox"
                  checked={showParking}
                  onChange={(e) => setShowParking(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Parking Spots</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none py-0.5 hover:text-slate-900 font-semibold">
                <input
                  type="checkbox"
                  checked={showTransfer}
                  onChange={(e) => setShowTransfer(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Transfer Stations</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none py-0.5 hover:text-slate-900 font-semibold">
                <input
                  type="checkbox"
                  checked={showFuel}
                  onChange={(e) => setShowFuel(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Fuel Stations</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none py-0.5 hover:text-slate-900 font-semibold">
                <input
                  type="checkbox"
                  checked={showWorkshop}
                  onChange={(e) => setShowWorkshop(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Workshops</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none py-0.5 hover:text-slate-900 font-semibold">
                <input
                  type="checkbox"
                  checked={showStartEndPoint}
                  onChange={(e) => setShowStartEndPoint(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Start/End Points</span>
              </label>

              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none py-0.5 hover:text-slate-900 font-semibold">
                  <input
                    type="checkbox"
                    checked={showStoppages}
                    onChange={(e) => setShowStoppages(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                  />
                  <span>Stoppages</span>
                </label>

                {showStoppages && (
                  <div className="pl-5 flex flex-col gap-1.5 border-l border-slate-150 ml-1.5 mt-0.5">
                    <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer select-none hover:text-slate-800">
                      <input
                        type="checkbox"
                        checked={showMajorStoppages}
                        onChange={(e) => setShowMajorStoppages(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>Major Stops (≥ 10 mins)</span>
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer select-none hover:text-slate-800">
                      <input
                        type="checkbox"
                        checked={showMiniStoppages}
                        onChange={(e) => setShowMiniStoppages(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>Mini Stops (&lt; 10 mins)</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Media Player Floating Deck at Bottom Center */}
        <div className="absolute bottom-2 sm:bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[96%] sm:w-[90%] max-w-2xl bg-white/95 backdrop-blur-md border border-slate-200 text-slate-800 rounded-xl sm:rounded-2xl shadow-2xl p-3 sm:p-4 flex flex-col gap-2 sm:gap-3 transition-all duration-300">
          {/* Timeline slider row */}
          <div className="w-full flex items-center gap-2 sm:gap-3">
            <span className="text-[10px] sm:text-xs font-semibold font-mono text-slate-500 w-12 sm:w-16 shrink-0 text-left">
              {playbackSteps.length > 0 ? formatTimeStr(playbackSteps[idx]?.time) : "00:00:00"}
            </span>
            <input
              type="range"
              min={0}
              max={playbackSteps.length > 0 ? playbackSteps.length - 1 : 100}
              value={playbackSteps.length > 0 ? idx : 0}
              disabled={playbackSteps.length === 0}
              onChange={(e) => {
                if (playbackSteps.length > 0) {
                  setPlaying(false);
                  if (intervalRef.current) {
                    clearTimeout(intervalRef.current);
                    intervalRef.current = null;
                  }
                  setIdx(Number(e.target.value));
                }
              }}
              className="flex-1 h-1.5 rounded-full cursor-pointer bg-slate-200 accent-emerald-500 appearance-none outline-none focus:outline-none"
              style={{
                background: `linear-gradient(to right, #10B981 0%, #10B981 ${progressPct}%, #e2e8f0 ${progressPct}%, #e2e8f0 100%)`
              }}
            />
            <span className="text-[10px] sm:text-xs font-semibold font-mono text-slate-500 w-12 sm:w-16 shrink-0 text-right">
              {playbackSteps.length > 0 ? formatTimeStr(playbackSteps[playbackSteps.length - 1]?.time) : "00:00:00"}
            </span>
          </div>

          {/* Controls and Telemetry Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
            {/* Left Group: Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Play/Pause */}
              <button
                type="button"
                disabled={!selectedImei}
                onClick={() => {
                  if (points.length === 0) {
                    loadRoute(true);
                  } else {
                    const nextPlaying = !playing;
                    setPlaying(nextPlaying);
                    if (!nextPlaying && intervalRef.current) {
                      clearTimeout(intervalRef.current);
                      intervalRef.current = null;
                    }
                  }
                }}
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all duration-200 shadow-md shrink-0 focus:outline-none ${!selectedImei
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 shadow-emerald-500/20 cursor-pointer hover:shadow-lg"
                  }`}
                title={!selectedImei ? "Please select a vehicle first" : playing ? "Pause Playback" : "Start Playback"}
              >
                {playing ? (
                  <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                ) : (
                  <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current translate-x-0.5" />
                )}
              </button>

              {/* Stop */}
              <button
                type="button"
                disabled={points.length === 0}
                onClick={handleStop}
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-white transition-all duration-200 shadow-md shrink-0 focus:outline-none ${points.length === 0
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-rose-500 hover:bg-rose-600 active:scale-95 shadow-rose-500/20 cursor-pointer hover:shadow-lg"
                  }`}
                title="Stop Playback"
              >
                <Square className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current" />
              </button>

              {/* Reset */}
              <button
                type="button"
                onClick={handleReset}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 hover:text-slate-800 flex items-center justify-center shadow-md transition-all shrink-0 cursor-pointer focus:outline-none"
                title="Reset filters and data"
              >
                <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
              
              {/* Speed Multiplier Select */}
              <div className="relative">
                <select
                  value={speedMultiplier}
                  onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
                  className="bg-slate-100 border border-slate-200 text-slate-900 pl-3 pr-8 py-1.5 rounded-xl text-xs focus:border-emerald-500 outline-none transition cursor-pointer font-bold appearance-none select-none"
                >
                  <option value={1}>1X</option>
                  <option value={2}>2X</option>
                  <option value={4}>4X</option>
                  <option value={8}>8X</option>
                  <option value={16}>16X</option>
                  <option value={32}>32X</option>
                  <option value={64}>64X</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Right Group: Live Telemetry Values */}
            {selectedImei && playbackSteps.length > 0 && currentStep && (
              <div className="flex items-center gap-3.5 text-xs font-mono">
                {/* Speed indicator */}
                <div className="flex items-center gap-1.5 bg-slate-100/80 px-3 py-1.5 rounded-xl border border-slate-200/50">
                  <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-slate-900">Speed:</span>
                  <span className="font-bold text-black">{Math.round(currentStep.speed)} km/h</span>
                </div>

                {/* Ignition indicator */}
                <div className="flex items-center gap-1.5 bg-slate-100/80 px-3 py-1.5 rounded-xl border border-slate-200/50">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-slate-900">Ignition:</span>
                  <span className={`inline-flex items-center gap-1.5 font-bold ${currentStep.ignition ? "text-emerald-400" : "text-rose-400"}`}>
                    <span className={`w-2 h-2 rounded-full ${currentStep.ignition ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
                    {currentStep.ignition ? "ON" : "OFF"}
                  </span>
                </div>
            </div>


            )}
          </div>
        </div>
      </div>
    </div>
  );
}
