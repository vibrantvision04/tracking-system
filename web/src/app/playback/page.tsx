"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { Vehicle, GpsDataPoint } from "@/lib/types";

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
      // If speed is > 120km/h and distance is > 0.05km, it's likely a GPS jump
      if (speedKmh > 120 && distKm > 0.05) {
        continue; // Skip outlier
      }
    }
    filtered.push(curr);
  }

  // 2. Moving Average Smoothing (Window size = 5)
  const smoothed: GpsDataPoint[] = [];
  const windowSize = 2; // 2 before, 2 after = 5 total
  for (let i = 0; i < filtered.length; i++) {
    const start = Math.max(0, i - windowSize);
    const end = Math.min(filtered.length - 1, i + windowSize);

    let sumLat = 0;
    let sumLng = 0;
    let count = 0;

    for (let j = start; j <= end; j++) {
      sumLat += filtered[j].lat;
      sumLng += filtered[j].lng;
      count++;
    }

    smoothed.push({
      ...filtered[i],
      lat: sumLat / count,
      lng: sumLng / count
    });
  }

  return smoothed;
}

function downsampleForOsrm(points: GpsDataPoint[]): GpsDataPoint[] {
  if (points.length < 2) return points;
  const result: GpsDataPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const dist = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng) * 1000;
    // Keep points if they are > 30 meters apart to drastically reduce payload
    if (dist > 30) {
      result.push(curr);
    }
  }
  if (result[result.length - 1] !== points[points.length - 1]) {
    result.push(points[points.length - 1]);
  }
  return result;
}

async function fetchMapMatchedRoute(points: GpsDataPoint[]): Promise<[number, number][]> {
  const downsampled = downsampleForOsrm(points);
  const CHUNK_SIZE = 90; // OSRM has a limit of 100 coordinates
  const fetchPromises: Promise<[number, number][]>[] = [];

  for (let i = 0; i < downsampled.length; i += CHUNK_SIZE) {
    const chunk = downsampled.slice(i, i + CHUNK_SIZE);
    if (chunk.length < 2) {
      if (chunk.length === 1) fetchPromises.push(Promise.resolve([[chunk[0].lat, chunk[0].lng]]));
      continue;
    }

    const coordsStr = chunk.map(p => `${p.lng},${p.lat}`).join(';');
    const radiusesStr = chunk.map(() => '50').join(';'); // 50m search radius

    const p = fetch(
      `https://router.project-osrm.org/match/v1/driving/${coordsStr}?radiuses=${radiusesStr}&geometries=geojson&overview=full`
    )
    .then(res => {
      if (!res.ok) throw new Error("OSRM Error");
      return res.json();
    })
    .then(data => {
      const matchedCoords: [number, number][] = [];
      if (data.code === 'Ok' && data.matchings && data.matchings.length > 0) {
        data.matchings.forEach((m: any) => {
          if (m.geometry && m.geometry.coordinates) {
            m.geometry.coordinates.forEach((coord: [number, number]) => {
              // OSRM returns [lng, lat], Leaflet wants [lat, lng]
              matchedCoords.push([coord[1], coord[0]]);
            });
          }
        });
      } else {
        chunk.forEach(p => matchedCoords.push([p.lat, p.lng]));
      }
      return matchedCoords;
    })
    .catch(err => {
      console.error("OSRM Match failed:", err);
      // Fallback
      return chunk.map(p => [p.lat, p.lng] as [number, number]);
    });

    fetchPromises.push(p);
  }

  const results = await Promise.all(fetchPromises);
  const matchedCoordinates: [number, number][] = [];
  results.forEach(res => matchedCoordinates.push(...res));
  return matchedCoordinates;
}

