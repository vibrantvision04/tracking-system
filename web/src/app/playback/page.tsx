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

function findClosestCoordinateIndex(lat: number, lng: number, coords: [number, number][]): number {
  if (coords.length === 0) return 0;
  let minDistance = Infinity;
  let closestIndex = 0;
  for (let i = 0; i < coords.length; i++) {
    const dist = haversineDistance(lat, lng, coords[i][0], coords[i][1]);
    if (dist < minDistance) {
      minDistance = dist;
      closestIndex = i;
    }
  }
  return closestIndex;
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

  // 2. Moving Average Smoothing (Window size = 5)
  const smoothed: GpsDataPoint[] = [];
  const windowSize = 2;
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
  const CHUNK_SIZE = 90;
  const fetchPromises: Promise<[number, number][]>[] = [];

  for (let i = 0; i < downsampled.length; i += CHUNK_SIZE) {
    const chunk = downsampled.slice(i, i + CHUNK_SIZE);
    if (chunk.length < 2) {
      if (chunk.length === 1) fetchPromises.push(Promise.resolve([[chunk[0].lat, chunk[0].lng]]));
      continue;
    }

    const coordsStr = chunk.map(p => `${p.lng},${p.lat}`).join(';');

    const p = fetch(
      `https://router.project-osrm.org/match/v1/driving/${coordsStr}?geometries=geojson&overview=full`
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

export default function PlaybackPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [regionsList, setRegionsList] = useState<any[]>([]);

  // Filtering States
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [selectedWardId, setSelectedWardId] = useState<string>("");
  const [selectedShift, setSelectedShift] = useState<string>("Morning");
  const [selectedImei, setSelectedImei] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(4);

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
  const assignedRouteLayerRef = useRef<any>(null);
  const boundaryLayerRef = useRef<any>(null); // For selected zone/ward boundaries
  const intervalRef = useRef<any>(null);

  const matchedCoordsRef = useRef<[number, number][]>([]);
  const activeLineRef = useRef<any>(null);
  const startMarkerRef = useRef<any>(null);
  const endMarkerRef = useRef<any>(null);

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

  // Load Initial Metadata
  useEffect(() => {
    api<{ data: Vehicle[] }>("/api/vehicles").then((r) => setVehicles(r.data || [])).catch(() => { });
    api<{ data: any[] }>("/api/zones").then((res) => setZones(res.data || [])).catch(() => {});
    api<{ success: boolean; data: any[] }>("/api/regions").then((res) => {
      if (res.success) setRegionsList(res.data || []);
    }).catch(() => {});

    // Parse URL parameters if present
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlImei = params.get("imei");
      const urlDate = params.get("date");
      if (urlImei) setSelectedImei(urlImei);
      if (urlDate) setDate(urlDate);
    }
  }, []);

  // Set selected zone and ward when selectedImei is loaded or preset
  useEffect(() => {
    if (selectedImei && vehicles.length > 0) {
      const veh = vehicles.find(v => v.gps_device?.imei === selectedImei);
      if (veh) {
        if ((veh as any).zone_id) setSelectedZoneId(String((veh as any).zone_id));
        if ((veh as any).ward_id) setSelectedWardId(String((veh as any).ward_id));
      }
    }
  }, [selectedImei, vehicles]);

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

    L.control.layers({
      "Google Maps (Default)": googleMapLayer,
      "Google Satellite": googleHybridLayer,
      "Dark Map": darkLayer
    }, {}, { position: 'topright' }).addTo(mapRef.current);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ─── Render Geofence Boundary overlays on map ───
  useEffect(() => {
    const layer = boundaryLayerRef.current;
    if (!layer || !mapRef.current || regionsList.length === 0) return;

    layer.clearLayers();
    const L = require("leaflet");

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
            }
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
            }
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

  // Load Route Playback Trace
  const loadRoute = useCallback(async () => {
    if (!selectedImei || !date) return;
    const from = `${date}T00:00:00.000Z`;
    const to = `${date}T23:59:59.999Z`;

    try {
      const r = await api<{ data: GpsDataPoint[] }>(`/api/gps-data/${selectedImei}?from=${from}&to=${to}`);
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
      if (assignedRouteLayerRef.current) {
        map.removeLayer(assignedRouteLayerRef.current);
        assignedRouteLayerRef.current = null;
      }
      setStoppages([]);
      setCheckpoints([]);

      if (validPoints.length === 0) return;

      const baseCoords = validPoints.map((p) => [p.lat, p.lng] as [number, number]);
      const matchedCoords = await fetchMapMatchedRoute(validPoints);
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
      }).addTo(map);
      lineRef.current.bringToBack();

      map.fitBounds(lineRef.current.getBounds(), { padding: [50, 50] });

      // 2. Draw dynamic covered route trail in vibrant solid orange
      activeLineRef.current = L.polyline([matchedCoords[0], matchedCoords[0]], {
        color: "#f97316", // Thick vibrant orange path showing dynamic progress
        weight: 5.5,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round"
      }).addTo(map);
      activeLineRef.current.bringToFront();

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
      startMarkerRef.current = L.marker(baseCoords[0], { icon: startIcon }).addTo(map);

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
      endMarkerRef.current = L.marker(baseCoords[baseCoords.length - 1], { icon: endIcon }).addTo(map);

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
      mkRef.current = L.marker(baseCoords[0], { icon: vehicleIcon })
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

        const marker = L.marker([s.lat, s.lng], { icon: stopIcon }).addTo(map);

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
      });

    } catch (err) {
      console.error("Playback load error:", err);
    }
  }, [selectedImei, date]);

  // Dynamic active trail updating helper
  const updateActiveCoveredLine = useCallback((currentIndex: number) => {
    const L = require("leaflet");
    const map = mapRef.current;
    if (!map || matchedCoordsRef.current.length === 0 || !points[currentIndex]) return;

    const currentPoint = points[currentIndex];
    
    // Locate the closest OSRM map-matched point index
    const closestIdx = findClosestCoordinateIndex(currentPoint.lat, currentPoint.lng, matchedCoordsRef.current);
    
    // Slice matched road coords up to the closest index
    const coveredCoords = matchedCoordsRef.current.slice(0, Math.max(2, closestIdx + 1));

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
      activeLineRef.current.bringToFront();
    }
  }, [points]);

  // Handle Playback Intervals (Adjusted by Speed Multiplier)
  useEffect(() => {
    if (!playing || idx >= points.length - 1 || !mapRef.current || !mkRef.current) return;

    const intervalDuration = Math.max(10, 150 / speedMultiplier);

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
        updateActiveCoveredLine(next);
        return next;
      });
    }, intervalDuration);

    return () => clearInterval(intervalRef.current);
  }, [playing, points, speedMultiplier, idx, updateActiveCoveredLine]);

  // Scrub Scrubbed Point Sync
  useEffect(() => {
    if (points[idx] && mkRef.current) {
      const p = points[idx];
      mkRef.current.setLatLng([p.lat, p.lng]);
      mkRef.current.setPopupContent(getPopupContent(p));
      updateActiveCoveredLine(idx);
    }
  }, [idx, points, updateActiveCoveredLine]);

  // Filter Dropdowns Lists
  const filteredWards = selectedZoneId
    ? regionsList.filter(r => r.region_type_id === 3 && r.parent_id === parseInt(selectedZoneId))
    : regionsList.filter(r => r.region_type_id === 3);

  const filteredVehicles = vehicles.filter(v => {
    if (selectedZoneId && (v as any).zone_id !== parseInt(selectedZoneId)) return false;
    if (selectedWardId && (v as any).ward_id !== parseInt(selectedWardId)) return false;
    return true;
  });

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
      `}} />
      
      {/* Dynamic Master Header */}
      <header className="flex h-14 bg-[#e2e8f0] px-6 items-center border-b border-slate-300 shrink-0 justify-between w-full">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-wide text-slate-800">ISWM - NAGAR NIGAM JAIPUR</h1>
        </div>
        <div className="flex items-center gap-4">
          {/* Language Selection */}
          <div className="relative flex items-center bg-white border border-slate-300 rounded px-3 py-1 text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-50 transition">
            <span>English</span>
            <svg className="w-3.5 h-3.5 ml-1.5 fill-current text-slate-500" viewBox="0 0 20 20">
              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
            </svg>
          </div>
          {/* Circular user profile silhouette */}
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white shrink-0 shadow-sm">
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
        </div>
      </header>

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
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-white border border-slate-300 px-3 py-1.5 rounded text-sm text-slate-700 focus:border-emerald-500 outline-none transition cursor-pointer font-medium" 
            />
          </div>

          {/* Select Zone */}
          <div className="min-w-[150px]">
            <select
              value={selectedZoneId}
              onChange={(e) => {
                setSelectedZoneId(e.target.value);
                setSelectedWardId("");
                setSelectedImei("");
              }}
              className="w-full bg-white border border-slate-300 px-3 py-1.5 rounded text-sm text-slate-700 focus:border-emerald-500 outline-none transition cursor-pointer font-medium"
            >
              <option value="">Select Zone</option>
              {zones.map((z, idx) => (
                <option key={`zone-${z.id}-${idx}`} value={z.id}>{z.region_name}</option>
              ))}
            </select>
          </div>

          {/* Select Ward */}
          <div className="min-w-[150px]">
            <select
              value={selectedWardId}
              onChange={(e) => {
                setSelectedWardId(e.target.value);
                setSelectedImei("");
              }}
              className="w-full bg-white border border-slate-300 px-3 py-1.5 rounded text-sm text-slate-700 focus:border-emerald-500 outline-none transition cursor-pointer font-medium"
            >
              <option value="">Select Ward</option>
              {filteredWards.map((w, idx) => (
                <option key={`ward-${w.id}-${idx}`} value={w.id}>{w.region_name}</option>
              ))}
            </select>
          </div>

          {/* Select Shift */}
          <div className="min-w-[120px]">
            <select
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
              className="w-full bg-white border border-slate-300 px-3 py-1.5 rounded text-sm text-slate-700 focus:border-emerald-500 outline-none transition cursor-pointer font-medium"
            >
              <option value="Morning">Morning</option>
              <option value="Evening">Evening</option>
              <option value="Night">Night</option>
            </select>
          </div>

          {/* Select Vehicle */}
          <div className="min-w-[170px]">
            <select
              value={selectedImei}
              onChange={(e) => setSelectedImei(e.target.value)}
              className="w-full bg-white border border-slate-300 px-3 py-1.5 rounded text-sm text-slate-700 focus:border-emerald-500 outline-none transition cursor-pointer font-medium"
            >
              <option value="">Select Vehicle</option>
              {filteredVehicles.filter(v => v.gps_device).map((v, idx) => (
                <option key={`veh-${v.id}-${idx}`} value={v.gps_device!.imei}>
                  {v.registration_no} ({v.vehicle_type?.name || "Tipper"})
                </option>
              ))}
            </select>
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
            </select>
          </div>

          {/* Play/Pause Green Circle Button */}
          <button
            onClick={() => {
              if (points.length === 0) {
                loadRoute();
              } else {
                setPlaying(!playing);
              }
            }}
            className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-500/20 transition-all shrink-0 cursor-pointer"
            title={playing ? "Pause Playback" : "Start Playback"}
          >
            {playing ? (
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            ) : (
              <svg className="w-3.5 h-3.5 fill-current translate-x-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            )}
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
        <div className="absolute top-3 right-16 z-[1000] flex items-center">
          <div className="bg-[#f59e0b] hover:bg-amber-600 text-white px-3 py-1.5 text-xs font-bold uppercase rounded shadow-md tracking-wider flex items-center gap-1 cursor-pointer transition select-none">
            <span>Map Indication</span>
          </div>
        </div>

        {/* Floating stoppages sidebar if stoppages exist */}
        {stoppages.length > 0 && (
          <div className="absolute top-4 right-4 z-[1000] w-64 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 p-4 shadow-2xl max-h-[calc(100%-32px)] overflow-y-auto custom-scrollbar flex flex-col">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-3 flex items-center gap-1.5 shrink-0 border-b border-slate-100 pb-2">
              🛑 Stoppages ({stoppages.length})
            </h3>
            <div className="space-y-2 flex-1 overflow-y-auto pr-0.5">
              {stoppages.map((s, i) => (
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
          </div>
        )}
      </div>
    </div>
  );
}
