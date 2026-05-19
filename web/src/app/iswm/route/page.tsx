"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { api, post, put, del } from "@/lib/api";
import { toast } from "react-toastify";

// Dynamic map import to avoid SSR errors
const RouteBuilderMap = dynamic(() => import("@/components/RouteBuilderMap"), { ssr: false });

interface Coordinate {
	lat: number;
	lng: number;
}

function getHaversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const R = 6371000; // meters
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLng / 2) *
			Math.sin(dLng / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

function getRouteDistance(pts: Coordinate[]): number {
	let total = 0;
	for (let i = 0; i < pts.length - 1; i++) {
		total += getHaversineDistance(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng);
	}
	return parseFloat((total / 1000).toFixed(2)); // in km
}

interface Route {
	id: number;
	route_name: string;
	identification: string;
	distance: number;
	route_type_id: number;
	route_type_name: string;
	geometry_id?: number;
	ward_id?: number;
	ward_name: string;
	shift_id?: number;
	shift_name: string;
	lanes: any[];
	is_active: boolean;
	geojson: string;
	color: string;
	updated_at: string;
}

export default function RoutePage() {
	const [routes, setRoutes] = useState<Route[]>([]);
	const [searchFilter, setSearchFilter] = useState("");
	const [isFormOpen, setIsFormOpen] = useState(false);
	const [editingRoute, setEditingRoute] = useState<Route | null>(null);

	// Dropdowns data
	const [wards, setWards] = useState<any[]>([]);
	const [shifts, setShifts] = useState<any[]>([]);
	const [routeTypes, setRouteTypes] = useState<any[]>([]);

	// Form Inputs State
	const [form, setForm] = useState({
		name: "",
		identification: "",
		wardId: "",
		shiftId: "",
		routeTypeId: "1",
		distance: 0,
		color: "#fba339",
		geojson: "",
		lanes: [] as any[],
	});

	// Route coordinates state passed down
	const [routeCoords, setRouteCoords] = useState<Coordinate[]>([]);

	// Load Initial Data
	const loadRoutes = async () => {
		try {
			const res = await api<{ success: boolean; data: Route[] }>("/api/routes");
			if (res.success) setRoutes(res.data || []);
		} catch (err) {
			console.error("Failed to load routes:", err);
		}
	};

	useEffect(() => {
		loadRoutes();

		// Fetch dropdown metadata
		api<{ data: any[] }>("/api/wards").then((res) => setWards(res.data || []));
		api<{ data: any[] }>("/api/shifts").then((res) => setShifts(res.data || []));
		api<{ data: any[] }>("/api/route-types").then((res) => setRouteTypes(res.data || []));
	}, []);

	// Recalculate distance and geojson when route coords change
	useEffect(() => {
		if (routeCoords.length === 0) {
			setForm((prev) => {
				if (prev.distance === 0 && prev.geojson === "") return prev;
				return { ...prev, distance: 0, geojson: "" };
			});
			return;
		}
		const distKm = getRouteDistance(routeCoords);

		setForm((prev) => {
			const geojsonStr = JSON.stringify({
				type: "Feature",
				geometry: {
					type: "LineString",
					coordinates: routeCoords.map((pt) => [pt.lng, pt.lat]),
				},
				properties: {},
			}, null, 2);

			if (prev.distance === distKm && prev.geojson === geojsonStr) {
				return prev;
			}
			return {
				...prev,
				distance: distKm,
				geojson: geojsonStr,
			};
		});
	}, [routeCoords]);

	// Table Filtering
	const filteredRoutes = routes.filter((r) => {
		const term = searchFilter.toLowerCase();
		return (
			r.route_name.toLowerCase().includes(term) ||
			r.identification.toLowerCase().includes(term) ||
			r.ward_name.toLowerCase().includes(term) ||
			r.shift_name.toLowerCase().includes(term) ||
			r.route_type_name.toLowerCase().includes(term)
		);
	});

	const handleOpenAddForm = () => {
		setEditingRoute(null);
		setForm({
			name: "",
			identification: "",
			wardId: wards[0]?.id ? String(wards[0].id) : "",
			shiftId: shifts[0]?.id ? String(shifts[0].id) : "",
			routeTypeId: "1",
			distance: 0,
			color: "#fba339",
			geojson: "",
			lanes: [],
		});
		setRouteCoords([]);
		setIsFormOpen(true);
	};

	const handleOpenEditForm = (route: Route) => {
		setEditingRoute(route);
		setForm({
			name: route.route_name,
			identification: route.identification,
			wardId: route.ward_id ? String(route.ward_id) : "",
			shiftId: route.shift_id ? String(route.shift_id) : "",
			routeTypeId: String(route.route_type_id),
			distance: route.distance,
			color: route.color || "#fba339",
			geojson: route.geojson || "",
			lanes: route.lanes || [],
		});

		// Parse geojson geometry if exists
		let coords: Coordinate[] = [];
		if (route.geojson) {
			try {
				const geom = JSON.parse(route.geojson);
				if (geom.type === "Feature" && geom.geometry) {
					coords = geom.geometry.coordinates.map((c: any) => ({ lat: c[1], lng: c[0] }));
				} else if (geom.type === "LineString") {
					coords = geom.coordinates.map((c: any) => ({ lat: c[1], lng: c[0] }));
				}
			} catch (e) {
				console.error("Error parsing GeoJSON during edit mapping:", e);
			}
		}
		setRouteCoords(coords);
		setIsFormOpen(true);
	};

	const handleDeleteRoute = async (id: number) => {
		if (!confirm("Are you sure you want to delete this route?")) return;
		try {
			const res = await del<{ success: boolean }>(`/api/routes/${id}`);
			if (res.success) {
				toast.success("Route deleted successfully.");
				loadRoutes();
			}
		} catch (err) {
			toast.error("Failed to delete route.");
		}
	};

	// Snapped coordinates file uploader
	const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (event) => {
			const text = event.target?.result as string;
			if (!text) return;

			if (text.includes("<kml") || text.includes("<Placemark")) {
				// Parse standard KML coordinates using regex
				const match = text.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
				if (match && match[1]) {
					const rawCoords = match[1].trim().split(/\s+/);
					const pts = rawCoords
						.map((pair) => {
							const parts = pair.split(",");
							const lng = parseFloat(parts[0]);
							const lat = parseFloat(parts[1]);
							return { lat, lng };
						})
						.filter((pt) => !isNaN(pt.lat) && !isNaN(pt.lng));

					if (pts.length > 0) {
						setRouteCoords(pts);

						// Set total distance
						const distKm = getRouteDistance(pts);
						setForm((prev) => ({
							...prev,
							distance: distKm,
							geojson: JSON.stringify(
								{
									type: "Feature",
									geometry: {
										type: "LineString",
										coordinates: pts.map((p) => [p.lng, p.lat]),
									},
									properties: {},
								},
								null,
								2
							),
						}));
						toast.success("KML coordinates uploaded successfully.");
					} else {
						toast.error("No valid coordinates found inside KML tags.");
					}
				} else {
					toast.error("No <coordinates> tag found in KML file.");
				}
			} else {
				// GeoJSON parsing
				try {
					const parsed = JSON.parse(text);
					let pts: any[] = [];
					if (parsed.type === "FeatureCollection" && parsed.features) {
						for (const feat of parsed.features) {
							if (feat.geometry && feat.geometry.type === "LineString") {
								pts = feat.geometry.coordinates;
								break;
							}
						}
					} else if (parsed.type === "Feature" && parsed.geometry && parsed.geometry.type === "LineString") {
						pts = parsed.geometry.coordinates;
					} else if (parsed.type === "LineString" && parsed.coordinates) {
						pts = parsed.coordinates;
					}

					if (pts.length > 0) {
						const coordsObj = pts.map((p: any) => ({ lat: p[1], lng: p[0] }));
						setRouteCoords(coordsObj);

						const distKm = getRouteDistance(coordsObj);
						setForm((prev) => ({
							...prev,
							distance: distKm,
							geojson: JSON.stringify(parsed, null, 2),
						}));
						toast.success("GeoJSON geometry parsed successfully.");
					} else {
						toast.error("No LineString coordinates found in GeoJSON.");
					}
				} catch (err) {
					toast.error("Failed to parse file content. Must be valid GeoJSON or KML.");
				}
			}
		};
		reader.readAsText(file);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.name || !form.identification) {
			toast.error("Route name and Identification fields are required.");
			return;
		}

		// Ensure geometry string represents valid GeoJSON if coords present
		let finalGeoJSON = form.geojson;
		if (routeCoords.length > 0 && !finalGeoJSON) {
			finalGeoJSON = JSON.stringify({
				type: "Feature",
				geometry: {
					type: "LineString",
					coordinates: routeCoords.map((pt) => [pt.lng, pt.lat]),
				},
				properties: {},
			});
		}

		const payload = {
			route_name: form.name,
			identification: form.identification,
			distance: Number(form.distance),
			route_type_id: Number(form.routeTypeId),
			ward_id: form.wardId ? Number(form.wardId) : null,
			shift_id: form.shiftId ? Number(form.shiftId) : null,
			geojson: finalGeoJSON,
			color: form.color,
			lanes: form.lanes,
		};

		try {
			if (editingRoute) {
				const res = await put<{ success: boolean }>(`/api/routes/${editingRoute.id}`, payload);
				if (res.success) {
					toast.success("Route updated successfully.");
					setIsFormOpen(false);
					loadRoutes();
				}
			} else {
				const res = await post<{ success: boolean }>(`/api/routes`, payload);
				if (res.success) {
					toast.success("Route created successfully.");
					setIsFormOpen(false);
					loadRoutes();
				}
			}
		} catch (err) {
			toast.error("Failed to save route. Check inputs.");
		}
	};

	return (
		<div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-dark)] overflow-y-auto p-6">
			{/* Top Header */}
			<div className="flex justify-between items-center mb-6">
				<div>
					<h1 className="text-xl font-bold text-white tracking-wide">Route Manager</h1>
					<div className="h-1 w-8 bg-green-500 rounded mt-1.5" />
				</div>
				{!isFormOpen && (
					<button
						onClick={handleOpenAddForm}
						className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 font-semibold text-xs text-white rounded-lg transition-all shadow-lg hover:shadow-indigo-500/20"
					>
						+ Add Route
					</button>
				)}
			</div>

			{!isFormOpen ? (
				/* ─── LIST VIEW ─── */
				<div className="bg-[var(--bg-card)] border border-white/[.05] rounded-xl overflow-hidden shadow-2xl">
					<div className="p-4 border-b border-white/[.05] flex justify-end gap-3 items-center">
						<input
							type="text"
							placeholder="Type to filter ..."
							value={searchFilter}
							onChange={(e) => setSearchFilter(e.target.value)}
							className="px-3 py-1.5 bg-black/40 border border-white/[.08] rounded-lg text-xs text-white placeholder-slate-500 outline-none w-64 focus:border-indigo-500/30"
						/>
						<button className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold rounded-lg text-white transition-colors">
							Search
						</button>
					</div>

					<div className="overflow-x-auto">
						<table className="w-full text-left text-xs border-collapse">
							<thead>
								<tr className="bg-white/[.02] border-b border-white/[.05] text-slate-400 font-bold uppercase tracking-wider">
									<th className="p-4">S. No.</th>
									<th className="p-4">Name</th>
									<th className="p-4">Route Identification</th>
									<th className="p-4">Distance(km)</th>
									<th className="p-4">Ward</th>
									<th className="p-4">Shift</th>
									<th className="p-4">Updated At</th>
									<th className="p-4 text-center">Action</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-white/[.04]">
								{filteredRoutes.map((route, index) => (
									<tr key={route.id} className="hover:bg-white/[.02] transition-colors text-slate-300">
										<td className="p-4 text-slate-500">{index + 1}</td>
										<td className="p-4 font-semibold text-white">{route.route_name}</td>
										<td className="p-4 text-slate-400">{route.identification}</td>
										<td className="p-4 text-indigo-400 font-mono font-semibold">{route.distance}</td>
										<td className="p-4">{route.ward_name || "Unknown Ward"}</td>
										<td className="p-4">
											<span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-medium">
												{route.shift_name || "Morning"}
											</span>
										</td>
										<td className="p-4 text-slate-500">
											{new Date(route.updated_at).toLocaleString("en-US", {
												year: "numeric",
												month: "2-digit",
												day: "2-digit",
												hour: "2-digit",
												minute: "2-digit",
												second: "2-digit",
												hour12: false,
											})}
										</td>
										<td className="p-4">
											<div className="flex justify-center items-center gap-3">
												<button
													onClick={() => handleOpenEditForm(route)}
													className="p-1.5 bg-white/[.04] hover:bg-white/[.08] rounded text-slate-300 hover:text-indigo-400 transition-colors"
													title="Edit Route"
												>
													✏️
												</button>
												<button
													onClick={() => handleDeleteRoute(route.id)}
													className="p-1.5 bg-white/[.04] hover:bg-white/[.08] rounded text-slate-300 hover:text-red-400 transition-colors"
													title="Delete Route"
												>
													🗑️
												</button>
											</div>
										</td>
									</tr>
								))}
								{filteredRoutes.length === 0 && (
									<tr>
										<td colSpan={8} className="text-center py-10 text-slate-500">
											No routes found.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			) : (
				/* ─── FORM BUILDER VIEW ─── */
				<form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1 min-h-0">
					{/* Left Input Fields Panel */}
					<div className="lg:col-span-5 bg-[var(--bg-card)] border border-white/[.05] rounded-xl p-6 shadow-2xl flex flex-col gap-5 justify-between">
						<div className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
										Name*
									</label>
									<input
										type="text"
										required
										placeholder="Eg. Tilak Nagar"
										value={form.name}
										onChange={(e) => setForm({ ...form, name: e.target.value })}
										className="w-full px-3 py-2 bg-black/40 border border-white/[.08] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/40 placeholder-slate-600"
									/>
								</div>
								<div>
									<label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
										Identification*
									</label>
									<input
										type="text"
										required
										placeholder="Eg. Tilak Path, Patrkar, etc"
										value={form.identification}
										onChange={(e) => setForm({ ...form, identification: e.target.value })}
										className="w-full px-3 py-2 bg-black/40 border border-white/[.08] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/40 placeholder-slate-600"
									/>
								</div>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
										Ward*
									</label>
									<select
										required
										value={form.wardId}
										onChange={(e) => setForm({ ...form, wardId: e.target.value })}
										className="w-full px-3 py-2 bg-black/40 border border-white/[.08] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/40"
									>
										<option value="">Select Ward</option>
										{wards.map((w) => (
											<option key={w.id} value={w.id}>
												{w.region_name}
											</option>
										))}
									</select>
								</div>
								<div>
									<label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
										Shift*
									</label>
									<select
										required
										value={form.shiftId}
										onChange={(e) => setForm({ ...form, shiftId: e.target.value })}
										className="w-full px-3 py-2 bg-black/40 border border-white/[.08] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/40"
									>
										<option value="">Select Shift</option>
										{shifts.map((s) => (
											<option key={s.id} value={s.id}>
												{s.shift_name}
											</option>
										))}
									</select>
								</div>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
										Route Type
									</label>
									<select
										value={form.routeTypeId}
										onChange={(e) => setForm({ ...form, routeTypeId: e.target.value })}
										className="w-full px-3 py-2 bg-black/40 border border-white/[.08] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/40"
									>
										{routeTypes.map((t) => (
											<option key={t.id} value={t.id}>
												{t.name}
											</option>
										))}
									</select>
								</div>
								<div>
									<label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
										Distance(km)*
									</label>
									<input
										type="number"
										step="0.01"
										readOnly
										value={form.distance}
										className="w-full px-3 py-2 bg-black/20 border border-white/[.05] rounded-lg text-sm text-indigo-400 font-mono font-semibold select-none outline-none cursor-not-allowed"
									/>
								</div>
							</div>

							<div className="border-t border-white/[.05] pt-4 mt-2">
								<h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Set Geometry</h3>

								<div className="mb-4">
									<label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
										Border Color
									</label>
									<div className="flex gap-3 items-center">
										<input
											type="color"
											value={form.color}
											onChange={(e) => setForm({ ...form, color: e.target.value })}
											className="w-8 h-8 rounded border-none bg-transparent cursor-pointer"
										/>
										<input
											type="text"
											value={form.color}
											onChange={(e) => setForm({ ...form, color: e.target.value })}
											className="w-32 px-3 py-1 bg-black/40 border border-white/[.08] rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500/30"
										/>
									</div>
								</div>

								<div className="mb-4">
									<label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
										GEOJSON/KML*
									</label>
									<textarea
										rows={4}
										placeholder="Enter JSON"
										value={form.geojson}
										onChange={(e) => setForm({ ...form, geojson: e.target.value })}
										className="w-full px-3 py-2 bg-black/40 border border-white/[.08] rounded-lg text-xs text-white font-mono placeholder-slate-700 focus:outline-none focus:border-indigo-500/30 resize-none"
									/>
								</div>

								<div>
									<label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
										Upload File (KML or GEOJSON)
									</label>
									<div className="relative border-2 border-dashed border-white/[.1] rounded-xl hover:border-indigo-500/40 transition-colors p-4 flex flex-col items-center justify-center cursor-pointer bg-black/20 group">
										<input
											type="file"
											accept=".kml,.geojson,.json"
											onChange={handleFileUpload}
											className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
										/>
										<div className="text-xl mb-1 text-slate-400 group-hover:text-indigo-400 transition-colors">📂</div>
										<div className="text-xs text-white font-medium group-hover:text-indigo-300 transition-colors">
											Click to upload
										</div>
										<div className="text-[10px] text-slate-500 mt-0.5">Supports .kml and .geojson</div>
									</div>
								</div>
							</div>
						</div>

						{/* Action Buttons */}
						<div className="flex gap-3 border-t border-white/[.05] pt-4 mt-4">
							<button
								type="submit"
								className="px-6 py-2 bg-green-600 hover:bg-green-700 text-xs font-bold text-white rounded-lg shadow-lg hover:shadow-green-500/10 transition-colors"
							>
								Submit
							</button>
							<button
								type="button"
								onClick={() => setIsFormOpen(false)}
								className="px-6 py-2 bg-white/[.06] hover:bg-white/[.1] text-xs font-bold text-slate-300 rounded-lg transition-colors"
							>
								Close
							</button>
						</div>
					</div>

					{/* Right Map Panel */}
					<div className="lg:col-span-7 bg-[var(--bg-card)] border border-white/[.05] rounded-xl overflow-hidden shadow-2xl flex flex-col p-4">
						<RouteBuilderMap
							routeCoords={routeCoords}
							setRouteCoords={setRouteCoords}
							borderColor={form.color}
							lanes={form.lanes}
							setLanes={(newLanes) => setForm((prev) => ({ ...prev, lanes: newLanes }))}
							distance={form.distance}
							setDistance={(dist) => setForm((prev) => ({ ...prev, distance: dist }))}
							geojsonText={form.geojson}
							setGeojsonText={(txt) => setForm((prev) => ({ ...prev, geojson: txt }))}
						/>
					</div>
				</form>
			)}
		</div>
	);
}
