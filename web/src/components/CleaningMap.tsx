"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface CleaningMapProps {
  depotLat: number;
  depotLng: number;
  radius: number;
  uploadLat?: number;
  uploadLng?: number;
  verificationStatus?: string; // "VALID" or "OUTSIDE_RADIUS"
  depotName?: string;
}

export default function CleaningMap({
  depotLat,
  depotLng,
  radius,
  uploadLat,
  uploadLng,
  verificationStatus,
  depotName = "Depot Center",
}: CleaningMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  const depotMarkerRef = useRef<L.Marker | null>(null);
  const uploadMarkerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);

  const defaultLat = 26.9124;
  const defaultLng = 75.7873;

  const latNum = parseFloat(String(depotLat));
  const lngNum = parseFloat(String(depotLng));
  const radNum = parseFloat(String(radius));

  const hasValidDepot = !isNaN(latNum) && !isNaN(lngNum) && latNum !== 0 && lngNum !== 0;
  const hasValidUpload = uploadLat !== undefined && uploadLng !== undefined && 
                         !isNaN(uploadLat) && !isNaN(uploadLng) && 
                         uploadLat !== 0 && uploadLng !== 0;

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapInstance) return;

    const initialLat = hasValidDepot ? latNum : defaultLat;
    const initialLng = hasValidDepot ? lngNum : defaultLng;

    const m = L.map(mapContainer.current, {
      zoomControl: false,
      minZoom: 4,
    }).setView([initialLat, initialLng], 15);

    // Google Maps base layer
    const googleMapLayer = L.tileLayer("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      attribution: "© Google Maps",
      maxZoom: 20,
    });
    googleMapLayer.addTo(m);

    // Zoom controls on top-right
    L.control.zoom({ position: "topright" }).addTo(m);

    setMapInstance(m);

    // Force map to invalidate size and load tiles correctly
    setTimeout(() => {
      if (m) {
        m.invalidateSize();
      }
    }, 200);

    return () => {
      m.remove();
      setMapInstance(null);
    };
  }, []);

  // 2. Update Layers when Coordinates Change
  useEffect(() => {
    if (!mapInstance) return;

    // Remove existing markers & overlays if any
    if (depotMarkerRef.current) {
      depotMarkerRef.current.remove();
      depotMarkerRef.current = null;
    }
    if (uploadMarkerRef.current) {
      uploadMarkerRef.current.remove();
      uploadMarkerRef.current = null;
    }
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }
    if (lineRef.current) {
      lineRef.current.remove();
      lineRef.current = null;
    }

    if (!hasValidDepot) return;

    const targetRadius = radNum && radNum > 0 ? radNum : 50;

    // Depot Marker Styling (large blue/green circle target)
    const depotIcon = L.divIcon({
      className: "",
      html: `<div style="
        background-color: #059669; 
        width: 32px; 
        height: 32px; 
        border-radius: 50%; 
        color: white; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        font-size: 16px; 
        font-weight: bold; 
        border: 2.5px solid white; 
        box-shadow: 0 3px 8px rgba(0,0,0,0.4);
      ">🎯</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const depotMarker = L.marker([latNum, lngNum], { icon: depotIcon })
      .addTo(mapInstance)
      .bindPopup(`<b>${depotName}</b><br>Radius: ${targetRadius}m`);
    depotMarkerRef.current = depotMarker;

    // Geofence Circle
    const circle = L.circle([latNum, lngNum], {
      radius: targetRadius,
      color: "#059669",
      weight: 2,
      fillColor: "#059669",
      fillOpacity: 0.12,
    }).addTo(mapInstance);
    circleRef.current = circle;

    const bounds = L.latLngBounds([L.latLng(latNum, lngNum)]);

    // Handle Upload Marker
    if (hasValidUpload) {
      const isInside = verificationStatus === "VALID";
      const markerColor = isInside ? "#10B981" : "#EF4444"; // Green or Red
      const markerEmoji = isInside ? "📸" : "⚠️";

      const uploadIcon = L.divIcon({
        className: "",
        html: `<div style="
          background-color: ${markerColor}; 
          width: 32px; 
          height: 32px; 
          border-radius: 50%; 
          color: white; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-size: 16px; 
          font-weight: bold; 
          border: 2.5px solid white; 
          box-shadow: 0 3px 8px rgba(0,0,0,0.4);
        ">${markerEmoji}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const uploadMarker = L.marker([uploadLat!, uploadLng!], { icon: uploadIcon })
        .addTo(mapInstance)
        .bindPopup(`<b>Upload Location</b><br>${isInside ? "Inside Radius (Valid)" : "Outside Radius (Invalid)"}`);
      uploadMarkerRef.current = uploadMarker;

      bounds.extend(L.latLng(uploadLat!, uploadLng!));

      // Draw connecting dashed line
      const line = L.polyline([[latNum, lngNum], [uploadLat!, uploadLng!]], {
        color: markerColor,
        weight: 2,
        dashArray: "6, 6",
      }).addTo(mapInstance);
      lineRef.current = line;

      // Fit map to show both markers
      mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } else {
      // Zoom to just the depot geofence
      const circleBounds = circle.getBounds();
      if (circleBounds.isValid()) {
        mapInstance.fitBounds(circleBounds, { padding: [50, 50], maxZoom: 16 });
      } else {
        mapInstance.setView([latNum, lngNum], 16);
      }
    }
  }, [mapInstance, depotLat, depotLng, radius, uploadLat, uploadLng, verificationStatus]);

  // Adjust size on window or tab switches
  useEffect(() => {
    if (!mapInstance) return;
    mapInstance.invalidateSize();
  }, [mapInstance, depotLat, depotLng]);

  return <div ref={mapContainer} className="w-full h-full rounded-2xl overflow-hidden shadow-inner border border-theme-border" style={{ minHeight: "300px" }} />;
}