function detectStoppages(points: GpsDataPoint[]): StoppagePoint[] {
  const stoppages: StoppagePoint[] = [];
  const minStoppageDuration = 60; // 60 seconds
  const maxStoppageRadiusKm = 0.03; // 30 meters

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

export default function PlaybackPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [imei, setImei] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [routeId, setRouteId] = useState("");
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
  const assignedRouteLayerRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  const jumpToKeyframe = useCallback((index: number) => {
    setPlaying(false);
    setIdx(index);
    const p = points[index];
    if (p) {
      const map = mapRef.current;
      if (map) {
        map.panTo([p.lat, p.lng]);
      }
      if (mkRef.current) {
        mkRef.current.setLatLng([p.lat, p.lng]);
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

  useEffect(() => {
    api<{ data: Vehicle[] }>("/api/vehicles").then((r) => setVehicles(r.data || [])).catch(() => { });

    // Auto-load from URL parameters if present
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlImei = params.get("imei");
      const urlDate = params.get("date");
      const urlRouteId = params.get("route_id");
      if (urlImei) setImei(urlImei);
      if (urlDate) setDate(urlDate);
      if (urlRouteId) setRouteId(urlRouteId);
    }
  }, []);

  // Init map
  useEffect(() => {
    if (typeof window === "undefined" || !box.current || mapRef.current) return;
    const L = require("leaflet");
    mapRef.current = L.map(box.current).setView([26.9124, 75.7873], 13);

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

    L.control.layers({
      "Google Maps (Default)": googleMapLayer,
      "Google Satellite + Labels": googleHybridLayer,
      "Dark Map": darkLayer
    }, {}, { position: 'topright' }).addTo(mapRef.current);

    // Add cleanup to clear references
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const loadRoute = useCallback(async () => {
    if (!imei || !date) return;
    const from = `${date}T00:00:00.000Z`;
    const to = `${date}T23:59:59.999Z`;

    try {
      const r = await api<{ data: GpsDataPoint[] }>(`/api/gps-data/${imei}?from=${from}&to=${to}`);
      const data = r.data || [];
      const validPointsRaw = data.filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number' && p.lat !== 0);
      const validPoints = smoothGpsTrace(validPointsRaw);
      setPoints(validPoints);
      setIdx(0);
      setPlaying(false);

      const L = require("leaflet");
      const map = mapRef.current;
      if (!map) return;
      if (lineRef.current) map.removeLayer(lineRef.current);
      if (mkRef.current) map.removeLayer(mkRef.current);

      // Clear previous stoppage and checkpoint markers
      if (stoppageMarkersRef.current) {
        stoppageMarkersRef.current.forEach((marker: any) => map.removeLayer(marker));
        stoppageMarkersRef.current = [];
      }
      if (checkpointMarkersRef.current) {
        checkpointMarkersRef.current.forEach((marker: any) => map.removeLayer(marker));
        checkpointMarkersRef.current = [];
      }
      if (assignedRouteLayerRef.current) {
        map.removeLayer(assignedRouteLayerRef.current);
        assignedRouteLayerRef.current = null;
      }
      setStoppages([]);
      setCheckpoints([]);

      if (validPoints.length === 0) return;

      // 1. Get raw/smoothed coordinates to associate with playback index
      const baseCoords = validPoints.map((p) => [p.lat, p.lng] as [number, number]);

      // 2. Fetch Map Matched Polyline for beautiful tracing on the road
      const matchedCoords = await fetchMapMatchedRoute(validPoints);

      // Draw the beautiful map-matched polyline
      lineRef.current = L.polyline(matchedCoords, { color: "#8b5cf6", weight: 4, opacity: 0.8 }).addTo(map);

      // Fit map to bounds
      map.fitBounds(lineRef.current.getBounds(), { padding: [50, 50] });

      mkRef.current = L.circleMarker(baseCoords[0], { radius: 8, fillColor: "#22c55e", fillOpacity: 1, color: "#fff", weight: 2 })
        .bindPopup(getPopupContent(validPoints[0]))
        .addTo(map);

      // Detect and add stoppage markers
      const detectedStoppages = detectStoppages(validPoints);
      setStoppages(detectedStoppages);

      detectedStoppages.forEach((s, i) => {
        const marker = L.circleMarker([s.lat, s.lng], {
          radius: 7,
          fillColor: "#ef4444",
          fillOpacity: 0.9,
          color: "#fff",
          weight: 1.5
        }).addTo(map);

        const stopPopupContent = `
          <div style="color: #0f172a; font-family: sans-serif; font-size: 13px; line-height: 1.4; min-width: 160px; padding: 2px;">
            <div style="font-weight: 700; border-bottom: 1px dashed #ef4444; padding-bottom: 6px; margin-bottom: 8px; color: #dc2626; font-size: 14px; display: flex; align-items: center; gap: 4px;">
              🛑 <span>Stoppage #${i + 1}</span>
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
              <span style="font-weight: 700; color: #dc2626;">${formatStoppageDuration(s.durationSeconds)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px;">
              <span style="color: #64748b;">Coord:</span>
              <span style="font-weight: 500; color: #334155; font-size: 11px;">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</span>
            </div>
            <div style="border-top: 1px solid #f1f5f9; padding-top: 6px;">
              <button 
                onclick="window.jumpToKeyframe(${s.startIndex})"
                style="background: #ef4444; color: #fff; border: none; padding: 6px 8px; font-size: 11px; font-weight: 600; cursor: pointer; border-radius: 6px; width: 100%; transition: background 0.2s;"
              >
                🔍 Focus on Playback
              </button>
            </div>
          </div>
        `;
        marker.bindPopup(stopPopupContent);
        stoppageMarkersRef.current.push(marker);
      });

      // Fetch and plot assigned route and checkpoints
      if (routeId && routeId !== "undefined" && routeId !== "null" && routeId !== "0") {
        try {
          // 1. Fetch checkpoints
          const cpRes = await api<{ data: any[] }>(`/api/routes/${routeId}/checkpoints`);
          const cpData = cpRes.data || [];
          setCheckpoints(cpData);

          // Calculate hits locally based on the purple map-matched line (matchedCoords)
          // This ensures the visual green/red status perfectly matches the drawn line!
          const hitCheckpoints = new Set<number>();
          cpData.forEach(cp => {
            const tolerance = 10; // Force 10m tolerance for all checkpoints
            for (let i = 0; i < matchedCoords.length; i++) {
              // matchedCoords is an array of [lat, lng]
              const dist = haversineDistance(matchedCoords[i][0], matchedCoords[i][1], cp.latitude, cp.longitude) * 1000;
              if (dist <= tolerance) {
                hitCheckpoints.add(cp.id);
                break;
              }
            }
          });

          cpData.forEach((cp, i) => {
            const isHit = hitCheckpoints.has(cp.id);
            const fillColor = isHit ? "#22c55e" : "#ef4444"; // Green for hit, Red for missed

            const cpMarker = L.circleMarker([cp.latitude, cp.longitude], {
              radius: 6,
              fillColor: fillColor,
              fillOpacity: 0.9,
              color: "#fff",
              weight: 1.5,
              dashArray: "2,2"
            }).addTo(map);

            const cpPopup = `
              <div style="color: #0f172a; font-family: sans-serif; font-size: 13px; line-height: 1.4; padding: 2px;">
                <div style="font-weight: 700; border-bottom: 1px dashed ${fillColor}; padding-bottom: 6px; margin-bottom: 8px; color: ${fillColor}; font-size: 14px; display: flex; align-items: center; gap: 4px;">
                  📍 <span>Checkpoint ${cp.sequence_order > 0 ? '#' + cp.sequence_order : ''}</span>
                </div>
                <div style="margin-bottom: 4px; display: flex; justify-content: space-between; gap: 12px;">
                  <span style="color: #64748b;">Name:</span>
                  <span style="font-weight: 600; color: #1e293b;">${cp.checkpoint_name}</span>
                </div>
                <div style="margin-bottom: 4px; display: flex; justify-content: space-between; gap: 12px;">
                  <span style="color: #64748b;">Radius:</span>
                  <span style="font-weight: 600; color: #1e293b;">10m</span>
                </div>
                <div style="margin-bottom: 4px; display: flex; justify-content: space-between; gap: 12px;">
                  <span style="color: #64748b;">Status:</span>
                  <span style="font-weight: 700; color: ${fillColor};">${isHit ? 'COVERED' : 'MISSED'}</span>
                </div>
              </div>
            `;
            cpMarker.bindPopup(cpPopup);
            checkpointMarkersRef.current.push(cpMarker);
          });

          // 2. Fetch route geometry
          const routesRes = await api<{ data: any[] }>("/api/routes");
          const assignedRoute = (routesRes.data || []).find((r: any) => r.id === parseInt(routeId));
          if (assignedRoute) {
            if (assignedRoute.geojson) {
              try {
                const geoData = JSON.parse(assignedRoute.geojson);
                assignedRouteLayerRef.current = L.geoJSON(geoData, {
                  style: {
                    color: "#3b82f6", // Blue for planned route
                    weight: 5,
                    opacity: 0.6
                  }
                }).addTo(map);
              } catch (e) {
                console.error("Failed to parse route geojson", e);
              }
            } else if (assignedRoute.lanes && Array.isArray(assignedRoute.lanes)) {
              // Fallback to dotted line if no geojson is present
              const pts: [number, number][] = [];
              assignedRoute.lanes.forEach((lane: any) => {
                if (lane.startLat && lane.startLng) pts.push([lane.startLat, lane.startLng]);
                if (lane.endLat && lane.endLng) pts.push([lane.endLat, lane.endLng]);
              });
              if (pts.length > 0) {
                assignedRouteLayerRef.current = L.polyline(pts, {
                  color: "#eab308",
                  weight: 4,
                  opacity: 0.8,
                  dashArray: "8, 8"
                }).addTo(map);
              }
            }
          }

        } catch (err) {
          console.error("Failed to load checkpoints or route", err);
        }
      }

    } catch (err) {
      console.error("Playback load error:", err);
    }
  }, [imei, date, routeId]);

  // Auto-load route if imei and date were set from URL parameters
  const hasAutoLoaded = useRef(false);
  useEffect(() => {
    if (imei && date && mapRef.current && !hasAutoLoaded.current) {
      if (typeof window !== "undefined" && window.location.search.includes(imei)) {
        hasAutoLoaded.current = true;
        loadRoute();
      }
    }
  }, [imei, date, loadRoute]);

  // Playback animation
  useEffect(() => {
    if (!playing || idx >= points.length - 1 || !mapRef.current || !mkRef.current) return;

    intervalRef.current = setInterval(() => {
      setIdx((prev) => {
        const next = prev + 1;
        if (next >= points.length) {
          setPlaying(false);
          return prev;
        }
        const p = points[next];
        mkRef.current.setLatLng([p.lat, p.lng]);
        mkRef.current.setPopupContent(getPopupContent(p));
        return next;
      });
    }, 150);
    return () => clearInterval(intervalRef.current);
  }, [playing, points]);

  // Scrub
  useEffect(() => {
    if (points[idx] && mkRef.current) {
      const p = points[idx];
      mkRef.current.setLatLng([p.lat, p.lng]);
      mkRef.current.setPopupContent(getPopupContent(p));
    }
  }, [idx, points]);

  const p = points[idx];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="hidden md:flex h-14 bg-[var(--bg-card)] px-6 items-center border-b border-white/[.05] shrink-0">
        <h1 className="text-sm font-semibold tracking-tight">⏪ Route Playback</h1>
        {points.length > 0 && <span className="ml-auto text-xs text-slate-500">{points.length} GPS points loaded</span>}
      </header>
      <div className="flex-1 relative flex flex-col">
        <div ref={box} className="flex-1 w-full h-full" />

        {/* Control Panel */}
        <div className="absolute top-4 left-4 right-4 sm:right-auto sm:w-[300px] bg-[rgba(15,21,37,.95)] backdrop-blur-2xl rounded-xl border border-white/[.06] z-[1000] p-4 shadow-2xl">
          <div className="space-y-2 mb-3">
            <select value={imei} onChange={(e) => setImei(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-white/[.06] rounded-lg text-[13px] text-white outline-none">
              <option value="">Select vehicle…</option>
              {vehicles.filter((v) => v.gps_device).map((v) => (
                <option key={v.id} value={v.gps_device!.imei}>{v.registration_no} — {v.vehicle_type?.name || ""}</option>
              ))}
            </select>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-white/[.06] rounded-lg text-[13px] text-white outline-none" />
            <input type="text" placeholder="Route ID (optional)" value={routeId} onChange={(e) => setRouteId(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-white/[.06] rounded-lg text-[13px] text-white outline-none" />
            <button onClick={loadRoute} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg font-medium transition">▶ Load Route</button>
          </div>

          {points.length > 0 && (
            <div className="border-t border-white/[.05] pt-3 space-y-2">
              <div className="text-xs text-slate-400">
                {p ? <><b>{new Date(p.time).toLocaleTimeString()}</b> — {p.speed} km/h — Pt {idx + 1}/{points.length}</> : ""}
              </div>
              <input type="range" min={0} max={points.length - 1} value={idx}
                onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
                className="w-full accent-indigo-500" />
              <div className="flex gap-2">
                <button onClick={() => { setPlaying(false); setIdx(Math.max(0, idx - 1)); }}
                  className="flex-1 py-1.5 bg-[var(--bg-surface)] border border-white/[.06] rounded-lg text-xs text-white hover:bg-indigo-600 transition">⏮</button>
                <button onClick={() => setPlaying(!playing)}
                  className="flex-[2] py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition">
                  {playing ? "⏸ Pause" : "▶ Play"}
                </button>
                <button onClick={() => { setPlaying(false); setIdx(Math.min(points.length - 1, idx + 1)); }}
                  className="flex-1 py-1.5 bg-[var(--bg-surface)] border border-white/[.06] rounded-lg text-xs text-white hover:bg-indigo-600 transition">⏭</button>
              </div>
            </div>
          )}

          {/* Stoppages List */}
          {stoppages.length > 0 && (
            <div className="border-t border-white/[.05] pt-3 mt-3 max-h-[180px] overflow-y-auto pr-1">
              <h3 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                🛑 Stoppage Points ({stoppages.length})
              </h3>
              <div className="space-y-1.5">
                {stoppages.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => jumpToKeyframe(s.startIndex)}
                    className="w-full text-left px-2 py-1.5 bg-[var(--bg-surface)] hover:bg-red-500/10 border border-white/[.05] hover:border-red-500/30 rounded-lg text-xs transition flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-red-400">Stop #{i + 1}</span>
                      <span className="text-[10px] text-slate-400 ml-2">
                        {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded font-medium">
                      {formatStoppageDuration(s.durationSeconds)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {points.length === 0 && imei && <p className="text-xs text-slate-600 mt-2">No data for this date.</p>}
        </div>
      </div>
    </div>
  );
}
