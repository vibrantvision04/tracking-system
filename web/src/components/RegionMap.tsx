"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Region {
  id: number;
  region_name: string;
  region_code: string;
  estimated_population: number;
  region_type_title: string;
  parent_region_name: string;
  geojson?: any;
  color?: string;
}

interface RegionMapProps {
  geoJSON: string;
  color: string;
  onChangeGeoJSON: (val: string) => void;
  regions: Region[];
  isDrawing: boolean;
  setIsDrawing: (val: boolean) => void;
  editingRegionId?: number | null;
}

export default function RegionMap({
  geoJSON,
  color,
  onChangeGeoJSON,
  regions,
  isDrawing,
  setIsDrawing,
  editingRegionId,
}: RegionMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  
  // Layers references
  const currentDrawLayer = useRef<L.LayerGroup | null>(null);
  const existingRegionsLayer = useRef<L.FeatureGroup | null>(null);

  const [tempPoints, setTempPoints] = useState<[number, number][]>([]); // Store coordinates as [lng, lat] for GeoJSON

  // ─── Initialize Map ───
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const m = L.map(mapContainer.current, {
      zoomControl: false,
      minZoom: 4,
    }).setView([26.9124, 75.7873], 12);

    // Google Maps base layer
    const googleMapLayer = L.tileLayer("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      attribution: "© Google Maps",
      maxZoom: 20,
    });
    googleMapLayer.addTo(m);

    // Add zoom controls on top-right
    L.control.zoom({ position: "topright" }).addTo(m);

    // Create Layer Groups
    currentDrawLayer.current = L.layerGroup().addTo(m);
    existingRegionsLayer.current = L.featureGroup().addTo(m);

    mapRef.current = m;

    return () => {
      m.remove();
      mapRef.current = null;
    };
  }, []);

  // ─── Invalidate Map Size on layout change ───
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    
    // Call invalidateSize immediately and after transition delays to ensure the container transition has finished
    m.invalidateSize();
    const timer1 = setTimeout(() => m.invalidateSize(), 50);
    const timer2 = setTimeout(() => m.invalidateSize(), 150);
    const timer3 = setTimeout(() => m.invalidateSize(), 300);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [isDrawing]);

  // ─── Render Existing Regions ───
  useEffect(() => {
    const m = mapRef.current;
    const layer = existingRegionsLayer.current;
    if (!m || !layer) return;

    layer.clearLayers();

    // If a particular region is selected for editing/viewing, do not render other regions in the background
    if (editingRegionId) {
      return;
    }

    regions.forEach((reg) => {
      if (reg.geojson && reg.geojson.features && reg.geojson.features.length > 0) {
        try {
          const regionGeoJSON = L.geoJSON(reg.geojson, {
            style: {
              color: reg.color || "#888888",
              weight: 1.5,
              fillColor: reg.color || "#888888",
              fillOpacity: 0.1,
            },
          });
          
          regionGeoJSON.bindPopup(`
            <div style="font-family:Inter,sans-serif;font-size:11px;padding:2px;">
              <b style="font-size:12px;color:#1e293b;">${reg.region_name}</b><br/>
              <span style="color:#64748b;">Code: ${reg.region_code || "—"}</span><br/>
              <span style="color:#64748b;">Type: ${reg.region_type_title}</span>
            </div>
          `);

          layer.addLayer(regionGeoJSON);
        } catch (err) {
          console.error("Failed to render background region", reg.region_name, err);
        }
      }
    });
  }, [regions, editingRegionId]);

  // ─── Initialize tempPoints from geoJSON (External Sync, e.g. when editing starts) ───
  useEffect(() => {
    if (!geoJSON) {
      setTempPoints([]);
      return;
    }

    try {
      const parsed = JSON.parse(geoJSON);
      if (parsed && parsed.features && parsed.features[0] && parsed.features[0].geometry) {
        const geom = parsed.features[0].geometry;
        if (geom.type === "Polygon" && geom.coordinates && geom.coordinates[0]) {
          const coords = geom.coordinates[0];
          if (coords.length > 2) {
            // Strip the last closing coordinate to match the drawing vertex flow
            const temp = coords.slice(0, -1);
            
            // Only set if different to prevent infinite loops
            const isDifferent = temp.some((pt, idx) => {
              const prevPt = tempPoints[idx];
              return !prevPt || pt[0] !== prevPt[0] || pt[1] !== prevPt[1];
            }) || temp.length !== tempPoints.length;

            if (isDifferent) {
              setTempPoints(temp);
              
              // Automatically pan map to fit the loaded polygon shape
              const m = mapRef.current;
              if (m) {
                const shape = L.geoJSON(parsed);
                const bounds = shape.getBounds();
                if (bounds.isValid()) {
                  m.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
                }
              }
            }
          }
        }
      }
    } catch (err) {
      // Quietly ignore parsing errors as user might still be typing
    }
  }, [geoJSON]);

  // ─── Propagate tempPoints changes back to parent geoJSON textarea ───
  useEffect(() => {
    if (tempPoints.length < 3) return;

    // Close polygon loop by adding first point at the end
    const coordinates = [...tempPoints, tempPoints[0]];

    const geoJSONFeature = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [coordinates],
          },
        },
      ],
    };

    const newStr = JSON.stringify(geoJSONFeature, null, 2);
    if (newStr !== geoJSON) {
      onChangeGeoJSON(newStr);
    }
  }, [tempPoints]);

  // ─── Map Click Handler (Drawing Points) ───
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!isDrawing) return;
      const { lat, lng } = e.latlng;
      setTempPoints((prev) => [...prev, [lng, lat]]);
    };

    m.on("click", handleMapClick);
    return () => {
      m.off("click", handleMapClick);
    };
  }, [isDrawing]);

  // ─── Render Draggable Vertices and Midpoints / Finished Polygon ───
  useEffect(() => {
    const layer = currentDrawLayer.current;
    if (!layer) return;

    layer.clearLayers();

    if (tempPoints.length === 0) return;

    // Use mutable local copy of L.LatLng objects to update natively on drag
    const latLngs = tempPoints.map(([lng, lat]) => L.latLng(lat, lng));
    const n = latLngs.length;

    if (!isDrawing) {
      // ─── RENDER finished polygon style when not actively editing/drawing (The Border and All!) ───
      if (n >= 3) {
        L.polygon(latLngs, {
          color: color || "#fba339",
          weight: 2,
          fillColor: color || "#fba339",
          fillOpacity: 0.15,
        }).addTo(layer);
      } else {
        // Draw simple polyline if less than 3 points
        L.polyline(latLngs, {
          color: color || "#fba339",
          weight: 2,
        }).addTo(layer);
      }
      return; // Stop here, do not render green vertex points or midpoints!
    }

    // ─── RENDER active drawing tools when isDrawing is active ───

    // Draw polygon boundary path natively in Leaflet
    const line = L.polyline(latLngs, {
      color: "#059669",
      weight: 3,
    }).addTo(layer);

    // Draw polygon closing dashed line natively if n > 2
    let closedLine: L.Polyline | null = null;
    if (n > 2) {
      closedLine = L.polyline([latLngs[n - 1], latLngs[0]], {
        color: "#059669",
        weight: 1.5,
        dashArray: "5, 5",
      }).addTo(layer);
    }

    // Keep track of midpoint markers so we can adjust their positions natively
    const midMarkers: L.Marker[] = [];

    const updateMidpointPosition = (idx: number) => {
      const p1 = latLngs[idx];
      const p2 = latLngs[(idx + 1) % n];
      const midLat = (p1.lat + p2.lat) / 2;
      const midLng = (p1.lng + p2.lng) / 2;
      if (midMarkers[idx]) {
        midMarkers[idx].setLatLng([midLat, midLng]);
      }
    };

    // 1. Draw points as draggable circular markers
    latLngs.forEach((latlng, idx) => {
      const marker = L.marker(latlng, {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:12px;height:12px;border-radius:50%;background:#059669;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.25);cursor:move;"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        }),
        draggable: true
      });

      marker.on("drag", (e: L.LeafletEvent) => {
        const dragLatLng = (e.target as L.Marker).getLatLng();
        
        // Update local mutable coordinates array
        latLngs[idx] = dragLatLng;

        // Redraw polyline path natively in real-time
        line.setLatLngs(latLngs);
        if (closedLine) {
          closedLine.setLatLngs([latLngs[n - 1], latLngs[0]]);
        }

        // Move adjacent segment midpoints dynamically
        updateMidpointPosition((idx - 1 + n) % n);
        updateMidpointPosition(idx);
      });

      marker.on("dragend", () => {
        // Propagate updated coordinates to React state exactly once upon drag completion
        setTempPoints(latLngs.map((ll) => [ll.lng, ll.lat]));
      });

      // CLICK handler on the first marker to easily close and finish shape!
      if (idx === 0 && n >= 3) {
        marker.on("click", (e: L.LeafletEvent) => {
          L.DomEvent.stopPropagation(e);
          // Close polygon loop by adding first point at the end
          const coordinates = [...latLngs, latLngs[0]].map((ll) => [ll.lng, ll.lat]);

          const geoJSONFeature = {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "Polygon",
                  coordinates: [coordinates],
                },
              },
            ],
          };

          onChangeGeoJSON(JSON.stringify(geoJSONFeature, null, 2));
          setIsDrawing(false);
        });
        
        marker.options.title = "Click to close and finish polygon";
      }

      layer.addLayer(marker);
    });

    // 2. Draw midpoints/child points that expand the polygon when dragged
    if (n > 1) {
      for (let i = 0; i < n; i++) {
        // Skip closing midpoint if polygon is not closed or has only 2 points
        if (i === n - 1 && n < 3) continue;

        const p1 = latLngs[i];
        const p2 = latLngs[(i + 1) % n];

        const midLat = (p1.lat + p2.lat) / 2;
        const midLng = (p1.lng + p2.lng) / 2;
        const midLatLng = L.latLng(midLat, midLng);

        const midMarker = L.marker(midLatLng, {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:10px;height:10px;border-radius:50%;background:#34d399;opacity:0.8;border:1.5px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.2);cursor:pointer;"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5]
          }),
          draggable: true
        });

        midMarkers[i] = midMarker;

        let activeLatLngs = [...latLngs];
        let inserted = false;
        const newIdx = i + 1;

        midMarker.on("drag", (e: L.LeafletEvent) => {
          const dragLatLng = (e.target as L.Marker).getLatLng();
          if (!inserted) {
            // Splicing a temporary vertex into the polyline on first drag movement
            activeLatLngs.splice(newIdx, 0, dragLatLng);
            inserted = true;
          } else {
            // Update the temporary vertex position
            activeLatLngs[newIdx] = dragLatLng;
          }

          // Update polyline path to show the extension natively in real-time
          line.setLatLngs(activeLatLngs);
          if (closedLine) {
            closedLine.setLatLngs([activeLatLngs[activeLatLngs.length - 1], activeLatLngs[0]]);
          }
        });

        midMarker.on("dragend", () => {
          const finalLatLng = midMarker.getLatLng();
          // Update the React state ONCE when drag completes, inserting the new vertex permanently
          setTempPoints((prev) => {
            const next = [...prev];
            next.splice(newIdx, 0, [finalLatLng.lng, finalLatLng.lat]);
            return next;
          });
        });

        layer.addLayer(midMarker);
      }
    }
  }, [tempPoints, isDrawing, color]);

  // ─── Drawing Actions ───
  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempPoints((prev) => prev.slice(0, -1));
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempPoints([]);
    onChangeGeoJSON("");
  };

  const handleFinish = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tempPoints.length < 3) {
      alert("Please draw at least 3 points to create a valid polygon.");
      return;
    }

    // Close polygon loop by adding first point at the end
    const coordinates = [...tempPoints, tempPoints[0]];

    const geoJSONFeature = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [coordinates],
          },
        },
      ],
    };

    onChangeGeoJSON(JSON.stringify(geoJSONFeature, null, 2));
    setIsDrawing(false);
  };

  return (
    <div className="relative w-full h-full min-h-[300px] overflow-hidden flex flex-col">
      <div ref={mapContainer} className="flex-1 w-full h-full z-0" />

      {/* Sleek, Top-Center Drawing Controller & Actions Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex gap-2.5 items-center select-none">
        <button
          type="button"
          onClick={() => {
            setIsDrawing(!isDrawing);
            if (!isDrawing) setTempPoints([]);
          }}
          className={`p-2.5 rounded-xl shadow-lg border transition-all flex items-center justify-center
            ${isDrawing 
              ? "bg-emerald-600 text-white border-emerald-500 scale-105" 
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          title={isDrawing ? "Stop Drawing" : "Start Drawing Polygon"}
        >
          <svg className="w-4.5 h-4.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span className="ml-2 text-[10px] font-black uppercase tracking-wider">
            {isDrawing ? "Drawing Mode Active" : "Draw Polygon"}
          </span>
        </button>

        {isDrawing && (
          <div className="flex gap-1.5 bg-white/95 backdrop-blur-md border border-slate-200 p-1.5 rounded-xl shadow-lg animate-slide-in">
            <button
              type="button"
              onClick={handleUndo}
              disabled={tempPoints.length === 0}
              className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-[10px] font-bold px-3 py-1.5 rounded-lg transition"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={tempPoints.length === 0}
              className="bg-red-50 hover:bg-red-100 disabled:opacity-40 text-red-600 text-[10px] font-bold px-3 py-1.5 rounded-lg transition"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleFinish}
              disabled={tempPoints.length < 3}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[10px] font-bold px-4 py-1.5 rounded-lg transition shadow-md shadow-emerald-600/10"
            >
              Finish Shape
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
