"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as turf from "@turf/turf";
import { Route, Undo2, Trash2 } from "lucide-react";

interface Props {
	routeCoords: { lat: number; lng: number }[];
	setRouteCoords: React.Dispatch<React.SetStateAction<{ lat: number; lng: number }[]>>;
	borderColor: string;
	distance: number;
	setDistance: (dist: number) => void;
	geojsonText: string;
	setGeojsonText: (txt: string) => void;
	/** Cap the number of points that can be drawn (e.g. 2 for an A→B route). */
	maxPoints?: number;
	/** Coverage radius (metres) drawn around the first point (A). */
	pointARadius?: number;
	/** Coverage radius (metres) drawn around the last point (B). */
	pointBRadius?: number;
}

export default function RouteBuilderMap({
	routeCoords,
	setRouteCoords,
	borderColor,
	distance,
	setDistance,
	geojsonText,
	setGeojsonText,
	maxPoints,
	pointARadius,
	pointBRadius,
}: Props) {
	const mapContainerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<L.Map | null>(null);
	const routePolylineRef = useRef<L.Polyline | null>(null);
	const routeMarkersRef = useRef<L.Marker[]>([]);
	const vertexMarkersRef = useRef<L.Marker[]>([]);
	const lanePointLayersRef = useRef<L.Layer[]>([]);
	const hasFitBoundsRef = useRef(false);

	const [isDrawing, setIsDrawing] = useState(false);
	const [showConfirmClear, setShowConfirmClear] = useState(false);

	// Overlay checkbox layers
	const [showRoute, setShowRoute] = useState(true);


	// Calculate distance along polyline route
	const calculatePathDistance = (
		startIdx: number,
		startPt: L.LatLng,
		endIdx: number,
		endPt: L.LatLng,
		coords: L.LatLng[]
	): number => {
		if (coords.length < 2) return 0;

		let segmentCoords: L.LatLng[] = [];
		if (startIdx <= endIdx) {
			segmentCoords = [
				startPt,
				...coords.slice(startIdx, endIdx + 1),
				endPt
			];
		} else {
			segmentCoords = [
				startPt,
				...coords.slice(endIdx, startIdx + 1).reverse(),
				endPt
			];
		}

		// Deduplicate consecutive coordinates
		const cleanCoords: L.LatLng[] = [];
		segmentCoords.forEach((pt) => {
			if (cleanCoords.length === 0) {
				cleanCoords.push(pt);
			} else {
				const prev = cleanCoords[cleanCoords.length - 1];
				if (prev.lat !== pt.lat || prev.lng !== pt.lng) {
					cleanCoords.push(pt);
				}
			}
		});

		let totalMeters = 0;
		for (let i = 0; i < cleanCoords.length - 1; i++) {
			totalMeters += cleanCoords[i].distanceTo(cleanCoords[i + 1]);
		}
		return parseFloat(totalMeters.toFixed(2));
	};

	// Calculate overall route polyline distance
	const calculateTotalRouteDistance = (coords: L.LatLng[]): number => {
		let total = 0;
		for (let i = 0; i < coords.length - 1; i++) {
			total += coords[i].distanceTo(coords[i + 1]);
		}
		return parseFloat((total / 1000).toFixed(2)); // in km
	};

	// Initialize Leaflet Map once on mount
	useEffect(() => {
		if (!mapContainerRef.current || mapRef.current) return;

		const m = L.map(mapContainerRef.current, {
			center: [26.9124, 75.7873], // Jaipur
			zoom: 13,
			zoomControl: true,
			preferCanvas: true,
		});

		L.tileLayer("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
			attribution: '© Google Maps',
			maxZoom: 20,
		}).addTo(m);

		mapRef.current = m;

		return () => {
			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, []);



	// Global hook to delete a route point from vertex marker popups
	useEffect(() => {
		(window as any).deletePoint = (idx: number) => {
			setRouteCoords((prev) => {
				const updated = prev.filter((_, i) => i !== idx);

				const leafletUpdated = updated.map((pt) => L.latLng(pt.lat, pt.lng));
				const newDist = calculateTotalRouteDistance(leafletUpdated);
				setDistance(newDist);

				const geojsonObj = {
					type: "Feature",
					geometry: {
						type: "LineString",
						coordinates: updated.map((pt) => [pt.lng, pt.lat]),
					},
					properties: {},
				};
				setGeojsonText(JSON.stringify(geojsonObj, null, 2));

				return updated;
			});
			mapRef.current?.closePopup();
		};
		return () => {
			delete (window as any).deletePoint;
		};
	}, [setRouteCoords, setDistance, setGeojsonText]);

	// Click handler setup
	useEffect(() => {
		const m = mapRef.current;
		if (!m) return;

		const onClick = (e: L.LeafletMouseEvent) => {
			// Prevent adding coordinate if clicked on a vertex handle, marker, or popup
			const target = e.originalEvent?.target as HTMLElement;
			if (target && (target.closest(".route-vertex-handle") || target.closest(".leaflet-popup") || target.closest(".leaflet-marker-icon"))) {
				return;
			}

			if (!isDrawing) return;

			const pt = { lat: e.latlng.lat, lng: e.latlng.lng };
			setRouteCoords((prev) => {
				// Enforce a maximum number of points (e.g. A→B = 2)
				if (typeof maxPoints === "number" && prev.length >= maxPoints) {
					return prev;
				}
				// Guard against a double-fired click adding two points at the same spot
				const last = prev[prev.length - 1];
				if (last && last.lat === pt.lat && last.lng === pt.lng) {
					return prev;
				}
				const updated = [...prev, pt];
				const leafletUpdated = updated.map((p) => L.latLng(p.lat, p.lng));
				setDistance(calculateTotalRouteDistance(leafletUpdated));

				const geojsonObj = {
					type: "Feature",
					geometry: {
						type: "LineString",
						coordinates: updated.map((p) => [p.lng, p.lat]),
					},
					properties: {},
				};
				setGeojsonText(JSON.stringify(geojsonObj, null, 2));
				return updated;
			});
		};

		m.on("click", onClick);
		return () => {
			m.off("click", onClick);
		};
	}, [isDrawing, maxPoints]);

	// Auto-stop drawing once the point cap is reached
	useEffect(() => {
		if (typeof maxPoints === "number" && isDrawing && routeCoords.length >= maxPoints) {
			setIsDrawing(false);
		}
	}, [routeCoords, isDrawing, maxPoints]);

	// Render route polyline and start/end markers
	useEffect(() => {
		const m = mapRef.current;
		if (!m) return;

		// Clear previous route polyline
		if (routePolylineRef.current) {
			routePolylineRef.current.remove();
			routePolylineRef.current = null;
		}

		// Clear previous route markers
		routeMarkersRef.current.forEach((mk) => mk.remove());
		routeMarkersRef.current = [];

		if (routeCoords.length === 0) {
			hasFitBoundsRef.current = false;
			return;
		}

		if (!showRoute) return;

		// Fit bounds ONLY once when the route is first loaded or drawn (length goes 0 -> >1)
		if (routeCoords.length > 1 && !hasFitBoundsRef.current) {
			const bounds = L.latLngBounds(routeCoords);
			m.fitBounds(bounds, { padding: [50, 50] });
			hasFitBoundsRef.current = true;
		} else if (routeCoords.length === 1 && !hasFitBoundsRef.current) {
			m.panTo(routeCoords[0]);
		}

		// Draw route polyline
		const poly = L.polyline(routeCoords, {
			color: borderColor || "#fba339",
			weight: 5,
			opacity: 0.9,
		}).addTo(m);
		routePolylineRef.current = poly;

		// Draw start and end indicators
		if (routeCoords.length > 0) {
			const startIcon = L.divIcon({
				className: "custom-start-marker",
				html: `<div style="width: 14px; height: 14px; background: #22c55e; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
				iconSize: [14, 14],
				iconAnchor: [7, 7],
			});
			const startMk = L.marker(routeCoords[0], { icon: startIcon }).addTo(m);
			routeMarkersRef.current.push(startMk);

			if (routeCoords.length > 1) {
				const endIcon = L.divIcon({
					className: "custom-end-marker",
					html: `<div style="width: 14px; height: 14px; background: #ef4444; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
					iconSize: [14, 14],
					iconAnchor: [7, 7],
				});
				const endMk = L.marker(routeCoords[routeCoords.length - 1], { icon: endIcon }).addTo(m);
				routeMarkersRef.current.push(endMk);
			}
		}

		return () => {
			if (routePolylineRef.current) {
				routePolylineRef.current.remove();
				routePolylineRef.current = null;
			}
			routeMarkersRef.current.forEach((mk) => mk.remove());
			routeMarkersRef.current = [];
		};
	}, [routeCoords, borderColor, showRoute]);

	// Render bendable route vertex handle markers (white draggable handle circles)
	useEffect(() => {
		const m = mapRef.current;
		if (!m) return;

		// Clear previous vertex markers
		vertexMarkersRef.current.forEach((mk) => mk.remove());
		vertexMarkersRef.current = [];

		// Show vertex handles always so lane points are visible, but only make them draggable when drawing
		if (routeCoords.length === 0) return;

		routeCoords.forEach((coord, idx) => {
			const vertexIcon = L.divIcon({
				className: "route-vertex-handle",
				html: `
					<div style="
						width: 14px;
						height: 14px;
						background: white;
						border: 2px solid #fba339;
						border-radius: 50%;
						box-shadow: 0 0 4px rgba(0,0,0,0.5);
						cursor: ${isDrawing ? 'grab' : 'pointer'};
						display: flex;
						align-items: center;
						justify-content: center;
						font-family: 'Inter', sans-serif;
						font-size: 8px;
						font-weight: 900;
						color: #1e293b;
						line-height: 1;
					">
						${idx + 1}
					</div>
				`,
				iconSize: [14, 14],
				iconAnchor: [7, 7],
			});

			const marker = L.marker([coord.lat, coord.lng], {
				icon: vertexIcon,
				draggable: isDrawing,
			})
			.bindTooltip(isDrawing ? `Drag to bend. Click to delete Point #${idx + 1}` : `Point #${idx + 1}`, {
				direction: "top",
				permanent: false,
			})
			.bindPopup(`
				<div style="font-family: inherit; font-size: 11px; text-align: center; min-width: 90px; padding: 2px;">
					<strong style="display: block; margin-bottom: 6px; color: #0f172a;">Path Point #${idx + 1}</strong>
					${isDrawing ? `<button 
						type="button" 
						onclick="event.stopPropagation(); event.preventDefault(); window.deletePoint(${idx})" 
						style="padding: 4px 8px; background: #ef4444; color: white; border: none; border-radius: 4px; font-size: 10px; font-weight: 600; cursor: pointer; width: 100%; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px;"
						onmouseover="this.style.background='#dc2626'"
						onmouseout="this.style.background='#ef4444'"
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="3 6 5 6 21 6"></polyline>
							<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
							<line x1="10" y1="11" x2="10" y2="17"></line>
							<line x1="14" y1="11" x2="14" y2="17"></line>
						</svg>
						Delete Point
					</button>` : ''}
				</div>
			`, { closeButton: false })
			.addTo(m);

			// Real-time stretching visual helper
			marker.on("drag", (e: L.LeafletEvent) => {
				const dragMarker = e.target as L.Marker;
				const newLatLng = dragMarker.getLatLng();
				if (routePolylineRef.current) {
					const currentLatLngs = routePolylineRef.current.getLatLngs() as L.LatLng[];
					currentLatLngs[idx] = newLatLng;
					routePolylineRef.current.setLatLngs(currentLatLngs);
				}
			});

			// Update state on drag release
			marker.on("dragend", (e: L.LeafletEvent) => {
				const dragMarker = e.target as L.Marker;
				const newLatLng = dragMarker.getLatLng();

				setRouteCoords((prev) => {
					const updated = [...prev];
					updated[idx] = { lat: newLatLng.lat, lng: newLatLng.lng };

					const leafletUpdated = updated.map((pt) => L.latLng(pt.lat, pt.lng));
					const newDist = calculateTotalRouteDistance(leafletUpdated);
					setDistance(newDist);

					const geojsonObj = {
						type: "Feature",
						geometry: {
							type: "LineString",
							coordinates: updated.map((pt) => [pt.lng, pt.lat]),
						},
						properties: {},
					};
					setGeojsonText(JSON.stringify(geojsonObj, null, 2));

					return updated;
				});
			});

			vertexMarkersRef.current.push(marker);
		});

		return () => {
			vertexMarkersRef.current.forEach((mk) => mk.remove());
			vertexMarkersRef.current = [];
		};
	}, [routeCoords, isDrawing]);

	// Render lane points (at actual vertex coordinates) with 10m radius circles
	useEffect(() => {
		const m = mapRef.current;
		if (!m) return;

		// Clear previous lane point layers
		lanePointLayersRef.current.forEach((layer) => layer.remove());
		lanePointLayersRef.current = [];

		if (routeCoords.length === 0) return;
		if (!showRoute) return;

		const layers: L.Layer[] = [];

		// A→B mode: draw a coverage circle sized to each point's configured radius.
		const abMode = typeof pointARadius === "number" || typeof pointBRadius === "number";
		if (abMode) {
			const drawCoverage = (
				coord: { lat: number; lng: number },
				radiusM: number,
				color: string,
				label: string
			) => {
				const circle = L.circle([coord.lat, coord.lng], {
					radius: radiusM > 0 ? radiusM : 1,
					color,
					weight: 1.5,
					fillColor: color,
					fillOpacity: 0.15,
					interactive: false,
				}).addTo(m);
				layers.push(circle);
				const dot = L.circleMarker([coord.lat, coord.lng], {
					radius: 3,
					color: "#ffffff",
					weight: 1,
					fillColor: color,
					fillOpacity: 1,
				})
					.bindTooltip(`${label} • ${radiusM}m`, { direction: "top", permanent: false })
					.addTo(m);
				layers.push(dot);
			};

			// Point A (first)
			drawCoverage(routeCoords[0], typeof pointARadius === "number" ? pointARadius : 20, "#22c55e", "Point A");
			// Point B (last) — only if a distinct second point exists
			if (routeCoords.length > 1) {
				const bIdx = routeCoords.length - 1;
				drawCoverage(routeCoords[bIdx], typeof pointBRadius === "number" ? pointBRadius : 20, "#ef4444", "Point B");
			}

			lanePointLayersRef.current = layers;
			return () => {
				layers.forEach((layer) => layer.remove());
			};
		}

		for (let i = 0; i < routeCoords.length; i++) {
			const coord = routeCoords[i];

			// 1. Draw 10m coverage circle
			const zoneCircle = L.circle([coord.lat, coord.lng], {
				radius: 10,
				color: "#10b981",
				weight: 1.2,
				fillColor: "#10b981",
				fillOpacity: 0.12,
				dashArray: "3, 3",
				interactive: false,
			}).addTo(m);
			layers.push(zoneCircle);

			// 2. Draw small center dot
			const centerDot = L.circleMarker([coord.lat, coord.lng], {
				radius: 2.0,
				color: "#ffffff",
				weight: 0.8,
				fillColor: "#10b981",
				fillOpacity: 1,
				opacity: 1,
			})
			.bindTooltip(`Lane Point #${i + 1}`, {
				direction: "top",
				permanent: false,
			})
			.addTo(m);
			layers.push(centerDot);
		}

		lanePointLayersRef.current = layers;

		return () => {
			layers.forEach((layer) => layer.remove());
		};
	}, [routeCoords, showRoute, pointARadius, pointBRadius]);

	// Parse custom input JSON coordinates
	useEffect(() => {
		if (!geojsonText) {
			if (routeCoords.length > 0) {
				setRouteCoords([]);
				setDistance(0);
			}
			return;
		}
		try {
			const parsed = JSON.parse(geojsonText);
			let pts: { lat: number; lng: number }[] = [];

			if (parsed.type === "Feature" && parsed.geometry && parsed.geometry.type === "LineString") {
				pts = parsed.geometry.coordinates.map((c: any) => ({ lat: c[1], lng: c[0] }));
			} else if (parsed.type === "LineString") {
				pts = parsed.coordinates.map((c: any) => ({ lat: c[1], lng: c[0] }));
			} else if (Array.isArray(parsed)) {
				pts = parsed.map((c: any) => ({ lat: c[1] || c.lat, lng: c[0] || c.lng }));
			}

			if (pts.length > 0 && JSON.stringify(pts) !== JSON.stringify(routeCoords)) {
				setRouteCoords(pts);
				const leafletPts = pts.map((pt) => L.latLng(pt.lat, pt.lng));
				const newDist = calculateTotalRouteDistance(leafletPts);
				setDistance(newDist);
			}
		} catch (e) {
			// Fail silently during typing
		}
	}, [geojsonText]);


	return (
		<div className="relative w-full h-full rounded-xl overflow-hidden border border-theme-border bg-black/10">
			<div ref={mapContainerRef} className="w-full h-full min-h-[400px] z-10" />

			{/* Left Top Action Panel */}
			<div className="absolute top-3 left-[60px] z-50 flex flex-col gap-2">
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						setIsDrawing(!isDrawing);
					}}
					className={`p-2 rounded-lg text-theme-text font-medium shadow-lg flex items-center gap-1.5 transition-colors text-xs whitespace-nowrap ${
						isDrawing ? "bg-theme-accent border border-indigo-400" : "bg-theme-surface/80 hover:bg-slate-100 border border-theme-border"
					}`}
					title={isDrawing ? "Click on map to draw. Double-click to stop" : "Start drawing route polyline"}
				>
					<Route size={14} className="text-emerald-600" />
					<span>{isDrawing ? "Stop Drawing" : "Draw Route"}</span>
				</button>

				{routeCoords.length > 0 && isDrawing && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							setRouteCoords((prev) => {
								const updated = prev.slice(0, -1);
								const leafletUpdated = updated.map((pt) => L.latLng(pt.lat, pt.lng));
								const newDist = calculateTotalRouteDistance(leafletUpdated);
								setDistance(newDist);
								const geojsonObj = {
									type: "Feature",
									geometry: {
										type: "LineString",
										coordinates: updated.map((pt) => [pt.lng, pt.lat]),
									},
									properties: {},
								};
								setGeojsonText(JSON.stringify(geojsonObj, null, 2));
								return updated;
							});
						}}
						className="p-2 rounded-lg text-theme-text font-medium shadow-lg flex items-center gap-1.5 transition-colors text-xs whitespace-nowrap bg-theme-surface/90 hover:bg-slate-100 border border-theme-border"
						title="Remove the last placed route point (Undo)"
					>
						<Undo2 size={14} />
						<span>Undo Point</span>
					</button>
				)}

				{routeCoords.length > 0 && (
					<div className="flex gap-1.5 items-center">
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								e.preventDefault();
								if (!showConfirmClear) {
									setShowConfirmClear(true);
								} else {
									setRouteCoords([]);
									setDistance(0);
									setGeojsonText("");
									setIsDrawing(false);
									setShowConfirmClear(false);
								}
							}}
							className={`p-2 rounded-lg text-white font-medium shadow-lg flex items-center gap-1.5 transition-colors text-xs whitespace-nowrap border ${
								showConfirmClear 
									? "bg-red-400 hover:bg-red-600 border-red-100 animate-pulse" 
									: "bg-red-700 hover:bg-red-600 border-red-500/30 hover:border-red-500/50"
							}`}
							title="Delete all coordinate points and reset the entire route"
						>
							<Trash2 size={14} />
							<span>{showConfirmClear ? "Confirm Clear?" : "Clear Route"}</span>
						</button>

						{showConfirmClear && (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									e.preventDefault();
									setShowConfirmClear(false);
								}}
								className="p-2 rounded-lg text-theme-text font-medium shadow-lg flex items-center transition-colors text-xs bg-theme-surface/90 hover:bg-slate-100 border border-theme-border"
								title="Cancel clearing"
							>
								Cancel
							</button>
						)}
					</div>
				)}
			</div>

			{/* Right Checkbox Layer Overlay */}
			<div className="absolute top-3 right-3 z-50 bg-theme-surface/80 border border-theme-border p-3 rounded-lg text-xs text-theme-text backdrop-blur-md shadow-xl flex flex-col gap-2 min-w-[140px]">
				<div className="font-semibold text-theme-text-dim mb-1 tracking-wider uppercase">LAYERS</div>
				<label className="flex items-center gap-2 cursor-pointer hover:text-theme-text">
					<input
						type="checkbox"
						checked={showRoute}
						onChange={(e) => setShowRoute(e.target.checked)}
						className="rounded text-indigo-500 bg-theme-surface border-theme-border focus:ring-0"
					/>
					<span>Route</span>
				</label>
			</div>

			{/* Custom Instruction Bar at bottom */}
			{isDrawing && (
				<div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 bg-theme-surface/90 border border-theme-border px-4 py-2 rounded-full text-xs text-theme-text font-medium shadow-2xl backdrop-blur-md flex items-center gap-3">
					<div className="w-2 h-2 rounded-full bg-theme-surface-hover0 animate-ping" />
					<span>
						DRAW MODE: Click on the map to add route coordinates.
					</span>
					<button
						type="button"
						onClick={() => {
							setIsDrawing(false);
						}}
						className="px-2 py-0.5 bg-theme-surface/10 hover:bg-theme-surface/20 rounded font-bold transition-colors"
					>
						Done
					</button>
				</div>
			)}

			{/* Full Screen / Large Lane Modal Prompt */}
	
		</div>
	);
}
