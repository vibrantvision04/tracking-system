/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, post } from "@/lib/api";
import { toast } from "react-toastify";
import { useStore, ENABLE_FUEL_FEATURES } from "@/lib/store";
import { centroid } from "@turf/turf";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { populateOpenDepotLayer } from "@/components/OpenDepotMapLayer";

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

interface ZoneInfo {
  ID: number;
  Name: string;
  Color: string;
  StartWard: number;
  EndWard: number;
}

const Zones: ZoneInfo[] = [
  { ID: 1, Name: "Vidyadhar Nagar", Color: "#FEF08A", StartWard: 1, EndWard: 22 },
  { ID: 2, Name: "Jhotwara", Color: "#22D3EE", StartWard: 23, EndWard: 37 },
  { ID: 3, Name: "Sanganer", Color: "#FB923C", StartWard: 38, EndWard: 58 },
  { ID: 4, Name: "Bagru", Color: "#60A5FA", StartWard: 59, EndWard: 72 },
  { ID: 5, Name: "Malviya Nagar", Color: "#2DD4BF", StartWard: 73, EndWard: 87 },
  { ID: 6, Name: "Civil Line", Color: "#94A3B8", StartWard: 88, EndWard: 103 },
  { ID: 7, Name: "Kishanpole", Color: "#EAB308", StartWard: 104, EndWard: 115 },
  { ID: 8, Name: "Adarsh Nagar", Color: "#FCA5A5", StartWard: 116, EndWard: 132 },
  { ID: 9, Name: "Hawamahal", Color: "#EC4899", StartWard: 133, EndWard: 147 },
  { ID: 10, Name: "Amer", Color: "#22C55E", StartWard: 148, EndWard: 150 },
];

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
  const wardsLayerRef = useRef<L.LayerGroup | null>(null);
  const openDepotsLayerRef = useRef<L.LayerGroup | null>(null);

  // Loaded Data States
  const [alerts, setAlerts] = useState<D2DAlert[]>([]);
  const [startedVehicles, setStartedVehicles] = useState<StartedVehicle[]>([]);
  const [unauthorizedVehicles, setUnauthorizedVehicles] = useState<D2DAlert[]>([]);
  const [otherVehicles, setOtherVehicles] = useState<OtherVehicle[]>([]);
  const [geofences, setGeofences] = useState<MapGeofence[]>([]);
  const [regionsList, setRegionsList] = useState<any[]>([]);
  
  // Dropdown list states
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [wardsList, setWardsList] = useState<Ward[]>([]);
  const [routeTypesList, setRouteTypesList] = useState<{ id: number; name: string }[]>([]);
  const [routesList, setRoutesList] = useState<any[]>([]);
  const [shiftsList, setShiftsList] = useState<any[]>([]);

  // Filtering states
  const [selectedZone, setSelectedZone] = useState("Jaipur (All Zones)");
  const [selectedWard, setSelectedWard] = useState("");
  const [selectedRouteType, setSelectedRouteType] = useState("");
  const [selectedShift, setSelectedShift] = useState<string>("Morning Shift");
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const [hasInitializedShift, setHasInitializedShift] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"alerts" | "started" | "unauth" | "other">("alerts");

  // Layer groups for clean updates
  const allRoutesLayerRef = useRef<L.LayerGroup | null>(null);

  // Facilities states
  const [parkingSpots, setParkingSpots] = useState<any[]>([]);
  const [transferStations, setTransferStations] = useState<any[]>([]);
  const [fuelStations, setFuelStations] = useState<any[]>([]);
  const [workshops, setWorkshops] = useState<any[]>([]);

  // Selection states
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Map Controls State (Right side checkboxes)
  const [showParking, setShowParking] = useState(true);
  const [showTransfer, setShowTransfer] = useState(true);
  const [showFuel, setShowFuel] = useState(ENABLE_FUEL_FEATURES);
  const [showWorkshop, setShowWorkshop] = useState(true);
  const [showOpenDepots, setShowOpenDepots] = useState(true);

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
  const [showZoneBoundary, setShowZoneBoundary] = useState(true);
  const [showWardBoundary, setShowWardBoundary] = useState(true);

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
      // Parallelize fetches to reduce loading delay/blocking dramatically
      const [
        dashboardRes,
        zonesRes,
        wardsRes,
        regionsRes,
        routeTypesRes,
        pSpotsRes,
        tStationsRes,
        fStationsRes,
        workshopsRes,
        routesRes,
        shiftsRes
      ] = await Promise.all([
        api<{
          success: boolean;
          alerts: D2DAlert[];
          started_vehicles: StartedVehicle[];
          unauthorized_vehicles: D2DAlert[];
          other_vehicles: OtherVehicle[];
          geofences: MapGeofence[];
          active_shift: string;
        }>("/api/d2d/dashboard").catch(err => {
          console.error("Failed to load dashboard telemetry:", err);
          return { success: false, alerts: [], started_vehicles: [], unauthorized_vehicles: [], other_vehicles: [], geofences: [], active_shift: "" };
        }),
        api<{ success: boolean; data: Zone[] }>("/api/zones").catch(err => {
          console.error("Failed to load zones:", err);
          return { success: false, data: [] };
        }),
        api<{ success: boolean; data: Ward[] }>("/api/wards").catch(err => {
          console.error("Failed to load wards:", err);
          return { success: false, data: [] };
        }),
        api<{ success: boolean; data: any[] }>("/api/regions").catch(err => {
          console.error("Failed to load regions:", err);
          return { success: false, data: [] };
        }),
        api<{ success: boolean; data: { id: number; name: string }[] }>("/api/route-types").catch(err => {
          console.error("Failed to load route types:", err);
          return { success: false, data: [] };
        }),
        api<{ data: any[] }>("/api/parking-spots").catch(err => {
          console.error("Failed to load parking spots:", err);
          return { data: [] };
        }),
        api<{ data: any[] }>("/api/transfer-stations").catch(err => {
          console.error("Failed to load transfer stations:", err);
          return { data: [] };
        }),
        api<{ data: any[] }>("/api/fuel-stations").catch(err => {
          console.error("Failed to load fuel stations:", err);
          return { data: [] };
        }),
        api<{ data: any[] }>("/api/workshops").catch(err => {
          console.error("Failed to load workshops:", err);
          return { data: [] };
        }),
        api<{ success: boolean; data: any[] }>("/api/routes").catch(err => {
          console.error("Failed to load routes:", err);
          return { success: false, data: [] };
        }),
        api<{ success: boolean; data: any[] }>("/api/shifts?group=VEHICLE_MOVEMENT").catch(err => {
          console.error("Failed to load shifts:", err);
          return { success: false, data: [] };
        })
      ]);

      if (dashboardRes.success) {
        setAlerts(dashboardRes.alerts || []);
        setStartedVehicles(dashboardRes.started_vehicles || []);
        setUnauthorizedVehicles(dashboardRes.unauthorized_vehicles || []);
        setOtherVehicles(dashboardRes.other_vehicles || []);
        setGeofences(dashboardRes.geofences || []);
        setActiveShift(dashboardRes.active_shift || "");
        if (!hasInitializedShift) {
          if (dashboardRes.active_shift) {
            setSelectedShift(dashboardRes.active_shift);
          } else {
            setSelectedShift("Morning Shift");
          }
          setHasInitializedShift(true);
        }
      }

      if (zonesRes.success) {
        const allOption = { id: -1, region_name: "Jaipur (All Zones)", name: "Jaipur (All Zones)" } as any;
        setZonesList([allOption, ...(zonesRes.data || [])]);
        localStorage.setItem("d2d_zones", JSON.stringify(zonesRes.data || []));
      }

      if (wardsRes.success) {
        setWardsList(wardsRes.data || []);
        localStorage.setItem("d2d_wards", JSON.stringify(wardsRes.data || []));
      }

      if (regionsRes.success) {
        setRegionsList(regionsRes.data || []);
        localStorage.setItem("d2d_regions", JSON.stringify(regionsRes.data || []));
      }

      if (routeTypesRes.success) {
        setRouteTypesList(routeTypesRes.data || []);
        localStorage.setItem("d2d_route_types", JSON.stringify(routeTypesRes.data || []));
      }

      if (pSpotsRes.data) {
        setParkingSpots(pSpotsRes.data);
        localStorage.setItem("d2d_parking_spots", JSON.stringify(pSpotsRes.data));
      }

      if (tStationsRes.data) {
        setTransferStations(tStationsRes.data);
        localStorage.setItem("d2d_transfer_stations", JSON.stringify(tStationsRes.data));
      }
      
      if (fStationsRes.data) {
        setFuelStations(fStationsRes.data);
        localStorage.setItem("d2d_fuel_stations", JSON.stringify(fStationsRes.data));
      }
      
      if (workshopsRes.data) {
        setWorkshops(workshopsRes.data);
        localStorage.setItem("d2d_workshops", JSON.stringify(workshopsRes.data));
      }

      if (routesRes.success) {
        setRoutesList(routesRes.data || []);
        localStorage.setItem("d2d_routes", JSON.stringify(routesRes.data || []));
      }

      if (shiftsRes.success) {
        setShiftsList(shiftsRes.data || []);
        localStorage.setItem("d2d_shifts", JSON.stringify(shiftsRes.data || []));
      }
    } catch (err) {
      console.error("Failed to load dashboard telemetry", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // SWR: Load static elements instantly from localStorage cache on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const cachedZones = localStorage.getItem("d2d_zones");
        const cachedWards = localStorage.getItem("d2d_wards");
        const cachedRegions = localStorage.getItem("d2d_regions");
        const cachedRouteTypes = localStorage.getItem("d2d_route_types");
        const cachedParking = localStorage.getItem("d2d_parking_spots");
        const cachedTransfer = localStorage.getItem("d2d_transfer_stations");
        const cachedFuel = localStorage.getItem("d2d_fuel_stations");
        const cachedRoutes = localStorage.getItem("d2d_routes");
        const cachedShifts = localStorage.getItem("d2d_shifts");

        if (cachedZones) {
          const parsed = JSON.parse(cachedZones);
          const allOption = { id: -1, region_name: "Jaipur (All Zones)", name: "Jaipur (All Zones)" } as any;
          setZonesList([allOption, ...parsed]);
        }
        if (cachedWards) setWardsList(JSON.parse(cachedWards));
        if (cachedRegions) setRegionsList(JSON.parse(cachedRegions));
        if (cachedRouteTypes) setRouteTypesList(JSON.parse(cachedRouteTypes));
        if (cachedParking) setParkingSpots(JSON.parse(cachedParking));
        if (cachedTransfer) setTransferStations(JSON.parse(cachedTransfer));
        if (cachedFuel) setFuelStations(JSON.parse(cachedFuel));
        if (cachedRoutes) setRoutesList(JSON.parse(cachedRoutes));
        if (cachedShifts) setShiftsList(JSON.parse(cachedShifts));
        
        const cachedWorkshops = localStorage.getItem("d2d_workshops");
        if (cachedWorkshops) setWorkshops(JSON.parse(cachedWorkshops));
      } catch (e) {
        console.warn("Failed to load cached D2DMap layers:", e);
      }
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Initialize Map ───
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const m = L.map(containerRef.current, {
      zoomControl: false,
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
    wardsLayerRef.current = L.layerGroup().addTo(m);
    allRoutesLayerRef.current = L.layerGroup().addTo(m);
    openDepotsLayerRef.current = L.layerGroup().addTo(m);

    // Reposition zoom controls manually to bottomright corner
    L.control.zoom({ position: "bottomright" }).addTo(m);

    mapRef.current = m;

    return () => {
      m.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      geofencesLayerRef.current = null;
      routesLayerRef.current = null;
      wardsLayerRef.current = null;
      allRoutesLayerRef.current = null;
      openDepotsLayerRef.current = null;
    };
  }, []);

  // ─── Select All Control ───
  const handleSelectAll = (checked: boolean) => {
    setShowParking(checked);
    setShowTransfer(checked);
    setShowFuel(checked);
    setShowWorkshop(checked);
    setShowOpenDepots(checked);
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
    setShowZoneBoundary(checked);
    setShowWardBoundary(checked);
  };

  const isAllSelected = 
    showParking && showTransfer && showFuel && showWorkshop && showOpenDepots &&
    showStop5_10 && showStop10_15 && showStop15_plus &&
    showOverspeeding && showFastCoverage && showDeviation && showDelay && showLateStarted && showUnauthorizedMovement &&
    showPlannedRoute && showActualMovement && showZoneBoundary && showWardBoundary;

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

    if (openDepotsLayerRef.current) {
      openDepotsLayerRef.current.clearLayers();
      if (showOpenDepots) {
        populateOpenDepotLayer(L, openDepotsLayerRef.current);
      }
    }

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

    const renderFacilityPolygon = (item: any, typeName: string, emoji: string, defaultColor: string) => {
      if (!item.geojson) return;
      try {
        let feature = item.geojson;
        if (typeof feature === "string") {
          try {
            feature = JSON.parse(feature);
          } catch (e) {
            console.error("Failed to parse geojson string for facility:", e);
            return;
          }
        }
        const center = centroid(feature);
        if (!center || !center.geometry || !center.geometry.coordinates) return;
        const coords = center.geometry.coordinates;
        const latLng = [coords[1], coords[0]] as [number, number];
        
        const color = item.color || defaultColor;

        // Draw Polygon
        L.geoJSON(feature, {
          style: {
            color: color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.2,
            dashArray: "3, 3"
          }
        }).addTo(geofencesLayerRef.current!);

        // Draw Icon
        const icon = L.divIcon({
          className: "",
          html: `<div style="font-size: 16px; transform: translate(-8px, -8px); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${emoji}</div>`,
          iconSize: [20, 20],
        });

        const m = L.marker(latLng, { icon }).addTo(geofencesLayerRef.current!);
        m.bindPopup(`<b style="color: #fff;">${item.name}</b><br/><span style="color:#94a3b8;">Type: ${typeName}</span>`);
      } catch (err) {
        console.error("Failed to render facility:", err);
      }
    };

    // Draw facilities based on toggles
    const facilities: any[] = [];
    if (showParking) facilities.push(...parkingSpots.map(p => ({ ...p, type: 'Parking Spot', icon: '🅿️', color: p.color || '#000000' })));
    if (showTransfer) facilities.push(...transferStations.map(t => ({ ...t, type: 'Transfer Station', icon: '🔄', color: t.color || '#000000' })));
    if (showFuel) facilities.push(...fuelStations.map(f => ({ ...f, type: 'Fuel Station', icon: '⛽', color: f.color || '#000000' })));
    if (showWorkshop) facilities.push(...workshops.map(w => ({ ...w, type: 'Workshop', icon: '🛠️', color: w.color || '#000000' })));

    facilities.forEach(item => {
      renderFacilityPolygon(item, item.type, item.icon, item.color);
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

        // Binding Marker tooltip label (shows on hover to prevent clutter): RJ14GQ5302SW 🚫 🚫 🚫 🚫 🚫 🍎 ⏱️ 🚫 🚫 🚫 (50%)
        mMarker.bindTooltip(
          `<div style="font-family: monospace; font-size: 11px; font-weight: bold; background: #0f172a; border: 1px solid #334155; color: #f8fafc; padding: 2px 6px; border-radius: 4px; white-space: nowrap; display: flex; gap: 6px; align-items: center; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
            <span>${v.reg_no}</span>
            <span style="font-size: 9px; letter-spacing: -1px;">${v.emoji_sequence}</span>
            <span style="color: #3b82f6;">(${v.inorder_route_percent}%)</span>
          </div>`,
          {
            permanent: false,
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
    parkingSpots,
    transferStations,
    fuelStations,
    workshops,
    showParking,
    showTransfer,
    showFuel,
    showWorkshop,
    showOpenDepots,
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

  // ─── Draw Filtered Routes and Lanes ───
  useEffect(() => {
    const map = mapRef.current;
    const layer = allRoutesLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    if (!showPlannedRoute) return;

    // Helper to snap coordinates to a route segment
    const snapToRoute = (latlng: L.LatLng, coords: L.LatLng[]): { snapped: L.LatLng; index: number } => {
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

    // Helper to create flags (pins) for lanes
    const createD2DPinIcon = (type: "start" | "end", number: string | number) => {
      const color = type === "start" ? "#22c55e" : "#ef4444";
      const strokeColor = type === "start" ? "#15803d" : "#b91c1c";
      return L.divIcon({
        className: `lane-${type}-flag-pin`,
        html: `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; width: 22px; height: 28px;">
            <svg width="22" height="28" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.5));">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 9.3 12 18 12 18s12-8.7 12-18c0-6.63-5.37-12-12-12z" fill="${color}" stroke="${strokeColor}" strokeWidth="1.5"/>
              <circle cx="12" cy="12" r="7.5" fill="white"/>
              <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="8.5" fill="${strokeColor}">${number}</text>
            </svg>
          </div>
        `,
        iconSize: [22, 28],
        iconAnchor: [11, 28],
      });
    };

    // Filter logic
    const activeZone = zonesList.find(z => z.region_name === selectedZone);
    const activeWardObj = regionsList.find(r => 
      r.region_type_id === 3 && 
      r.region_name.split(" - ")[0] === selectedWard
    );

    let filtered = routesList;

    // 1. Zone Filter
    if (activeZone && activeZone.id !== -1) {
      filtered = filtered.filter(route => {
        const routeWard = regionsList.find(r => r.region_type_id === 3 && r.id === route.ward_id);
        return routeWard && routeWard.parent_id === activeZone.id;
      });
    }

    // 2. Ward Filter
    if (selectedWard && activeWardObj) {
      filtered = filtered.filter(route => route.ward_id === activeWardObj.id);
    }

    // 3. Shift Filter
    if (selectedShift && selectedShift !== "all") {
      filtered = filtered.filter(route => {
        return route.shift_name === selectedShift || 
               (route.shift_name && route.shift_name.toLowerCase().includes(selectedShift.toLowerCase().split(" ")[0]));
      });
    }

    // 4. Route Filter (if a specific route is selected)
    const isSingleRouteSelected = selectedRouteId && selectedRouteId !== "all";
    if (isSingleRouteSelected) {
      filtered = filtered.filter(route => String(route.id) === selectedRouteId);
    }

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
            let routePts: L.LatLng[] = [];
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
                  let segmentCoords: L.LatLng[] = [];
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
        console.error("Failed to render route on D2DMap:", err);
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
  }, [routesList, selectedZone, selectedWard, selectedShift, selectedRouteId, regionsList, zonesList, showPlannedRoute]);

  // ─── Render Ward Boundaries overlay on map ───
  useEffect(() => {
    const layer = wardsLayerRef.current;
    if (!layer || !mapRef.current) return;

    layer.clearLayers();

    if (!showZoneBoundary && !showWardBoundary) return;

    const isAllJaipur = selectedZone === "Jaipur (All Zones)";

    if (isAllJaipur) {
      // Draw all zones and their wards
      const realZones = zonesList.filter(z => z.id !== -1);
      realZones.forEach((z) => {
        const zoneWards = regionsList.filter(r => 
          r.region_type_id === 3 && 
          r.parent_id === z.id
        );

        const zoneRegion = regionsList.find(r => r.region_type_id === 2 && r.id === z.id);
        const zoneColor = zoneRegion && zoneRegion.color ? zoneRegion.color : "#8b5cf6";

        // Draw Combined Zone boundary for this zone
        if (showZoneBoundary && zoneRegion && zoneRegion.geojson) {
          try {
            const zoneBoundaryLayer = L.geoJSON(zoneRegion.geojson, {
              style: {
                color: zoneColor,
                weight: 4.5,
                fillColor: zoneColor,
                fillOpacity: 0.15,
              }
            });

            zoneBoundaryLayer.bindPopup(`
              <div style="font-family:Inter,sans-serif;font-size:12px;padding:6px;color:#1e293b;">
                <b style="font-size:14px;color:#4f46e5;">${z.region_name || z.name || `Zone ${z.id}`}</b><br/>
                <span style="color:#64748b;font-weight:bold;">Combined Zone Boundary</span><br/>
                <span style="color:#64748b;">Wards: ${zoneWards.length} Total</span>
              </div>
            `);

            zoneBoundaryLayer.on("mouseover", function (e) {
              const layerObj = e.target;
              layerObj.setStyle({
                fillOpacity: 0.25,
                weight: 5.5,
              });
            });

            zoneBoundaryLayer.on("mouseout", function (e) {
              const layerObj = e.target;
              layerObj.setStyle({
                fillOpacity: 0.15,
                weight: 4.5,
              });
            });

            layer.addLayer(zoneBoundaryLayer);
          } catch (err) {
            console.error("Failed to render pre-calculated zone boundary", err);
          }
        }


        // Draw all individual Wards of this zone as thin dividers
        if (showWardBoundary) {
          zoneWards.forEach((w) => {
            if (w.geojson && w.geojson.features && w.geojson.features.length > 0) {
              try {
                const regionGeoJSON = L.geoJSON(w.geojson, {
                  style: {
                    color: w.color || zoneColor,
                    weight: 1.0,
                    dashArray: "3, 4",
                    fillColor: w.color || zoneColor,
                    fillOpacity: 0.0,
                  },
                });

                regionGeoJSON.bindPopup(`
                  <div style="font-family:Inter,sans-serif;font-size:11px;padding:4px;color:#1e293b;">
                    <b style="font-size:13px;color:#4f46e5;">${w.region_name}</b><br/>
                    <span style="color:#64748b;font-weight:bold;"> ${z.region_name}</span><br/>
                    <span style="color:#64748b;">Code: ${w.region_code || "—"}</span>
                  </div>
                `);

                regionGeoJSON.on("mouseover", function (e) {
                  const layerObj = e.target;
                  layerObj.setStyle({
                    fillOpacity: 0.2,
                    weight: 2.2,
                    dashArray: undefined,
                  });
                });

                regionGeoJSON.on("mouseout", function (e) {
                  const layerObj = e.target;
                  layerObj.setStyle({
                    fillOpacity: 0.0,
                    weight: 1.0,
                    dashArray: "3, 4",
                  });
                });

                layer.addLayer(regionGeoJSON);
              } catch (err) {
                console.error("Failed to render ward boundary in Jaipur view", err);
              }
            }
          });
        }
      });

      // Fit map to show all wards
      if (regionsList.length > 0) {
        try {
          const boundsGroup = L.featureGroup();
          regionsList.forEach(w => {
            if (w.region_type_id === 3 && w.geojson && w.geojson.features && w.geojson.features.length > 0) {
              const g = L.geoJSON(w.geojson);
              boundsGroup.addLayer(g);
            }
          });
          const bounds = boundsGroup.getBounds();
          if (bounds.isValid()) {
            mapRef.current.fitBounds(bounds, { padding: [30, 30] });
          }
        } catch (e) {
          // ignore
        }
      }
    } else {
      // Find the currently selected zone ID
      const activeZone = zonesList.find(z => z.region_name === selectedZone);
      if (!activeZone) return;

      // Filter regionsList to only show wards (region_type_id = 3) belonging to the selected Zone
      const activeWards = regionsList.filter(r => 
        r.region_type_id === 3 && 
        r.parent_id === activeZone.id
      );

      const selectedZoneRegion = regionsList.find(r => r.region_type_id === 2 && r.id === activeZone.id);
      const zoneColor = selectedZoneRegion && selectedZoneRegion.color ? selectedZoneRegion.color : "#8b5cf6";

      // 1. Draw Combined Zone Boundary if multiple wards exist and no specific ward is selected
      if (showZoneBoundary && selectedZoneRegion && selectedZoneRegion.geojson && !selectedWard) {
        try {
          const zoneBoundaryLayer = L.geoJSON(selectedZoneRegion.geojson, {
            style: {
              color: zoneColor,
              weight: 4.5,
              fillColor: zoneColor,
              fillOpacity: 0.18,
            }
          });

          zoneBoundaryLayer.bindPopup(`
            <div style="font-family:Inter,sans-serif;font-size:12px;padding:6px;color:#1e293b;">
              <b style="font-size:14px;color:#4f46e5;">${selectedZone}</b><br/>
              <span style="color:#64748b;font-weight:bold;">Combined Zone Boundary</span><br/>
              <span style="color:#64748b;">Wards: 1 to ${activeWards.length} (${activeWards.length} Total)</span>
            </div>
          `);

          zoneBoundaryLayer.on("mouseover", function (e) {
            const layerObj = e.target;
            layerObj.setStyle({
              fillOpacity: 0.28,
              weight: 5.5,
            });
          });

          zoneBoundaryLayer.on("mouseout", function (e) {
            const layerObj = e.target;
            layerObj.setStyle({
              fillOpacity: 0.18,
              weight: 4.5,
            });
          });

          layer.addLayer(zoneBoundaryLayer);
        } catch (err) {
          console.error("Failed to render pre-calculated combined zone boundary", err);
        }
      }


      // 2. Plot individual Wards
      if (showWardBoundary) {
        const wardsToDraw = selectedWard 
          ? activeWards.filter(w => w.region_name.split(" - ")[0] === selectedWard || w.region_code === selectedWard || w.region_name === selectedWard)
          : activeWards;

        wardsToDraw.forEach((w) => {
          if (w.geojson && w.geojson.features && w.geojson.features.length > 0) {
            try {
              const isSelectedWard = selectedWard && (w.region_name.split(" - ")[0] === selectedWard || w.region_code === selectedWard || w.region_name === selectedWard);

              const regionGeoJSON = L.geoJSON(w.geojson, {
                style: {
                  color: w.color || zoneColor,
                  weight: isSelectedWard ? 3.5 : 1.2,
                  dashArray: isSelectedWard ? undefined : "3, 4",
                  fillColor: w.color || zoneColor,
                  fillOpacity: isSelectedWard ? 0.25 : 0.0, // transparent inside when displaying combined boundary to avoid overlap
                },
              });

              regionGeoJSON.bindPopup(`
                <div style="font-family:Inter,sans-serif;font-size:11px;padding:4px;color:#1e293b;">
                  <b style="font-size:13px;color:#4f46e5;">${w.region_name}</b><br/>
                  <span style="color:#64748b;font-weight:bold;"> ${selectedZone}</span><br/>
                  <span style="color:#64748b;">Code: ${w.region_code || "—"}</span>
                </div>
              `);

              regionGeoJSON.on("mouseover", function (e) {
                const layerObj = e.target;
                layerObj.setStyle({
                  fillOpacity: isSelectedWard ? 0.35 : 0.25,
                  weight: isSelectedWard ? 4.5 : 2.5,
                  dashArray: undefined,
                });
              });

              regionGeoJSON.on("mouseout", function (e) {
                const layerObj = e.target;
                layerObj.setStyle({
                  fillOpacity: isSelectedWard ? 0.25 : 0.0,
                  weight: isSelectedWard ? 3.5 : 1.2,
                  dashArray: isSelectedWard ? undefined : "3, 4",
                });
              });

              layer.addLayer(regionGeoJSON);
            } catch (err) {
              console.error("Failed to render ward boundary polygon", w.region_name, err);
            }
          }
        });

        // Optionally pan map to fit the selected/filtered boundaries
        if (wardsToDraw.length > 0) {
          try {
            const boundsGroup = L.featureGroup();
            wardsToDraw.forEach(w => {
              if (w.geojson && w.geojson.features && w.geojson.features.length > 0) {
                const g = L.geoJSON(w.geojson);
                boundsGroup.addLayer(g);
              }
            });
            const bounds = boundsGroup.getBounds();
            if (bounds.isValid()) {
              mapRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
            }
          } catch (e) {
            // quiet fail
          }
        }
      }
    }
  }, [selectedZone, selectedWard, regionsList, zonesList, showZoneBoundary, showWardBoundary]);

  // Automatically select the vehicle's assigned route when a vehicle is selected
  useEffect(() => {
    if (!selectedVehicleId) return;

    // Find the vehicle in startedVehicles or otherVehicles
    const v = startedVehicles.find(sv => sv.id === selectedVehicleId) || 
              otherVehicles.find(ov => ov.id === selectedVehicleId);
    if (!v) return;

    // Resolve the route ID
    let routeIdStr = "";
    const match = routesList.find(r => 
      r.identification && v.route && 
      (r.identification.toLowerCase() === v.route.toLowerCase() ||
       r.route_name.toLowerCase() === v.route.toLowerCase())
    );
    if (match) {
      routeIdStr = String(match.id);
    } else if (v.ward_no) {
      const wardClean = v.ward_no.replace(/\D/g, "");
      const wardRegion = regionsList.find(r => 
        r.region_type_id === 3 && 
        (r.region_name.split(" - ")[0] === wardClean || r.region_code === wardClean || r.region_name.includes(wardClean))
      );
      if (wardRegion) {
        const matchByWard = routesList.find(r => r.ward_id === wardRegion.id);
        if (matchByWard) routeIdStr = String(matchByWard.id);
      }
    }

    if (routeIdStr) {
      setSelectedRouteId(routeIdStr);
      
      // Also match the shift filter if the route has a shift
      const routeObj = routesList.find(r => String(r.id) === routeIdStr);
      if (routeObj && routeObj.shift_name) {
        // Find matching shift in shiftsList
        const matchedShift = shiftsList.find(s => 
          s.shift_name === routeObj.shift_name || 
          s.shift_name.toLowerCase().includes(routeObj.shift_name.toLowerCase().split(" ")[0])
        );
        if (matchedShift) {
          setSelectedShift(matchedShift.shift_name);
        }
      }
    }
  }, [selectedVehicleId, startedVehicles, otherVehicles, routesList, regionsList, shiftsList]);

  // Handle row selection
  const handleSelectRow = (id: number) => {
    setSelectedVehicleId(id);
    setActiveTab(activeTab);
  };

  // Filters calculation
  const activeZone = zonesList.find(z => z.region_name === selectedZone);
  const filteredWardsList = activeZone && activeZone.id !== -1
    ? wardsList.filter(w => w.parent_id === activeZone.id)
    : wardsList;
  
  const distinctWards = Array.from(new Set(filteredWardsList.map((w) => w.region_name))).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, "")) || 0;
    const numB = parseInt(b.replace(/\D/g, "")) || 0;
    return numA - numB;
  });

  const filteredRoutesDropdownList = (() => {
    const activeZone = zonesList.find(z => z.region_name === selectedZone);
    const activeWardObj = regionsList.find(r => 
      r.region_type_id === 3 && 
      r.region_name.split(" - ")[0] === selectedWard
    );

    let filtered = routesList;

    // 1. Zone Filter
    if (activeZone && activeZone.id !== -1) {
      filtered = filtered.filter(route => {
        const routeWard = regionsList.find(r => r.region_type_id === 3 && r.id === route.ward_id);
        return routeWard && routeWard.parent_id === activeZone.id;
      });
    }

    // 2. Ward Filter
    if (selectedWard && activeWardObj) {
      filtered = filtered.filter(route => route.ward_id === activeWardObj.id);
    }

    // 3. Shift Filter
    if (selectedShift && selectedShift !== "all") {
      filtered = filtered.filter(route => {
        return route.shift_name === selectedShift || 
               (route.shift_name && route.shift_name.toLowerCase().includes(selectedShift.toLowerCase().split(" ")[0]));
      });
    }

    return filtered;
  })();

  const filterItem = (reg: string, ward: string) => {
    const matchesSearch = reg.toLowerCase().includes(searchQuery.toLowerCase()) || ward.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesWard = true;
    if (selectedWard) {
      const selectedNum = parseInt(selectedWard.replace(/\D/g, "")) || 0;
      const wardNum = parseInt(ward.replace(/\D/g, "")) || 0;
      matchesWard = selectedNum === wardNum;
    }

    let matchesZone = true;
    if (selectedZone && selectedZone !== "Jaipur (All Zones)" && activeZone) {
      const wardRegion = regionsList.find(r => r.region_type_id === 3 && r.region_name.toLowerCase() === ward.toLowerCase());
      if (wardRegion) {
        matchesZone = wardRegion.parent_id === activeZone.id;
      } else {
        const wardNum = parseInt(ward.replace(/\D/g, "")) || 0;
        const foundWard = regionsList.find(r => r.region_type_id === 3 && parseInt(r.region_name.replace(/\D/g, "")) === wardNum);
        matchesZone = foundWard ? foundWard.parent_id === activeZone.id : false;
      }
    }

    return matchesSearch && matchesWard && matchesZone;
  };

  const filteredAlerts = alerts.filter(a => filterItem(a.reg_no, a.ward_no));
  const filteredStarted = startedVehicles.filter(sv => filterItem(sv.reg_no, sv.ward_no));
  const filteredUnauthorized = unauthorizedVehicles.filter(a => filterItem(a.reg_no, a.ward_no));
  const filteredOther = otherVehicles.filter(ov => filterItem(ov.reg_no, ov.ward_no));

  const zoneOptions = zonesList.map(z => ({ value: z.region_name, label: z.region_name }));

  const wardOptions = [
    { value: "", label: "All Wards" },
    ...distinctWards.map(w => ({ value: w.split(" - ")[0], label: w }))
  ];

  const shiftOptions = [
    { value: "all", label: "All Shifts" },
    ...shiftsList.map(s => ({ value: s.shift_name, label: s.shift_name }))
  ];

  const routeOptions = [
    { value: "", label: "All Routes" },
    ...filteredRoutesDropdownList.map(r => ({ value: String(r.id), label: r.route_name }))
  ];

  const routeTypeOptions = [
    { value: "", label: "All Route Types" },
    ...routeTypesList.map(rt => ({ value: rt.name, label: rt.name }))
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-theme-base text-theme-text overflow-hidden font-sans">
      
      {/* Top Navigation / Filters Bar */}
      <header className="bg-theme-surface border-b border-theme-border shrink-0 z-10 w-full">
        {/* Header Row */}
        <div className="px-4 py-3 lg:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">📊</span>
            <div>
              <h1 className="text-sm font-bold tracking-wider text-theme-accent">SWIFT - NAGAR NIGAM JAIPUR</h1>
              <span className="text-[10px] text-theme-text-dim">Door-to-Door (D2D) Fleet Monitoring Dashboard</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 px-3 py-1.5 bg-theme-elevated border border-theme-border rounded-lg text-xs text-theme-text font-medium">
            <span className="font-bold text-theme-accent">⏱️ Active Shift:</span> {activeShift || "N/A"}
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-4 pb-3 lg:px-6 flex flex-wrap items-center gap-3 border-t border-theme-border/50 pt-3">
          <div className="flex items-center gap-2 min-w-[140px]">
            <span className="text-[9px] text-theme-text-dim uppercase tracking-widest font-bold">Zone</span>
            <SearchableSelect
              value={selectedZone}
              onChange={(val) => {
                setSelectedZone(val);
                setSelectedWard("");
                setSelectedRouteId("");
                setSelectedVehicleId(null);
              }}
              options={zoneOptions}
              placeholder="Select Zone"
              className="flex-1"
            />
          </div>

          <div className="flex items-center gap-2 min-w-[140px]">
            <span className="text-[9px] text-theme-text-dim uppercase tracking-widest font-bold">Ward</span>
            <SearchableSelect
              value={selectedWard}
              onChange={(val) => {
                setSelectedWard(val);
                setSelectedRouteId("");
                setSelectedVehicleId(null);
              }}
              options={wardOptions}
              placeholder="All Wards"
              className="flex-1"
            />
          </div>

          <div className="flex items-center gap-2 min-w-[140px]">
            <span className="text-[9px] text-theme-text-dim uppercase tracking-widest font-bold">Shift</span>
            <SearchableSelect
              value={selectedShift}
              onChange={(val) => {
                setSelectedShift(val);
                setSelectedRouteId("");
                setSelectedVehicleId(null);
              }}
              options={shiftOptions}
              placeholder="All Shifts"
              className="flex-1"
            />
          </div>

          <div className="flex items-center gap-2 min-w-[160px]">
            <span className="text-[9px] text-theme-text-dim uppercase tracking-widest font-bold">Route</span>
            <SearchableSelect
              value={selectedRouteId}
              onChange={(val) => {
                setSelectedRouteId(val);
                setSelectedVehicleId(null);
              }}
              options={routeOptions}
              placeholder="All Routes"
              className="flex-1"
            />
          </div>

          <div className="flex items-center gap-2 min-w-[140px]">
            <span className="text-[9px] text-theme-text-dim uppercase tracking-widest font-bold">Route Type</span>
            <SearchableSelect
              value={selectedRouteType}
              onChange={(val) => setSelectedRouteType(val)}
              options={routeTypeOptions}
              placeholder="All Types"
              className="flex-1"
            />
          </div>

          <button
            onClick={() => {
              setSelectedZone("Jaipur (All Zones)");
              setSelectedWard("");
              setSelectedRouteId("");
              setSelectedRouteType("");
              setSelectedShift("Morning Shift");
              setSearchQuery("");
              setSelectedVehicleId(null);
            }}
            className="ml-auto px-3 py-1.5 text-xs font-bold border border-theme-border bg-theme-base hover:bg-theme-elevated text-theme-text-dim rounded-lg transition cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        
        {/* Left Side: Map + Bottom Tables */}
        <div className="flex-1 flex flex-col min-w-0 h-full">
          
          {/* Map area */}
          <div className="flex-1 relative min-h-[250px] sm:min-h-[300px] bg-theme-surface">
            <div ref={containerRef} className="absolute inset-0 z-0" />
            
            {/* Quick search floating overlay */}
            <div className="absolute top-4 left-4 z-10 bg-theme-surface/90 border border-theme-border rounded-lg p-2 flex items-center gap-2 shadow-2xl backdrop-blur-md">
              <input
                type="text"
                placeholder="Search Reg No..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-black/35 px-3 py-1.5 border border-theme-border rounded text-xs text-theme-text placeholder:text-theme-text-dim focus:border-indigo-500 outline-none w-52 transition duration-200"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-theme-text-dim hover:text-theme-text text-xs px-1">✕</button>
              )}
            </div>

            {/* Floating button to open right panel when closed */}
            {!rightPanelOpen && (
              <button
                onClick={() => setRightPanelOpen(true)}
                className="absolute top-4 right-4 z-[1000] bg-theme-surface/95 border border-indigo-500/30 hover:border-indigo-500/80 rounded-xl px-3.5 py-2 flex items-center gap-2 shadow-2xl backdrop-blur-md text-xs font-bold text-theme-accent hover:text-theme-text hover:bg-indigo-950/40 transition-all duration-300 active:scale-95 group animate-fade-in"
              >
                <svg className="w-4 h-4 text-theme-accent group-hover:rotate-45 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Layers & Filters</span>
                <svg className="w-3.5 h-3.5 text-indigo-500 group-hover:text-theme-text transition-transform duration-200 group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
          </div>

          {/* Bottom Tables Tabs */}
          <div className={`border-t border-theme-border bg-theme-base flex flex-col relative shrink-0 transition-all duration-300 ease-in-out ${
            bottomPanelOpen ? "h-[320px] md:h-[380px]" : "h-12 overflow-hidden"
          }`}>
            
            {/* Tab selection triggers */}
            <div className="flex h-12 border-b border-theme-border bg-theme-surface px-4 items-center justify-between">
              <div className="flex gap-1 h-full overflow-x-auto custom-scrollbar flex-1 whitespace-nowrap">
                <button
                  onClick={() => {
                    if (activeTab === "alerts") {
                      setBottomPanelOpen(!bottomPanelOpen);
                    } else {
                      setActiveTab("alerts");
                      setBottomPanelOpen(true);
                    }
                  }}
                  className={`h-full px-4 text-xs font-semibold flex items-center gap-2 rounded-t-lg transition-all duration-200 ${
                    activeTab === "alerts"
                      ? "bg-red-950/30 text-red-400 border-b-2 border-red-500"
                      : "text-theme-text-dim hover:text-theme-text hover:bg-theme-elevated/50"
                  }`}
                >
                  <span>⚠️ Alerts</span>
                  <span className="px-2 py-0.5 bg-red-500/20 text-red-300 rounded-full text-[10px] font-bold min-w-[20px] text-center">
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
                  className={`h-full px-4 text-xs font-semibold flex items-center gap-2 rounded-t-lg transition-all duration-200 ${
                    activeTab === "started"
                      ? "bg-green-950/30 text-green-400 border-b-2 border-green-500"
                      : "text-theme-text-dim hover:text-theme-text hover:bg-theme-elevated/50"
                  }`}
                >
                  <span>🟢 Active</span>
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded-full text-[10px] font-bold min-w-[20px] text-center">
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
                  className={`h-full px-4 text-xs font-semibold flex items-center gap-2 rounded-t-lg transition-all duration-200 ${
                    activeTab === "unauth"
                      ? "bg-amber-950/30 text-amber-400 border-b-2 border-amber-500"
                      : "text-theme-text-dim hover:text-theme-text hover:bg-theme-elevated/50"
                  }`}
                >
                  <span>🛡️ Unauthorized</span>
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full text-[10px] font-bold min-w-[20px] text-center">
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
                  className={`h-full px-4 text-xs font-semibold flex items-center gap-2 rounded-t-lg transition-all duration-200 ${
                    activeTab === "other"
                      ? "bg-slate-800/30 text-theme-text border-b-2 border-slate-500"
                      : "text-theme-text-dim hover:text-theme-text hover:bg-theme-elevated/50"
                  }`}
                >
                  <span>💤 Other</span>
                  <span className="px-2 py-0.5 bg-slate-500/20 text-slate-300 rounded-full text-[10px] font-bold min-w-[20px] text-center">
                    {filteredOther.length}
                  </span>
                </button>
              </div>

              <button
                onClick={() => setBottomPanelOpen(!bottomPanelOpen)}
                className="ml-2 px-3 py-1.5 text-xs font-bold border border-theme-border bg-theme-base hover:bg-theme-elevated text-theme-text-dim rounded-lg transition cursor-pointer flex items-center gap-1.5"
                title={bottomPanelOpen ? "Collapse Panel" : "Expand Panel"}
              >
                {bottomPanelOpen ? (
                  <>
                    <span>▼</span>
                    <span className="hidden sm:inline">Collapse</span>
                  </>
                ) : (
                  <>
                    <span>▲</span>
                    <span className="hidden sm:inline">Expand</span>
                  </>
                )}
              </button>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto custom-scrollbar p-3">
              {loading ? (
                <div className="h-full flex items-center justify-center text-xs text-theme-text-dim">Loading fleet tables...</div>
              ) : (
                <div className="overflow-x-auto w-full min-w-0 custom-scrollbar pb-2">
                  {/* --- TAB 1: ALL ALERTS --- */}
                  {activeTab === "alerts" && (
                    <table className="w-full border-collapse text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-theme-border text-theme-text-dim bg-theme-surface/30">
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
                      <tbody className="divide-y divide-theme-border">
                        {filteredAlerts.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="py-8 text-center text-theme-text-dim">No active alerts found.</td>
                          </tr>
                        ) : (
                          filteredAlerts.map((alert) => {
                            const isSelected = selectedVehicleId === alert.vehicle_id;
                            const isResolved = alert.status === "resolved";

                            return (
                              <tr
                                key={alert.id}
                                onClick={() => handleSelectRow(alert.vehicle_id)}
                                className={`hover:bg-theme-surface/40 cursor-pointer border-b border-theme-border transition duration-150 ${
                                  isSelected ? "bg-indigo-950/30 border-l-2 border-indigo-500" : ""
                                }`}
                              >
                                <td className="py-2.5 px-3 font-semibold text-theme-text">🚛</td>
                                <td className="py-2.5 px-3 font-bold text-theme-text">{alert.reg_no}</td>
                                <td className="py-2.5 px-3 text-theme-text">{alert.ward_no}</td>
                                <td className="py-2.5 px-3 text-theme-text">{alert.driver}</td>
                                <td className="py-2.5 px-3">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                    alert.alert_type === "Stoppage" 
                                      ? "bg-red-500/10 text-red-400 border border-red-500/20 shadow-sm shadow-red-500/5" 
                                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm shadow-amber-500/5"
                                  }`}>
                                    {alert.alert_type}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-theme-text max-w-[200px] truncate" title={alert.alert_detail}>
                                  {alert.alert_detail}
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-theme-text">{alert.alert_count}</td>
                                <td className="py-2.5 px-3 text-theme-accent font-bold">{alert.alert_time}</td>
                                
                                {/* Reason Selector */}
                                 <td className="py-2.5 px-2" onClick={e => e.stopPropagation()}>
                                   {isResolved ? (
                                     <span className="text-theme-text-dim font-medium">{alert.reason}</span>
                                   ) : (
                                     <select
                                       value={reasons[alert.id] || STOPPAGE_REASONS[0]}
                                       onChange={(e) =>
                                         setReasons((prev) => ({ ...prev, [alert.id]: e.target.value }))
                                       }
                                       className="bg-theme-surface border border-theme-border hover:border-indigo-500/40 rounded-lg px-2.5 py-1.5 text-[11px] text-theme-text outline-none w-36 focus:border-emerald-500 cursor-pointer transition"
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
                                     <span className="text-theme-text-dim font-medium">{alert.snooze_duration} Min</span>
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
                                       className="bg-theme-surface border border-theme-border hover:border-indigo-500/40 rounded-lg px-2 py-1.5 text-[11px] text-theme-text outline-none w-16 focus:border-emerald-500 text-center transition"
                                     />
                                   )}
                                 </td>

                                 {/* Submit Submit Button */}
                                 <td className="py-2.5 px-3 text-center" onClick={e => e.stopPropagation()}>
                                   {isResolved ? (
                                     <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-theme-surface-hover0/10 text-emerald-400 text-[9px] font-extrabold uppercase tracking-wider rounded-lg border border-emerald-500/20 shadow-sm shadow-emerald-500/5">
                                       <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                                       Resolved
                                     </span>
                                   ) : (
                                     <button
                                       onClick={() => handleResolveAlert(alert.id)}
                                       className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-extrabold uppercase tracking-wider rounded-lg text-[9px] shadow-md shadow-emerald-950/60 transition duration-150"
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
                        <tr className="border-b border-theme-border text-theme-text-dim bg-theme-surface text-[10px] font-bold uppercase tracking-wider">
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
                      <tbody className="divide-y divide-theme-border">
                        {filteredStarted.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="py-8 text-center text-theme-text-dim">No started vehicles found.</td>
                          </tr>
                        ) : (
                          filteredStarted.map((v) => {
                            const isSelected = selectedVehicleId === v.id;
                            return (
                              <tr
                                key={v.id}
                                onClick={() => handleSelectRow(v.id)}
                                className={`hover:bg-theme-surface/40 cursor-pointer border-b border-theme-border transition duration-150 ${
                                  isSelected ? "bg-indigo-950/30 border-l-2 border-indigo-500" : ""
                                }`}
                              >
                                <td className="py-2.5 px-3 font-semibold text-theme-text">🚛</td>
                                <td className="py-2.5 px-3 font-bold text-theme-text">{v.reg_no}</td>
                                <td className="py-2.5 px-3 text-theme-text">{v.ward_no}</td>
                                <td className="py-2.5 px-3 text-theme-text-dim">{v.route}</td>
                                <td className="py-2.5 px-3 text-theme-text">{v.driver}</td>
                                <td className="py-2.5 px-3 font-semibold text-theme-text">{v.distance_covered.toFixed(2)} KM</td>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden shrink-0">
                                      <div className="bg-theme-surface-hover0 h-full rounded-full" style={{ width: `${v.route_covered_percent}%` }} />
                                    </div>
                                    <span className="font-semibold text-theme-text">{v.route_covered_percent.toFixed(0)}%</span>
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
                                      : "bg-slate-800/40 text-theme-text-dim border border-theme-border/20"
                                  }`}>
                                    {v.going_to_transfer_station}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-theme-text-dim">{new Date(v.last_updated).toLocaleTimeString()}</td>
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
                        <tr className="border-b border-theme-border text-theme-text-dim bg-theme-surface text-[10px] font-bold uppercase tracking-wider">
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
                      <tbody className="divide-y divide-theme-border">
                        {filteredUnauthorized.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="py-8 text-center text-theme-text-dim">No unauthorized movements found.</td>
                          </tr>
                        ) : (
                          filteredUnauthorized.map((alert) => {
                            const isSelected = selectedVehicleId === alert.vehicle_id;
                            const isResolved = alert.status === "resolved";

                            return (
                              <tr
                                key={alert.id}
                                onClick={() => handleSelectRow(alert.vehicle_id)}
                                className={`hover:bg-theme-surface/40 cursor-pointer border-b border-theme-border transition duration-150 ${
                                  isSelected ? "bg-indigo-950/30 border-l-2 border-indigo-500" : ""
                                }`}
                              >
                                <td className="py-2.5 px-3 text-theme-text">🚛</td>
                                <td className="py-2.5 px-3 font-bold text-theme-text">{alert.reg_no}</td>
                                <td className="py-2.5 px-3 text-theme-text">{alert.ward_no}</td>
                                <td className="py-2.5 px-3 text-theme-text">{alert.driver}</td>
                                <td className="py-2.5 px-3">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm shadow-amber-500/5">
                                    {alert.alert_type}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-theme-text">{alert.alert_detail}</td>
                                <td className="py-2.5 px-3 font-semibold text-theme-text">{alert.alert_count}</td>
                                <td className="py-2.5 px-3 text-amber-400 font-bold">{alert.alert_time}</td>
                                
                                {/* Reason */}
                                <td className="py-2.5 px-2" onClick={e => e.stopPropagation()}>
                                  {isResolved ? (
                                    <span className="text-theme-text-dim font-medium">{alert.reason}</span>
                                  ) : (
                                    <select
                                      value={reasons[alert.id] || STOPPAGE_REASONS[0]}
                                      onChange={(e) =>
                                        setReasons((prev) => ({ ...prev, [alert.id]: e.target.value }))
                                      }
                                      className="bg-theme-surface border border-theme-border rounded-lg px-2.5 py-1 text-[11px] text-theme-text outline-none w-36 focus:border-emerald-500 cursor-pointer"
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
                                    <span className="text-theme-text-dim font-medium">{alert.snooze_duration} Min</span>
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
                                      className="bg-theme-surface border border-theme-border rounded-lg px-2 py-1 text-[11px] text-theme-text outline-none w-16 focus:border-emerald-500"
                                    />
                                  )}
                                </td>

                                {/* Submit Submit Button */}
                                <td className="py-2.5 px-3 text-center" onClick={e => e.stopPropagation()}>
                                  {isResolved ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-theme-surface-hover0/10 text-emerald-400 text-[10px] font-bold rounded-lg border border-emerald-500/20 shadow-sm shadow-emerald-500/5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                                      Resolved
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => handleResolveAlert(alert.id)}
                                      className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-bold rounded-lg text-[10px] shadow-md shadow-emerald-950/60 transition duration-150"
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
                        <tr className="border-b border-theme-border text-theme-text-dim bg-theme-surface text-[10px] font-bold uppercase tracking-wider">
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
                      <tbody className="divide-y divide-theme-border">
                        {filteredOther.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-8 text-center text-theme-text-dim">No other vehicles found.</td>
                          </tr>
                        ) : (
                          filteredOther.map((v) => {
                            const isSelected = selectedVehicleId === v.id;
                            return (
                              <tr
                                key={v.id}
                                onClick={() => handleSelectRow(v.id)}
                                className={`hover:bg-theme-surface/40 cursor-pointer border-b border-theme-border transition duration-150 ${
                                  isSelected ? "bg-indigo-950/30 border-l-2 border-indigo-500" : ""
                                }`}
                              >
                                <td className="py-2.5 px-3 text-theme-text-dim">🚛</td>
                                <td className="py-2.5 px-3 font-bold text-theme-text">{v.reg_no}</td>
                                <td className="py-2.5 px-3 text-theme-text">{v.ward_no}</td>
                                <td className="py-2.5 px-3 text-theme-text-dim">{v.route}</td>
                                <td className="py-2.5 px-3 text-theme-text">{v.driver}</td>
                                <td className="py-2.5 px-3 font-semibold text-theme-text-dim">{v.current_status}</td>
                                <td className="py-2.5 px-3 text-theme-text">{v.distance_covered.toFixed(2)} KM</td>
                                <td className="py-2.5 px-3">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${
                                    v.going_to_transfer_station === "Yes" 
                                      ? "bg-green-500/10 text-green-400 border border-green-500/20 shadow-sm shadow-green-500/5" 
                                      : "bg-slate-800/40 text-theme-text-dim border border-theme-border/20"
                                  }`}>
                                    {v.going_to_transfer_station}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-theme-text-dim">
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
        <aside className={`fixed md:relative right-0 inset-y-0 md:h-full z-[1001] bg-theme-surface/95 md:bg-theme-surface border-l border-theme-border flex flex-col shrink-0 overflow-y-auto custom-scrollbar p-4 space-y-5 transition-all duration-300 ease-in-out ${
          rightPanelOpen 
            ? "w-72 opacity-100 translate-x-0" 
            : "w-0 p-0 border-l-0 opacity-0 overflow-hidden pointer-events-none translate-x-full md:translate-x-0"
        }`}>
          
          <div className="space-y-3 pb-3 border-b border-theme-border">
            {/* Header Row */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-theme-accent uppercase tracking-wider">Map Controls</span>
              <button
                onClick={() => setRightPanelOpen(false)}
                className="text-theme-text-dim hover:text-theme-text hover:bg-slate-800/80 p-1.5 rounded-lg transition duration-200 active:scale-95 flex items-center justify-center shrink-0"
                title="Collapse Panel"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            
            {/* Select All */}
            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="w-4 h-4 accent-indigo-500 rounded bg-theme-surface border-theme-border cursor-pointer"
              />
              <span className="text-xs text-theme-text-dim font-semibold group-hover:text-theme-text transition">Select All Layers</span>
            </label>
          </div>

          {/* Group 1: Facilities */}
          <details className="group border border-theme-border/40 rounded-xl bg-theme-surface/25 transition-all duration-300 overflow-hidden" open>
            <summary className="flex items-center justify-between p-3 text-[10px] font-bold text-theme-text-dim uppercase tracking-widest cursor-pointer select-none hover:bg-theme-surface transition-colors">
              <span>📍 Facilities</span>
              <span className="text-[8px] text-theme-text-dim transition-transform duration-300 group-open:rotate-90">▶</span>
            </summary>
            <div className="p-3 pt-1.5 space-y-2 border-t border-theme-border/20 pl-4">
              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showParking}
                  onChange={(e) => setShowParking(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">🅿️ Parking Lots</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showTransfer}
                  onChange={(e) => setShowTransfer(e.target.checked)}
                  className="w-4 h-4 accent-blue-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">🔄 Transfer Stations</span>
              </label>

              {ENABLE_FUEL_FEATURES && (
                <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showFuel}
                    onChange={(e) => setShowFuel(e.target.checked)}
                    className="w-4 h-4 accent-yellow-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                  />
                  <span className="flex items-center gap-1.5">⛽ Fuel Stations</span>
                </label>
              )}

              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showWorkshop}
                  onChange={(e) => setShowWorkshop(e.target.checked)}
                  className="w-4 h-4 accent-purple-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">🛠️ Workshop</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showOpenDepots}
                  onChange={(e) => setShowOpenDepots(e.target.checked)}
                  className="w-4 h-4 accent-slate-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">🏭 Open Depots</span>
              </label>
            </div>
          </details>

          {/* Group 2: Stoppage Thresholds */}
          <details className="group border border-theme-border/40 rounded-xl bg-theme-surface/25 transition-all duration-300 overflow-hidden" open>
            <summary className="flex items-center justify-between p-3 text-[10px] font-bold text-theme-text-dim uppercase tracking-widest cursor-pointer select-none hover:bg-theme-surface transition-colors">
              <span>⏱️ Stoppage Thresholds</span>
              <span className="text-[8px] text-theme-text-dim transition-transform duration-300 group-open:rotate-90">▶</span>
            </summary>
            <div className="p-3 pt-1.5 space-y-2 border-t border-theme-border/20 pl-4">
              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showStop5_10}
                  onChange={(e) => setShowStop5_10(e.target.checked)}
                  className="w-4 h-4 accent-yellow-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">🟡 5-10 mins</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showStop10_15}
                  onChange={(e) => setShowStop10_15(e.target.checked)}
                  className="w-4 h-4 accent-orange-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">🟠 10-15 mins</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showStop15_plus}
                  onChange={(e) => setShowStop15_plus(e.target.checked)}
                  className="w-4 h-4 accent-red-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">🔴 15+ mins</span>
              </label>
            </div>
          </details>

          {/* Group 3: Alert Filters */}
          <details className="group border border-theme-border/40 rounded-xl bg-theme-surface/25 transition-all duration-300 overflow-hidden" open>
            <summary className="flex items-center justify-between p-3 text-[10px] font-bold text-theme-text-dim uppercase tracking-widest cursor-pointer select-none hover:bg-theme-surface transition-colors">
              <span>⚠️ Alert Filters</span>
              <span className="text-[8px] text-theme-text-dim transition-transform duration-300 group-open:rotate-90">▶</span>
            </summary>
            <div className="p-3 pt-1.5 space-y-2 border-t border-theme-border/20 pl-4">
              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showOverspeeding}
                  onChange={(e) => setShowOverspeeding(e.target.checked)}
                  className="w-4 h-4 accent-red-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">⚡ Over Speeding</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showFastCoverage}
                  onChange={(e) => setShowFastCoverage(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">🛻 Fast Coverage</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showDeviation}
                  onChange={(e) => setShowDeviation(e.target.checked)}
                  className="w-4 h-4 accent-red-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">🍎 Deviation</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showDelay}
                  onChange={(e) => setShowDelay(e.target.checked)}
                  className="w-4 h-4 accent-yellow-600 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">⏱️ Delay</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showLateStarted}
                  onChange={(e) => setShowLateStarted(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">🕒 Late Started</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showUnauthorizedMovement}
                  onChange={(e) => setShowUnauthorizedMovement(e.target.checked)}
                  className="w-4 h-4 accent-red-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">🛡️ Unauthorized</span>
              </label>
            </div>
          </details>

          {/* Group 4: Route Overlays */}
          <details className="group border border-theme-border/40 rounded-xl bg-theme-surface/25 transition-all duration-300 overflow-hidden" open>
            <summary className="flex items-center justify-between p-3 text-[10px] font-bold text-theme-text-dim uppercase tracking-widest cursor-pointer select-none hover:bg-theme-surface transition-colors">
              <span>🛣️ Route Overlays</span>
              <span className="text-[8px] text-theme-text-dim transition-transform duration-300 group-open:rotate-90">▶</span>
            </summary>
            <div className="p-3 pt-1.5 space-y-2 border-t border-theme-border/20 pl-4">
              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showPlannedRoute}
                  onChange={(e) => setShowPlannedRoute(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">🗺️ Planned Route</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showActualMovement}
                  onChange={(e) => setShowActualMovement(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">📈 Actual Movement</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showZoneBoundary}
                  onChange={(e) => setShowZoneBoundary(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">⭕ Zone Boundary</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-theme-text hover:text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showWardBoundary}
                  onChange={(e) => setShowWardBoundary(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded bg-theme-surface border-theme-border cursor-pointer"
                />
                <span className="flex items-center gap-1.5">💠 Ward Boundary</span>
              </label>
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
