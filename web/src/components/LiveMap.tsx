"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { Vehicle, LivePosition } from "@/lib/types";
import { api, wsUrl } from "@/lib/api";
import { useStore } from "@/lib/store";
import { centroid } from "@turf/turf";
import useSWR from "swr";

const fetcher = (url: string) => api<{ data?: any[], success?: boolean }>(url).then(res => res.data || []);

interface Props { 
  vehicles: Vehicle[];
  showMenu?: boolean;
}

export default function LiveMap({ vehicles, showMenu = true }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef<Record<string, L.Marker>>({});
  const wardsLayerRef = useRef<L.LayerGroup | null>(null);
  const facilitiesLayerRef = useRef<L.LayerGroup | null>(null);
  const clusterLayerRef = useRef<L.MarkerClusterGroup | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [livePos, setLivePos] = useState<Record<string, LivePosition>>({});
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [selectedZone, setSelectedZone] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("selectedZone");
      return cached !== null ? cached : "all"; // Default to show everything
    }
    return "all";
  });
  const { data: zones = [] } = useSWR("/api/zones", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });
  const { data: regionsList = [] } = useSWR("/api/regions", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });
  const { data: parkingSpots = [] } = useSWR("/api/parking-spots", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });
  const { data: transferStations = [] } = useSWR("/api/transfer-stations", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });
  const { data: fuelStations = [] } = useSWR("/api/fuel-stations", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });
  const { data: workshops = [] } = useSWR("/api/workshops", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });

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

  useEffect(() => {
    if (!mapRef.current) return;
  }, [selectedZone, vehicles]);

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
    
    wardsLayerRef.current = L.layerGroup().addTo(m);
    facilitiesLayerRef.current = L.layerGroup().addTo(m);
    
    clusterLayerRef.current = (L as any).markerClusterGroup({
      disableClusteringAtZoom: 15,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 60,
    });
    m.addLayer(clusterLayerRef.current!);
    
    // Add zoom control manually in the bottom right corner
    L.control.zoom({ position: 'bottomright' }).addTo(m);

    L.control.layers({
      "Google Maps (Default)": googleMapLayer,
      "Google Satellite + Labels": googleHybridLayer,
      "Dark Map": darkLayer
    }, {}, { position: 'topright' }).addTo(m);
    
    mapRef.current = m;
    return () => { 
      m.remove(); 
      mapRef.current = null; 
      markers.current = {}; 
      wardsLayerRef.current = null;
      facilitiesLayerRef.current = null;
      clusterLayerRef.current = null;
    };
  }, []);

  // ─── Render Facilities (Parking Spots, Transfer Stations) ───
  useEffect(() => {
    const layer = facilitiesLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    const renderFacility = (item: any, typeName: string, iconSymbol: string, defaultColor: string) => {
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

    parkingSpots.forEach(p => renderFacility(p, "Parking Spot", "P", "#000000"));
    transferStations.forEach(t => renderFacility(t, "Transfer Station", "T", "#000000"));
    fuelStations.forEach(f => renderFacility(f, "Fuel Station", "F", "#000000"));
    workshops.forEach(w => renderFacility(w, "Workshop", "W", "#000000"));

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
                  <span style="color:#64748b;font-weight:bold;"> ${z.region_name || z.name}</span><br/>
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
        r.parent_id === activeZoneId
      );

      const activeZone = zones.find(z => z.id === activeZoneId);
      const zoneName = activeZone ? (activeZone.region_name || activeZone.name) : `Zone ${activeZoneId}`;

      const selectedZoneRegion = regionsList.find(r => r.region_type_id === 2 && r.id === activeZoneId);
      const zoneColor = selectedZoneRegion && selectedZoneRegion.color ? selectedZoneRegion.color : "#8b5cf6";

      // 1. Draw Combined Zone Boundary
      if (selectedZoneRegion && selectedZoneRegion.geojson) {
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
  }, [selectedZone, regionsList, zones]);

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
      markers.current[imei] = L.marker([lat, lng], { icon });
      if (clusterLayerRef.current) {
        clusterLayerRef.current.addLayer(markers.current[imei]);
      } else if (mapRef.current) {
        markers.current[imei].addTo(mapRef.current);
      }
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
        if (clusterLayerRef.current) {
          clusterLayerRef.current.removeLayer(markers.current[imei]);
        } else {
          markers.current[imei].remove();
        }
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
                  if (clusterLayerRef.current) {
                    clusterLayerRef.current.removeLayer(markers.current[msg.imei]);
                  } else {
                    markers.current[msg.imei].remove();
                  }
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
      {showMenu && (
        <div className="absolute top-4 left-4 right-4 md:right-auto md:w-[300px] max-h-[calc(100%-32px)] bg-[rgba(15,21,37,.92)] backdrop-blur-2xl rounded-xl border border-theme-border z-[1000] flex flex-col shadow-2xl shadow-black/40">
          {/* Stats Row */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-theme-border text-[11px] font-semibold">
            <span className="text-green-400">● {counts.running}</span>
            <span className="text-amber-400">● {counts.idle}</span>
            <span className="text-red-400">● {counts.stopped}</span>
            <span className="text-theme-text-dim ml-auto">{filteredByZone.length} visible</span>
          </div>

          {/* Zone Selector */}
          <div className="p-3 border-b border-theme-border">
            <select
              value={selectedZone || "all"}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedZone(val);
                localStorage.setItem("selectedZone", val);
              }}
              className="w-full px-3 py-2 bg-theme-surface border border-theme-border rounded-lg text-[13px] text-theme-text placeholder:text-theme-text-dim outline-none focus:border-emerald-500 transition"
            >
              <option value="all">Jaipur Heritage (All Zones)</option>
              {zones.map((z, idx) => (
                <option key={`zone-${z.id}-${idx}`} value={z.id}>{z.region_name}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="p-3 border-b border-theme-border">
            <input
              placeholder="Search reg no, type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 bg-theme-surface border border-theme-border rounded-lg text-[13px] text-theme-text placeholder:text-theme-text-dim outline-none focus:border-emerald-500 transition"
            />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filtered.map((v, idx) => {
              const imei = v.gps_device?.imei || "";
              const pos = livePos[imei];
              const sel = selected === imei;
              const dotColor = v.realStatus === "running" ? "#22c55e" : v.realStatus === "idle" ? "#f59e0b" : v.realStatus === "stopped" ? "#ef4444" : "#475569";
              return (
                <div
                  key={`vehicle-${v.id}-${idx}`}
                  onClick={() => {
                    setSelected(imei);
                    if (markers.current[imei] && mapRef.current) {
                      mapRef.current.setView(markers.current[imei].getLatLng(), 16);
                      markers.current[imei].openPopup();
                    }
                  }}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-theme-border cursor-pointer transition
                    ${sel ? "bg-theme-surface-hover border-l-[3px] border-l-indigo-500" : "hover:bg-theme-surface"}`}
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dotColor, boxShadow: v.realStatus === "running" ? `0 0 6px ${dotColor}` : "none" }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="text-[13px] font-semibold text-theme-text truncate">{v.registration_no}</div>
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
                    <div className="text-[11px] text-theme-text-dim truncate">{v.vehicle_type?.name || "—"}</div>
                    {pos && <div className="text-[10px] text-theme-accent mt-0.5">{pos.speed} km/h</div>}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <div className="text-center py-8 text-theme-text-dim text-sm">No vehicles</div>}
          </div>
        </div>
      )}
    </div>
  );
}
