"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Employee } from "@/app/swift/employee-monitoring/page";

interface EmployeeMapProps {
  employees: Employee[];
  selectedEmployee: Employee | null;
  onEmployeeClick: (employee: Employee) => void;
}

// Inject map CSS once
if (typeof document !== "undefined" && !document.getElementById("emp-map-style")) {
  const s = document.createElement("style");
  s.id = "emp-map-style";
  s.textContent = `
    .leaflet-tooltip.emp-tooltip {
      background: #1e293b !important;
      border: 1px solid #334155 !important;
      color: #f1f5f9 !important;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    .leaflet-tooltip.emp-tooltip::before {
      border-top-color: #1e293b !important;
    }
    .emp-marker {
      border: 2.5px solid #fff;
      border-radius: 50%;
      box-shadow: 0 0 0 3px rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: all 0.2s ease;
    }
    .emp-marker:hover {
      transform: scale(1.1);
    }
    .emp-marker.selected {
      box-shadow: 0 0 0 4px rgba(16,185,129,0.5), 0 2px 8px rgba(0,0,0,0.4);
    }
    .leaflet-popup-content-wrapper {
      border-radius: 14px !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18) !important;
      padding: 0 !important;
      overflow: hidden;
    }
    .leaflet-popup-content {
      margin: 0 !important;
      width: 280px !important;
    }
    .leaflet-popup-tip {
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(s);
}

function getMarkerColor(employee: Employee): string {
  if (employee.status === "Offline") return "#9CA3AF"; // Gray for offline
  
  switch (employee.designation) {
    case "Road Sweeping Staff":
      return "#10B981"; // Emerald/Green
    case "Supervisor":
      return "#F59E0B"; // Yellow/Amber
    case "Zone Manager":
      return "#EF4444"; // Red
    default:
      return "#10B981"; // Emerald default
  }
}

function getMarkerSVG(employee: Employee): string {
  switch (employee.designation) {
    case "Road Sweeping Staff":
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    case "Supervisor":
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    case "Zone Manager":
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    default:
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }
}

function buildMarkerIcon(employee: Employee, isSelected: boolean): L.DivIcon {
  const color = getMarkerColor(employee);
  const svg = getMarkerSVG(employee);
  const selectedClass = isSelected ? "selected" : "";
  
  return L.divIcon({
    className: "",
    html: `<div class="emp-marker ${selectedClass}" style="width:32px;height:32px;background-color:${color};display:flex;align-items:center;justify-content:center;">${svg}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
  });
}

function buildPopupContent(employee: Employee): string {
  const statusColor = employee.status === "Online" ? "#10B981" : "#9CA3AF";
  const statusBg = employee.status === "Online" ? "#D1FAE5" : "#F3F4F6";
  const statusText = employee.status === "Online" ? "#065F46" : "#4B5563";

  const lastUpdate = new Date(employee.last_gps_update).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `
    <div style="font-family:Inter,system-ui,sans-serif;font-size:12px;color:#1e293b;">
      <!-- Header -->
      <div style="background:${getMarkerColor(employee)};padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:6px;">
        <div>
          <div style="font-size:14px;font-weight:800;color:#fff;">${employee.name}</div>
          <div style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.85);margin-top:1px;">${employee.employee_id}</div>
        </div>
        <span style="font-size:9px;font-weight:800;padding:2px 8px;border-radius:20px;background:${statusBg};color:${statusText};text-transform:uppercase;letter-spacing:0.5px;">${employee.status}</span>
      </div>

      <!-- Body -->
      <div style="padding:10px 14px;display:flex;flex-direction:column;gap:8px;">

        <!-- Employee Details */}
        <div>
          <div style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px;">Employee Information</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;font-size:11px;">
            <span style="color:#64748b;">Designation:</span><span style="font-weight:600;text-align:right;">${employee.designation}</span>
            <span style="color:#64748b;">Mobile:</span><span style="font-weight:600;text-align:right;">${employee.mobile_number}</span>
          </div>
        </div>

        <div style="border-top:1px solid #f1f5f9;"></div>

        <!-- Assignment Details */}
        <div>
          <div style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px;">Assignment Information</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;font-size:11px;">
            <span style="color:#64748b;">Zone:</span><span style="font-weight:600;text-align:right;">${employee.zone}</span>
            <span style="color:#64748b;">Ward:</span><span style="font-weight:600;text-align:right;">${employee.ward}</span>
            <span style="color:#64748b;">Area:</span><span style="font-weight:600;text-align:right;">${employee.area}</span>
          </div>
        </div>

        <div style="border-top:1px solid #f1f5f9;"></div>

        <!-- GPS Details */}
        <div>
          <div style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px;">GPS Information</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;font-size:11px;">
            <span style="color:#64748b;">Latitude:</span><span style="font-weight:600;text-align:right;font-family:monospace;">${employee.latitude.toFixed(5)}</span>
            <span style="color:#64748b;">Longitude:</span><span style="font-weight:600;text-align:right;font-family:monospace;">${employee.longitude.toFixed(5)}</span>
            <span style="color:#64748b;">Last Update:</span><span style="font-weight:600;text-align:right;">${lastUpdate}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

export default function EmployeeMap({ employees, selectedEmployee, onEmployeeClick }: EmployeeMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const markersLayer = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Record<number, L.Marker>>({});

  // 1. Init Map
  useEffect(() => {
    if (!mapContainer.current) return;

    // Prevent re-initialization if Leaflet already attached to this DOM node
    if ((mapContainer.current as any)._leaflet_id) return;

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

  // 2. Render Employee Markers
  useEffect(() => {
    if (!mapInstance || !markersLayer.current) return;

    markersLayer.current.clearLayers();
    if (!employees || employees.length === 0) return;

    const bounds: L.LatLngTuple[] = [];

    employees.forEach((employee) => {
      if (!employee.latitude || !employee.longitude || isNaN(employee.latitude) || isNaN(employee.longitude)) return;

      const pos: L.LatLngTuple = [employee.latitude, employee.longitude];
      bounds.push(pos);

      const isSelected = selectedEmployee?.id === employee.id;
      const icon = buildMarkerIcon(employee, isSelected);
      const marker = L.marker(pos, { icon }).addTo(markersLayer.current!);

      // Tooltip (hover)
      marker.bindTooltip(
        `<div>
          <strong>${employee.name}</strong><br/>
          ${employee.designation}<br/>
          <span style="color:${employee.status === "Online" ? "#10B981" : "#9CA3AF"};font-weight:800;">${employee.status}</span>
        </div>`,
        { className: "emp-tooltip", direction: "top", offset: [0, -18] }
      );

      // Popup (click)
      marker.bindPopup(buildPopupContent(employee), { maxWidth: 300, minWidth: 280 });

      // Click handler
      marker.on("click", () => {
        onEmployeeClick(employee);
      });

      markersRef.current[employee.id] = marker;
    });

    if (bounds.length > 0) {
      try {
        mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } catch (e) {
        console.error("Failed to fit employee map bounds", e);
      }
    }
  }, [mapInstance, employees, selectedEmployee, onEmployeeClick]);

  // 3. Zoom to selected employee
  useEffect(() => {
    if (!mapInstance || !selectedEmployee) return;

    const marker = markersRef.current[selectedEmployee.id];
    if (marker) {
      mapInstance.setView([selectedEmployee.latitude, selectedEmployee.longitude], 16);
      marker.openPopup();
    }
  }, [mapInstance, selectedEmployee]);

  return <div ref={mapContainer} className="flex-1 w-full h-full z-0" />;
}
