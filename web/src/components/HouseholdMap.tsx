"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface Household {
  id: number;
  rfid: string;
  name: string;
  mobile: string;
  address: string;
  zone: string;
  ward: string;
  area: string;
  latitude: number;
  longitude: number;
  // Coverage — Auto or Manual both mean "Covered" (green). Not Covered = red.
  coverage_type: "Auto" | "Manual" | "Not Covered";
  last_coverage_time: string | null;
  // Survey
  survey_date: string;
}

interface HouseholdMapProps {
  households: Household[];
}

// Inject map CSS once
if (typeof document !== "undefined" && !document.getElementById("hh-map-style")) {
  const s = document.createElement("style");
  s.id = "hh-map-style";
  s.textContent = `
    .leaflet-tooltip.hh-tooltip {
      background: #1e293b !important;
      border: 1px solid #334155 !important;
      color: #f1f5f9 !important;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    .leaflet-tooltip.hh-tooltip::before {
      border-top-color: #1e293b !important;
    }
    .hh-marker-covered {
      background-color: #10B981;
      border: 2.5px solid #fff;
      border-radius: 50%;
      box-shadow: 0 0 0 3px rgba(16,185,129,0.25), 0 2px 6px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px;
    }
    .hh-marker-not-covered {
      background-color: #EF4444;
      border: 2.5px solid #fff;
      border-radius: 50%;
      box-shadow: 0 0 0 3px rgba(239,68,68,0.25), 0 2px 6px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px;
    }
    .leaflet-popup-content-wrapper {
      border-radius: 14px !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18) !important;
      padding: 0 !important;
      overflow: hidden;
    }
    .leaflet-popup-content {
      margin: 0 !important;
      width: 270px !important;
    }
    .leaflet-popup-tip {
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(s);
}

function isCovered(h: Household) {
  return h.coverage_type === "Auto" || h.coverage_type === "Manual";
}

function getMarkerColor(h: Household) {
  return isCovered(h) ? "#10B981" : "#EF4444";
}

function buildMarkerIcon(h: Household) {
  const covered = isCovered(h);
  const cls = covered ? "hh-marker-covered" : "hh-marker-not-covered";
  const emoji = covered ? "🏠" : "🏚";
  return L.divIcon({
    className: "",
    html: `<div class="${cls}" style="width:30px;height:30px;">${emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
}

function buildPopupContent(h: Household) {
  const covered = isCovered(h);
  const headerColor = covered ? "#10B981" : "#EF4444";
  const statusLabel = covered ? h.coverage_type : "Not Covered";
  const statusBadgeBg = covered
    ? "background:#d1fae5;color:#065f46"
    : "background:#fee2e2;color:#991b1b";
  const typeColor = covered ? "#10B981" : "#EF4444";

  const lastTime = h.last_coverage_time
    ? new Date(h.last_coverage_time).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "N/A";

  return `
    <div style="font-family:Inter,system-ui,sans-serif;font-size:12px;color:#1e293b;">
      <!-- Header -->
      <div style="background:${headerColor};padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:6px;">
        <div>
          <div style="font-size:14px;font-weight:800;color:#fff;">${h.name}</div>
          <div style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.85);margin-top:1px;">RFID: ${h.rfid}</div>
        </div>
        <span style="font-size:9px;font-weight:800;padding:2px 8px;border-radius:20px;background:rgba(255,255,255,0.22);color:#fff;text-transform:uppercase;letter-spacing:0.5px;">${statusLabel}</span>
      </div>

      <!-- Body -->
      <div style="padding:10px 14px;display:flex;flex-direction:column;gap:8px;">

        <!-- Household Details -->
        <div>
          <div style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px;">🏠 Household Details</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;font-size:11px;">
            <span style="color:#64748b;">Mobile:</span><span style="font-weight:600;text-align:right;">${h.mobile}</span>
            <span style="color:#64748b;">Zone:</span><span style="font-weight:600;text-align:right;">${h.zone}</span>
            <span style="color:#64748b;">Ward:</span><span style="font-weight:600;text-align:right;">${h.ward}</span>
            <span style="color:#64748b;">Area:</span><span style="font-weight:600;text-align:right;">${h.area}</span>
          </div>
          <div style="margin-top:4px;font-size:10px;color:#64748b;">${h.address}</div>
        </div>

        <div style="border-top:1px solid #f1f5f9;"></div>

        <!-- Coverage Details -->
        <div>
          <div style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px;">📡 Coverage Details</div>
          <div style="display:flex;flex-direction:column;gap:4px;font-size:11px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:#64748b;">Coverage Type:</span>
              <span style="font-size:9px;font-weight:800;padding:2px 8px;border-radius:20px;${statusBadgeBg};text-transform:uppercase;">${h.coverage_type}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:#64748b;">Final Status:</span>
              <span style="font-weight:700;color:${typeColor};">${covered ? "Covered" : "Not Covered"}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:#64748b;">Last Coverage:</span>
              <span style="font-weight:600;font-size:10px;">${lastTime}</span>
            </div>
          </div>
        </div>

        <div style="border-top:1px solid #f1f5f9;"></div>

        <!-- Survey Details -->
        <div>
          <div style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px;">📋 Survey Details</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;font-size:11px;">
            <span style="color:#64748b;">Latitude:</span><span style="font-weight:600;font-family:monospace;text-align:right;">${h.latitude.toFixed(5)}</span>
            <span style="color:#64748b;">Longitude:</span><span style="font-weight:600;font-family:monospace;text-align:right;">${h.longitude.toFixed(5)}</span>
            <span style="color:#64748b;">Survey Date:</span><span style="font-weight:600;text-align:right;">${h.survey_date}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

export default function HouseholdMap({ households }: HouseholdMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const markersLayer = useRef<L.LayerGroup | null>(null);

  // 1. Init Map
  useEffect(() => {
    if (!mapContainer.current || mapInstance) return;

    const m = L.map(mapContainer.current, {
      zoomControl: false,
      minZoom: 4,
    }).setView([26.9124, 75.7873], 13);

    L.tileLayer("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      attribution: "© Google Maps",
      maxZoom: 20,
    }).addTo(m);

    L.control.zoom({ position: "bottomright" }).addTo(m);
    markersLayer.current = L.layerGroup().addTo(m);

    setMapInstance(m);
    setTimeout(() => m.invalidateSize(), 200);

    return () => {
      m.remove();
      setMapInstance(null);
      markersLayer.current = null;
    };
  }, []);

  // 2. Render Household Markers
  useEffect(() => {
    if (!mapInstance || !markersLayer.current) return;

    markersLayer.current.clearLayers();
    if (!households || households.length === 0) return;

    const bounds: L.LatLngTuple[] = [];

    households.forEach((h) => {
      if (!h.latitude || !h.longitude || isNaN(h.latitude) || isNaN(h.longitude)) return;

      const pos: L.LatLngTuple = [h.latitude, h.longitude];
      bounds.push(pos);

      const icon = buildMarkerIcon(h);
      const marker = L.marker(pos, { icon }).addTo(markersLayer.current!);

      const covered = isCovered(h);
      const markerColor = getMarkerColor(h);

      // Tooltip (hover)
      marker.bindTooltip(
        `<div>
          <strong>${h.name}</strong><br/>
          RFID: ${h.rfid}<br/>
          Ward: ${h.ward} · ${h.area}<br/>
          <span style="color:${markerColor};font-weight:800;">${covered ? h.coverage_type : "Not Covered"}</span>
        </div>`,
        { className: "hh-tooltip", direction: "top", offset: [0, -16] }
      );

      // Popup (click)
      marker.bindPopup(buildPopupContent(h), { maxWidth: 290, minWidth: 270 });
    });

    if (bounds.length > 0) {
      try {
        mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } catch (e) {
        console.error("Failed to fit household map bounds", e);
      }
    }
  }, [mapInstance, households]);

  return <div ref={mapContainer} className="flex-1 w-full h-full z-0" />;
}
