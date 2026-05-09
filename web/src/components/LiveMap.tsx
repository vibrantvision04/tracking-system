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
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [selectedZone, setSelectedZone] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("selectedZone");
      return cached !== null ? cached : "177"; // Default to 177
    }
    return "177";
  });
  const [zones, setZones] = useState<any[]>([]);
  const hasFitBounds = useRef(false);

  useEffect(() => {
    api<{ data: any[] }>("/api/zones").then((res) => {
      setZones(res.data || []);
    });
  }, []);



  const livePosAccumulator = useRef<Record<string, LivePosition>>({});

  useEffect(() => {
    const interval = setInterval(() => {
      if (Object.keys(livePosAccumulator.current).length > 0) {
        setLivePos((prev) => ({ ...prev, ...livePosAccumulator.current }));
        livePosAccumulator.current = {};
      }
    }, 1000); // Flush every 1 second
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    

  }, [selectedZone, vehicles]);

  // ─── Init Map ───
  useEffect(() => {
    if (!box.current || mapRef.current) return;
    const m = L.map(box.current, { 
      zoomControl: true,
      minZoom: 5,
      maxBounds: [[6.0, 68.0], [38.0, 98.0]],
      maxBoundsViscosity: 1.0,
      preferCanvas: true,
      layers: [] // Default set below
    }).setView([26.9124, 75.7873], 13);
    
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

    darkLayer.addTo(m); // Default layer

    L.control.layers({
      "Dark Map": darkLayer,
      "Street Map": streetLayer,
      "Satellite (No Labels)": satelliteLayer,
      "Satellite + Labels": satelliteHybrid
    }, {}, { position: 'topright' }).addTo(m);
    
    mapRef.current = m;
    return () => { 
      m.remove(); 
      mapRef.current = null; 
      markers.current = {}; 
    };
  }, []);

  // ─── Marker helper ───
  const upsertMarker = useCallback((imei: string, lat: number, lng: number, speed: number, ignition: boolean, regNo: string, typeName: string, isLive: boolean, lastTime?: string | null) => {
    if (!mapRef.current) return;
    
    const getVehicleEmoji = (type: string) => {
      const t = type.toLowerCase();
      if (t.includes("feeder") || t.includes("tipper")) return "🚛";
      if (t.includes("compactor")) return "🗑️";
      if (t.includes("tractor") || t.includes("ferguson")) return "🚜";
      if (t.includes("ambulance")) return "🚑";
      if (t.includes("tata") || t.includes("mahindra")) return "🚚";
      return "🚗"; // Fallback
    };

    const color = isLive ? (speed > 3 ? "#22c55e" : speed > 0 ? "#f59e0b" : "#ef4444") : "#64748b";
    const emoji = getVehicleEmoji(typeName);
    
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,.85);display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:${isLive ? `0 0 10px ${color}` : "none"}">${emoji}</div>`,
      iconSize: [24, 24], iconAnchor: [12, 12],
    });
    if (typeof lat !== 'number' || typeof lng !== 'number' || lat === 0) {
      console.warn("Invalid lat/lng for", imei, lat, lng);
      return;
    }

    if (markers.current[imei]) {
      markers.current[imei].setLatLng([lat, lng]).setIcon(icon);
    } else {
      markers.current[imei] = L.marker([lat, lng], { icon }).addTo(mapRef.current);
    }

    const timeStr = isLive ? "Live Now" : (lastTime ? `Last seen: ${new Date(lastTime).toLocaleString()}` : "Offline");
    markers.current[imei].bindPopup(`
      <div style="font-family:Inter,sans-serif;min-width:180px;font-size:12px;">
        <div style="font-weight:700;font-size:13px;margin-bottom:2px;">${regNo}</div>
        <div style="color:#888;margin-bottom:6px;">${typeName}</div>
        <div style="margin-bottom:6px;">
          <span style="padding:2px 6px;border-radius:4px;background:${isLive ? "rgba(34,197,94,.15)" : "rgba(100,116,139,.15)"};color:${isLive ? "#22c55e" : "#94a3b8"};font-weight:600;font-size:10px;">${timeStr}</span>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:4px;">
          <span>Speed: <b>${speed} km/h</b></span>
          <span style="color:${ignition ? "#22c55e" : "#ef4444"}">Ignition: <b>${ignition ? "ON" : "OFF"}</b></span>
        </div>
        <div style="color:#6366f1;font-size:11px;margin-top:4px;">IMEI: ${imei}</div>
      </div>
    `);
  }, []);

  // ─── Initial Marker Placement ───
  // ─── Marker Management (Filtered) ───
  useEffect(() => {
    if (!mapRef.current) return;
    
    const filteredVehicles = vehicles.filter((v) => {
      if (!selectedZone || selectedZone === "all") return true;
      return (v as any).zone_id === parseInt(selectedZone);
    });

    const filteredImeis = new Set(filteredVehicles.map(v => v.gps_device?.imei).filter(Boolean));
    
    // Cleanup hidden markers
    Object.keys(markers.current).forEach((imei) => {
      if (!filteredImeis.has(imei)) {
        markers.current[imei].remove();
        delete markers.current[imei];
      }
    });

    // Create/Update visible markers
    filteredVehicles.forEach((v) => {
      const imei = v.gps_device?.imei;
      if (!imei) return;
      if (v.last_lat && v.last_lng) {
        const isMoving = v.status === "running";
        const isIdle = v.status === "idle";
        const simulatedSpeed = isMoving ? 5 : (isIdle ? 2 : 0);
        const simulatedIsLive = v.status !== "offline";
        
        upsertMarker(imei, v.last_lat, v.last_lng, simulatedSpeed, false, v.registration_no, v.vehicle_type?.name || "Vehicle", simulatedIsLive, v.last_time);
      }
    });
  }, [vehicles, selectedZone, upsertMarker]);

  // ─── Fit Bounds on Zone Change or Load ───
  const lastFittedZone = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!mapRef.current) return;
    if (lastFittedZone.current === selectedZone) return; 
    
    const bounds = L.latLngBounds([]);
    let count = 0;
    
    vehicles.forEach(v => {
      const isVisible = !selectedZone || selectedZone === "all" || (v as any).zone_id === parseInt(selectedZone);
      if (isVisible && v.last_lat && v.last_lng) {
        bounds.extend([v.last_lat, v.last_lng]);
        count++;
      }
    });
    
    if (count > 0) {
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: false });
      lastFittedZone.current = selectedZone;
    }
  }, [vehicles, selectedZone]); // Keep livePos here so it fits as soon as the first snapshot/updates arrive


  const vehiclesRef = useRef(vehicles);
  useEffect(() => { vehiclesRef.current = vehicles; }, [vehicles]);

  const selectedZoneRef = useRef(selectedZone);
  useEffect(() => { selectedZoneRef.current = selectedZone; }, [selectedZone]);

  // ─── WebSocket for real-time GPS ───
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnect: ReturnType<typeof setTimeout>;
    let isMounted = true;
    const pendingFetches = new Set<string>();
    
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
              livePosAccumulator.current[imei] = msg;
              
              const v = vehiclesRef.current.find((vv) => vv.gps_device?.imei === msg.imei);
              const sz = selectedZoneRef.current;
              const isVisible = !sz || sz === "all" || (v && (v as any).zone_id === parseInt(sz));
              
              if (isVisible) {
                upsertMarker(msg.imei, msg.lat, msg.lng, msg.speed, !!msg.ignition, v?.registration_no || msg.imei, v?.vehicle_type?.name || "", true);
              } else {
                if (markers.current[msg.imei]) {
                  markers.current[msg.imei].remove();
                  delete markers.current[msg.imei];
                }
              }
            }
            if (msg.type === "device_status") {
              setStatuses(prev => ({ ...prev, [msg.imei]: msg.status }));
            }
            if (msg.type === "metadata_update") {
              // Re-fetch all metadata when something changes
              useStore.getState().loadAll(true);
            }
            if (msg.type === "snapshot") {
              if (Array.isArray(msg.data)) {
                const map: Record<string, LivePosition> = {};
                msg.data.forEach((p: LivePosition) => { map[p.imei] = p; });
                setLivePos((prev) => ({ ...prev, ...map }));
              }
              if (msg.statuses) {
                setStatuses(prev => ({ ...prev, ...msg.statuses }));
              }
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

  const filteredByZone = processedVehicles.filter((v) => {
    if (!selectedZone || selectedZone === "all") return true;
    return (v as any).zone_id === parseInt(selectedZone);
  });

  const filtered = filteredByZone.filter((v) =>
    v.registration_no.toLowerCase().includes(search.toLowerCase()) ||
    (v.vehicle_type?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const counts = {
    running: filteredByZone.filter((v) => v.realStatus === "running").length,
    idle: filteredByZone.filter((v) => v.realStatus === "idle").length,
    stopped: filteredByZone.filter((v) => v.realStatus === "stopped").length,
    offline: filteredByZone.filter((v) => v.realStatus === "offline").length,
  };

  return (
    <div className="flex-1 w-full flex relative overflow-hidden">
      <div ref={box} className="flex-1 w-full" />

      {/* Overlay Panel */}
      <div className="absolute top-4 left-4 right-4 md:right-auto md:w-[300px] max-h-[calc(100%-32px)] bg-[rgba(15,21,37,.92)] backdrop-blur-2xl rounded-xl border border-white/[.06] z-[1000] flex flex-col shadow-2xl shadow-black/40">
        {/* Stats Row */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[.05] text-[11px] font-semibold">
          <span className="text-green-400">● {counts.running}</span>
          <span className="text-amber-400">● {counts.idle}</span>
          <span className="text-red-400">● {counts.stopped}</span>
          <span className="text-slate-500 ml-auto">{filteredByZone.length} visible</span>
        </div>

        {/* Zone Selector */}
        <div className="p-3 border-b border-white/[.05]">
          <select
            value={selectedZone || "all"}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedZone(val);
              localStorage.setItem("selectedZone", val);
            }}
            className="w-full px-3 py-2 bg-black/25 border border-white/[.06] rounded-lg text-[13px] text-white placeholder:text-slate-600 outline-none focus:border-indigo-500/40 transition"
          >
            <option value="all">All Zones</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.region_name}</option>
            ))}
          </select>
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
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-[13px] font-semibold text-slate-200 truncate">{v.registration_no}</div>
                      {statuses[imei] === "connected" && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded-full border border-green-500/20 font-medium">CONNECTED</span>
                      )}
                    </div>
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
