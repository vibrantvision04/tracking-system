"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, post } from "@/lib/api";
import { toast } from "react-toastify";
import { useStore, ENABLE_FUEL_FEATURES } from "@/lib/store";

interface D2DAlert {
  id: number;
  alert_type: string;
  reg_no: string;
  ward_no: string;
  driver: string;
  alert_detail: string;
  alert_count: number;
  alert_time: string;
  status: "pending" | "resolved";
  reason: string;
  snooze_duration: number;
  lat: number;
  lng: number;
  vehicle_id: number;
}

interface StartedVehicle {
  id: number;
  reg_no: string;
  ward_no: string;
  route: string;
  driver: string;
  distance_covered: number;
  route_covered_percent: number;
  inorder_route_percent: number;
  going_to_transfer_station: string;
  last_updated: string;
  lat: number;
  lng: number;
  heading: number;
  emoji_sequence: string;
  current_status: string;
}

interface OtherVehicle {
  id: number;
  reg_no: string;
  ward_no: string;
  route: string;
  driver: string;
  current_status: string;
  distance_covered: number;
  going_to_transfer_station: string;
  last_updated: string | null;
}

interface MapGeofence {
  id: number;
  name: string;
  type: string;
  lat: number;
  lng: number;
  radius_meter: number;
}

interface Zone {
  id: number;
  region_name: string;
  name: string;
}

interface Ward {
  id: number;
  region_name: string;
  parent_id: number;
}

const STOPPAGE_REASONS = [
  "Direction By Senior",
  "Invalid",
  "Household took time",
  "Traffic Jam",
  "Lane is blocked",
  "Vehicle breakdown",
  "Vehicle did not start",
  "Delay from household",
  "Replace Driver-Vehicle",
  "CSI stopped the driver",
  "Other valid reason",
  "Request Vehicle-Driver replacement",
  "Vehicle is under maintenance",
  "Going to Rc Point",
  "At Fuel Pump"
].filter(reason => ENABLE_FUEL_FEATURES || !reason.toLowerCase().includes("fuel"));

