"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Lane {
	laneOrder: number;
	totalDistance: number;
	noOfHouseholds: number;
	noOfCommercials: number;
	doubleLane: string; // "Yes" | "No"
	startLat: number;
	startLng: number;
	endLat: number;
	endLng: number;
}

interface Props {
	routeCoords: { lat: number; lng: number }[];
	setRouteCoords: React.Dispatch<React.SetStateAction<{ lat: number; lng: number }[]>>;
	borderColor: string;
	lanes: Lane[];
	setLanes: (lanes: Lane[]) => void;
	distance: number;
	setDistance: (dist: number) => void;
	geojsonText: string;
	setGeojsonText: (txt: string) => void;
}

export default function RouteBuilderMap({
	routeCoords,
	setRouteCoords,
	borderColor,
	lanes,
	setLanes,
	distance,
	setDistance,
	geojsonText,
	setGeojsonText,
}: Props) {
	const mapContainerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<L.Map | null>(null);
	const routePolylineRef = useRef<L.Polyline | null>(null);
	const routeMarkersRef = useRef<L.Marker[]>([]);
	const lanePolylinesRef = useRef<L.Polyline[]>([]);
	const laneMarkersRef = useRef<L.Marker[]>([]);
	const currentPlacingMarkersRef = useRef<L.Marker[]>([]);
	const vertexMarkersRef = useRef<L.Marker[]>([]);
	const hasFitBoundsRef = useRef(false);
	const lanesRef = useRef<Lane[]>(lanes);
	useEffect(() => {
		lanesRef.current = lanes;
	}, [lanes]);

	const [isDrawing, setIsDrawing] = useState(false);
	const [isEditingLanes, setIsEditingLanes] = useState(false);
	const [activeOverlay, setActiveOverlay] = useState(false);
	const [showConfirmClear, setShowConfirmClear] = useState(false);

	// Overlay checkbox layers
	const [showRoute, setShowRoute] = useState(true);
	const [showStartPoint, setShowStartPoint] = useState(true);
	const [showEndPoint, setShowEndPoint] = useState(true);
	const [showCollectionPoint, setShowCollectionPoint] = useState(true);

	// Checkpoint placement state
	const [laneStartPoint, setLaneStartPoint] = useState<{ lat: number; lng: number; index: number } | null>(null);
	const [laneEndPoint, setLaneEndPoint] = useState<{ lat: number; lng: number; index: number } | null>(null);
	const [showLaneForm, setShowLaneForm] = useState(false);
	const [laneForm, setLaneForm] = useState({
		laneOrder: 1,
		totalDistance: 0,
		noOfHouseholds: 0,
		noOfCommercials: 0,
		doubleLane: "No",
	});

	// Helper to create beautiful map pin drop point icons with numbers
	const createPinIcon = (type: "start" | "end", number: string | number) => {
		const color = type === "start" ? "#22c55e" : "#ef4444";
		const strokeColor = type === "start" ? "#15803d" : "#b91c1c";
		return L.divIcon({
			className: `lane-${type}-flag-pin`,
			html: `
				<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; width: 28px; height: 36px;">
					<svg width="28" height="36" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 3px 5px rgba(0,0,0,0.5));">
						<path d="M12 0C5.37 0 0 5.37 0 12c0 9.3 12 18 12 18s12-8.7 12-18c0-6.63-5.37-12-12-12z" fill="${color}" stroke="${strokeColor}" stroke-width="1.5"/>
						<circle cx="12" cy="12" r="7.5" fill="white"/>
						<text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="8.5" fill="${strokeColor}">${number}</text>
					</svg>
				</div>
			`,
			iconSize: [28, 36],
			iconAnchor: [14, 36],
		});
	};

	// Standard projection/snapping helper
	const snapToRoute = (latlng: L.LatLng, coords: L.LatLng[]): { snapped: L.LatLng; index: number } => {
		if (coords.length === 0) return { snapped: latlng, index: -1 };
		if (coords.length === 1) return { snapped: coords[0], index: 0 };

		let minDistance = Infinity;
		let bestPoint = coords[0];
		let bestIndex = 0;

		for (let i = 0; i < coords.length - 1; i++) {
			const p1 = coords[i];
			const p2 = coords[i + 1];

			const x = latlng.lng;
			const y = latlng.lat;
			const x1 = p1.lng;
			const y1 = p1.lat;
			const x2 = p2.lng;
			const y2 = p2.lat;

			const dx = x2 - x1;
			const dy = y2 - y1;

			let t = 0;
			if (dx !== 0 || dy !== 0) {
				t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
				t = Math.max(0, Math.min(1, t)); // Clamp to segment
			}

			const snapped = L.latLng(y1 + t * dy, x1 + t * dx);
			const d = latlng.distanceTo(snapped);

			if (d < minDistance) {
				minDistance = d;
				bestPoint = snapped;
				bestIndex = i;
			}
		}

		return { snapped: bestPoint, index: bestIndex };
	};

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

	// Global hook to delete a lane from Leaflet popups
	useEffect(() => {
		(window as any).deleteLane = (laneOrder: number) => {
			const updated = lanesRef.current.filter((l) => l.laneOrder !== laneOrder);
			setLanes(updated);
		};
		return () => {
			delete (window as any).deleteLane;
		};
	}, [setLanes]);

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

			if (isDrawing) {
				setRouteCoords((prev) => {
					const updated = [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }];
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
				return;
			}

			if (activeOverlay) {
				if (routeCoords.length < 2) {
					alert("Please draw the route path first before setting lane points.");
					return;
				}

				const leafletRoute = routeCoords.map((pt) => L.latLng(pt.lat, pt.lng));
				const snapResult = snapToRoute(e.latlng, leafletRoute);

				// Snap within 100 meters (magnetic behavior)
				const snapDist = e.latlng.distanceTo(snapResult.snapped);
				const isMagnetic = snapDist <= 100;

				const targetPt = isMagnetic ? snapResult.snapped : e.latlng;
				const targetIdx = snapResult.index;

				if (!laneStartPoint) {
					setLaneStartPoint({
						lat: targetPt.lat,
						lng: targetPt.lng,
						index: targetIdx,
					});
				} else if (!laneEndPoint) {
					const dist = calculatePathDistance(
						laneStartPoint.index,
						L.latLng(laneStartPoint.lat, laneStartPoint.lng),
						targetIdx,
						L.latLng(targetPt.lat, targetPt.lng),
						leafletRoute
					);

					setLaneEndPoint({
						lat: targetPt.lat,
						lng: targetPt.lng,
						index: targetIdx,
					});

					setLaneForm((prev) => ({
						...prev,
						laneOrder: lanes.length + 1,
						totalDistance: dist,
					}));
					setShowLaneForm(true);
				}
			}
		};

		m.on("click", onClick);
		return () => {
			m.off("click", onClick);
		};
	}, [isDrawing, activeOverlay, routeCoords, laneStartPoint, laneEndPoint, lanes.length]);

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

		// Hide vertex handles unless we are actively drawing/editing the route
		if (!isDrawing || routeCoords.length === 0) return;

		routeCoords.forEach((coord, idx) => {
			const vertexIcon = L.divIcon({
				className: "route-vertex-handle",
				html: `<div style="width: 12px; height: 12px; background: white; border: 2.5px solid #fba339; border-radius: 50%; box-shadow: 0 0 5px rgba(0,0,0,0.6); cursor: grab;"></div>`,
				iconSize: [12, 12],
				iconAnchor: [6, 6],
			});

			const marker = L.marker([coord.lat, coord.lng], {
				icon: vertexIcon,
				draggable: true,
			})
			.bindTooltip(`Drag to bend. Click to delete Point #${idx + 1}`, {
				direction: "top",
				permanent: false,
			})
			.bindPopup(`
				<div style="font-family: inherit; font-size: 11px; text-align: center; min-width: 90px; padding: 2px;">
					<strong style="display: block; margin-bottom: 6px; color: #0f172a;">Point #${idx + 1}</strong>
					<button 
						type="button" 
						onclick="event.stopPropagation(); event.preventDefault(); window.deletePoint(${idx})" 
						style="padding: 4px 8px; background: #ef4444; color: white; border: none; border-radius: 4px; font-size: 10px; font-weight: 600; cursor: pointer; width: 100%; text-align: center;"
						onmouseover="this.style.background='#dc2626'"
						onmouseout="this.style.background='#ef4444'"
					>
						🗑️ Delete Point
					</button>
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

	// Render snapping preview dot when mouse hovers over route in lane placement mode
	useEffect(() => {
		const m = mapRef.current;
		if (!m || !activeOverlay || routeCoords.length < 2) return;

		const previewIcon = L.divIcon({
			className: "snapping-preview-dot",
			html: `<div style="width: 12px; height: 12px; background: #6366f1; border: 2.5px solid white; border-radius: 50%; box-shadow: 0 0 6px #6366f1; animation: pulse 1.2s infinite;"></div>`,
			iconSize: [12, 12],
			iconAnchor: [6, 6],
		});

		let previewMarker: L.Marker | null = null;

		const onMouseMove = (e: L.LeafletMouseEvent) => {
			const leafletRoute = routeCoords.map((pt) => L.latLng(pt.lat, pt.lng));
			const snapResult = snapToRoute(e.latlng, leafletRoute);

			if (!previewMarker) {
				previewMarker = L.marker(snapResult.snapped, { icon: previewIcon }).addTo(m);
			} else {
				previewMarker.setLatLng(snapResult.snapped);
			}
		};

		m.on("mousemove", onMouseMove);

		return () => {
			m.off("mousemove", onMouseMove);
			if (previewMarker) {
				previewMarker.remove();
			}
		};
	}, [activeOverlay, routeCoords]);

	// Render lane highlights and start/end SVG pin markers
	useEffect(() => {
		const m = mapRef.current;
		if (!m) return;

		// Clear previous lane polylines
		lanePolylinesRef.current.forEach((pl) => pl.remove());
		lanePolylinesRef.current = [];

		// Clear previous lane markers
		laneMarkersRef.current.forEach((mk) => mk.remove());
		laneMarkersRef.current = [];

		if (routeCoords.length < 2) return;

		// Render lane segments
		lanes.forEach((lane) => {
			const leafletRoute = routeCoords.map((c) => L.latLng(c.lat, c.lng));
			const startIdx = snapToRoute(L.latLng(lane.startLat, lane.startLng), leafletRoute).index;
			const endIdx = snapToRoute(L.latLng(lane.endLat, lane.endLng), leafletRoute).index;

			if (startIdx >= 0 && endIdx >= 0) {
				let segmentCoords: L.LatLng[] = [];
				const startPt = L.latLng(lane.startLat, lane.startLng);
				const endPt = L.latLng(lane.endLat, lane.endLng);

				if (startIdx <= endIdx) {
					segmentCoords = [
						startPt,
						...routeCoords.slice(startIdx, endIdx + 1).map((c) => L.latLng(c.lat, c.lng)),
						endPt,
					];
				} else {
					segmentCoords = [
						startPt,
						...routeCoords.slice(endIdx, startIdx + 1).reverse().map((c) => L.latLng(c.lat, c.lng)),
						endPt,
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

				// Draw lane segment highlighted
				const lanePoly = L.polyline(cleanCoords, {
					color: "#3b82f6", // Blue for lanes
					weight: 7,
					opacity: 0.8,
				}).addTo(m);

				lanePoly.bindTooltip(`Lane ${lane.laneOrder}: ${lane.totalDistance}m`, {
					permanent: false,
					direction: "top",
				});

				lanePolylinesRef.current.push(lanePoly);
			}

			// Draw Green start pin drop marker
			if (showStartPoint) {
				const popupContentStart = `
					<div style="font-family: inherit; font-size: 12px; color: #1e293b; min-width: 140px;">
						<strong style="color: #0f172a; display: block; margin-bottom: 4px;">Lane Set ${lane.laneOrder} - Start</strong>
						<span style="color: #64748b;">Households: ${lane.noOfHouseholds}</span>
						<button 
							type="button"
							id="delete-lane-start-${lane.laneOrder}"
							onclick="event.stopPropagation(); event.preventDefault(); const btn = document.getElementById('delete-lane-start-${lane.laneOrder}'); if(btn.innerText.includes('Delete')) { btn.innerText = '⚠️ Confirm?'; btn.style.background = '#dc2626'; } else { window.deleteLane(${lane.laneOrder}); }" 
							style="margin-top: 8px; width: 100%; padding: 4px 8px; background: #ef4444; color: white; border: none; border-radius: 6px; font-size: 10px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: background 0.2s;"
							onmouseover="if(this.innerText.includes('Delete')) this.style.background='#dc2626'"
							onmouseout="if(this.innerText.includes('Delete')) this.style.background='#ef4444'"
						>
							🗑️ Delete Lane
						</button>
					</div>
				`;
				const startMk = L.marker([lane.startLat, lane.startLng], { 
					icon: createPinIcon("start", lane.laneOrder) 
				})
				.bindPopup(popupContentStart)
				.addTo(m);
				laneMarkersRef.current.push(startMk);
			}

			// Draw Red end pin drop marker
			if (showEndPoint) {
				const popupContentEnd = `
					<div style="font-family: inherit; font-size: 12px; color: #1e293b; min-width: 140px;">
						<strong style="color: #0f172a; display: block; margin-bottom: 4px;">Lane Set ${lane.laneOrder} - End</strong>
						<span style="color: #64748b;">Commercials: ${lane.noOfCommercials}</span>
						<button 
							type="button"
							id="delete-lane-end-${lane.laneOrder}"
							onclick="event.stopPropagation(); event.preventDefault(); const btn = document.getElementById('delete-lane-end-${lane.laneOrder}'); if(btn.innerText.includes('Delete')) { btn.innerText = '⚠️ Confirm?'; btn.style.background = '#dc2626'; } else { window.deleteLane(${lane.laneOrder}); }" 
							style="margin-top: 8px; width: 100%; padding: 4px 8px; background: #ef4444; color: white; border: none; border-radius: 6px; font-size: 10px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: background 0.2s;"
							onmouseover="if(this.innerText.includes('Delete')) this.style.background='#dc2626'"
							onmouseout="if(this.innerText.includes('Delete')) this.style.background='#ef4444'"
						>
							🗑️ Delete Lane
						</button>
					</div>
				`;
				const endMk = L.marker([lane.endLat, lane.endLng], { 
					icon: createPinIcon("end", lane.laneOrder) 
				})
				.bindPopup(popupContentEnd)
				.addTo(m);
				laneMarkersRef.current.push(endMk);
			}
		});

		return () => {
			lanePolylinesRef.current.forEach((pl) => pl.remove());
			lanePolylinesRef.current = [];
			laneMarkersRef.current.forEach((mk) => mk.remove());
			laneMarkersRef.current = [];
		};
	}, [lanes, showStartPoint, showEndPoint, routeCoords]);

	// Render current active placing checkpoint markers
	useEffect(() => {
		const m = mapRef.current;
		if (!m) return;

		// Clear previous placing markers
		currentPlacingMarkersRef.current.forEach((mk) => mk.remove());
		currentPlacingMarkersRef.current = [];

		if (laneStartPoint) {
			const currentGreenMk = L.marker([laneStartPoint.lat, laneStartPoint.lng], { 
				icon: createPinIcon("start", lanes.length + 1) 
			}).addTo(m);
			currentPlacingMarkersRef.current.push(currentGreenMk);
		}

		if (laneEndPoint) {
			const currentRedMk = L.marker([laneEndPoint.lat, laneEndPoint.lng], { 
				icon: createPinIcon("end", lanes.length + 1) 
			}).addTo(m);
			currentPlacingMarkersRef.current.push(currentRedMk);
		}

		return () => {
			currentPlacingMarkersRef.current.forEach((mk) => mk.remove());
			currentPlacingMarkersRef.current = [];
		};
	}, [laneStartPoint, laneEndPoint, lanes.length]);

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

	const saveLaneInfo = () => {
		if (!laneStartPoint || !laneEndPoint) return;

		const newLane: Lane = {
			laneOrder: Number(laneForm.laneOrder),
			totalDistance: parseFloat(Number(laneForm.totalDistance).toFixed(2)),
			noOfHouseholds: Number(laneForm.noOfHouseholds),
			noOfCommercials: Number(laneForm.noOfCommercials),
			doubleLane: laneForm.doubleLane,
			startLat: laneStartPoint.lat,
			startLng: laneStartPoint.lng,
			endLat: laneEndPoint.lat,
			endLng: laneEndPoint.lng,
		};

		setLanes([...lanes, newLane]);

		// Clear states
		setLaneStartPoint(null);
		setLaneEndPoint(null);
		setShowLaneForm(false);
	};

	const cancelLaneInfo = () => {
		setLaneStartPoint(null);
		setLaneEndPoint(null);
		setShowLaneForm(false);
	};

	const resetLanePoints = () => {
		setLaneStartPoint(null);
		setLaneEndPoint(null);
		setShowLaneForm(false);
		setLanes([]);
	};

	return (
		<div className="relative w-full h-full rounded-xl overflow-hidden border border-white/[.05] bg-black/10">
			<div ref={mapContainerRef} className="w-full h-full min-h-[400px] z-10" />

			{/* Left Top Action Panel */}
			<div className="absolute top-3 left-12 z-50 flex flex-col gap-2">
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						setIsDrawing(!isDrawing);
						setActiveOverlay(false);
					}}
					className={`p-2 rounded-lg text-white font-medium shadow-lg flex items-center gap-1.5 transition-colors text-xs ${
						isDrawing ? "bg-indigo-600 border border-indigo-400" : "bg-slate-900/80 hover:bg-slate-800 border border-white/[.08]"
					}`}
					title={isDrawing ? "Click on map to draw. Double-click to stop" : "Start drawing route polyline"}
				>
					<span>🛣️</span>
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
						className="p-2 rounded-lg text-white font-medium shadow-lg flex items-center gap-1.5 transition-colors text-xs bg-slate-900/90 hover:bg-slate-800 border border-white/[.08]"
						title="Remove the last placed route point (Undo)"
					>
						<span>↩️</span>
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
									setLanes([]);
									setLaneStartPoint(null);
									setLaneEndPoint(null);
									setShowLaneForm(false);
									setIsDrawing(false);
									setActiveOverlay(false);
									setShowConfirmClear(false);
								}
							}}
							className={`p-2 rounded-lg text-white font-medium shadow-lg flex items-center gap-1.5 transition-colors text-xs border ${
								showConfirmClear 
									? "bg-red-600 hover:bg-red-700 border-red-500 animate-pulse" 
									: "bg-red-950/90 hover:bg-red-900/90 border-red-500/30 hover:border-red-500/50"
							}`}
							title="Delete all coordinate points and reset the entire route"
						>
							<span>🧹</span>
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
								className="p-2 rounded-lg text-white font-medium shadow-lg flex items-center transition-colors text-xs bg-slate-900/90 hover:bg-slate-800 border border-white/[.08]"
								title="Cancel clearing"
							>
								Cancel
							</button>
						)}
					</div>
				)}

				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						if (routeCoords.length < 2) {
							alert("Please draw the route path first before configuring lanes.");
							return;
						}
						setActiveOverlay(!activeOverlay);
						setIsDrawing(false);
					}}
					disabled={routeCoords.length < 2}
					className={`p-2 rounded-lg text-white font-medium shadow-lg flex items-center gap-1.5 transition-colors text-xs ${
						activeOverlay ? "bg-blue-600 border border-blue-400" : "bg-slate-900/80 hover:bg-slate-800 border border-white/[.08]"
					} ${routeCoords.length < 2 ? "opacity-40 cursor-not-allowed" : ""}`}
					title={routeCoords.length < 2 ? "Draw route path first to enable lane checkpoints" : "Configure lane checkpoints snapped to route line"}
				>
					<span>🗺️</span>
					<span>{activeOverlay ? "Active: Route by Lane" : "Route by Lane"}</span>
				</button>
			</div>

			{/* Right Checkbox Layer Overlay */}
			<div className="absolute top-3 right-3 z-50 bg-slate-950/80 border border-white/[.08] p-3 rounded-lg text-xs text-slate-300 backdrop-blur-md shadow-xl flex flex-col gap-2 min-w-[140px]">
				<div className="font-semibold text-slate-400 mb-1 tracking-wider uppercase">LAYERS</div>
				<label className="flex items-center gap-2 cursor-pointer hover:text-white">
					<input
						type="checkbox"
						checked={showRoute}
						onChange={(e) => setShowRoute(e.target.checked)}
						className="rounded text-indigo-500 bg-black/40 border-white/[.15] focus:ring-0"
					/>
					<span>Route</span>
				</label>
				<label className="flex items-center gap-2 cursor-pointer hover:text-white">
					<input
						type="checkbox"
						checked={showStartPoint}
						onChange={(e) => setShowStartPoint(e.target.checked)}
						className="rounded text-indigo-500 bg-black/40 border-white/[.15] focus:ring-0"
					/>
					<span>Start Point</span>
				</label>
				<label className="flex items-center gap-2 cursor-pointer hover:text-white">
					<input
						type="checkbox"
						checked={showEndPoint}
						onChange={(e) => setShowEndPoint(e.target.checked)}
						className="rounded text-indigo-500 bg-black/40 border-white/[.15] focus:ring-0"
					/>
					<span>End Point</span>
				</label>
				<label className="flex items-center gap-2 cursor-pointer hover:text-white">
					<input
						type="checkbox"
						checked={showCollectionPoint}
						onChange={(e) => setShowCollectionPoint(e.target.checked)}
						className="rounded text-indigo-500 bg-black/40 border-white/[.15] focus:ring-0"
					/>
					<span>Collection Point</span>
				</label>
			</div>

			{/* Custom Instruction Bar at bottom */}
			{(isDrawing || activeOverlay) && (
				<div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 bg-slate-950/90 border border-indigo-500/20 px-4 py-2 rounded-full text-xs text-white font-medium shadow-2xl backdrop-blur-md flex items-center gap-3">
					<div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
					<span>
						{isDrawing
							? "DRAW MODE: Click on the map to add route coordinates."
							: "LANE MODE: Click route to place Start Point (Green), then End Point (Red)."}
					</span>
					<button
						type="button"
						onClick={() => {
							setIsDrawing(false);
							setActiveOverlay(false);
						}}
						className="px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded font-bold transition-colors"
					>
						Done
					</button>
				</div>
			)}

			{/* Full Screen / Large Lane Modal Prompt */}
			{showLaneForm && (
				<div className="absolute inset-0 bg-black/75 z-[99999] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
					<div className="bg-slate-900 border border-white/[.08] rounded-2xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden">
						<div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
						<h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
							<span>🛣️</span> Add Lane Info
						</h3>

						<div className="space-y-4">
							<div>
								<label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
									Lane Order
								</label>
								<input
									type="number"
									value={laneForm.laneOrder}
									onChange={(e) => setLaneForm({ ...laneForm, laneOrder: parseInt(e.target.value) || 1 })}
									className="w-full px-3 py-2 bg-black/40 border border-white/[.08] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/40"
								/>
							</div>

							<div>
								<label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
									Total Distance (meters)
								</label>
								<input
									type="number"
									value={laneForm.totalDistance}
									onChange={(e) => setLaneForm({ ...laneForm, totalDistance: parseFloat(e.target.value) || 0 })}
									className="w-full px-3 py-2 bg-black/40 border border-white/[.08] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/40"
								/>
							</div>

							<div className="grid grid-cols-2 gap-3">
								<div>
									<label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
										Households
									</label>
									<input
										type="number"
										value={laneForm.noOfHouseholds}
										onChange={(e) => setLaneForm({ ...laneForm, noOfHouseholds: parseInt(e.target.value) || 0 })}
										className="w-full px-3 py-2 bg-black/40 border border-white/[.08] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/40"
									/>
								</div>
								<div>
									<label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
										Commercials
									</label>
									<input
										type="number"
										value={laneForm.noOfCommercials}
										onChange={(e) => setLaneForm({ ...laneForm, noOfCommercials: parseInt(e.target.value) || 0 })}
										className="w-full px-3 py-2 bg-black/40 border border-white/[.08] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/40"
									/>
								</div>
							</div>

							<div>
								<label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
									Double Lane
								</label>
								<select
									value={laneForm.doubleLane}
									onChange={(e) => setLaneForm({ ...laneForm, doubleLane: e.target.value })}
									className="w-full px-3 py-2 bg-black/40 border border-white/[.08] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/40"
								>
									<option value="No">No</option>
									<option value="Yes">Yes</option>
								</select>
							</div>
						</div>

						<div className="flex justify-end gap-3 mt-6">
							<button
								type="button"
								onClick={cancelLaneInfo}
								className="px-4 py-2 bg-white/[.06] hover:bg-white/[.1] rounded-lg text-xs font-medium text-slate-300 transition-colors"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={saveLaneInfo}
								className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-xs font-medium text-white shadow-lg transition-colors"
							>
								Save Lane
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
