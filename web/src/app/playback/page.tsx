"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { Vehicle, GpsDataPoint } from "@/lib/types";

export default function PlaybackPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [imei, setImei] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [points, setPoints] = useState<GpsDataPoint[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const mkRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    api<{ data: Vehicle[] }>("/api/vehicles").then((r) => setVehicles(r.data || [])).catch(() => { });
  }, []);

  // Init map
  useEffect(() => {
    if (typeof window === "undefined" || !box.current || mapRef.current) return;
    const L = require("leaflet");
    mapRef.current = L.map(box.current).setView([26.9124, 75.7873], 13);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(mapRef.current);
  }, []);

  const loadRoute = useCallback(async () => {
    if (!imei || !date) return;
    const from = `${date}T00:00:00.000Z`;
    const to = `${date}T23:59:59.999Z`;
    const r = await api<{ data: GpsDataPoint[] }>(`/api/gps-data/${imei}?from=${from}&to=${to}`);
    const data = r.data || [];
    setPoints(data);
    setIdx(0);
    setPlaying(false);

    const L = require("leaflet");
    const map = mapRef.current;
    if (!map) return;
    if (lineRef.current) map.removeLayer(lineRef.current);
    if (mkRef.current) map.removeLayer(mkRef.current);
    if (data.length === 0) return;

    const ll = data.map((p) => [p.latitude, p.longitude] as [number, number]);
    lineRef.current = L.polyline(ll, { color: "#6366f1", weight: 3, opacity: .7 }).addTo(map);
    map.fitBounds(lineRef.current.getBounds(), { padding: [40, 40] });
    mkRef.current = L.circleMarker(ll[0], { radius: 8, fillColor: "#22c55e", fillOpacity: 1, color: "#fff", weight: 2 }).addTo(map);
  }, [imei, date]);

  // Playback animation
  useEffect(() => {
    if (!playing || points.length === 0) return;
    intervalRef.current = setInterval(() => {
      setIdx((prev) => {
        if (prev >= points.length - 1) { setPlaying(false); return prev; }
        const next = prev + 1;
        const p = points[next];
        if (mkRef.current) mkRef.current.setLatLng([p.latitude, p.longitude]);
        return next;
      });
    }, 150);
    return () => clearInterval(intervalRef.current);
  }, [playing, points]);

  // Scrub
  useEffect(() => {
    if (points[idx] && mkRef.current) mkRef.current.setLatLng([points[idx].latitude, points[idx].longitude]);
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
                {p ? <><b>{new Date(p.timestamp).toLocaleTimeString()}</b> — {p.speed} km/h — Pt {idx + 1}/{points.length}</> : ""}
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
          {points.length === 0 && imei && <p className="text-xs text-slate-600 mt-2">No data for this date.</p>}
        </div>
      </div>
    </div>
  );
}
