"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Vehicle, LivePosition } from "@/lib/types";
import { api, wsUrl } from "@/lib/api";
import { useStore } from "@/lib/store";

interface Props { vehicles: Vehicle[] }

export default function LiveMap({ vehicles }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef<Record<string, L.Marker>>({});
  const box = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [livePos, setLivePos] = useState<Record<string, LivePosition>>({});

  // ─── Init Map ───
  useEffect(() => {
    if (!box.current || mapRef.current) return;
    const m = L.map(box.current, { 
      zoomControl: true,
      minZoom: 5, // Allow zooming out to see the whole country
      maxBounds: [
        [6.0, 68.0],  // South West bounds of India
        [38.0, 98.0]  // North East bounds of India
      ],
      maxBoundsViscosity: 1.0 // Bounce back when panning out of bounds
    }).setView([26.9124, 75.7873], 13);
    
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© CARTO © OSM", 
      maxZoom: 19,
      noWrap: true // Prevent horizontal repeating
    }).addTo(m);
    
    mapRef.current = m;
    return () => { m.remove(); mapRef.current = null; };
  }, []);

  // ─── Marker helper ───
  const upsertMarker = useCallback((imei: string, lat: number, lng: number, speed: number, ignition: boolean, regNo: string, typeName: string) => {
    if (!mapRef.current) return;
    const color = speed > 3 ? "#22c55e" : speed > 0 ? "#f59e0b" : "#ef4444";
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,.85);box-shadow:0 0 10px ${color}"></div>`,
      iconSize: [14, 14], iconAnchor: [7, 7],
    });
    if (markers.current[imei]) {
      markers.current[imei].setLatLng([lat, lng]).setIcon(icon);
    } else {
      markers.current[imei] = L.marker([lat, lng], { icon }).addTo(mapRef.current);
    }
    markers.current[imei].bindPopup(`
      <div style="font-family:Inter,sans-serif;min-width:170px;font-size:12px;">
        <div style="font-weight:700;font-size:13px;margin-bottom:2px;">${regNo}</div>
        <div style="color:#888;margin-bottom:6px;">${typeName}</div>
        <div style="display:flex;gap:10px;margin-bottom:4px;">
          <span>Speed: <b>${speed} km/h</b></span>
          <span style="color:${ignition ? "#22c55e" : "#ef4444"}">Ignition: <b>${ignition ? "ON" : "OFF"}</b></span>
        </div>
        <div style="color:#6366f1;font-size:11px;margin-top:4px;">IMEI: ${imei}</div>
      </div>
    `);
  }, []);

  // ─── Place initial markers & auto-fit bounds ───
  useEffect(() => {
    if (!mapRef.current) return;
    const bounds = L.latLngBounds([]);
    let hasMarkers = false;

    vehicles.forEach((v) => {
      const imei = v.gps_device?.imei;
      if (!imei) return;
      const pos = livePos[imei];
      if (pos) {
        upsertMarker(imei, pos.lat, pos.lng, pos.speed, !!pos.ignition, v.registration_no, v.vehicle_type?.name || "Vehicle");
        bounds.extend([pos.lat, pos.lng]);
        hasMarkers = true;
      }
    });

    // Auto-fit the map to show all vehicles when positions first load
    if (hasMarkers && Object.keys(livePos).length > 0 && !selected) {
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: false });
    }
  }, [vehicles, livePos, upsertMarker, selected]);

  const vehiclesRef = useRef(vehicles);
  useEffect(() => { vehiclesRef.current = vehicles; }, [vehicles]);

  // ─── WebSocket for real-time GPS ───
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnect: ReturnType<typeof setTimeout>;
    let isMounted = true;
    
    const connect = () => {
      if (!isMounted) return;
      try {
        const url = wsUrl();
        ws = new WebSocket(url);
        
        ws.onopen = () => {
          if (isMounted) console.log("WebSocket connected to", url);
        };

        ws.onmessage = (e) => {
          if (!isMounted) return;
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "gps_update") {
              const imei = msg.imei;
              setLivePos((prev) => ({ ...prev, [imei]: msg }));
              
              // If this is a new vehicle we haven't seen in our list, fetch its metadata
              const knownVehicles = vehiclesRef.current;
              if (!knownVehicles.find(v => v.gps_device?.imei === imei)) {
                api<{ data: Vehicle }>(`/api/vehicles/imei/${imei}`).then(res => {
                  if (res.data) {
                    useStore.getState().addOrUpdateVehicle(res.data);
                  }
                }).catch(() => {});
              }
              
              const v = vehiclesRef.current.find((vv) => vv.gps_device?.imei === msg.imei);
              upsertMarker(msg.imei, msg.lat, msg.lng, msg.speed, !!msg.ignition, v?.registration_no || msg.imei, v?.vehicle_type?.name || "");
            }
            if (msg.type === "snapshot" && Array.isArray(msg.data)) {
              const map: Record<string, LivePosition> = {};
              msg.data.forEach((p: LivePosition) => { map[p.imei] = p; });
              setLivePos((prev) => ({ ...prev, ...map }));
            }
          } catch (err) {
            if (isMounted) console.error("WS Message Error:", err);
          }
        };

        ws.onclose = (e) => {
          if (!isMounted) return;
          console.log("WebSocket closed:", e.code, e.reason);
          reconnect = setTimeout(connect, 3000);
        };

        ws.onerror = (err) => {
          // Only log if we haven't unmounted, otherwise it's likely an abort error
          if (isMounted) console.error("WebSocket Error:", err);
        };
      } catch (err) {
        if (isMounted) console.error("WS Connect Error:", err);
      }
    };

    // Connect instantly without delay
    connect();

    return () => {
      isMounted = false;
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
      clearTimeout(reconnect);
    };
  }, [upsertMarker]);

  // ─── Filter & Dynamic Status ───
  const getStatus = (imei: string) => {
    const pos = livePos[imei];
    if (!pos) return "offline";
    if (pos.speed > 5) return "running";
    if (pos.speed > 0) return "idle";
    return "stopped";
  };

  const processedVehicles = vehicles.map(v => ({
    ...v,
    realStatus: getStatus(v.gps_device?.imei || "")
  }));

  const filtered = processedVehicles.filter((v) =>
    v.registration_no.toLowerCase().includes(search.toLowerCase()) ||
    (v.vehicle_type?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const counts = {
    running: processedVehicles.filter((v) => v.realStatus === "running").length,
    idle: processedVehicles.filter((v) => v.realStatus === "idle").length,
    stopped: processedVehicles.filter((v) => v.realStatus === "stopped").length,
    offline: processedVehicles.filter((v) => v.realStatus === "offline").length,
  };

  return (
    <div className="flex-1 w-full flex relative overflow-hidden">
      <div ref={box} className="flex-1 w-full" />

      {/* Overlay Panel */}
      <div className="absolute top-4 left-4 w-[300px] max-h-[calc(100%-32px)] bg-[rgba(15,21,37,.92)] backdrop-blur-2xl rounded-xl border border-white/[.06] z-[1000] flex flex-col shadow-2xl shadow-black/40">
        {/* Stats Row */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[.05] text-[11px] font-semibold">
          <span className="text-green-400">● {counts.running}</span>
          <span className="text-amber-400">● {counts.idle}</span>
          <span className="text-red-400">● {counts.stopped}</span>
          <span className="text-slate-500 ml-auto">{vehicles.length} total</span>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-white/[.05]">
          <input
            placeholder="Search reg no, type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-black/25 border border-white/[.06] rounded-lg text-[13px] text-white placeholder:text-slate-600 outline-none focus:border-indigo-500/40 transition"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map((v) => {
            const imei = v.gps_device?.imei || "";
            const pos = livePos[imei];
            const sel = selected === imei;
            const dotColor = v.realStatus === "running" ? "#22c55e" : v.realStatus === "idle" ? "#f59e0b" : v.realStatus === "stopped" ? "#ef4444" : "#475569";
            return (
              <div
                key={v.id}
                onClick={() => {
                  setSelected(imei);
                  if (markers.current[imei] && mapRef.current) {
                    mapRef.current.setView(markers.current[imei].getLatLng(), 16);
                    markers.current[imei].openPopup();
                  }
                }}
                className={`flex items-center gap-3 px-4 py-3 border-b border-white/[.04] cursor-pointer transition
                  ${sel ? "bg-indigo-500/[.1] border-l-[3px] border-l-indigo-500" : "hover:bg-white/[.02]"}`}
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dotColor, boxShadow: v.realStatus === "running" ? `0 0 6px ${dotColor}` : "none" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="text-[13px] font-semibold text-slate-200 truncate">{v.registration_no}</div>
                    {pos && (
                      <div className={`text-[9px] px-1.5 py-0.5 rounded border ${pos.ignition ? "text-green-400 border-green-400/30" : "text-red-400 border-red-400/30"}`}>
                        IGN {pos.ignition ? "ON" : "OFF"}
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{v.vehicle_type?.name || "—"}</div>
                  {pos && <div className="text-[10px] text-indigo-400 mt-0.5">{pos.speed} km/h</div>}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="text-center py-8 text-slate-600 text-sm">No vehicles</div>}
        </div>
      </div>
    </div>
  );
}
