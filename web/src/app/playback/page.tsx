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
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
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
  const [points, setPoints] = useState<GpsDataPoint[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [stoppages, setStoppages] = useState<StoppagePoint[]>([]);

  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const mkRef = useRef<any>(null);
  const stoppageMarkersRef = useRef<any[]>([]);
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
  }, []);

  // Init map
  useEffect(() => {
    if (typeof window === "undefined" || !box.current || mapRef.current) return;
    const L = require("leaflet");
    mapRef.current = L.map(box.current).setView([26.9124, 75.7873], 13);
    
    const darkLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© CARTO © OSM", maxZoom: 19, noWrap: true
    });

    const streetLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap", maxZoom: 19, noWrap: true
    });

    const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "© Esri", maxZoom: 19, noWrap: true
    });

    const satelliteHybrid = L.layerGroup([
      satelliteLayer,
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
        attribution: "Labels © CARTO", maxZoom: 19, noWrap: true
      })
    ]);

    darkLayer.addTo(mapRef.current);

    L.control.layers({
      "Dark Map": darkLayer,
      "Street Map": streetLayer,
      "Satellite (No Labels)": satelliteLayer,
      "Satellite + Labels": satelliteHybrid
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
      const validPoints = data.filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number' && p.lat !== 0);
      setPoints(validPoints);
      setIdx(0);
      setPlaying(false);

      const L = require("leaflet");
      const map = mapRef.current;
      if (!map) return;
      if (lineRef.current) map.removeLayer(lineRef.current);
      if (mkRef.current) map.removeLayer(mkRef.current);

      // Clear previous stoppage markers
      if (stoppageMarkersRef.current) {
        stoppageMarkersRef.current.forEach((marker: any) => map.removeLayer(marker));
        stoppageMarkersRef.current = [];
      }
      setStoppages([]);

      if (validPoints.length === 0) return;

      const ll = validPoints.map((p) => [p.lat, p.lng] as [number, number]);
      lineRef.current = L.polyline(ll, { color: "#6366f1", weight: 3, opacity: .7 }).addTo(map);
      
      const bounds = lineRef.current.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
      
      mkRef.current = L.circleMarker(ll[0], { radius: 8, fillColor: "#22c55e", fillOpacity: 1, color: "#fff", weight: 2 })
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
    } catch (err) {
      console.error("Playback load error:", err);
    }
  }, [imei, date]);

  // Playback animation
  useEffect(() => {
    if (!playing || points.length === 0) return;
    intervalRef.current = setInterval(() => {
      setIdx((prev) => {
        if (prev >= points.length - 1) { setPlaying(false); return prev; }
        const next = prev + 1;
        const p = points[next];
        if (mkRef.current) {
          mkRef.current.setLatLng([p.lat, p.lng]);
          mkRef.current.setPopupContent(getPopupContent(p));
        }
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
                      <span className="font-semibold text-red-400">Stop #{i+1}</span>
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
