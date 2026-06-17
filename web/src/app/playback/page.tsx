"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { Vehicle, GpsDataPoint } from "@/lib/types";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { populateOpenDepotLayer } from "@/components/OpenDepotMapLayer";

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

  points.forEach(p => {
    // 1. Caching: If the point is very close to the last computed point (less than 5 meters), reuse the matched result
    if (lastRawLat !== -999 && haversineDistance(p.lat, p.lng, lastRawLat, lastRawLng) < 0.005) {
      matchedCoords.push(lastMatched);
      return;
    }

    // 2. Euclidean snap to route segments
    let minDistanceSq = Infinity;
    let bestLat = p.lat;
    let bestLng = p.lng;

    for (let i = 0; i < routePts.length - 1; i++) {
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
      }
    }

    // Convert distance from degrees to meters (approx 1 degree = 111,000 meters)
    const distMeters = Math.sqrt(minDistanceSq) * 111000;
    if (distMeters <= toleranceMeters) {
      lastMatched = [bestLat, bestLng];
    } else {
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

  // Filtering States
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [selectedWardId, setSelectedWardId] = useState<string>("");
  const [selectedShift, setSelectedShift] = useState<string>("Morning Shift");
  const [selectedImei, setSelectedImei] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(4);
  const [routeIdParam, setRouteIdParam] = useState<string | null>(null);

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

  // Visibility states
  const [showPlannedRoute, setShowPlannedRoute] = useState(true);
  const [showActualMovement, setShowActualMovement] = useState(true);
  const [showRawPlayback, setShowRawPlayback] = useState(true);
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
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [stoppages, setStoppages] = useState<StoppagePoint[]>([]);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);

  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const mkRef = useRef<any>(null);
  const stoppageMarkersRef = useRef<any[]>([]);
  const checkpointMarkersRef = useRef<any[]>([]);
  const checkpointMarkersMapRef = useRef<Record<number, any>>({});
  const assignedRouteLayerRef = useRef<any>(null);
  const boundaryLayerRef = useRef<any>(null); // For selected zone/ward boundaries
  const intervalRef = useRef<any>(null);

  const parkingSpotsLayerRef = useRef<any>(null);
  const transferStationsLayerRef = useRef<any>(null);
  const fuelStationsLayerRef = useRef<any>(null);
  const workshopsLayerRef = useRef<any>(null);
  const openDepotsLayerRef = useRef<any>(null);

  const matchedCoordsRef = useRef<[number, number][]>([]);
  const activeLineRef = useRef<any>(null);
  const startMarkerRef = useRef<any>(null);
  const endMarkerRef = useRef<any>(null);

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
    setIdx(index);
    const p = points[index];
    if (p) {
      const map = mapRef.current;
      const matched = matchedCoordsRef.current[index];
      const targetLat = matched ? matched[0] : p.lat;
      const targetLng = matched ? matched[1] : p.lng;
      
      if (map) {
        map.panTo([targetLat, targetLng]);
      }
      if (mkRef.current) {
        if (mkRef.current._icon) mkRef.current._icon.style.transition = 'none';
        mkRef.current.setLatLng([targetLat, targetLng]);
        mkRef.current.setPopupContent(getPopupContent(p));
        mkRef.current.openPopup();
      }
    }
  }, [points]);

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

    const createD2DPinIcon = (type: "start" | "end", number: string | number) => {
      const color = type === "start" ? "#22c55e" : "#ef4444";
      const strokeColor = type === "start" ? "#15803d" : "#b91c1c";
      return L.divIcon({
        className: `lane-${type}-flag-pin`,
        html: `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; width: 22px; height: 28px;">
            <svg width="22" height="28" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.5));">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 9.3 12 18 12 18s12-8.7 12-18c0-6.63-5.37-12-12-12z" fill="${color}" stroke="${strokeColor}" stroke-width="1.5"/>
              <circle cx="12" cy="12" r="7.5" fill="white"/>
              <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="8.5" fill="${strokeColor}">${number}</text>
            </svg>
          </div>
        `,
        iconSize: [22, 28],
        iconAnchor: [11, 28],
      });
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
        
        // Render route line
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

        // If a specific route is selected, also draw its lanes and pin drop markers
        if (isSingleRouteSelected && route.lanes) {
          let parsedLanes = route.lanes;
          if (typeof parsedLanes === "string") {
            try {
              parsedLanes = JSON.parse(parsedLanes);
            } catch (e) {
              parsedLanes = [];
            }
          }
          if (Array.isArray(parsedLanes)) {
            // Get route coordinates for snapping/drawing lane segments
            let routePts: any[] = [];
            if (feature.geometry && feature.geometry.type === "LineString") {
              routePts = feature.geometry.coordinates.map((c: any) => L.latLng(c[1], c[0]));
            } else if (feature.type === "LineString") {
              routePts = feature.coordinates.map((c: any) => L.latLng(c[1], c[0]));
            }

            parsedLanes.forEach((rawLane: any) => {
              const isDB = rawLane.start_point !== undefined;
              const startLat = isDB ? (rawLane.start_point?.y ?? 0) : (rawLane.startLat ?? 0);
              const startLng = isDB ? (rawLane.start_point?.x ?? 0) : (rawLane.startLng ?? 0);
              const endLat = isDB ? (rawLane.end_point?.y ?? 0) : (rawLane.endLat ?? 0);
              const endLng = isDB ? (rawLane.end_point?.x ?? 0) : (rawLane.endLng ?? 0);
              
              const lane = {
                startLat,
                startLng,
                endLat,
                endLng,
                laneOrder: isDB ? (rawLane.lane_order ?? 1) : (rawLane.laneOrder ?? 1),
                noOfHouseholds: isDB ? (rawLane.no_of_households ?? 0) : (rawLane.noOfHouseholds ?? 0),
                noOfCommercials: isDB ? (rawLane.no_of_commercial ?? 0) : (rawLane.noOfCommercials ?? 0),
              };

              // Draw highlighted lane segment
              if (routePts.length >= 2) {
                const startIdx = snapToRoute(L.latLng(lane.startLat, lane.startLng), routePts).index;
                const endIdx = snapToRoute(L.latLng(lane.endLat, lane.endLng), routePts).index;
                if (startIdx >= 0 && endIdx >= 0) {
                  let segmentCoords: any[] = [];
                  const startPt = L.latLng(lane.startLat, lane.startLng);
                  const endPt = L.latLng(lane.endLat, lane.endLng);

                  if (startIdx <= endIdx) {
                    segmentCoords = [
                      startPt,
                      ...routePts.slice(startIdx, endIdx + 1),
                      endPt,
                    ];
                  } else {
                    segmentCoords = [
                      startPt,
                      ...routePts.slice(endIdx, startIdx + 1).reverse(),
                      endPt,
                    ];
                  }

                  L.polyline(segmentCoords, {
                    color: "#3b82f6", // Blue for lanes
                    weight: 6,
                    opacity: 0.8,
                  }).addTo(layer);
                }
              }

              // Draw start pin (Green)
              L.marker([lane.startLat, lane.startLng], { 
                icon: createD2DPinIcon("start", lane.laneOrder) 
              })
              .bindPopup(`
                <div style="font-family:Inter,sans-serif;font-size:12px;color:#1e293b;padding:4px;">
                  <b>Lane Set ${lane.laneOrder} - Start</b><br/>
                  <span style="color:#64748b;">Households: ${lane.noOfHouseholds || 0}</span>
                </div>
              `)
              .addTo(layer);

              // Draw end pin (Red)
              L.marker([lane.endLat, lane.endLng], { 
                icon: createD2DPinIcon("end", lane.laneOrder) 
              })
              .bindPopup(`
                <div style="font-family:Inter,sans-serif;font-size:12px;color:#1e293b;padding:4px;">
                  <b>Lane Set ${lane.laneOrder} - End</b><br/>
                  <span style="color:#64748b;">Commercials: ${lane.noOfCommercials || 0}</span>
                </div>
              `)
              .addTo(layer);
            });
          }
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
  }, [routesList, selectedZoneId, selectedWardId, selectedShift, selectedRouteId, regionsList, showPlannedRoute]);

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
    api<{ data: any[] }>("/api/zones").then((res) => setZones(res.data || [])).catch(() => {});
    api<{ success: boolean; data: any[] }>("/api/regions").then((res) => {
      if (res.success) setRegionsList(res.data || []);
    }).catch(() => {});
    api<{ success: boolean; data: any[] }>("/api/routes").then((res) => {
      if (res.success) setRoutesList(res.data || []);
    }).catch(() => {});
    api<{ success: boolean; data: any[] }>("/api/shifts?group=VEHICLE_MOVEMENT").then((res) => {
      if (res.success) setShiftsList(res.data || []);
    }).catch(() => {});

    api<{ data: any[] }>("/api/parking-spots").then((res) => setParkingSpots(res.data || [])).catch(() => {});
    api<{ data: any[] }>("/api/transfer-stations").then((res) => setTransferStations(res.data || [])).catch(() => {});
    api<{ data: any[] }>("/api/fuel-stations").then((res) => setFuelStations(res.data || [])).catch(() => {});
    api<{ data: any[] }>("/api/workshops").then((res) => setWorkshops(res.data || [])).catch(() => {});

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

  // Init Leaflet map
  useEffect(() => {
    if (typeof window === "undefined" || !box.current || mapRef.current) return;
    const L = require("leaflet");

    mapRef.current = L.map(box.current, { zoomControl: false }).setView([26.9124, 75.7873], 13);
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

    return () => {
      if (mapRef.current) {
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

  // Reusable helper to clear all playback state and layers from Leaflet map
  const clearPlaybackLayers = useCallback(() => {
    setPoints([]);
    setIdx(0);
    setPlaying(false);
    setStoppages([]);
    setCheckpoints([]);

    const map = mapRef.current;
    if (!map) return;

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
    matchedCoordsRef.current = [];

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
      const validPoints = smoothGpsTrace(validPointsRaw);
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
      
      // Fetch the assigned route for this vehicle today to snap against
      let routeCheckpoints: any[] = [];
      let assignedRouteData: any = null;
      let visitedCheckpointsList: any[] = [];
      const targetRouteId = selectedRouteId || routeIdParam;
      if (targetRouteId) {
        try {
          const vehicle = vehicles.find(v => v.gps_device?.imei === selectedImei);
          if (vehicle) {
            const cov = await api<any>(`/api/vehicles/${vehicle.id}/route-coverage?date=${date}&route_id=${targetRouteId}`);
            if (cov.success && cov.route_id) {
              // Get Route details (geometry)
              const rRes = await api<any>(`/api/routes/${cov.route_id}`);
              if (rRes.success && rRes.data) {
                assignedRouteData = rRes.data;
              }

              const cpRes = await api<any>(`/api/routes/${cov.route_id}/checkpoints`);
              if (cpRes.success && cpRes.data) {
                routeCheckpoints = cpRes.data;
              }

              if (cov.details) {
                visitedCheckpointsList = cov.details;
              }
            }
          }
        } catch (err) {
          console.error("Failed to load assigned route for snapping", err);
        }
      }

      const matchedCoords = fetchMapMatchedRouteTurf(
        validPoints,
        assignedRouteData ? assignedRouteData.geojson : null,
        15
      );
      matchedCoordsRef.current = matchedCoords;

      // Create custom low-index background pane for the planned route to prevent overlapping redraw flickering
      if (!map.getPane("backgroundPathPane")) {
        map.createPane("backgroundPathPane");
        map.getPane("backgroundPathPane").style.zIndex = "350";
        map.getPane("backgroundPathPane").style.pointerEvents = "none";
      }

      // 1. Draw planned path as a faint background dashed polyline in the background pane
      lineRef.current = L.polyline(matchedCoords, { 
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

      map.fitBounds(lineRef.current.getBounds(), { padding: [50, 50] });

      // 2. Draw dynamic covered route trail — color resolved later from assignedRouteData
      // Initialise with a fallback; color will be updated once assignedRouteData is resolved below
      activeLineRef.current = L.polyline([matchedCoords[0], matchedCoords[0]], {
        color: "#f97316", // Temporary fallback; replaced below when route color is known
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
      startMarkerRef.current = L.marker(baseCoords[0], { icon: startIcon });
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
      endMarkerRef.current = L.marker(baseCoords[baseCoords.length - 1], { icon: endIcon });
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
      mkRef.current = L.marker(startPos, { icon: vehicleIcon })
        .bindPopup(getPopupContent(validPoints[0]))
        .addTo(map);

      // 6. Detect and draw stoppages using color/gradient & centered duration in minutes
      const detectedStoppages = detectStoppages(validPoints);
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

        const marker = L.marker([s.lat, s.lng], { icon: stopIcon });
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
            activeLineRef.current.setStyle({ color: routeColor, opacity: 0.95 });
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
      const checkpointMarkers: any[] = [];
      const markersMap: Record<number, any> = {};
      routeCheckpoints.forEach((cp, idx) => {
        const visitedDetail = visitedCheckpointsList.find(vd => vd.checkpoint_id === cp.id);
        const visited = visitedDetail ? visitedDetail.visited : false;

        const isLaneStart = cp.checkpoint_name.includes("_Lane") && cp.checkpoint_name.includes("_Start");
        const isLaneEnd = cp.checkpoint_name.includes("_Lane") && cp.checkpoint_name.includes("_End");
        
        let cpIcon;
        if (isLaneStart || isLaneEnd) {
          const type = isLaneStart ? "start" : "end";
          const match = cp.checkpoint_name.match(/_Lane(\d+)_/);
          const laneNum = match ? match[1] : String(idx + 1);
          
          const color = type === "start" ? (visited ? "#10b981" : "#22c55e") : (visited ? "#ef4444" : "#dc2626");
          const strokeColor = type === "start" ? "#15803d" : "#b91c1c";
          
          cpIcon = L.divIcon({
            html: `
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; width: 28px; height: 36px; opacity: ${visited ? 1.0 : 0.75};">
                <svg width="28" height="36" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 3px 5px rgba(0,0,0,0.4));">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 9.3 12 18 12 18s12-8.7 12-18c0-6.63-5.37-12-12-12z" fill="${color}" stroke="${strokeColor}" stroke-width="1.5"/>
                  <circle cx="12" cy="12" r="7.5" fill="white"/>
                  <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-family="'Inter', sans-serif" font-weight="900" font-size="8.5" fill="${strokeColor}">${laneNum}</text>
                </svg>
              </div>
            `,
            className: "",
            iconSize: [28, 36],
            iconAnchor: [14, 36],
          });
        } else {
          cpIcon = L.divIcon({
            html: `
              <div style="
                width: 28px;
                height: 28px;
                background: ${visited ? 'rgba(16, 185, 129, 0.22)' : 'rgba(239, 68, 68, 0.22)'};
                border: 2px solid ${visited ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'};
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 5px rgba(0,0,0,0.15);
              ">
                <div style="
                  width: 18px;
                  height: 18px;
                  background: ${visited ? '#10b981' : '#ef4444'};
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: #ffffff;
                  font-family: 'Inter', sans-serif;
                  font-size: 9px;
                  font-weight: 800;
                ">
                  ${idx + 1}
                </div>
              </div>
            `,
            className: "",
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
        }

        const marker = L.marker([cp.latitude, cp.longitude], { icon: cpIcon });
        (marker as any).isVisited = visited;
        markersMap[cp.id] = marker;
        const reason = visitedDetail ? visitedDetail.reason : "";

        marker.bindPopup(`
          <div style="color: #0f172a; font-family: sans-serif; font-size: 13px; line-height: 1.4; padding: 2px; min-width: 150px;">
            <div style="font-weight: 700; border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; margin-bottom: 8px; color: ${visited ? '#10b981' : '#ef4444'}; font-size: 14px;">
              📍 ${formatCheckpointName(cp.checkpoint_name, cp.sequence_order)} (Point #${cp.sequence_order})
            </div>
            <div style="margin-bottom: 4px; display: flex; justify-content: space-between; gap: 12px;">
              <span style="color: #64748b;">Status:</span>
              <span style="font-weight: 700; color: ${visited ? '#10b981' : '#ef4444'};">${visited ? '✅ Visited (Hit)' : '❌ Not Visited'}</span>
            </div>
            ${!visited && reason ? `
            <div style="margin-bottom: 4.5px; display: flex; flex-direction: column; gap: 2px; background: #fef2f2; border: 1px solid #fee2e2; border-radius: 6px; padding: 6px 8px; margin-top: 4px;">
              <span style="color: #dc2626; font-size: 10px; font-weight: 800; text-transform: uppercase; tracking-wider: 0.05em;">⚠️ Miss Reason:</span>
              <span style="font-weight: 700; color: #991b1b; font-size: 11px;">${reason}</span>
            </div>
            ` : ''}
            <div style="margin-bottom: 4px; display: flex; justify-content: space-between; gap: 12px; margin-top: 6px;">
              <span style="color: #64748b;">Radius:</span>
              <span style="font-weight: 600; color: #1e293b;">${cp.radius_meters || 100} meters</span>
            </div>
          </div>
        `);
        
        // Also draw the checkpoint radius circle
        const circle = L.circle([cp.latitude, cp.longitude], {
          radius: cp.radius_meters || 100,
          color: visited ? '#10b981' : '#ef4444',
          weight: 1,
          fillColor: visited ? '#10b981' : '#ef4444',
          fillOpacity: 0.05,
          interactive: false
        });
        (circle as any).isVisited = visited;

        const shouldShowCP = showPlannedRoute && (visited ? showCoveredCheckpoints : showUncoveredCheckpoints);
        if (shouldShowCP) {
          marker.addTo(map);
          circle.addTo(map);
        }

        checkpointMarkers.push(marker);
        checkpointMarkers.push(circle);
      });
      checkpointMarkersRef.current = checkpointMarkers;
      checkpointMarkersMapRef.current = markersMap;
      setCheckpoints(routeCheckpoints.map(cp => {
        const visitedDetail = visitedCheckpointsList.find(vd => vd.checkpoint_id === cp.id);
        return {
          ...cp,
          visited: visitedDetail ? visitedDetail.visited : false,
          reason: visitedDetail ? visitedDetail.reason : ""
        };
      }));

    } catch (err) {
      console.error("Playback load error:", err);
    }
  }, [selectedImei, date, routeIdParam, selectedRouteId, vehicles]);

  // Clear old route when vehicle or date changes (playback loads only on Play button click)
  useEffect(() => {
    clearPlaybackLayers();
  }, [selectedImei, date, clearPlaybackLayers]);

  const handleStop = () => {
    setPlaying(false);
    // Draw the full actual movement trail
    if (matchedCoordsRef.current.length > 0 && activeLineRef.current) {
      activeLineRef.current.setLatLngs(matchedCoordsRef.current);
      activeLineRef.current.bringToFront();
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
    clearPlaybackLayers();
  };

  // Dynamic active trail updating helper
  const updateActiveCoveredLine = useCallback((currentIndex: number) => {
    const L = require("leaflet");
    const map = mapRef.current;
    if (!map || matchedCoordsRef.current.length === 0 || !points[currentIndex]) return;

    // Slice matched road coords up to the current index directly (1-to-1 mapping)
    const coveredCoords = matchedCoordsRef.current.slice(0, currentIndex + 1);

    if (activeLineRef.current) {
      activeLineRef.current.setLatLngs(coveredCoords);
      activeLineRef.current.bringToFront();
    } else {
      activeLineRef.current = L.polyline(coveredCoords, {
        color: "#f97316", // Thick vibrant orange path showing dynamic progress
        weight: 5.5,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round"
      }).addTo(map);
      activeLineRef.current.on('click', handleLineClick);
      activeLineRef.current.bringToFront();
    }
  }, [points]);

  // Handle Playback Intervals (Adjusted by Speed Multiplier)
  useEffect(() => {
    if (!playing || idx >= points.length - 1 || !mapRef.current || !mkRef.current) return;

    const intervalDuration = Math.max(10, 150 / speedMultiplier);

    if (mkRef.current && mkRef.current._icon) {
      mkRef.current._icon.style.transition = `transform ${intervalDuration}ms linear`;
    }

    intervalRef.current = setInterval(() => {
      setIdx((prev) => {
        const next = prev + 1;
        if (next >= points.length) {
          setPlaying(false);
          if (mkRef.current && mkRef.current._icon) {
            mkRef.current._icon.style.transition = 'none';
          }
          return prev;
        }
        const p = points[next];
        const matched = matchedCoordsRef.current[next];
        const targetLat = matched ? matched[0] : p.lat;
        const targetLng = matched ? matched[1] : p.lng;
        
        mkRef.current.setLatLng([targetLat, targetLng]);
        mkRef.current.setPopupContent(getPopupContent(p));
        updateActiveCoveredLine(next);
        return next;
      });
    }, intervalDuration);

    return () => {
      clearInterval(intervalRef.current);
      if (mkRef.current && mkRef.current._icon) {
        mkRef.current._icon.style.transition = 'none';
      }
    };
  }, [playing, points, speedMultiplier, idx, updateActiveCoveredLine]);

  // Scrub Scrubbed Point Sync
  useEffect(() => {
    if (points[idx] && mkRef.current) {
      if (!playing && mkRef.current._icon) {
        mkRef.current._icon.style.transition = 'none';
      }
      const p = points[idx];
      const matched = matchedCoordsRef.current[idx];
      const targetLat = matched ? matched[0] : p.lat;
      const targetLng = matched ? matched[1] : p.lng;

      mkRef.current.setLatLng([targetLat, targetLng]);
      mkRef.current.setPopupContent(getPopupContent(p));
      updateActiveCoveredLine(idx);
    }
  }, [idx, points, updateActiveCoveredLine, playing]);

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

  const p = points[idx];

  // Helper format time
  const formatTimeStr = (t?: string) => {
    if (!t) return "00:00:00";
    return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white text-slate-800 font-sans">
      <style dangerouslySetInnerHTML={{__html: `
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
      <div className="bg-white px-6 py-2 border-b border-slate-200 shrink-0">
        <h2 className="text-base font-bold text-slate-700">Playback</h2>
        <div className="h-[3px] w-8 bg-emerald-500 mt-1"></div>
      </div>

      {/* HORIZONTAL CONTROLS PANEL */}
      <section className="bg-[#f1f5f9] border-b border-slate-200 px-6 py-3.5 z-10 shrink-0 w-full flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3.5 w-full">
          
          {/* Date Picker */}
          <div className="relative min-w-[130px]">
            <input 
              type="date" 
              value={date} 
              onChange={(e) => {
                setDate(e.target.value);
                setRouteIdParam(null);
              }}
              className="w-full bg-white border border-slate-300 px-3 py-1.5 rounded text-sm text-slate-700 focus:border-emerald-500 outline-none transition cursor-pointer font-medium" 
            />
          </div>

          {/* Select Zone */}
          <div className="min-w-[150px]">
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
              className="w-full"
            />
          </div>

          {/* Select Ward */}
          <div className="min-w-[150px]">
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
              className="w-full"
            />
          </div>

          {/* Select Shift */}
          <div className="min-w-[150px]">
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
              className="w-full"
            />
          </div>

          {/* Select Vehicle */}
          <div className="min-w-[170px]">
            <SearchableSelect
              value={selectedImei}
              onChange={handleVehicleSelect}
              options={vehicleOptions}
              placeholder="Select Vehicle"
              className="w-full"
            />
          </div>

          {/* Speed Selector */}
          <div className="min-w-[80px]">
            <select
              value={speedMultiplier}
              onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
              className="w-full bg-white border border-slate-300 px-3 py-1.5 rounded text-sm text-slate-800 focus:border-emerald-500 outline-none transition cursor-pointer font-bold"
            >
              <option value={1}>1X</option>
              <option value={2}>2X</option>
              <option value={4}>4X</option>
              <option value={8}>8X</option>
              <option value={16}>16X</option>
              <option value={32}>32X</option>
              <option value={64}>64X</option>
            </select>
          </div>

          {/* Playback Controls Row */}
          <button
            type="button"
            disabled={!selectedImei}
            onClick={() => {
              if (points.length === 0) {
                loadRoute(true);
              } else {
                setPlaying(!playing);
              }
            }}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-white transition-all duration-200 shadow-md shrink-0 ${
              !selectedImei 
                ? "bg-slate-300 cursor-not-allowed shadow-none" 
                : "bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-emerald-500/20 cursor-pointer hover:shadow-lg"
            }`}
            title={!selectedImei ? "Please select a vehicle first" : playing ? "Pause Playback" : "Start Playback"}
          >
            {playing ? (
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            ) : (
              <svg className="w-3.5 h-3.5 fill-current translate-x-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>

          {/* Stop Button */}
          <button
            type="button"
            disabled={points.length === 0}
            onClick={handleStop}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-white transition-all duration-200 shadow-md shrink-0 ${
              points.length === 0 
                ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none" 
                : "bg-rose-600 hover:bg-rose-700 active:scale-95 shadow-rose-500/20 cursor-pointer hover:shadow-lg"
            }`}
            title="Show Full Route / Stop Playback"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
          </button>

          {/* Reset Button */}
          <button
            type="button"
            onClick={handleReset}
            className="w-8 h-8 rounded-full bg-slate-500 hover:bg-slate-600 active:scale-95 text-white flex items-center justify-center shadow-md shadow-slate-500/20 transition-all shrink-0 cursor-pointer hover:shadow-lg"
            title="Reset Filters and Playback"
          >
            <svg className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>

        {/* Playback Progress timeline scrub slider - Always visible */}
        <div className="w-full flex items-center gap-3 mt-1">
          <span className="text-xs font-semibold font-mono text-slate-500 w-14 shrink-0 text-left">
            {points.length > 0 ? formatTimeStr(p?.time) : "00:00:00"}
          </span>
          <input 
            type="range" 
            min={0} 
            max={points.length > 0 ? points.length - 1 : 100} 
            value={points.length > 0 ? idx : 0}
            disabled={points.length === 0}
            onChange={(e) => { 
              if (points.length > 0) {
                setPlaying(false); 
                setIdx(Number(e.target.value)); 
              }
            }}
            className="flex-1 h-1.5 rounded-full cursor-pointer bg-slate-200 accent-sky-500 appearance-none outline-none"
          />
          <span className="text-xs font-semibold font-mono text-slate-500 w-14 shrink-0 text-right">
            {points.length > 0 ? formatTimeStr(points[points.length - 1]?.time) : "00:00:00"}
          </span>
        </div>
      </section>

      {/* Split map layout */}
      <div className="flex-1 relative flex flex-col md:flex-row overflow-hidden">
        
        {/* Leaflet Map takes full size */}
        <div ref={box} className="flex-1 w-full h-full z-0 bg-theme-base" />

        {/* Custom Orange Map Indication Button matching screenshot */}
        <div className={`absolute top-3 z-[1000] flex flex-col items-end transition-all duration-300 ${
          stoppages.length > 0 ? 'right-[280px]' : 'right-4'
        }`}>
          <div 
            onClick={() => setShowMapIndicationMenu(!showMapIndicationMenu)}
            className="bg-[#f59e0b] hover:bg-amber-600 text-white px-3 py-1.5 text-xs font-bold uppercase rounded shadow-md tracking-wider flex items-center gap-1 cursor-pointer transition select-none"
          >
            <span>Map Indication</span>
          </div>

          {showMapIndicationMenu && (
            <div className="mt-1 bg-white border border-slate-200 rounded-lg shadow-2xl p-3 w-64 flex flex-col gap-2 z-[1000]">
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
                        className="rounded text-emerald-600 focus:ring-0 w-3 h-3"
                      />
                      <span>Covered Lane Points (Hit)</span>
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer select-none hover:text-slate-800">
                      <input 
                        type="checkbox" 
                        checked={showUncoveredCheckpoints} 
                        onChange={(e) => setShowUncoveredCheckpoints(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-0 w-3 h-3"
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
                        className="rounded text-emerald-600 focus:ring-0 w-3 h-3"
                      />
                      <span>Major Stops (≥ 10 mins)</span>
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer select-none hover:text-slate-800">
                      <input 
                        type="checkbox" 
                        checked={showMiniStoppages} 
                        onChange={(e) => setShowMiniStoppages(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-0 w-3 h-3"
                      />
                      <span>Mini Stops (&lt; 10 mins)</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Floating checkpoints sidebar if checkpoints exist */}
        {checkpoints.length > 0 && (
          <div className={`absolute top-4 left-4 z-[1000] w-64 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 p-4 shadow-2xl ${checkpointsCollapsed ? 'max-h-12 overflow-hidden pb-0' : 'max-h-[calc(100%-32px)]'} flex flex-col transition-all duration-300`}>
            <h3 
              onClick={() => setCheckpointsCollapsed(!checkpointsCollapsed)}
              className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-3 flex items-center justify-between shrink-0 border-b border-slate-100 pb-2 cursor-pointer select-none"
            >
              <span className="flex items-center gap-1.5">
                📍 Checkpoints ({checkpoints.filter(cp => cp.visited).length}/{checkpoints.length} Hit)
              </span>
              <span className="text-slate-400 text-sm font-semibold transition-transform">
                {checkpointsCollapsed ? "▲" : "▼"}
              </span>
            </h3>
            {!checkpointsCollapsed && (
              <div className="space-y-2 flex-1 overflow-y-auto pr-0.5 custom-scrollbar">
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
                    className={`w-full text-left p-2.5 border rounded-xl text-xs transition flex items-center justify-between group active:scale-98 ${
                      cp.visited 
                        ? 'bg-emerald-50/50 hover:bg-emerald-50 border-emerald-100 hover:border-emerald-200' 
                        : 'bg-rose-50/30 hover:bg-rose-50/70 border-rose-100 hover:border-rose-200'
                    }`}
                  >
                    <div className="space-y-0.5 max-w-[70%]">
                      <span className={`font-extrabold block truncate ${cp.visited ? 'text-emerald-600' : 'text-rose-500'}`}>
                        #{cp.sequence_order} {formatCheckpointName(cp.checkpoint_name, cp.sequence_order)}
                      </span>
                      <span className="text-[9px] text-slate-400 block font-normal">
                        Radius: {cp.radius_meters || 100}m
                      </span>
                      {!cp.visited && cp.reason && (
                        <span className="text-[9.5px] text-rose-600 font-semibold block mt-1.5 leading-tight italic bg-rose-50/70 border border-rose-100 px-1.5 py-0.5 rounded">
                          ⚠️ {cp.reason}
                        </span>
                      )}
                    </div>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg transition duration-200 ${
                      cp.visited 
                        ? 'bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200' 
                        : 'bg-rose-100 text-rose-600 group-hover:bg-rose-200'
                    }`}>
                      {cp.visited ? 'HIT' : 'MISSED'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Floating stoppages sidebar if stoppages exist */}
        {stoppages.length > 0 && (
          <div className={`absolute top-4 right-4 z-[1000] w-64 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 p-4 shadow-2xl ${stoppagesCollapsed ? 'max-h-12 overflow-hidden pb-0' : 'max-h-[calc(100%-32px)]'} flex flex-col transition-all duration-300`}>
            <h3 
              onClick={() => setStoppagesCollapsed(!stoppagesCollapsed)}
              className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-3 flex items-center justify-between shrink-0 border-b border-slate-100 pb-2 cursor-pointer select-none"
            >
              <span className="flex items-center gap-1.5">
                🛑 Stoppages ({
                  stoppages.filter(s => {
                    const mins = Math.max(1, Math.round(s.durationSeconds / 60));
                    const isMajor = mins >= 10;
                    if (isMajor && !showMajorStoppages) return false;
                    if (!isMajor && !showMiniStoppages) return false;
                    return true;
                  }).length
                })
              </span>
              <span className="text-slate-400 text-sm font-semibold transition-transform">
                {stoppagesCollapsed ? "▲" : "▼"}
              </span>
            </h3>
            {!stoppagesCollapsed && (
              <div className="space-y-2 flex-1 overflow-y-auto pr-0.5 custom-scrollbar">
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
                    className="w-full text-left p-2.5 bg-slate-50 hover:bg-red-50 border border-slate-100 hover:border-red-200 rounded-xl text-xs transition flex items-center justify-between group active:scale-98"
                  >
                    <div className="space-y-0.5">
                      <span className="font-extrabold text-red-500 block">Stoppage #{i + 1}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className="text-[10px] font-black bg-red-100 text-red-600 group-hover:bg-red-200 px-2 py-0.5 rounded-lg transition duration-200">
                       {formatStoppageDuration(s.durationSeconds)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