export default function D2DMap() {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Layer groups for clean updates
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const geofencesLayerRef = useRef<L.LayerGroup | null>(null);
  const routesLayerRef = useRef<L.LayerGroup | null>(null);

  // Loaded Data States
  const [alerts, setAlerts] = useState<D2DAlert[]>([]);
  const [startedVehicles, setStartedVehicles] = useState<StartedVehicle[]>([]);
  const [unauthorizedVehicles, setUnauthorizedVehicles] = useState<D2DAlert[]>([]);
  const [otherVehicles, setOtherVehicles] = useState<OtherVehicle[]>([]);
  const [geofences, setGeofences] = useState<MapGeofence[]>([]);
  
  // Dropdown list states
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [wardsList, setWardsList] = useState<Ward[]>([]);

  // Filtering states
  const [selectedZone, setSelectedZone] = useState("Zone 1 - Hawa Mahal-Aamer Zone");
  const [selectedWard, setSelectedWard] = useState("");
  const [selectedRouteType, setSelectedRouteType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"alerts" | "started" | "unauth" | "other">("alerts");

  // Selection states
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Map Controls State (Right side checkboxes)
  const [showParking, setShowParking] = useState(true);
  const [showTransfer, setShowTransfer] = useState(true);
  const [showFuel, setShowFuel] = useState(ENABLE_FUEL_FEATURES);
  const [showWorkshop, setShowWorkshop] = useState(true);

  const [showStop5_10, setShowStop5_10] = useState(true);
  const [showStop10_15, setShowStop10_15] = useState(true);
  const [showStop15_plus, setShowStop15_plus] = useState(true);

  const [showOverspeeding, setShowOverspeeding] = useState(true);
  const [showFastCoverage, setShowFastCoverage] = useState(true);
  const [showDeviation, setShowDeviation] = useState(true);
  const [showDelay, setShowDelay] = useState(true);
  const [showLateStarted, setShowLateStarted] = useState(true);
  const [showUnauthorizedMovement, setShowUnauthorizedMovement] = useState(true);

  const [showPlannedRoute, setShowPlannedRoute] = useState(true);
  const [showActualMovement, setShowActualMovement] = useState(true);

  // Form states inside table/details
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [snoozes, setSnoozes] = useState<Record<number, number>>({});
  const [activeShift, setActiveShift] = useState<string>("");

  // UI Collapse States
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const sidebarCollapsed = useStore((state) => state.sidebarCollapsed);

  // Invalidate map size when layouts collapse/expand to avoid rendering glitches
  useEffect(() => {
    if (!mapRef.current) return;
    
    // Invalidate size immediately
    mapRef.current.invalidateSize();
    
    // Invalidate size after animation ends (300ms transition)
    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 320);

    return () => clearTimeout(timer);
  }, [sidebarCollapsed, rightPanelOpen, bottomPanelOpen]);

  // ─── Fetch Dropdowns and Main Data ───
  const fetchData = useCallback(async () => {
    try {
      const dashboard = await api<{
        success: boolean;
        alerts: D2DAlert[];
        started_vehicles: StartedVehicle[];
        unauthorized_vehicles: D2DAlert[];
        other_vehicles: OtherVehicle[];
        geofences: MapGeofence[];
        active_shift: string;
      }>("/api/d2d/dashboard");

      if (dashboard.success) {
        setAlerts(dashboard.alerts || []);
        setStartedVehicles(dashboard.started_vehicles || []);
        setUnauthorizedVehicles(dashboard.unauthorized_vehicles || []);
        setOtherVehicles(dashboard.other_vehicles || []);
        setGeofences(dashboard.geofences || []);
        setActiveShift(dashboard.active_shift || "");
      }

      const zones = await api<{ success: boolean; data: Zone[] }>("/api/zones");
      if (zones.success) {
        setZonesList(zones.data || []);
      }

      const wards = await api<{ success: boolean; data: Ward[] }>("/api/wards");
      if (wards.success) {
        setWardsList(wards.data || []);
      }
    } catch (err) {
      console.error("Failed to load dashboard telemetry", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Initialize Map ───
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const m = L.map(containerRef.current, {
      zoomControl: true,
      minZoom: 4,
      preferCanvas: true,
    }).setView([26.9239, 75.8267], 13);

    L.tileLayer(
      "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
      {
        attribution: "© Google Maps",
        maxZoom: 20,
      }
    ).addTo(m);

    // Initialize Layers
    markersLayerRef.current = L.layerGroup().addTo(m);
    geofencesLayerRef.current = L.layerGroup().addTo(m);
    routesLayerRef.current = L.layerGroup().addTo(m);

    mapRef.current = m;

    return () => {
      m.remove();
      mapRef.current = null;
    };
  }, []);

  // ─── Select All Control ───
  const handleSelectAll = (checked: boolean) => {
    setShowParking(checked);
    setShowTransfer(checked);
    setShowFuel(checked);
    setShowWorkshop(checked);
    setShowStop5_10(checked);
    setShowStop10_15(checked);
    setShowStop15_plus(checked);
    setShowOverspeeding(checked);
    setShowFastCoverage(checked);
    setShowDeviation(checked);
    setShowDelay(checked);
    setShowLateStarted(checked);
    setShowUnauthorizedMovement(checked);
    setShowPlannedRoute(checked);
    setShowActualMovement(checked);
  };

  const isAllSelected = 
    showParking && showTransfer && showFuel && showWorkshop &&
    showStop5_10 && showStop10_15 && showStop15_plus &&
    showOverspeeding && showFastCoverage && showDeviation && showDelay && showLateStarted && showUnauthorizedMovement &&
    showPlannedRoute && showActualMovement;

  // ─── Handle Resolve Alert ───
  const handleResolveAlert = async (id: number) => {
    const reason = reasons[id] || STOPPAGE_REASONS[0];
    const snooze = snoozes[id] || 0;

    try {
      const res = await post<{ success: boolean }>(`/api/alerts/${id}/resolve`, {
        reason,
        snooze_duration: snooze,
      });

      if (res.success) {
        toast.success("Alert resolved successfully!");
        
        // Update alerts lists
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, status: "resolved", reason, snooze_duration: snooze } : a
          )
        );
        setUnauthorizedVehicles((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, status: "resolved", reason, snooze_duration: snooze } : a
          )
        );
      }
    } catch (err) {
      toast.error("Failed to resolve alert");
    }
  };

  // ─── Draw Markers, Routes, and Geofences ───
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current || !geofencesLayerRef.current || !routesLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    geofencesLayerRef.current.clearLayers();
    routesLayerRef.current.clearLayers();

    // 1. Draw Geofences
    geofences.forEach((geo) => {
      let isVisible = false;
      let color = "#3b82f6";
      let emoji = "📍";

      if (geo.type === "Parking Lot" && showParking) {
        isVisible = true;
        color = "#10b981"; // Green
        emoji = "🅿️";
      } else if (geo.type === "Transfer Station" && showTransfer) {
        isVisible = true;
        color = "#3b82f6"; // Blue
        emoji = "🔄";
      } else if (geo.type === "Fuel Station" && showFuel) {
        isVisible = true;
        color = "#eab308"; // Yellow
        emoji = "⛽";
      } else if (geo.type === "Workshop" && showWorkshop) {
        isVisible = true;
        color = "#8b5cf6"; // Purple
        emoji = "🛠️";
      }

      if (isVisible) {
        // Draw Circle
        L.circle([geo.lat, geo.lng], {
          radius: geo.radius_meter,
          color: color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.1,
        }).addTo(geofencesLayerRef.current!);

        // Draw Icon
        const icon = L.divIcon({
          className: "",
          html: `<div style="font-size: 16px; transform: translate(-8px, -8px); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${emoji}</div>`,
          iconSize: [20, 20],
        });

        L.marker([geo.lat, geo.lng], { icon })
          .addTo(geofencesLayerRef.current!)
          .bindPopup(`<b style="color: #fff;">${geo.name}</b><br/><span style="color:#94a3b8;">Type: ${geo.type}</span>`);
      }
    });

    // 2. Draw Active/Started Vehicles with Interactive Emojis Status Block permanent tooltip
    startedVehicles.forEach((v) => {
      const isSelected = selectedVehicleId === v.id;
      
      // Determine active alerts and filter status
      let stopDur = 0;
      // Stoppage duration extraction
      const vehicleAlerts = alerts.filter(a => a.vehicle_id === v.id && a.status === "pending");
      const stopAlert = vehicleAlerts.find(a => a.alert_type === "Stoppage");
      if (stopAlert) {
        // Extract duration from detail or fallback
        const matches = stopAlert.alert_detail.match(/Duration: ([\d.]+) Min/);
        if (matches && matches[1]) {
          stopDur = parseFloat(matches[1]);
        } else {
          stopDur = 12.0; // fallback
        }
      }

      // Check stoppage visibility filters
      let isStoppageFilteredOut = false;
      if (stopAlert) {
        if (stopDur >= 15 && !showStop15_plus) isStoppageFilteredOut = true;
        else if (stopDur >= 10 && stopDur < 15 && !showStop10_15) isStoppageFilteredOut = true;
        else if (stopDur >= 5 && stopDur < 10 && !showStop5_10) isStoppageFilteredOut = true;
      }

      // Check other alert visibility filters
      const hasOverspeed = vehicleAlerts.some(a => a.alert_type === "Over Speeding");
      if (hasOverspeed && !showOverspeeding) isStoppageFilteredOut = true;
      
      const hasUnauth = vehicleAlerts.some(a => a.alert_type === "Unauthorized Movement");
      if (hasUnauth && !showUnauthorizedMovement) isStoppageFilteredOut = true;

      const hasLate = vehicleAlerts.some(a => a.alert_type === "Late Started");
      if (hasLate && !showLateStarted) isStoppageFilteredOut = true;

      const hasDev = vehicleAlerts.some(a => a.alert_type === "Deviation");
      if (hasDev && !showDeviation) isStoppageFilteredOut = true;

      const hasDel = vehicleAlerts.some(a => a.alert_type === "Delay");
      if (hasDel && !showDelay) isStoppageFilteredOut = true;

      if (!isStoppageFilteredOut) {
        const rotationAngle = v.heading || 0;
        
        const isOffline = !activeShift || (new Date().getTime() - new Date(v.last_updated).getTime() > 15 * 60 * 1000);
        let color = "#10b981"; // green
        if (isOffline) {
          color = "#64748b"; // grayish
        } else if (stopAlert) {
          color = stopDur >= 15 ? "#ef4444" : stopDur >= 10 ? "#f97316" : "#eab308";
        }
        
        // Create Marker Icon representing vehicle heading direction
        const icon = L.divIcon({
          className: "",
          html: `
            <div style="
              width: 34px;
              height: 34px;
              border-radius: 50%;
              background: #0f172a;
              border: 3px solid ${color};
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 15px;
              box-shadow: 0 0 ${isSelected ? "22px" : "12px"} ${color};
              transform: scale(${isSelected ? 1.25 : 1}) rotate(${rotationAngle}deg);
              transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
              cursor: pointer;
            ">
              🚛
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

        const displayStatus = isOffline ? "Offline" : v.current_status;
        const statusColor = isOffline ? "#64748b" : color;

        const mMarker = L.marker([v.lat, v.lng], { icon })
          .addTo(markersLayerRef.current!)
          .bindPopup(`
            <div style="font-family: Inter, sans-serif; min-width: 250px; font-size: 12px; padding: 4px; color: #fff;">
              <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
                <span>🚛 ${v.reg_no}</span>
                <span style="color: ${statusColor}; font-size: 11px;">● ${displayStatus}</span>
              </div>
              <div style="margin-bottom: 8px;">
                <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.06); border: 1px solid ${color}; color: ${color}; font-weight: 600; font-size: 10px;">
                  Inorder Route Coverage: ${v.inorder_route_percent}%
                </span>
              </div>
              <div style="color: #94a3b8; display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;">
                <span>👤 <b>Driver:</b> ${v.driver}</span>
                <span>📍 <b>Ward No:</b> ${v.ward_no}</span>
                <span>🛣️ <b>Route:</b> ${v.route}</span>
                <span>📏 <b>Distance Covered:</b> ${v.distance_covered.toFixed(2)} KM</span>
                <span>🔄 <b>Going to TS:</b> ${v.going_to_transfer_station}</span>
                <span>⏰ <b>Last Update:</b> ${new Date(v.last_updated).toLocaleTimeString()}</span>
              </div>
              <div style="border-top: 1px solid rgba(255,255,255,0.08); pt-2; font-family: monospace; font-size: 10px; color: #94a3b8;">
                ${v.emoji_sequence}
              </div>
            </div>
          `);

        // Binding permanent Marker tooltip label as requested: RJ14GQ5302SW 🚫 🚫 🚫 🚫 🚫 🍎 ⏱️ 🚫 🚫 🚫 (50%)
        mMarker.bindTooltip(
          `<div style="font-family: monospace; font-size: 11px; font-weight: bold; background: #0f172a; border: 1px solid #334155; color: #f8fafc; padding: 2px 6px; border-radius: 4px; white-space: nowrap; display: flex; gap: 6px; align-items: center; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
            <span>${v.reg_no}</span>
            <span style="font-size: 9px; letter-spacing: -1px;">${v.emoji_sequence}</span>
            <span style="color: #3b82f6;">(${v.inorder_route_percent}%)</span>
          </div>`,
          {
            permanent: true,
            direction: "top",
            offset: [0, -18],
            className: "custom-marker-tooltip",
          }
        );

        mMarker.on("click", () => {
          setSelectedVehicleId(v.id);
        });

        // If selected, center map on this vehicle
        if (isSelected) {
          mapRef.current!.setView([v.lat, v.lng], 15);
        }
      }
    });

    // 3. Draw Actual Movement path for selected vehicle
    if (selectedVehicleId && showActualMovement) {
      // Find selected vehicle and draw simulated telemetry points around Hawa Mahal
      const v = startedVehicles.find(sv => sv.id === selectedVehicleId);
      if (v) {
        // Mocking beautiful path centered around active coordinates
        const lat = v.lat;
        const lng = v.lng;
        const polyCoords: [number, number][] = [
          [lat - 0.005, lng - 0.005],
          [lat - 0.002, lng - 0.004],
          [lat - 0.001, lng - 0.001],
          [lat, lng],
        ];

        L.polyline(polyCoords, {
          color: "#10b981", // Emerald Green
          weight: 4,
          opacity: 0.8,
        }).addTo(routesLayerRef.current!);

        // Add Planned Route dashed line for comparison
        if (showPlannedRoute) {
          const plannedCoords: [number, number][] = [
            [lat - 0.006, lng - 0.006],
            [lat - 0.003, lng - 0.003],
            [lat + 0.001, lng + 0.001],
          ];
          L.polyline(plannedCoords, {
            color: "#3b82f6", // Blue
            weight: 3,
            dashArray: "6, 6",
            opacity: 0.6,
          }).addTo(routesLayerRef.current!);
        }
      }
    }
  }, [
    startedVehicles,
    selectedVehicleId,
    geofences,
    showParking,
    showTransfer,
    showFuel,
    showWorkshop,
    showStop5_10,
    showStop10_15,
    showStop15_plus,
    showOverspeeding,
    showFastCoverage,
    showDeviation,
    showDelay,
    showLateStarted,
    showUnauthorizedMovement,
    showPlannedRoute,
    showActualMovement,
    alerts,
  ]);

  // Handle row selection
  const handleSelectRow = (id: number) => {
    setSelectedVehicleId(id);
    setActiveTab(activeTab);
  };

  // Filters calculation
  const distinctWards = Array.from(new Set(wardsList.map((w) => w.region_name))).sort();

  const filterItem = (reg: string, ward: string) => {
    const matchesSearch = reg.toLowerCase().includes(searchQuery.toLowerCase()) || ward.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesWard = !selectedWard || ward.includes(selectedWard);
    return matchesSearch && matchesWard;
  };

  const filteredAlerts = alerts.filter(a => filterItem(a.reg_no, a.ward_no));
  const filteredStarted = startedVehicles.filter(sv => filterItem(sv.reg_no, sv.ward_no));
  const filteredUnauthorized = unauthorizedVehicles.filter(a => filterItem(a.reg_no, a.ward_no));
  const filteredOther = otherVehicles.filter(ov => filterItem(ov.reg_no, ov.ward_no));

  return (
    <div className="flex flex-col h-screen w-full bg-[#030712] text-slate-100 overflow-hidden font-sans">
      
      {/* Top Navigation / Filters Bar */}
      <header className="flex flex-col lg:flex-row lg:h-16 bg-[#090d16] px-4 py-3 lg:py-0 lg:px-6 items-start lg:items-center justify-between gap-4 lg:gap-0 border-b border-slate-800 shrink-0 z-10 w-full">
        <div className="flex items-center gap-3">
          <span className="text-xl">📊</span>
          <div>
            <h1 className="text-sm font-bold tracking-wider text-indigo-400">ISWM - NAGAR NIGAM JAIPUR</h1>
            <span className="text-[10px] text-slate-400">Door-to-Door (D2D) Fleet Monitoring Dashboard</span>
          </div>
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="flex flex-col min-w-[130px] flex-1 lg:flex-initial">
            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1">Zone</span>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-200 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition duration-200 cursor-pointer"
            >
              <option value="Zone 1 - Hawa Mahal-Aamer Zone">Zone 1 - Hawa Mahal-Aamer Zone</option>
              {zonesList.map(z => (
                <option key={z.id} value={z.region_name}>{z.region_name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col min-w-[130px] flex-1 lg:flex-initial">
            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1">Select Ward</span>
            <select
              value={selectedWard}
              onChange={(e) => setSelectedWard(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-200 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition duration-200 cursor-pointer"
            >
              <option value="">All Wards</option>
              {distinctWards.map(w => {
                const clean = w.split(" - ")[0];
                return <option key={w} value={clean}>{w}</option>;
              })}
            </select>
          </div>

          <div className="flex flex-col min-w-[130px] flex-1 lg:flex-initial">
            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1">Route Type</span>
            <select
              value={selectedRouteType}
              onChange={(e) => setSelectedRouteType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-200 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition duration-200 cursor-pointer"
            >
              <option value="">All Route Types</option>
              <option value="SWEEPING">Sweeping Machine</option>
              <option value="COMPACTOR">Compactor</option>
              <option value="D2D">D2D Hopper Tipper</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 font-medium shrink-0 ml-auto lg:ml-0 h-[32px] mt-4 lg:mt-0">
            <span className="font-bold text-indigo-400">⏱️ Shift:</span> {activeShift || "N/A"}
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Left Side: Map + Bottom Tables */}
        <div className="flex-1 flex flex-col min-w-0 h-full">
          
          {/* Map area */}
          <div className="flex-1 relative bg-slate-950">
            <div ref={containerRef} className="absolute inset-0 z-0" />
            
            {/* Quick search floating overlay */}
            <div className="absolute top-4 left-14 z-10 bg-slate-900/90 border border-slate-800/80 rounded-lg p-2 flex items-center gap-2 shadow-2xl backdrop-blur-md">
              <input
                type="text"
                placeholder="Search Reg No..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-black/35 px-3 py-1.5 border border-slate-700/60 rounded text-xs text-white placeholder:text-slate-500 focus:border-indigo-500 outline-none w-52 transition duration-200"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-white text-xs px-1">✕</button>
              )}
            </div>

            {/* Floating button to open right panel when closed */}
            {!rightPanelOpen && (
              <button
                onClick={() => setRightPanelOpen(true)}
                className="absolute top-4 right-4 z-[1000] bg-slate-900/95 border border-indigo-500/30 hover:border-indigo-500/80 rounded-xl px-3.5 py-2 flex items-center gap-2 shadow-2xl backdrop-blur-md text-xs font-bold text-indigo-400 hover:text-white hover:bg-indigo-950/40 transition-all duration-300 active:scale-95 group animate-fade-in"
              >
                <svg className="w-4 h-4 text-indigo-400 group-hover:rotate-45 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Layers & Filters</span>
                <svg className="w-3.5 h-3.5 text-indigo-500 group-hover:text-white transition-transform duration-200 group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
          </div>

          {/* Bottom Tables Tabs */}
          <div className={`border-t border-slate-800 bg-[#070b13] flex flex-col relative shrink-0 transition-all duration-300 ease-in-out ${
            bottomPanelOpen ? "h-[280px] md:h-[340px]" : "h-10 overflow-hidden"
          }`}>
            
            {/* Tab selection triggers */}
            <div className="flex h-10 border-b border-slate-850 bg-[#090d16] px-4 items-center justify-between cursor-pointer select-none" onClick={(e) => {
              // Click the tab bar itself to toggle
              if ((e.target as HTMLElement).tagName === 'DIV' || (e.target as HTMLElement).tagName === 'HEADER') {
                setBottomPanelOpen(!bottomPanelOpen);
              }
            }}>
              <div className="flex gap-2 h-full">
                <button
                  onClick={() => {
                    if (activeTab === "alerts") {
                      setBottomPanelOpen(!bottomPanelOpen);
                    } else {
                      setActiveTab("alerts");
                      setBottomPanelOpen(true);
                    }
                  }}
                  className={`h-full px-4 text-xs font-semibold flex items-center border-b-2 gap-1.5 transition ${
                    activeTab === "alerts"
                      ? "border-red-500 text-red-400 bg-red-950/10"
                      : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  <span>⚠️ All Alerts</span>
                  <span className="px-1.5 py-0.5 bg-red-500/20 text-red-300 rounded-full text-[10px] font-bold">
                    {filteredAlerts.length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    if (activeTab === "started") {
                      setBottomPanelOpen(!bottomPanelOpen);
                    } else {
                      setActiveTab("started");
                      setBottomPanelOpen(true);
                    }
                  }}
                  className={`h-full px-4 text-xs font-semibold flex items-center border-b-2 gap-1.5 transition ${
                    activeTab === "started"
                      ? "border-green-500 text-green-400 bg-green-950/10"
                      : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  <span>🟢 Started Vehicles</span>
                  <span className="px-1.5 py-0.5 bg-green-500/20 text-green-300 rounded-full text-[10px] font-bold">
                    {filteredStarted.length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    if (activeTab === "unauth") {
                      setBottomPanelOpen(!bottomPanelOpen);
                    } else {
                      setActiveTab("unauth");
                      setBottomPanelOpen(true);
                    }
                  }}
                  className={`h-full px-4 text-xs font-semibold flex items-center border-b-2 gap-1.5 transition ${
                    activeTab === "unauth"
                      ? "border-amber-500 text-amber-400 bg-amber-950/10"
                      : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  <span>🛡️ Unauthorized Movements</span>
                  <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded-full text-[10px] font-bold">
                    {filteredUnauthorized.length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    if (activeTab === "other") {
                      setBottomPanelOpen(!bottomPanelOpen);
                    } else {
                      setActiveTab("other");
                      setBottomPanelOpen(true);
                    }
                  }}
                  className={`h-full px-4 text-xs font-semibold flex items-center border-b-2 gap-1.5 transition ${
                    activeTab === "other"
                      ? "border-slate-500 text-slate-300 bg-slate-800/10"
                      : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  <span>💤 Other / Stopped</span>
                  <span className="px-1.5 py-0.5 bg-slate-500/20 text-slate-300 rounded-full text-[10px] font-bold">
                    {filteredOther.length}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                {loading && <span className="text-[10px] text-slate-500 animate-pulse">Syncing database data...</span>}
                <button
                  onClick={() => setBottomPanelOpen(!bottomPanelOpen)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition duration-200 active:scale-95 flex items-center justify-center shrink-0"
                  title={bottomPanelOpen ? "Collapse Panel" : "Expand Panel"}
                >
                  <svg className={`w-4 h-4 transition-transform duration-300 ${bottomPanelOpen ? "" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto custom-scrollbar p-3">
              {loading ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">Loading fleet tables...</div>
              ) : (
                <div className="overflow-x-auto w-full min-w-0 custom-scrollbar pb-2">
                  {/* --- TAB 1: ALL ALERTS --- */}
                  {activeTab === "alerts" && (
                    <table className="w-full border-collapse text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/30">
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Reg No.</th>
                          <th className="py-2.5 px-3">Ward No.</th>
                          <th className="py-2.5 px-3">Driver</th>
                          <th className="py-2.5 px-3">Alerts</th>
                          <th className="py-2.5 px-3">Alert Detail</th>
                          <th className="py-2.5 px-3">Alert Count</th>
                          <th className="py-2.5 px-3">Alert Time</th>
                          <th className="py-2.5 px-3">Reason</th>
                          <th className="py-2.5 px-3">Snooze (Min)</th>
                          <th className="py-2.5 px-3 text-center">Submit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {filteredAlerts.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="py-8 text-center text-slate-500">No active alerts found.</td>
                          </tr>
                        ) : (
                          filteredAlerts.map((alert) => {
                            const isSelected = selectedVehicleId === alert.vehicle_id;
                            const isResolved = alert.status === "resolved";

                            return (
                              <tr
                                key={alert.id}
                                onClick={() => handleSelectRow(alert.vehicle_id)}
                                className={`hover:bg-slate-850/40 cursor-pointer border-b border-slate-850/30 transition duration-150 ${
                                  isSelected ? "bg-indigo-950/30 border-l-2 border-indigo-500" : ""
                                }`}
                              >
                                <td className="py-2.5 px-3 font-semibold text-slate-300">🚛</td>
                                <td className="py-2.5 px-3 font-bold text-white">{alert.reg_no}</td>
                                <td className="py-2.5 px-3 text-slate-300">{alert.ward_no}</td>
                                <td className="py-2.5 px-3 text-slate-300">{alert.driver}</td>
                                <td className="py-2.5 px-3">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                    alert.alert_type === "Stoppage" 
                                      ? "bg-red-500/10 text-red-400 border border-red-500/20 shadow-sm shadow-red-500/5" 
                                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm shadow-amber-500/5"
                                  }`}>
                                    {alert.alert_type}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-300 max-w-[200px] truncate" title={alert.alert_detail}>
                                  {alert.alert_detail}
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-slate-300">{alert.alert_count}</td>
                                <td className="py-2.5 px-3 text-indigo-400 font-bold">{alert.alert_time}</td>
                                
                                {/* Reason Selector */}
                                <td className="py-2.5 px-2" onClick={e => e.stopPropagation()}>
                                  {isResolved ? (
                                    <span className="text-slate-400 font-medium">{alert.reason}</span>
                                  ) : (
                                    <select
                                      value={reasons[alert.id] || STOPPAGE_REASONS[0]}
                                      onChange={(e) =>
                                        setReasons((prev) => ({ ...prev, [alert.id]: e.target.value }))
                                      }
                                      className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-200 outline-none w-36 focus:border-indigo-500/50 cursor-pointer"
                                    >
                                      {STOPPAGE_REASONS.map((r) => (
                                        <option key={r} value={r}>{r}</option>
                                      ))}
                                    </select>
                                  )}
                                </td>

                                {/* Snooze input */}
                                <td className="py-2.5 px-2" onClick={e => e.stopPropagation()}>
                                  {isResolved ? (
                                    <span className="text-slate-500 font-medium">{alert.snooze_duration} Min</span>
                                  ) : (
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="Min"
                                      value={snoozes[alert.id] || ""}
                                      onChange={(e) =>
                                        setSnoozes((prev) => ({
                                          ...prev,
                                          [alert.id]: parseInt(e.target.value) || 0,
                                        }))
                                      }
                                      className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 outline-none w-16 focus:border-indigo-500/50"
                                    />
                                  )}
                                </td>

                                {/* Submit Submit Button */}
                                <td className="py-2.5 px-3 text-center" onClick={e => e.stopPropagation()}>
                                  {isResolved ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-500/10 text-green-400 text-[10px] font-bold rounded-lg border border-green-500/20 shadow-sm shadow-green-500/5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0"></span>
                                      Resolved
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => handleResolveAlert(alert.id)}
                                      className="px-3 py-1 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-bold rounded-lg text-[10px] shadow-sm shadow-green-600/10 transition duration-150"
                                    >
                                      Submit
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  )}

                  {/* --- TAB 2: STARTED VEHICLES --- */}
                  {activeTab === "started" && (
                    <table className="w-full border-collapse text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/40 text-[10px] font-bold uppercase tracking-wider">
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Reg No.</th>
                          <th className="py-2.5 px-3">Ward No.</th>
                          <th className="py-2.5 px-3">Route</th>
                          <th className="py-2.5 px-3">Driver</th>
                          <th className="py-2.5 px-3">Distance Covered (KM)</th>
                          <th className="py-2.5 px-3">Route Covered (%)</th>
                          <th className="py-2.5 px-3">Inorder Route Covered (%)</th>
                          <th className="py-2.5 px-3">Going to TS</th>
                          <th className="py-2.5 px-3">Last Updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {filteredStarted.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="py-8 text-center text-slate-500">No started vehicles found.</td>
                          </tr>
                        ) : (
                          filteredStarted.map((v) => {
                            const isSelected = selectedVehicleId === v.id;
                            return (
                              <tr
                                key={v.id}
                                onClick={() => handleSelectRow(v.id)}
                                className={`hover:bg-slate-850/40 cursor-pointer border-b border-slate-850/30 transition duration-150 ${
                                  isSelected ? "bg-indigo-950/30 border-l-2 border-indigo-500" : ""
                                }`}
                              >
                                <td className="py-2.5 px-3 font-semibold text-slate-300">🚛</td>
                                <td className="py-2.5 px-3 font-bold text-white">{v.reg_no}</td>
                                <td className="py-2.5 px-3 text-slate-300">{v.ward_no}</td>
                                <td className="py-2.5 px-3 text-slate-400">{v.route}</td>
                                <td className="py-2.5 px-3 text-slate-300">{v.driver}</td>
                                <td className="py-2.5 px-3 font-semibold text-slate-300">{v.distance_covered.toFixed(2)} KM</td>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden shrink-0">
                                      <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${v.route_covered_percent}%` }} />
                                    </div>
                                    <span className="font-semibold text-slate-300">{v.route_covered_percent.toFixed(0)}%</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden shrink-0">
                                      <div className="bg-green-500 h-full rounded-full" style={{ width: `${v.inorder_route_percent}%` }} />
                                    </div>
                                    <span className="font-semibold text-green-400">{v.inorder_route_percent.toFixed(0)}%</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${
                                    v.going_to_transfer_station === "Yes" 
                                      ? "bg-green-500/10 text-green-400 border border-green-500/20 shadow-sm shadow-green-500/5" 
                                      : "bg-slate-800/40 text-slate-400 border border-slate-700/20"
                                  }`}>
                                    {v.going_to_transfer_station}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-400">{new Date(v.last_updated).toLocaleTimeString()}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  )}

                  {/* --- TAB 3: UNAUTHORIZED MOVEMENTS --- */}
                  {activeTab === "unauth" && (
                    <table className="w-full border-collapse text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/40 text-[10px] font-bold uppercase tracking-wider">
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Reg No.</th>
                          <th className="py-2.5 px-3">Ward No.</th>
                          <th className="py-2.5 px-3">Driver</th>
                          <th className="py-2.5 px-3">Alerts</th>
                          <th className="py-2.5 px-3">Alert Detail</th>
                          <th className="py-2.5 px-3">Alert Count</th>
                          <th className="py-2.5 px-3">Alert Time</th>
                          <th className="py-2.5 px-3">Reason</th>
                          <th className="py-2.5 px-3">Snooze (Min)</th>
                          <th className="py-2.5 px-3 text-center">Submit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {filteredUnauthorized.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="py-8 text-center text-slate-500">No unauthorized movements found.</td>
                          </tr>
                        ) : (
                          filteredUnauthorized.map((alert) => {
                            const isSelected = selectedVehicleId === alert.vehicle_id;
                            const isResolved = alert.status === "resolved";

                            return (
                              <tr
                                key={alert.id}
                                onClick={() => handleSelectRow(alert.vehicle_id)}
                                className={`hover:bg-slate-850/40 cursor-pointer border-b border-slate-850/30 transition duration-150 ${
                                  isSelected ? "bg-indigo-950/30 border-l-2 border-indigo-500" : ""
                                }`}
                              >
                                <td className="py-2.5 px-3 text-slate-300">🚛</td>
                                <td className="py-2.5 px-3 font-bold text-white">{alert.reg_no}</td>
                                <td className="py-2.5 px-3 text-slate-300">{alert.ward_no}</td>
                                <td className="py-2.5 px-3 text-slate-300">{alert.driver}</td>
                                <td className="py-2.5 px-3">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm shadow-amber-500/5">
                                    {alert.alert_type}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-300">{alert.alert_detail}</td>
                                <td className="py-2.5 px-3 font-semibold text-slate-300">{alert.alert_count}</td>
                                <td className="py-2.5 px-3 text-amber-400 font-bold">{alert.alert_time}</td>
                                
                                {/* Reason */}
                                <td className="py-2.5 px-2" onClick={e => e.stopPropagation()}>
                                  {isResolved ? (
                                    <span className="text-slate-400 font-medium">{alert.reason}</span>
                                  ) : (
                                    <select
                                      value={reasons[alert.id] || STOPPAGE_REASONS[0]}
                                      onChange={(e) =>
                                        setReasons((prev) => ({ ...prev, [alert.id]: e.target.value }))
                                      }
                                      className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-200 outline-none w-36 focus:border-indigo-500/50 cursor-pointer"
                                    >
                                      {STOPPAGE_REASONS.map((r) => (
                                        <option key={r} value={r}>{r}</option>
                                      ))}
                                    </select>
                                  )}
                                </td>

                                {/* Snooze */}
                                <td className="py-2.5 px-2" onClick={e => e.stopPropagation()}>
                                  {isResolved ? (
                                    <span className="text-slate-500 font-medium">{alert.snooze_duration} Min</span>
                                  ) : (
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="Min"
                                      value={snoozes[alert.id] || ""}
                                      onChange={(e) =>
                                        setSnoozes((prev) => ({
                                          ...prev,
                                          [alert.id]: parseInt(e.target.value) || 0,
                                        }))
                                      }
                                      className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 outline-none w-16 focus:border-indigo-500/50"
                                    />
                                  )}
                                </td>

                                {/* Submit Submit Button */}
                                <td className="py-2.5 px-3 text-center" onClick={e => e.stopPropagation()}>
                                  {isResolved ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-500/10 text-green-400 text-[10px] font-bold rounded-lg border border-green-500/20 shadow-sm shadow-green-500/5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0"></span>
                                      Resolved
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => handleResolveAlert(alert.id)}
                                      className="px-3 py-1 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-bold rounded-lg text-[10px] shadow-sm shadow-green-600/10 transition duration-150"
                                    >
                                      Submit
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  )}

                  {/* --- TAB 4: OTHER VEHICLES --- */}
                  {activeTab === "other" && (
                    <table className="w-full border-collapse text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/40 text-[10px] font-bold uppercase tracking-wider">
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Reg No.</th>
                          <th className="py-2.5 px-3">Ward No.</th>
                          <th className="py-2.5 px-3">Route</th>
                          <th className="py-2.5 px-3">Driver</th>
                          <th className="py-2.5 px-3">Current Status</th>
                          <th className="py-2.5 px-3">Distance Covered (KM)</th>
                          <th className="py-2.5 px-3">Going to TS</th>
                          <th className="py-2.5 px-3">Last Updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {filteredOther.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-8 text-center text-slate-500">No other vehicles found.</td>
                          </tr>
                        ) : (
                          filteredOther.map((v) => {
                            const isSelected = selectedVehicleId === v.id;
                            return (
                              <tr
                                key={v.id}
                                onClick={() => handleSelectRow(v.id)}
                                className={`hover:bg-slate-850/40 cursor-pointer border-b border-slate-850/30 transition duration-150 ${
                                  isSelected ? "bg-indigo-950/30 border-l-2 border-indigo-500" : ""
                                }`}
                              >
                                <td className="py-2.5 px-3 text-slate-400">🚛</td>
                                <td className="py-2.5 px-3 font-bold text-white">{v.reg_no}</td>
                                <td className="py-2.5 px-3 text-slate-300">{v.ward_no}</td>
                                <td className="py-2.5 px-3 text-slate-400">{v.route}</td>
                                <td className="py-2.5 px-3 text-slate-300">{v.driver}</td>
                                <td className="py-2.5 px-3 font-semibold text-slate-400">{v.current_status}</td>
                                <td className="py-2.5 px-3 text-slate-300">{v.distance_covered.toFixed(2)} KM</td>
                                <td className="py-2.5 px-3">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${
                                    v.going_to_transfer_station === "Yes" 
                                      ? "bg-green-500/10 text-green-400 border border-green-500/20 shadow-sm shadow-green-500/5" 
                                      : "bg-slate-800/40 text-slate-400 border border-slate-700/20"
                                  }`}>
                                    {v.going_to_transfer_station}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-500">
                                  {v.last_updated ? new Date(v.last_updated).toLocaleTimeString() : "N/A"}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side Drawer Mobile Backdrop */}
        {rightPanelOpen && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000] md:hidden transition-opacity duration-300 animate-fade-in"
            onClick={() => setRightPanelOpen(false)}
          />
        )}

        {/* Right Side: Map Indication Controls Checklist */}
        <aside className={`fixed md:relative right-0 inset-y-0 md:h-full z-[1001] bg-[#090d16]/95 md:bg-[#090d16] border-l border-slate-800 flex flex-col shrink-0 overflow-y-auto custom-scrollbar p-4 space-y-5 transition-all duration-300 ease-in-out ${
          rightPanelOpen 
            ? "w-72 opacity-100 translate-x-0" 
            : "w-0 p-0 border-l-0 opacity-0 overflow-hidden pointer-events-none translate-x-full md:translate-x-0"
        }`}>
          
          <div className="space-y-2 pb-2.5 border-b border-slate-800">
            {/* Header Row 1 */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Map Indication Controls</span>
              <button
                onClick={() => setRightPanelOpen(false)}
                className="text-slate-400 hover:text-white hover:bg-slate-800/80 p-1.5 rounded-lg transition duration-200 active:scale-95 flex items-center justify-center shrink-0"
                title="Collapse Panel"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            
            {/* Header Row 2 */}
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-500 font-semibold uppercase tracking-wider">Layers & Options</span>
              <label className="flex items-center gap-1.5 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-3.5 h-3.5 accent-indigo-500 rounded bg-slate-900 border-slate-700 cursor-pointer focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-slate-400 font-semibold group-hover:text-white transition duration-150">Select All</span>
              </label>
            </div>
          </div>

          {/* Group 1: Layer Options */}
          <div className="space-y-2.5">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Geofences & Layers</h3>
            <div className="space-y-2 pl-1">
              <label className="flex items-center gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showParking}
                  onChange={(e) => setShowParking(e.target.checked)}
                  className="w-4.5 h-4.5 accent-emerald-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="flex items-center gap-1.5">🅿️ Parking Lot(s)</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showTransfer}
                  onChange={(e) => setShowTransfer(e.target.checked)}
                  className="w-4.5 h-4.5 accent-blue-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="flex items-center gap-1.5">🔄 Transfer Station(s)</span>
              </label>

              {ENABLE_FUEL_FEATURES && (
                <label className="flex items-center gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showFuel}
                    onChange={(e) => setShowFuel(e.target.checked)}
                    className="w-4.5 h-4.5 accent-yellow-500 rounded bg-slate-900 border-slate-700"
                  />
                  <span className="flex items-center gap-1.5">⛽ Fuel Station(s)</span>
                </label>
              )}

              <label className="flex items-center gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showWorkshop}
                  onChange={(e) => setShowWorkshop(e.target.checked)}
                  className="w-4.5 h-4.5 accent-purple-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="flex items-center gap-1.5">🛠️ Workshop</span>
              </label>
            </div>
          </div>

          {/* Group 2: Stoppage Duration Filters */}
          <div className="space-y-2.5">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Stoppage Levels</h3>
            <div className="space-y-2 pl-1">
              <label className="flex items-center gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showStop5_10}
                  onChange={(e) => setShowStop5_10(e.target.checked)}
                  className="w-4.5 h-4.5 accent-yellow-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="flex items-center gap-1.5">🟡 Stoppage 5 to 10 mins</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showStop10_15}
                  onChange={(e) => setShowStop10_15(e.target.checked)}
                  className="w-4.5 h-4.5 accent-orange-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="flex items-center gap-1.5">🟠 Stoppage 10 to 15 mins</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showStop15_plus}
                  onChange={(e) => setShowStop15_plus(e.target.checked)}
                  className="w-4.5 h-4.5 accent-red-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="flex items-center gap-1.5">🔴 Stoppage of 15 mins +</span>
              </label>
            </div>
          </div>

          {/* Group 3: Alert Types Checklist */}
          <div className="space-y-2.5">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Alert Filters</h3>
            <div className="space-y-2 pl-1">
              <label className="flex items-center gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showOverspeeding}
                  onChange={(e) => setShowOverspeeding(e.target.checked)}
                  className="w-4.5 h-4.5 accent-red-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="flex items-center gap-1.5">⚡ Over Speeding</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showFastCoverage}
                  onChange={(e) => setShowFastCoverage(e.target.checked)}
                  className="w-4.5 h-4.5 accent-indigo-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="flex items-center gap-1.5">🛻 Fast Coverage</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showDeviation}
                  onChange={(e) => setShowDeviation(e.target.checked)}
                  className="w-4.5 h-4.5 accent-red-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="flex items-center gap-1.5">🍎 Deviation</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showDelay}
                  onChange={(e) => setShowDelay(e.target.checked)}
                  className="w-4.5 h-4.5 accent-yellow-600 rounded bg-slate-900 border-slate-700"
                />
                <span className="flex items-center gap-1.5">⏱️ Delay</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showLateStarted}
                  onChange={(e) => setShowLateStarted(e.target.checked)}
                  className="w-4.5 h-4.5 accent-amber-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="flex items-center gap-1.5">🕒 Late Started</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showUnauthorizedMovement}
                  onChange={(e) => setShowUnauthorizedMovement(e.target.checked)}
                  className="w-4.5 h-4.5 accent-red-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="flex items-center gap-1.5">🛡️ Unauthorized Movement</span>
              </label>
            </div>
          </div>

          {/* Group 4: Routes & Overlays */}
          <div className="space-y-2.5">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Route Overlays</h3>
            <div className="space-y-2 pl-1">
              <label className="flex items-center gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showPlannedRoute}
                  onChange={(e) => setShowPlannedRoute(e.target.checked)}
                  className="w-4.5 h-4.5 accent-indigo-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="flex items-center gap-1.5">🗺️ Planned Route</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showActualMovement}
                  onChange={(e) => setShowActualMovement(e.target.checked)}
                  className="w-4.5 h-4.5 accent-emerald-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="flex items-center gap-1.5">📈 Actual Movement</span>
              </label>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
