/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Vehicle, LivePosition } from "@/lib/types";
import { api, wsUrl } from "@/lib/api";
import { useStore } from "@/lib/store";
import * as turf from "@turf/turf";
import { populateOpenDepotLayer } from "@/components/OpenDepotMapLayer";
import SearchableSelect from "@/components/ui/SearchableSelect";
import MultiSelect from "@/components/ui/MultiSelect";

// ─── Smooth marker slide animation ───
function slideMarkerTo(
  marker: L.Marker,
  target: [number, number],
  durationMs: number,
  animStore: Record<string, number>,
  key: string
) {
  if (animStore[key]) {
    cancelAnimationFrame(animStore[key]);
    delete animStore[key];
  }
  const start = marker.getLatLng();
  const end = L.latLng(target);
  const dist = start.distanceTo(end);
  if (dist <= 1 || dist >= 5000 || durationMs <= 0) {
    marker.setLatLng(end);
    return;
  }
  const t0 = performance.now();
  function step(now: number) {
    const t = Math.min((now - t0) / durationMs, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    marker.setLatLng([
      start.lat + (end.lat - start.lat) * ease,
      start.lng + (end.lng - start.lng) * ease,
    ]);
    if (t < 1) animStore[key] = requestAnimationFrame(step);
    else delete animStore[key];
  }
  animStore[key] = requestAnimationFrame(step);
}

// Inject live-pulse CSS once
if (typeof document !== "undefined" && !document.getElementById("lm-pulse")) {
  const s = document.createElement("style");
  s.id = "lm-pulse";
  s.textContent = `
    @keyframes lm-pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.45)}70%{box-shadow:0 0 0 10px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
    .lm-moving{animation:lm-pulse 2s ease-out infinite}
    .lm-ws-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px;flex-shrink:0}
    .lm-tooltip{background:#1e293b !important;border:1px solid #475569 !important;color:#f8fafc !important;font-weight:600;font-size:10px;padding:2px 6px;border-radius:4px;box-shadow:0 4px 10px rgba(0,0,0,0.3)}
    .leaflet-tooltip-top:before{border-top-color:#1e293b !important}
  `;
  document.head.appendChild(s);
}

interface Props { 
  vehicles: Vehicle[];
  showMenu?: boolean;
}

export default function LiveMap({ vehicles, showMenu = true }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef<Record<string, L.Marker>>({});
  // Cache last rendered icon key (color+emoji) per IMEI — skip icon rebuild when unchanged
  const iconCache = useRef<Record<string, { color: string; emoji: string }>>({});
  const animFrames = useRef<Record<string, number>>({});
  const wardsLayerRef = useRef<L.LayerGroup | null>(null);
  const transferStationsLayerRef = useRef<L.LayerGroup | null>(null);
  const parkingSpotsLayerRef = useRef<L.LayerGroup | null>(null);
  const fuelStationsLayerRef = useRef<L.LayerGroup | null>(null);
  const workshopsLayerRef = useRef<L.LayerGroup | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [selectedWard, setSelectedWard] = useState<string>("all");
  const [selectedVehicleType, setSelectedVehicleType] = useState<string>("all");
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [hasInitializedVehicles, setHasInitializedVehicles] = useState(false);
  const [showRegistrationNo, setShowRegistrationNo] = useState(false);

  const [livePos, setLivePos] = useState<Record<string, LivePosition>>({});
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("selectedZone");
      return cached !== null ? cached : "all"; // Default to show everything
    }
    return "all";
  });
  const [zones, setZones] = useState<any[]>([]);
  const [regionsList, setRegionsList] = useState<any[]>([]);

  const [parkingSpots, setParkingSpots] = useState<any[]>([]);
  const [transferStations, setTransferStations] = useState<any[]>([]);
  const [fuelStations, setFuelStations] = useState<any[]>([]);
  const [workshops, setWorkshops] = useState<any[]>([]);

  // SWR: Load static elements instantly from localStorage cache on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const cachedZones = localStorage.getItem("live_zones");
        const cachedRegions = localStorage.getItem("live_regions");
        const cachedParking = localStorage.getItem("live_parking_spots");
        const cachedTransfer = localStorage.getItem("live_transfer_stations");
        const cachedFuel = localStorage.getItem("live_fuel_stations");
        const cachedWorkshops = localStorage.getItem("live_workshops");

        if (cachedZones) setZones(JSON.parse(cachedZones));
        if (cachedRegions) setRegionsList(JSON.parse(cachedRegions));
        if (cachedParking) setParkingSpots(JSON.parse(cachedParking));
        if (cachedTransfer) setTransferStations(JSON.parse(cachedTransfer));
        if (cachedFuel) setFuelStations(JSON.parse(cachedFuel));
        if (cachedWorkshops) setWorkshops(JSON.parse(cachedWorkshops));
      } catch (e) {
        console.warn("Failed to load cached LiveMap layers:", e);
      }
    }
  }, []);

  // Initialize selectedVehicles with all IMEIs on load
  useEffect(() => {
    if (vehicles.length > 0 && !hasInitializedVehicles) {
      const imeis = vehicles.map(v => v.gps_device?.imei).filter(Boolean) as string[];
      setSelectedVehicles(imeis);
      setHasInitializedVehicles(true);
    }
  }, [vehicles, hasInitializedVehicles]);

  // When filters change, auto-select all vehicles matching the new filters
  const lastFilters = useRef({ zone: selectedZone, ward: selectedWard, type: selectedVehicleType });
  useEffect(() => {
    if (
      lastFilters.current.zone !== selectedZone ||
      lastFilters.current.ward !== selectedWard ||
      lastFilters.current.type !== selectedVehicleType
    ) {
      const matched = vehicles.filter((v) => {
        if (selectedZone && selectedZone !== "all") {
          if ((v as any).zone_id !== parseInt(selectedZone) && v.assigned_zone_id !== parseInt(selectedZone)) return false;
        }
        if (selectedWard && selectedWard !== "all") {
          if ((v as any).ward_id !== parseInt(selectedWard) && v.assigned_ward_id !== parseInt(selectedWard)) return false;
        }
        if (selectedVehicleType && selectedVehicleType !== "all") {
          if (v.vehicle_type?.name !== selectedVehicleType) return false;
        }
        return true;
      });
      const imeis = matched.map(v => v.gps_device?.imei).filter(Boolean) as string[];
      setSelectedVehicles(imeis);
      lastFilters.current = { zone: selectedZone, ward: selectedWard, type: selectedVehicleType };
    }
  }, [selectedZone, selectedWard, selectedVehicleType, vehicles]);

  useEffect(() => {
    Promise.all([
      api<{ data: any[] }>("/api/zones").then((res) => {
        setZones(res.data || []);
        localStorage.setItem("live_zones", JSON.stringify(res.data || []));
      }).catch(err => console.error("LiveMap failed to load zones:", err)),
      
      api<{ success: boolean; data: any[] }>("/api/regions").then((res) => {
        if (res.success) {
          setRegionsList(res.data || []);
          localStorage.setItem("live_regions", JSON.stringify(res.data || []));
        }
      }).catch(err => console.error("LiveMap failed to load regions:", err)),
      
      api<{ data: any[] }>("/api/parking-spots").then((res) => {
        setParkingSpots(res.data || []);
        localStorage.setItem("live_parking_spots", JSON.stringify(res.data || []));
      }).catch(err => console.error("LiveMap failed to load parking spots:", err)),
      
      api<{ data: any[] }>("/api/transfer-stations").then((res) => {
        setTransferStations(res.data || []);
        localStorage.setItem("live_transfer_stations", JSON.stringify(res.data || []));
      }).catch(err => console.error("LiveMap failed to load transfer stations:", err)),
      
      api<{ data: any[] }>("/api/fuel-stations").then((res) => {
        setFuelStations(res.data || []);
        localStorage.setItem("live_fuel_stations", JSON.stringify(res.data || []));
      }).catch(err => console.error("LiveMap failed to load fuel stations:", err)),
      
      api<{ data: any[] }>("/api/workshops").then((res) => {
        setWorkshops(res.data || []);
        localStorage.setItem("live_workshops", JSON.stringify(res.data || []));
      }).catch(err => console.error("LiveMap failed to load workshops:", err))
    ]).catch(err => console.error("LiveMap SWR revalidation failed:", err));
  }, []);

  const livePosAccumulator = useRef<Record<string, LivePosition>>({});

  useEffect(() => {
    const interval = setInterval(() => {
      const pending = { ...livePosAccumulator.current };
      if (Object.keys(pending).length > 0) {
        livePosAccumulator.current = {};
        setLivePos((prev) => ({ ...prev, ...pending }));
      }
    }, 300); // Flush every 300ms for smooth UI updates
    return () => clearInterval(interval);
  }, []);

  const sidebarCollapsed = useStore((state) => state.sidebarCollapsed);

  useEffect(() => {
    if (!mapRef.current) return;
    const tid1 = setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 100);
    const tid2 = setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 320);
    return () => {
      clearTimeout(tid1);
      clearTimeout(tid2);
    };
  }, [sidebarCollapsed]);

  // ─── Init Map ───
  useEffect(() => {
    if (!box.current || mapRef.current) return;
    const m = L.map(box.current, { 
      zoomControl: false,
      minZoom: 5,
      maxBounds: [[6.0, 68.0], [38.0, 98.0]],
      maxBoundsViscosity: 1.0,
      preferCanvas: true,
      layers: [] // Default set below
    }).setView([26.9124, 75.7873], 13);
    
    const googleMapLayer = L.tileLayer("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      attribution: "© Google Maps", maxZoom: 20, noWrap: true
    });

    const googleHybridLayer = L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
      attribution: "© Google Maps", maxZoom: 20, noWrap: true
    });

    const darkLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© CARTO", maxZoom: 19, noWrap: true
    });

    googleMapLayer.addTo(m); // Default layer
    
    // Initialize Layer groups
    wardsLayerRef.current = L.layerGroup().addTo(m);
    transferStationsLayerRef.current = L.layerGroup().addTo(m);
    parkingSpotsLayerRef.current = L.layerGroup().addTo(m);
    fuelStationsLayerRef.current = L.layerGroup().addTo(m);
    workshopsLayerRef.current = L.layerGroup().addTo(m);
    const openDepotsLayer = L.layerGroup().addTo(m);
    populateOpenDepotLayer(L, openDepotsLayer);
    
    // Add zoom control manually in the bottom right corner
    L.control.zoom({ position: 'bottomright' }).addTo(m);

    L.control.layers({
      "Google Maps (Default)": googleMapLayer,
      "Google Satellite + Labels": googleHybridLayer,
      "Dark Map": darkLayer
    }, {
      "Ward Boundaries": wardsLayerRef.current,
      "Transfer Stations": transferStationsLayerRef.current,
      "Parking Spots": parkingSpotsLayerRef.current,
      "Fuel Stations": fuelStationsLayerRef.current,
      "Workshops": workshopsLayerRef.current,
      "Open Depots": openDepotsLayer,
    }, { position: 'topright' }).addTo(m);
    
    mapRef.current = m;
    return () => { 
      m.remove(); 
      mapRef.current = null; 
      markers.current = {}; 
      iconCache.current = {};
      Object.values(animFrames.current).forEach(id => cancelAnimationFrame(id));
      animFrames.current = {};
      wardsLayerRef.current = null;
      transferStationsLayerRef.current = null;
      parkingSpotsLayerRef.current = null;
      fuelStationsLayerRef.current = null;
      workshopsLayerRef.current = null;
    };
  }, []);

  // ─── Render Facilities (Parking Spots, Transfer Stations) ───
  useEffect(() => {
    if (parkingSpotsLayerRef.current) parkingSpotsLayerRef.current.clearLayers();
    if (transferStationsLayerRef.current) transferStationsLayerRef.current.clearLayers();
    if (fuelStationsLayerRef.current) fuelStationsLayerRef.current.clearLayers();
    if (workshopsLayerRef.current) workshopsLayerRef.current.clearLayers();

    const renderFacility = (item: any, typeName: string, iconSymbol: string, defaultColor: string, layer: L.LayerGroup | null) => {
      if (!layer || !item.geojson) return;
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
        console.error("Failed to render facility:", err);
      }
    };

    parkingSpots.forEach(p => renderFacility(p, "Parking Spot", "P", "#10b981", parkingSpotsLayerRef.current));
    transferStations.forEach(t => renderFacility(t, "Transfer Station", "T", "#3b82f6", transferStationsLayerRef.current));
    fuelStations.forEach(f => renderFacility(f, "Fuel Station", "F", "#eab308", fuelStationsLayerRef.current));
    workshops.forEach(w => renderFacility(w, "Workshop", "W", "#8b5cf6", workshopsLayerRef.current));

  }, [parkingSpots, transferStations, fuelStations, workshops]);

  // ─── Render Ward Boundaries overlay on map ───
  useEffect(() => {
    const layer = wardsLayerRef.current;
    if (!layer || !mapRef.current) return;

    layer.clearLayers();

    const isAllJaipur = !selectedZone || selectedZone === "all";

    if (isAllJaipur) {
      // Draw all zones and their wards
      const realZones = zones.filter(z => z.id !== -1);
      realZones.forEach((z) => {
        const zoneWards = regionsList.filter(r => 
          r.region_type_id === 3 && 
          r.parent_id === z.id
        );

        const zoneRegion = regionsList.find(r => r.region_type_id === 2 && r.id === z.id);
        const zoneColor = zoneRegion && zoneRegion.color ? zoneRegion.color : "#8b5cf6";

        // Draw Combined Zone boundary for this zone
        if (zoneRegion && zoneRegion.geojson) {
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
            console.error("Failed to render zone boundary", err);
          }
        }

        // Draw all individual Wards of this zone as thin dividers
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
                  <b style="font-size:12px;color:#4f46e5;">${w.region_name}</b><br/>
                  <span style="color:#64748b;font-weight:bold;">Vidhansabha: ${z.region_name || z.name}</span><br/>
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
              console.error("Failed to render ward boundary in LiveMap Jaipur view", err);
            }
          }
        });
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
      const activeZoneId = parseInt(selectedZone);
      const activeWards = regionsList.filter(r => 
        r.region_type_id === 3 && 
        r.parent_id === activeZoneId &&
        (selectedWard === "all" || r.id === parseInt(selectedWard))
      );

      const activeZone = zones.find(z => z.id === activeZoneId);
      const zoneName = activeZone ? (activeZone.region_name || activeZone.name) : `Zone ${activeZoneId}`;

      const selectedZoneRegion = regionsList.find(r => r.region_type_id === 2 && r.id === activeZoneId);
      const zoneColor = selectedZoneRegion && selectedZoneRegion.color ? selectedZoneRegion.color : "#8b5cf6";

      // 1. Draw Combined Zone Boundary
      if (selectedZoneRegion && selectedZoneRegion.geojson && selectedWard === "all") {
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
              <b style="font-size:14px;color:#4f46e5;">${zoneName}</b><br/>
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

      // 2. Draw individual Wards inside
      activeWards.forEach((w) => {
        if (w.geojson && w.geojson.features && w.geojson.features.length > 0) {
          try {
            const regionGeoJSON = L.geoJSON(w.geojson, {
              style: {
                color: w.color || zoneColor,
                weight: 1.2,
                dashArray: "3, 4",
                fillColor: w.color || zoneColor,
                fillOpacity: 0.0, // transparent inside when displaying combined boundary to avoid overlap
              },
            });

            regionGeoJSON.bindPopup(`
              <div style="font-family:Inter,sans-serif;font-size:11px;padding:4px;color:#1e293b;">
                <b style="font-size:12px;color:#4f46e5;">${w.region_name}</b><br/>
                <span style="color:#64748b;">Code: ${w.region_code || "—"}</span>
              </div>
            `);

            regionGeoJSON.on("mouseover", function (e) {
              const layerObj = e.target;
              layerObj.setStyle({
                fillOpacity: 0.25,
                weight: 2.5,
                dashArray: undefined,
              });
            });

            regionGeoJSON.on("mouseout", function (e) {
              const layerObj = e.target;
              layerObj.setStyle({
                fillOpacity: 0.0,
                weight: 1.2,
                dashArray: "3, 4",
              });
            });

            layer.addLayer(regionGeoJSON);
          } catch (err) {
            console.error("Failed to render live map ward polygon", err);
          }
        }
      });

      if (activeWards.length > 0) {
        try {
          const boundsGroup = L.featureGroup();
          activeWards.forEach(w => {
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
          // ignore
        }
      }
    }
  }, [selectedZone, selectedWard, regionsList, zones]);

  // ─── Marker helper ───
  const upsertMarker = useCallback((imei: string, lat: number, lng: number, speed: number, ignition: boolean, regNo: string, typeName: string, isLive: boolean, lastTime?: string | null, showRegNo?: boolean) => {
    if (!mapRef.current) return;
    if (typeof lat !== 'number' || typeof lng !== 'number' || lat === 0) {
      console.warn("Invalid lat/lng for", imei, lat, lng);
      return;
    }

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
    
    const existingMarker = markers.current[imei];
    const cached = iconCache.current[imei];

    const movingClass = isLive && speed > 3 ? "lm-moving" : "";
    const mkIcon = () => L.divIcon({
      className: "",
      html: `<div class="${movingClass}" style="width:26px;height:26px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:${isLive ? `0 0 8px ${color}` : "none"};transition:background .3s,box-shadow .3s">${emoji}</div>`,
      iconSize: [26, 26], iconAnchor: [13, 13],
    });

    if (existingMarker) {
      // Smooth slide to new position (1s ease-out for moving vehicles)
      slideMarkerTo(existingMarker, [lat, lng], speed > 0 ? 1000 : 0, animFrames.current, imei);

      if (!cached || cached.color !== color || cached.emoji !== emoji) {
        existingMarker.setIcon(mkIcon());
        iconCache.current[imei] = { color, emoji };
      }
    } else {
      markers.current[imei] = L.marker([lat, lng], { icon: mkIcon() }).addTo(mapRef.current);
      iconCache.current[imei] = { color, emoji };
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

    if (showRegNo) {
      markers.current[imei].bindTooltip(regNo, {
        permanent: true,
        direction: "top",
        offset: [0, -15],
        className: "lm-tooltip"
      });
      // Force it to open
      markers.current[imei].openTooltip();
    } else {
      markers.current[imei].unbindTooltip();
    }
  }, []);

  // ─── Marker Management (Filtered & Live Position Synced) ───
  useEffect(() => {
    if (!mapRef.current) return;
    
    // 1. Apply Zone, Ward, Vehicle Type filters
    const filteredByFilters = vehicles.filter((v) => {
      if (selectedZone && selectedZone !== "all") {
        if ((v as any).zone_id !== parseInt(selectedZone) && v.assigned_zone_id !== parseInt(selectedZone)) return false;
      }
      if (selectedWard && selectedWard !== "all") {
        if ((v as any).ward_id !== parseInt(selectedWard) && v.assigned_ward_id !== parseInt(selectedWard)) return false;
      }
      if (selectedVehicleType && selectedVehicleType !== "all") {
        if (v.vehicle_type?.name !== selectedVehicleType) return false;
      }
      return true;
    });

    // 2. Only show markers for vehicles that are checked in selectedVehicles
    const displayedVehicles = filteredByFilters.filter((v) => {
      const imei = v.gps_device?.imei;
      return imei && selectedVehicles.includes(imei);
    });

    const displayedImeis = new Set(displayedVehicles.map(v => v.gps_device?.imei).filter(Boolean));
    
    // Cleanup hidden markers
    Object.keys(markers.current).forEach((imei) => {
      if (!displayedImeis.has(imei)) {
        markers.current[imei].remove();
        delete markers.current[imei];
      }
    });

    // Create/Update visible markers
    displayedVehicles.forEach((v) => {
      const imei = v.gps_device?.imei;
      if (!imei) return;

      const pos = livePos[imei];
      if (pos) {
        // Use live position data (from snapshot or ws updates)
        upsertMarker(
          imei,
          pos.lat,
          pos.lng,
          pos.speed,
          pos.ignition !== null ? !!pos.ignition : false,
          v.registration_no,
          v.vehicle_type?.name || "Vehicle",
          true,
          pos.time || v.last_time,
          showRegistrationNo
        );
      } else if (v.last_lat && v.last_lng) {
        // Fallback to static DB values
        const isMoving = v.status === "running";
        const isIdle = v.status === "idle";
        const simulatedSpeed = isMoving ? 5 : (isIdle ? 2 : 0);
        const simulatedIsLive = v.status !== "offline";
        
        upsertMarker(
          imei,
          v.last_lat,
          v.last_lng,
          simulatedSpeed,
          false,
          v.registration_no,
          v.vehicle_type?.name || "Vehicle",
          simulatedIsLive,
          v.last_time,
          showRegistrationNo
        );
      }
    });
  }, [vehicles, selectedZone, selectedWard, selectedVehicleType, selectedVehicles, livePos, showRegistrationNo, upsertMarker]);

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
  }, [vehicles, selectedZone]);

  const vehiclesRef = useRef(vehicles);
  useEffect(() => { vehiclesRef.current = vehicles; }, [vehicles]);

  const selectedZoneRef = useRef(selectedZone);
  useEffect(() => { selectedZoneRef.current = selectedZone; }, [selectedZone]);

  const selectedWardRef = useRef(selectedWard);
  useEffect(() => { selectedWardRef.current = selectedWard; }, [selectedWard]);

  const selectedVehicleTypeRef = useRef(selectedVehicleType);
  useEffect(() => { selectedVehicleTypeRef.current = selectedVehicleType; }, [selectedVehicleType]);

  const selectedVehiclesRef = useRef(selectedVehicles);
  useEffect(() => { selectedVehiclesRef.current = selectedVehicles; }, [selectedVehicles]);

  const showRegistrationNoRef = useRef(showRegistrationNo);
  useEffect(() => { showRegistrationNoRef.current = showRegistrationNo; }, [showRegistrationNo]);

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
          if (isMounted) {
            console.log("WebSocket connected to", url);
            setWsConnected(true);
          }
        };

        ws.onmessage = (e) => {
          if (!isMounted) return;
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "gps_update") {
              const imei = msg.imei;
              
              // Normalize to match LivePosition schema and include time
              const livePosMsg: LivePosition = {
                imei: msg.imei,
                lat: msg.lat,
                lng: msg.lng,
                speed: msg.speed,
                angle: msg.heading ?? msg.angle ?? 0,
                ignition: msg.ignition !== undefined ? msg.ignition : null,
                time: msg.timestamp || msg.time || new Date().toISOString()
              };

              livePosAccumulator.current[imei] = livePosMsg;
              
              const v = vehiclesRef.current.find((vv) => vv.gps_device?.imei === msg.imei);
              const sz = selectedZoneRef.current;
              const sw = selectedWardRef.current;
              const svt = selectedVehicleTypeRef.current;
              const svs = selectedVehiclesRef.current;
              const srn = showRegistrationNoRef.current;
              
              let isVisible = true;
              if (sz && sz !== "all") {
                if ((v as any)?.zone_id !== parseInt(sz) && v?.assigned_zone_id !== parseInt(sz)) isVisible = false;
              }
              if (sw && sw !== "all") {
                if ((v as any)?.ward_id !== parseInt(sw) && v?.assigned_ward_id !== parseInt(sw)) isVisible = false;
              }
              if (svt && svt !== "all") {
                if (v?.vehicle_type?.name !== svt) isVisible = false;
              }
              if (msg.imei && !svs.includes(msg.imei)) {
                isVisible = false;
              }
              
              if (isVisible) {
                // Instantly update marker on map without layout/render thrashing
                upsertMarker(
                  msg.imei,
                  msg.lat,
                  msg.lng,
                  msg.speed,
                  !!msg.ignition,
                  v?.registration_no || msg.imei,
                  v?.vehicle_type?.name || "Vehicle",
                  true,
                  livePosMsg.time,
                  srn
                );
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
                msg.data.forEach((p: any) => {
                  if (!p.imei) return;
                  map[p.imei] = {
                    imei: p.imei,
                    lat: p.lat,
                    lng: p.lng,
                    speed: p.speed || 0,
                    angle: p.heading ?? p.angle ?? 0,
                    ignition: p.ignition ?? null,
                    time: p.time || new Date().toISOString(),
                  };
                });
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
          setWsConnected(false);
          console.log("WebSocket closed:", e.code, e.reason);
          reconnect = setTimeout(connect, 3000);
        };

        ws.onerror = (err) => {
          if (isMounted) console.error("WebSocket Error:", err);
        };
      } catch (err) {
        if (isMounted) console.error("WS Connect Error:", err);
      }
    };

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

  const filteredByFilters = processedVehicles.filter((v) => {
    if (selectedZone && selectedZone !== "all") {
      if ((v as any).zone_id !== parseInt(selectedZone) && v.assigned_zone_id !== parseInt(selectedZone)) return false;
    }
    if (selectedWard && selectedWard !== "all") {
      if ((v as any).ward_id !== parseInt(selectedWard) && v.assigned_ward_id !== parseInt(selectedWard)) return false;
    }
    if (selectedVehicleType && selectedVehicleType !== "all") {
      if (v.vehicle_type?.name !== selectedVehicleType) return false;
    }
    return true;
  });

  const displayedVehicles = filteredByFilters.filter((v) => {
    const imei = v.gps_device?.imei;
    return imei && selectedVehicles.includes(imei);
  });

  const counts = {
    running: filteredByFilters.filter((v) => v.realStatus === "running").length,
    idle: filteredByFilters.filter((v) => v.realStatus === "idle").length,
    stopped: filteredByFilters.filter((v) => v.realStatus === "stopped").length,
    offline: filteredByFilters.filter((v) => v.realStatus === "offline").length,
  };

  const zoneOptions = [
    { value: "all", label: "Jaipur (All Zones)" },
    ...zones.map(z => ({ value: String(z.id), label: z.region_name }))
  ];

  const filteredWards = !selectedZone || selectedZone === "all"
    ? regionsList.filter(r => r.region_type_id === 3)
    : regionsList.filter(r => r.region_type_id === 3 && r.parent_id === parseInt(selectedZone));

  const wardOptions = [
    { value: "all", label: "Select Ward" },
    ...filteredWards.map(w => ({ value: String(w.id), label: w.region_name }))
  ];

  const vehicleTypes = Array.from(
    new Set(vehicles.map(v => v.vehicle_type?.name).filter(Boolean))
  ) as string[];

  const vehicleTypeOptions = [
    { value: "all", label: "Select Vehicle Type" },
    ...vehicleTypes.map(name => ({ value: name, label: name }))
  ];

  const vehicleOptions = filteredByFilters
    .filter(v => v.gps_device?.imei)
    .map(v => ({
      value: v.gps_device!.imei,
      label: v.registration_no
    }));

  // Fit Bounds on Ward Change
  const lastFittedWard = useRef<string | null>(null);
  useEffect(() => {
    if (!mapRef.current) return;
    if (selectedWard === "all" || lastFittedWard.current === selectedWard) return;

    const wardIdInt = parseInt(selectedWard);
    const targetWard = regionsList.find(r => r.region_type_id === 3 && r.id === wardIdInt);
    if (targetWard && targetWard.geojson) {
      try {
        const boundary = L.geoJSON(targetWard.geojson);
        mapRef.current.fitBounds(boundary.getBounds(), { padding: [30, 30], maxZoom: 16 });
        lastFittedWard.current = selectedWard;
      } catch (e) {
        console.error("Failed to fit bounds for ward", e);
      }
    }
  }, [selectedWard, regionsList]);

  return (
    <div className="flex-1 w-full flex flex-col relative overflow-hidden bg-theme-base">
      {/* HORIZONTAL CONTROLS PANEL */}
      {showMenu && (
        <section className="bg-theme-surface border-b border-theme-border px-6 py-3 z-10 shrink-0 w-full flex flex-wrap items-center justify-between gap-4 select-none">
          <div className="flex flex-wrap items-center gap-3.5">
            {/* Select Zone */}
            <div className="min-w-[160px]">
              <SearchableSelect
                value={selectedZone || "all"}
                onChange={(val) => {
                  setSelectedZone(val);
                  setSelectedWard("all");
                  localStorage.setItem("selectedZone", val);
                }}
                options={zoneOptions}
                placeholder="Select Zone"
                className="w-full"
              />
            </div>

            {/* Select Ward */}
            <div className="min-w-[160px]">
              <SearchableSelect
                value={selectedWard || "all"}
                onChange={(val) => {
                  setSelectedWard(val);
                }}
                options={wardOptions}
                placeholder="Select Ward"
                className="w-full"
                disabled={!selectedZone || selectedZone === "all"}
              />
            </div>

            {/* Select Vehicle Type */}
            <div className="min-w-[180px]">
              <SearchableSelect
                value={selectedVehicleType || "all"}
                onChange={(val) => {
                  setSelectedVehicleType(val);
                }}
                options={vehicleTypeOptions}
                placeholder="Select Vehicle Type"
                className="w-full"
              />
            </div>

            {/* Select Vehicle (MultiSelect) */}
            <div className="min-w-[260px] max-w-[360px]">
              <MultiSelect
                options={vehicleOptions}
                selectedValues={selectedVehicles}
                onChange={(vals) => {
                  setSelectedVehicles(vals);
                }}
                placeholder="Select Vehicle"
                className="w-full"
              />
            </div>

            {/* Show Registration No. Checkbox */}
            <div className="flex items-center gap-2 px-2 border-l border-theme-border">
              <input
                id="show-reg-no-checkbox"
                type="checkbox"
                checked={showRegistrationNo}
                onChange={(e) => setShowRegistrationNo(e.target.checked)}
                className="w-4 h-4 text-theme-accent border-slate-300 rounded focus:ring-theme-accent cursor-pointer"
              />
              <label htmlFor="show-reg-no-checkbox" className="text-xs font-bold text-theme-text cursor-pointer select-none">
                Show Registration No.
              </label>
            </div>
          </div>

          {/* Live Stats Row */}
          <div className="flex items-center gap-3.5 text-xs font-semibold text-theme-text border-l border-theme-border pl-4 h-8 shrink-0">
            <span className="flex items-center gap-1">
              <span className="lm-ws-dot" style={{ background: wsConnected ? "#22c55e" : "#ef4444" }} title={wsConnected ? "Live Connected" : "Disconnected"} />
              <span className="text-[10px] text-theme-text-dim uppercase tracking-wider">{wsConnected ? "Live" : "Offline"}</span>
            </span>
            <span className="text-green-600">● {counts.running} Running</span>
            <span className="text-amber-600">● {counts.idle} Idle</span>
            <span className="text-red-600">● {counts.stopped} Stopped</span>
            <span className="text-slate-500">● {counts.offline} Offline</span>
            <span className="bg-theme-base text-theme-text-dim px-2 py-0.5 rounded text-[11px] font-bold ml-2">
              {displayedVehicles.length} / {filteredByFilters.length} visible
            </span>
          </div>
        </section>
      )}

      {/* Map Viewport */}
      <div ref={box} className="flex-1 w-full z-0" />
    </div>
  );
}
