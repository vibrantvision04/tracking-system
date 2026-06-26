"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "react-toastify";

interface Point2D {
  latitude: number;
  longitude: number;
}

interface DumpZone extends Point2D {
  radius: number;
}

interface TransferStationMapProps {
  boundaryGeoJSON: string;
  onChangeBoundary: (val: string) => void;
  dumpZone: DumpZone | null;
  onChangeDumpZone: (val: DumpZone | null) => void;
  entryPoint: Point2D | null;
  onChangeEntryPoint: (val: Point2D | null) => void;
  exitPoint: Point2D | null;
  onChangeExitPoint: (val: Point2D | null) => void;
  activeTool: "boundary" | "dump" | "entry" | "exit" | null;
  setActiveTool: (tool: "boundary" | "dump" | "entry" | "exit" | null) => void;
  color: string;
  isDrawingBoundary: boolean;
  setIsDrawingBoundary: (val: boolean) => void;
}

export default function TransferStationMap({
  boundaryGeoJSON,
  onChangeBoundary,
  dumpZone,
  onChangeDumpZone,
  entryPoint,
  onChangeEntryPoint,
  exitPoint,
  onChangeExitPoint,
  activeTool,
  setActiveTool,
  color,
  isDrawingBoundary,
  setIsDrawingBoundary,
}: TransferStationMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Layers references
  const currentDrawLayer = useRef<L.LayerGroup | null>(null);

  const [tempPoints, setTempPoints] = useState<[number, number][]>([]); // [lng, lat] for GeoJSON
  const hasFitBounds = useRef(false);

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

    mapRef.current = m;

    return () => {
      m.remove();
      mapRef.current = null;
    };
  }, []);

  // ─── Handle Map Clicks to Place Markers ───
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;

      if (activeTool === "boundary") {
        setTempPoints((prev) => [...prev, [lng, lat]]);
      } else if (activeTool === "dump") {
        onChangeDumpZone({
          latitude: lat,
          longitude: lng,
          radius: dumpZone?.radius || 15,
        });
        setActiveTool(null);
      } else if (activeTool === "entry") {
        onChangeEntryPoint({
          latitude: lat,
          longitude: lng,
        });
        setActiveTool(null);
      } else if (activeTool === "exit") {
        onChangeExitPoint({
          latitude: lat,
          longitude: lng,
        });
        setActiveTool(null);
      }
    };

    m.on("click", handleMapClick);
    return () => {
      m.off("click", handleMapClick);
    };
  }, [activeTool, dumpZone, onChangeDumpZone, onChangeEntryPoint, onChangeExitPoint, setActiveTool]);

  // ─── Initialize tempPoints from boundaryGeoJSON ───
  useEffect(() => {
    if (!boundaryGeoJSON) {
      setTempPoints([]);
      return;
    }

    try {
      const parsed = JSON.parse(boundaryGeoJSON);
      if (parsed && parsed.features && parsed.features[0] && parsed.features[0].geometry) {
        const geom = parsed.features[0].geometry;
        if (geom.type === "Polygon" && geom.coordinates && geom.coordinates[0]) {
          const coords = geom.coordinates[0];
          if (coords.length > 2) {
            // Strip closing coordinate
            const temp = coords.slice(0, -1);

            const isDifferent = temp.some((pt: number[], idx: number) => {
              const prevPt = tempPoints[idx];
              return !prevPt || pt[0] !== prevPt[0] || pt[1] !== prevPt[1];
            }) || temp.length !== tempPoints.length;

            if (isDifferent) {
              setTempPoints(temp);

              // Fit map bounds only once on initial load
              const m = mapRef.current;
              if (m && !hasFitBounds.current) {
                const shape = L.geoJSON(parsed);
                const bounds = shape.getBounds();
                if (bounds.isValid()) {
                  m.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
                  hasFitBounds.current = true;
                }
              }
            }
          }
        }
      }
    } catch (err) {}
  }, [boundaryGeoJSON]);

  // ─── Propagate tempPoints to parent boundaryGeoJSON ───
  useEffect(() => {
    if (tempPoints.length < 3) return;

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
    if (newStr !== boundaryGeoJSON) {
      onChangeBoundary(newStr);
    }
  }, [tempPoints]);

  // ─── Render Polygon and Overlay Markers ───
  useEffect(() => {
    const layer = currentDrawLayer.current;
    const m = mapRef.current;
    if (!layer || !m) return;

    layer.clearLayers();

    const polygonColor = color || "#10b981";

    // 1. Draw Boundary Polygon
    const latLngs = tempPoints.map(([lng, lat]) => L.latLng(lat, lng));
    const n = latLngs.length;

    if (n > 0) {
      if (activeTool === "boundary") {
        // Draw active drawing path
        const line = L.polyline(latLngs, {
          color: "#059669",
          weight: 3,
        }).addTo(layer);

        let closedLine: L.Polyline | null = null;
        if (n > 2) {
          closedLine = L.polyline([latLngs[n - 1], latLngs[0]], {
            color: "#059669",
            weight: 1.5,
            dashArray: "5, 5",
          }).addTo(layer);
        }

        let filledPolygon: L.Polygon | null = null;
        if (n >= 3) {
          filledPolygon = L.polygon(latLngs, {
            color: polygonColor,
            weight: 2.5,
            fillColor: polygonColor,
            fillOpacity: 0.1,
          }).addTo(layer);
        }

        const midMarkers: L.Marker[] = [];
        const updateMidpointPosition = (i: number) => {
          const p1 = latLngs[i];
          const p2 = latLngs[(i + 1) % n];
          const midLat = (p1.lat + p2.lat) / 2;
          const midLng = (p1.lng + p2.lng) / 2;
          if (midMarkers[i]) {
            midMarkers[i].setLatLng([midLat, midLng]);
          }
        };

        // Draggable vertices
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
            latLngs[idx] = dragLatLng;
            
            line.setLatLngs(latLngs);
            if (closedLine) {
              closedLine.setLatLngs([latLngs[n - 1], latLngs[0]]);
            }
            if (filledPolygon) {
              filledPolygon.setLatLngs(latLngs);
            }

            updateMidpointPosition((idx - 1 + n) % n);
            updateMidpointPosition(idx);
          });

          marker.on("dragend", () => {
            setTempPoints(latLngs.map(ll => [ll.lng, ll.lat]));
          });

          marker.on("click", (e: L.LeafletEvent) => {
            L.DomEvent.stopPropagation(e);
            if (idx === 0 && n >= 3) {
              setIsDrawingBoundary(false);
              setActiveTool(null);
            }
          });

          if (idx === 0 && n >= 3) {
            marker.options.title = "Click to close polygon";
          }

          layer.addLayer(marker);
        });

        // Midpoints logic
        if (n > 1) {
          for (let i = 0; i < n; i++) {
            if (i === n - 1 && n < 3) continue;

            const p1 = latLngs[i];
            const p2 = latLngs[(i + 1) % n];
            const midLat = (p1.lat + p2.lat) / 2;
            const midLng = (p1.lng + p2.lng) / 2;

            const midMarker = L.marker([midLat, midLng], {
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
                activeLatLngs.splice(newIdx, 0, dragLatLng);
                inserted = true;
              } else {
                activeLatLngs[newIdx] = dragLatLng;
              }

              line.setLatLngs(activeLatLngs);
              if (closedLine) {
                closedLine.setLatLngs([activeLatLngs[activeLatLngs.length - 1], activeLatLngs[0]]);
              }
              if (filledPolygon) {
                filledPolygon.setLatLngs(activeLatLngs);
              }
            });

            midMarker.on("dragend", () => {
              const finalLatLng = midMarker.getLatLng();
              setTempPoints((prev) => {
                const next = [...prev];
                next.splice(newIdx, 0, [finalLatLng.lng, finalLatLng.lat]);
                return next;
              });
            });

            midMarker.on("click", (e: L.LeafletEvent) => {
              L.DomEvent.stopPropagation(e);
            });

            layer.addLayer(midMarker);
          }
        }
      } else {
        // Render boundary polygon statically if not actively editing boundary
        if (n >= 3) {
          L.polygon(latLngs, {
            color: polygonColor,
            weight: 3,
            fillColor: polygonColor,
            fillOpacity: 0.15,
          }).addTo(layer);
        }
      }
    }

    // 2. Draw Dump Zone Circle & Center Marker
    if (dumpZone) {
      const dumpCenter = L.latLng(dumpZone.latitude, dumpZone.longitude);

      // Circle representing radius
      L.circle(dumpCenter, {
        radius: dumpZone.radius,
        color: "#f59e0b",
        weight: 2,
        fillColor: "#f59e0b",
        fillOpacity: 0.12,
        dashArray: "3, 4",
      }).addTo(layer);

      // Draggable center marker
      const dumpIcon = L.divIcon({
        className: "",
        html: `<div style="
          background-color: #f59e0b; 
          width: 28px; 
          height: 28px; 
          border-radius: 50%; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          border: 2px solid white; 
          box-shadow: 0 3px 6px rgba(0,0,0,0.3);
          cursor: move;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const dumpMarker = L.marker(dumpCenter, { icon: dumpIcon, draggable: true }).addTo(layer);
      dumpMarker.bindPopup(`<b style="color: #d97706;">Dump Zone</b><br/>Radius: ${dumpZone.radius}m`);
      
      dumpMarker.on("click", (e: L.LeafletEvent) => {
        L.DomEvent.stopPropagation(e);
      });

      dumpMarker.on("dragend", (e: L.LeafletEvent) => {
        const newLatLng = (e.target as L.Marker).getLatLng();
        onChangeDumpZone({
          latitude: newLatLng.lat,
          longitude: newLatLng.lng,
          radius: dumpZone.radius,
        });
      });
    }

    // 3. Draw Entry Point Marker
    if (entryPoint) {
      const entryLatLng = L.latLng(entryPoint.latitude, entryPoint.longitude);

      const entryIcon = L.divIcon({
        className: "",
        html: `<div style="
          background-color: #10b981; 
          width: 26px; 
          height: 26px; 
          border-radius: 50%; 
          color: white; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-size: 9px; 
          font-weight: 900;
          border: 2px solid white; 
          box-shadow: 0 3px 6px rgba(0,0,0,0.3);
          cursor: move;
        ">IN</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const entryMarker = L.marker(entryLatLng, { icon: entryIcon, draggable: true }).addTo(layer);
      entryMarker.bindPopup(`<b style="color: #059669;">Entry Point</b>`);

      entryMarker.on("click", (e: L.LeafletEvent) => {
        L.DomEvent.stopPropagation(e);
      });

      entryMarker.on("dragend", (e: L.LeafletEvent) => {
        const newLatLng = (e.target as L.Marker).getLatLng();
        onChangeEntryPoint({
          latitude: newLatLng.lat,
          longitude: newLatLng.lng,
        });
      });
    }

    // 4. Draw Exit Point Marker
    if (exitPoint) {
      const exitLatLng = L.latLng(exitPoint.latitude, exitPoint.longitude);

      const exitIcon = L.divIcon({
        className: "",
        html: `<div style="
          background-color: #ef4444; 
          width: 26px; 
          height: 26px; 
          border-radius: 50%; 
          color: white; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-size: 9px; 
          font-weight: 900;
          border: 2px solid white; 
          box-shadow: 0 3px 6px rgba(0,0,0,0.3);
          cursor: move;
        ">OUT</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const exitMarker = L.marker(exitLatLng, { icon: exitIcon, draggable: true }).addTo(layer);
      exitMarker.bindPopup(`<b style="color: #dc2626;">Exit Point</b>`);

      exitMarker.on("click", (e: L.LeafletEvent) => {
        L.DomEvent.stopPropagation(e);
      });

      exitMarker.on("dragend", (e: L.LeafletEvent) => {
        const newLatLng = (e.target as L.Marker).getLatLng();
        onChangeExitPoint({
          latitude: newLatLng.lat,
          longitude: newLatLng.lng,
        });
      });
    }
  }, [tempPoints, activeTool, dumpZone, entryPoint, exitPoint, color]);

  // Undo vertex drawing
  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempPoints((prev) => prev.slice(0, -1));
  };

  // Clear polygon boundary
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempPoints([]);
    onChangeBoundary("");
  };

  // Finish polygon drawing
  const handleFinish = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tempPoints.length < 3) {
      toast.warning("Please draw at least 3 points to create a valid polygon.");
      return;
    }
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

    onChangeBoundary(JSON.stringify(geoJSONFeature, null, 2));
    setIsDrawingBoundary(false);
    setActiveTool(null);
  };

  return (
    <div className="w-full h-full relative overflow-hidden rounded-xl flex flex-col">
      <div ref={mapContainer} className="flex-1 w-full h-full z-0" />

      {/* Top Helper Floating Bar when active tool is selected */}
      {activeTool && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/90 backdrop-blur-md text-white text-[11px] font-semibold px-4 py-2 rounded-xl shadow-lg border border-slate-700/60 select-none animate-slide-in">
          {activeTool === "boundary" && (
            <div className="flex items-center gap-3">
              <span>Click on map to add boundary vertices.</span>
              <div className="flex gap-1.5 ml-2">
                <button type="button" onClick={handleUndo} disabled={tempPoints.length === 0} className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 px-2.5 py-1 rounded text-[9px] font-black uppercase">Undo</button>
                <button type="button" onClick={handleClear} disabled={tempPoints.length === 0} className="bg-rose-950/70 hover:bg-rose-900 text-rose-300 px-2.5 py-1 rounded text-[9px] font-black uppercase">Clear</button>
                <button type="button" onClick={handleFinish} disabled={tempPoints.length < 3} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-[9px] font-black uppercase">Finish</button>
              </div>
            </div>
          )}
          {activeTool === "dump" && "Click on the map inside boundary to set the Dump Zone center."}
          {activeTool === "entry" && "Click on the map inside boundary to set the Entry point."}
          {activeTool === "exit" && "Click on the map inside boundary to set the Exit point."}
        </div>
      )}
    </div>
  );
}
