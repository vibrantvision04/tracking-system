"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface DepotMapProps {
  latitude: number;
  longitude: number;
  radius: number;
  onLocationChange?: (lat: number, lng: number) => void;
  onRadiusChange?: (radius: number) => void;
  previewOnly?: boolean;
}

export default function DepotMap({
  latitude,
  longitude,
  radius,
  onLocationChange,
  onRadiusChange,
  previewOnly = false,
}: DepotMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  
  // Manage the map instance as state so changes trigger the layer rendering effect
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const initialFitPerformed = useRef(false);

  const [isFullscreen, setIsFullscreen] = useState(false);

  const defaultLat = 26.9124;
  const defaultLng = 75.7873;

  // Force cast inputs to numbers to prevent string parsing bugs in Leaflet
  const latNum = parseFloat(String(latitude));
  const lngNum = parseFloat(String(longitude));
  const radNum = parseFloat(String(radius));

  const hasValidCoords = !isNaN(latNum) && !isNaN(lngNum) && latNum !== 0 && lngNum !== 0;

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapInstance) return;

    const initialLat = hasValidCoords ? latNum : defaultLat;
    const initialLng = hasValidCoords ? lngNum : defaultLng;

    const m = L.map(mapContainer.current, {
      zoomControl: false,
      minZoom: 4,
    }).setView([initialLat, initialLng], 14);

    // Google Maps base layer
    const googleMapLayer = L.tileLayer("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      attribution: "© Google Maps",
      maxZoom: 20,
    });
    googleMapLayer.addTo(m);

    // Zoom controls on top-right
    L.control.zoom({ position: "topright" }).addTo(m);

    setMapInstance(m);

    // Listen to map click to place marker in edit/create mode
    if (!previewOnly && onLocationChange) {
      m.on("click", (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        onLocationChange(parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6)));
      });
    }

    // Force map to invalidate size and load tiles correctly shortly after mount
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

  // 2. Track, update, and pan/zoom Marker and Geofence Circle
  useEffect(() => {
    if (!mapInstance) return;

    const targetLat = hasValidCoords ? latNum : defaultLat;
    const targetLng = hasValidCoords ? lngNum : defaultLng;
    const targetRadius = radNum && radNum > 0 ? radNum : 50;

    // Setup custom divIcon for premium styling (large green circular target icon)
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

    // Handle Marker Update/Creation
    if (hasValidCoords) {
      if (markerRef.current) {
        markerRef.current.setLatLng([targetLat, targetLng]);
      } else {
        const marker = L.marker([targetLat, targetLng], {
          icon: depotIcon,
          draggable: !previewOnly && !!onLocationChange,
        }).addTo(mapInstance);

        if (!previewOnly && onLocationChange) {
          marker.on("dragend", (e: L.LeafletEvent) => {
            const dragLatLng = (e.target as L.Marker).getLatLng();
            onLocationChange(
              parseFloat(dragLatLng.lat.toFixed(6)),
              parseFloat(dragLatLng.lng.toFixed(6))
            );
          });
        }
        markerRef.current = marker;
      }
    } else {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    }

    // Handle Circle Update/Creation
    let activeCircle: L.Circle | null = null;
    if (hasValidCoords) {
      if (circleRef.current) {
        circleRef.current.setLatLng([targetLat, targetLng]);
        circleRef.current.setRadius(targetRadius);
        activeCircle = circleRef.current;
      } else {
        const circle = L.circle([targetLat, targetLng], {
          radius: targetRadius,
          color: "#059669",
          weight: 2.5,
          fillColor: "#059669",
          fillOpacity: 0.18,
        }).addTo(mapInstance);
        circleRef.current = circle;
        activeCircle = circle;
      }
    } else {
      if (circleRef.current) {
        circleRef.current.remove();
        circleRef.current = null;
      }
    }

    // Fit bounds or set view (only once on initial load/coordinate mount to prevent jumping during dragging)
    if (hasValidCoords) {
      if (!initialFitPerformed.current) {
        if (activeCircle) {
          try {
            const bounds = activeCircle.getBounds();
            if (bounds.isValid()) {
              mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
              initialFitPerformed.current = true;
            } else {
              mapInstance.setView([targetLat, targetLng], 15);
              initialFitPerformed.current = true;
            }
          } catch (err) {
            mapInstance.setView([targetLat, targetLng], 15);
            initialFitPerformed.current = true;
          }
        } else {
          mapInstance.setView([targetLat, targetLng], 15);
          initialFitPerformed.current = true;
        }
      }
    } else {
      // If coords are cleared, reset the initial fit flag
      initialFitPerformed.current = false;
    }
  }, [mapInstance, latitude, longitude, radius, hasValidCoords, previewOnly, onLocationChange]);

  // 3. Handle resize and invalidate map size when fullscreen toggles
  useEffect(() => {
    if (!mapInstance) return;

    mapInstance.invalidateSize();
    const timer = setTimeout(() => mapInstance.invalidateSize(), 200);
    return () => clearTimeout(timer);
  }, [mapInstance, isFullscreen, latitude, longitude]);

  // 4. Stacking Context override for Fullscreen Mode (forces parent container above Sidebar z-index)
  useEffect(() => {
    if (isFullscreen) {
      document.body.classList.add("fullscreen-map-active");
    } else {
      document.body.classList.remove("fullscreen-map-active");
    }
    return () => {
      document.body.classList.remove("fullscreen-map-active");
    };
  }, [isFullscreen]);

  const dropPinAtCenter = () => {
    if (!mapInstance || !onLocationChange) return;
    const center = mapInstance.getCenter();
    onLocationChange(
      parseFloat(center.lat.toFixed(6)),
      parseFloat(center.lng.toFixed(6))
    );
  };

  return (
    <div
      className={`w-full h-full flex flex-col transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-0 z-[9999] bg-theme-base"
          : "relative overflow-hidden"
      }`}
    >
      {/* Fullscreen Stacking Context CSS Fix */}
      {isFullscreen && (
        <style dangerouslySetInnerHTML={{ __html: `
          body.fullscreen-map-active div.flex.h-screen > div.flex-1 {
            z-index: 99999 !important;
          }
        `}} />
      )}

      {/* Fullscreen Header Overlay */}
      {isFullscreen && (
        <div className="bg-theme-surface/90 backdrop-blur border-b border-theme-border p-4 z-[1000] flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-theme-text">📍 Open Depot Fullscreen GIS Editor</span>
            <span className="text-xs text-theme-text-dim font-semibold mt-0.5">
              {hasValidCoords
                ? `Coordinates: ${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`
                : "Search or drag map to place depot geofence"}
            </span>
          </div>

          {onRadiusChange && !previewOnly && (
            <div className="flex items-center gap-4 bg-theme-surface px-4 py-2 rounded-xl border border-theme-border shadow-sm">
              <span className="text-xs font-bold text-theme-text">Radius:</span>
              <input
                type="range"
                min="10"
                max="500"
                step="5"
                value={radNum || 50}
                onChange={(e) => onRadiusChange(parseInt(e.target.value))}
                className="w-32 md:w-48 h-1.5 bg-theme-border rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <span className="text-xs font-bold text-emerald-400">{radNum}m</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsFullscreen(false)}
            className="bg-theme-accent hover:bg-theme-accent-hover text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-md shadow-emerald-600/20 cursor-pointer"
          >
            Confirm Location & Close
          </button>
        </div>
      )}

      {/* Main Map Element */}
      <div ref={mapContainer} className="flex-1 w-full h-full z-0" />

      {/* Floating Action Panels */}
      <div className="absolute right-4 bottom-4 z-[1000] flex flex-col gap-2.5">
        {/* Fullscreen Toggle */}
        <button
          type="button"
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="p-2.5 bg-theme-surface hover:bg-theme-surface-hover rounded-xl shadow-lg border border-theme-border text-theme-text transition flex items-center justify-center cursor-pointer"
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen GIS Mode"}
        >
          {isFullscreen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Drag & Drop controls when editing */}
      {!previewOnly && onLocationChange && (
        <div className="absolute left-4 bottom-4 z-[1000] flex gap-2">
          <button
            type="button"
            onClick={dropPinAtCenter}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5 transition border border-emerald-500/30 cursor-pointer"
          >
            📍 Drop Pin at Center
          </button>
          {hasValidCoords ? (
            <div className="bg-theme-surface/90 backdrop-blur border border-theme-border text-theme-text text-[10px] font-bold px-3.5 py-2.5 rounded-xl shadow-md flex items-center">
              🟢 Drag & Drop pin `🎯` to adjust geofence.
            </div>
          ) : (
            <div className="bg-theme-surface/90 backdrop-blur border border-theme-border text-theme-text text-[10px] font-bold px-3.5 py-2.5 rounded-xl shadow-md flex items-center">
              ⚪ Click on map or center map and click "Drop Pin at Center".
            </div>
          )}
        </div>
      )}
    </div>
  );
}
