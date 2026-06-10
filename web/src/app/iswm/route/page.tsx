"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { api, post, put, del } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

const RouteBuilderMap = dynamic(() => import("@/components/RouteBuilderMap"), { ssr: false });

interface Coordinate { lat: number; lng: number; }

function getHaversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getRouteDistance(pts: Coordinate[]): number {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { total += getHaversineDistance(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng); }
  return parseFloat((total / 1000).toFixed(2));
}

// ── Input guard ──────────────────────────────────────────────────────────────
const MAX_INPUT_BYTES = 5 * 1024 * 1024; // 5 MB
const MALICIOUS_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,   // onclick=, onerror=, etc.
  /data:text\/html/i,
  /vbscript:/i,
];

function isMaliciousInput(text: string): boolean {
  return MALICIOUS_PATTERNS.some(p => p.test(text));
}

function isCoordInRange(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
// ─────────────────────────────────────────────────────────────────────────────

function parseGeoJSONOrKMLText(text: string): Coordinate[] | null {
  if (!text || !text.trim()) return null;
  if (text.length > MAX_INPUT_BYTES) return null;   // too large
  if (isMaliciousInput(text)) return null;           // contains script/injection
  const trimmed = text.trim();
  
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      
      const extractCoordsFromObject = (obj: any): any[] | null => {
        if (!obj) return null;
        if (typeof obj === "string") {
          try {
            return extractCoordsFromObject(JSON.parse(obj));
          } catch (e) {
            return null;
          }
        }
        if (obj.type === "LineString" && Array.isArray(obj.coordinates)) {
          return obj.coordinates;
        }
        if (obj.type === "Feature" && obj.geometry) {
          return extractCoordsFromObject(obj.geometry);
        }
        if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
          for (const feat of obj.features) {
            const pts = extractCoordsFromObject(feat);
            if (pts) return pts;
          }
        }
        if (Array.isArray(obj.data)) {
          for (const item of obj.data) {
            const pts = extractCoordsFromObject(item);
            if (pts) return pts;
          }
        }
        if (obj.coordinates) {
          const pts = extractCoordsFromObject(obj.coordinates);
          if (pts) return pts;
        }
        if (obj.geometry_json) {
          const pts = extractCoordsFromObject(obj.geometry_json);
          if (pts) return pts;
        }
        if (obj.geometry) {
          const pts = extractCoordsFromObject(obj.geometry);
          if (pts) return pts;
        }
        if (Array.isArray(obj) && obj.length > 0 && Array.isArray(obj[0])) {
          return obj;
        }
        return null;
      };

      const pts = extractCoordsFromObject(parsed);
      if (pts && pts.length > 0) {
        return pts
          .map((p: any) => ({ lat: parseFloat(p[1]), lng: parseFloat(p[0]) }))
          .filter(pt => !isNaN(pt.lat) && !isNaN(pt.lng) && isCoordInRange(pt.lat, pt.lng));
      }
    } catch (err) {}
  }
  
  if (trimmed.includes("<coordinates>") || trimmed.includes("<Placemark")) {
    const match = trimmed.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
    if (match && match[1]) {
      const rawCoords = match[1].trim().split(/\s+/);
      const pts = rawCoords.map(pair => {
        const parts = pair.split(",");
        return { lat: parseFloat(parts[1]), lng: parts[0] ? parseFloat(parts[0]) : NaN };
      }).filter(pt => !isNaN(pt.lat) && !isNaN(pt.lng));
      if (pts.length > 0) {
        return pts;
      }
    }
  }

  // Regex fallback: match [lng, lat] patterns
  try {
    const pairs: Coordinate[] = [];
    const regex = /\[\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*\]/g;
    let match;
    while ((match = regex.exec(trimmed)) !== null) {
      const lng = parseFloat(match[1]);
      const lat = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        pairs.push({ lat, lng });
      }
    }
    if (pairs.length > 0) {
      return pairs;
    }
  } catch (e) {}
  
  return null;
}

interface Lane {
  laneOrder: number;
  totalDistance: number;
  noOfHouseholds: number;
  noOfCommercials: number;
  doubleLane: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}

function extractLanesFromObject(obj: any): any[] | null {
  if (!obj) return null;
  if (typeof obj === "string") {
    try {
      return extractLanesFromObject(JSON.parse(obj));
    } catch (e) {
      return null;
    }
  }
  if (typeof obj !== "object") return null;

  if (Array.isArray(obj.lanes)) {
    return obj.lanes;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = extractLanesFromObject(item);
      if (found) return found;
    }
  } else {
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val && (typeof val === "object" || typeof val === "string")) {
        const found = extractLanesFromObject(val);
        if (found) return found;
      }
    }
  }

  return null;
}

function parseLanesFromText(text: string): Lane[] | null {
  if (!text || !text.trim()) return null;
  if (text.length > MAX_INPUT_BYTES) return null;
  if (isMaliciousInput(text)) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      const rawLanes = extractLanesFromObject(parsed);
      if (rawLanes && Array.isArray(rawLanes)) {
        const MAX_LANES = 500; // sanity cap
        return rawLanes
          .slice(0, MAX_LANES)
          .map((lane: any) => ({
            laneOrder: typeof lane.laneOrder === "number" ? lane.laneOrder
              : typeof lane.lane_order === "number" ? lane.lane_order : 1,

            totalDistance: typeof lane.totalDistance === "number" ? lane.totalDistance
              : typeof lane.total_distance === "number" ? lane.total_distance : 0,

            noOfHouseholds: typeof lane.noOfHouseholds === "number" ? lane.noOfHouseholds
              : typeof lane.no_of_households === "number" ? lane.no_of_households : 0,

            noOfCommercials: typeof lane.noOfCommercials === "number" ? lane.noOfCommercials
              : typeof lane.no_of_commercials === "number" ? lane.no_of_commercials
              : typeof lane.no_of_commercial === "number" ? lane.no_of_commercial : 0,

            doubleLane: typeof lane.doubleLane === "string" ? lane.doubleLane
              : typeof lane.double_lane === "string" ? lane.double_lane
              : lane.is_double_lane === true ? "Yes" : "No",

            startLat: typeof lane.startLat === "number" ? lane.startLat
              : typeof lane.start_lat === "number" ? lane.start_lat
              : (lane.start_point && typeof lane.start_point.y === "number") ? lane.start_point.y : 0,

            startLng: typeof lane.startLng === "number" ? lane.startLng
              : typeof lane.start_lng === "number" ? lane.start_lng
              : (lane.start_point && typeof lane.start_point.x === "number") ? lane.start_point.x : 0,

            endLat: typeof lane.endLat === "number" ? lane.endLat
              : typeof lane.end_lat === "number" ? lane.end_lat
              : (lane.end_point && typeof lane.end_point.y === "number") ? lane.end_point.y : 0,

            endLng: typeof lane.endLng === "number" ? lane.endLng
              : typeof lane.end_lng === "number" ? lane.end_lng
              : (lane.end_point && typeof lane.end_point.x === "number") ? lane.end_point.x : 0,
          }))
          .filter(l =>
            l.startLat !== 0 && l.startLng !== 0 &&   // must have coords
            isCoordInRange(l.startLat, l.startLng) &&  // valid lat/lng range
            isCoordInRange(l.endLat, l.endLng)         // valid end range
          );
      }
    } catch (e) {}
  }
  return null;
}

interface Route {
  id: number; route_name: string; identification: string; distance: number; route_type_id: number;
  route_type_name: string; geometry_id?: number; ward_id?: number; ward_name: string;
  shift_id?: number; shift_name: string; lanes: Lane[]; is_active: boolean; geojson: string;
  color: string; updated_at: string;
}

export default function RoutePage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [wards, setWards] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [routeTypes, setRouteTypes] = useState<any[]>([]);

  const [form, setForm] = useState({
    name: "", identification: "", wardId: "", shiftId: "", routeTypeId: "1",
    distance: 0, color: "#fba339", geojson: "", lanes: [] as Lane[],
  });

  const [routeCoords, setRouteCoords] = useState<Coordinate[]>([]);

  const loadRoutes = async () => {
    setLoading(true);
    try {
      const res = await api<{ success: boolean; data: Route[] }>("/api/routes");
      if (res.success) setRoutes(res.data || []);
    } catch (err) { toast.error("Failed to load routes"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadRoutes();
    api<{ data: any[] }>("/api/wards").then(res => setWards(res.data || []));
    api<{ data: any[] }>("/api/shifts").then(res => setShifts(res.data || []));
    api<{ data: any[] }>("/api/route-types").then(res => setRouteTypes(res.data || []));
  }, []);

  useEffect(() => {
    if (routeCoords.length === 0) {
      setForm(prev => {
        if (prev.distance === 0 && prev.geojson === "") return prev;
        return { ...prev, distance: 0, geojson: "" };
      });
      return;
    }
    const distKm = getRouteDistance(routeCoords);
    setForm(prev => {
      const geojsonStr = JSON.stringify({
        type: "Feature", geometry: { type: "LineString", coordinates: routeCoords.map(pt => [pt.lng, pt.lat]) }, properties: {}
      }, null, 2);
      
      // Perform a semantic check on existing coords in form.geojson to avoid overwriting pasted input
      try {
        const existingCoords = parseGeoJSONOrKMLText(prev.geojson);
        const match = existingCoords && 
                      existingCoords.length === routeCoords.length && 
                      existingCoords.every((pt, i) => pt.lat === routeCoords[i].lat && pt.lng === routeCoords[i].lng);
        if (match && prev.distance === distKm) return prev;
      } catch (e) {}

      return { ...prev, distance: distKm, geojson: geojsonStr };
    });
  }, [routeCoords]);

  const filteredRoutes = routes.filter(r => {
    const term = searchFilter.toLowerCase();
    return r.route_name.toLowerCase().includes(term) || r.identification.toLowerCase().includes(term) ||
      r.ward_name.toLowerCase().includes(term) || r.shift_name.toLowerCase().includes(term) ||
      r.route_type_name.toLowerCase().includes(term);
  });

  const handleOpenAddForm = () => {
    setEditingRoute(null);
    setForm({
      name: "", identification: "", wardId: wards[0]?.id ? String(wards[0].id) : "",
      shiftId: shifts[0]?.id ? String(shifts[0].id) : "", routeTypeId: "1", distance: 0,
      color: "#fba339", geojson: "", lanes: [],
    });
    setRouteCoords([]); setIsFormOpen(true);
  };

  const handleOpenEditForm = (route: Route) => {
    setEditingRoute(route);
    setForm({
      name: route.route_name, identification: route.identification, wardId: route.ward_id ? String(route.ward_id) : "",
      shiftId: route.shift_id ? String(route.shift_id) : "", routeTypeId: String(route.route_type_id),
      distance: route.distance, color: route.color || "#fba339", geojson: route.geojson || "", lanes: route.lanes || [],
    });
    let coords: Coordinate[] = [];
    if (route.geojson) {
      try {
        const geom = JSON.parse(route.geojson);
        if (geom.type === "Feature" && geom.geometry) coords = geom.geometry.coordinates.map((c: any) => ({ lat: c[1], lng: c[0] }));
        else if (geom.type === "LineString") coords = geom.coordinates.map((c: any) => ({ lat: c[1], lng: c[0] }));
      } catch (e) { console.error(e); }
    }
    setRouteCoords(coords); setIsFormOpen(true);
  };

  const handleDeleteRoute = async (id: number, name: string) => {
    try {
      const res = await del<{ success: boolean }>(`/api/routes/${id}`);
      if (res.success) { toast.success("Route deleted successfully."); loadRoutes(); }
    } catch (err) { toast.error("Failed to delete route."); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      
      const parsedCoords = parseGeoJSONOrKMLText(text);
      if (parsedCoords && parsedCoords.length > 0) {
        setRouteCoords(parsedCoords);
        const distKm = getRouteDistance(parsedCoords);
        const parsedLanes = parseLanesFromText(text) || [];
        setForm(prev => ({
          ...prev,
          distance: distKm,
          geojson: text,
          lanes: parsedLanes,
        }));
        toast.success("File uploaded successfully.");
      } else {
        toast.error("Failed to parse coordinates from file. Ensure it contains a valid LineString or coordinates list.");
      }
    };
    reader.readAsText(file);
  };

  const handleGeoJSONPaste = (text: string) => {
    // ── Validation guards ──
    if (text.length > MAX_INPUT_BYTES) {
      toast.error("Input too large (max 5MB). Please paste a smaller file.");
      return;
    }
    if (isMaliciousInput(text)) {
      toast.error("Invalid input: suspicious content detected.");
      return;
    }
    // ──────────────────────
    setForm(prev => ({ ...prev, geojson: text }));
    const parsedCoords = parseGeoJSONOrKMLText(text);
    if (parsedCoords && parsedCoords.length > 0) {
      setRouteCoords(parsedCoords);
      const distKm = getRouteDistance(parsedCoords);
      const parsedLanes = parseLanesFromText(text) || [];
      setForm(prev => ({
        ...prev,
        distance: distKm,
        lanes: parsedLanes,
      }));
      if (parsedLanes.length > 0) {
        toast.info(`✅ ${parsedCoords.length} route points + ${parsedLanes.length} lanes loaded.`);
      }
    } else if (!text.trim()) {
      setRouteCoords([]);
      setForm(prev => ({ ...prev, lanes: [] }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.identification) { toast.error("Route name and Identification are required."); return; }
    
    let finalGeoJSON = form.geojson;
    if (routeCoords.length > 0 && !finalGeoJSON) {
      finalGeoJSON = JSON.stringify({ type: "Feature", geometry: { type: "LineString", coordinates: routeCoords.map(pt => [pt.lng, pt.lat]) }, properties: {} });
    }

    const payload = {
      route_name: form.name, identification: form.identification, distance: Number(form.distance),
      route_type_id: Number(form.routeTypeId), ward_id: form.wardId ? Number(form.wardId) : null,
      shift_id: form.shiftId ? Number(form.shiftId) : null, geojson: finalGeoJSON, color: form.color, lanes: form.lanes,
    };

    setSubmitting(true);
    try {
      if (editingRoute) {
        const res = await put<{ success: boolean }>(`/api/routes/${editingRoute.id}`, payload);
        if (res.success) { toast.success("Route updated successfully."); setIsFormOpen(false); loadRoutes(); }
      } else {
        const res = await post<{ success: boolean }>(`/api/routes`, payload);
        if (res.success) { toast.success("Route created successfully."); setIsFormOpen(false); loadRoutes(); }
      }
    } catch { toast.error("Failed to save route."); } finally { setSubmitting(false); }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">

      <PageHeader
        title="Route Manager"
        description="Design and manage vehicle routes and paths."
        breadcrumbs={[{ label: "ISWM", href: "/iswm/shift" }, { label: "Routes" }]}
        actions={
          <Button onClick={isFormOpen ? () => setIsFormOpen(false) : handleOpenAddForm} variant={isFormOpen ? "secondary" : "primary"}>
            {isFormOpen ? "✕ Close" : "+ Add Route"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {isFormOpen && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>{editingRoute ? "✏️ Edit Route" : "🛣️ Create Route"}</CardTitle>
              <CardDescription>Draw route path or upload coordinates.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                <div className="lg:col-span-5 space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Name" placeholder="Eg. Tilak Nagar" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                    <Input label="Identification" placeholder="Eg. Tilak Path" required value={form.identification} onChange={e => setForm({ ...form, identification: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5 block">Ward <span className="text-rose-500">*</span></label>
                      <select required value={form.wardId} onChange={e => setForm({ ...form, wardId: e.target.value })} className="w-full px-4 py-2.5 bg-theme-surface border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition">
                        <option value="">Select Ward</option>
                        {wards.map(w => <option key={w.id} value={w.id}>{w.region_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5 block">Shift <span className="text-rose-500">*</span></label>
                      <select required value={form.shiftId} onChange={e => setForm({ ...form, shiftId: e.target.value })} className="w-full px-4 py-2.5 bg-theme-surface border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition">
                        <option value="">Select Shift</option>
                        {shifts.map(s => <option key={s.id} value={s.id}>{s.shift_name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5 block">Route Type</label>
                      <select value={form.routeTypeId} onChange={e => setForm({ ...form, routeTypeId: e.target.value })} className="w-full px-4 py-2.5 bg-theme-surface border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition">
                        {routeTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <Input label="Distance (km)" type="number" step="0.01" value={form.distance} readOnly className="bg-theme-surface-hover0" />
                  </div>
                  
                  <div className="pt-2 border-t border-theme-border">
                    <h3 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider mb-3">Geometry</h3>
                    <div className="mb-4">
                      <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5 block">Color</label>
                      <div className="flex gap-3">
                        <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="w-10 h-10 rounded cursor-pointer bg-theme-surface border border-theme-border p-1" />
                        <Input value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="w-32" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      {/* Paste Area */}
                      <div className="flex flex-col">
                        <label className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-1.5 block">GEOJSON/KML <span className="text-rose-500">*</span></label>
                        <textarea
                          rows={4}
                          value={form.geojson}
                          onChange={(e) => handleGeoJSONPaste(e.target.value)}
                          placeholder='{"type":"Feature","geometry":...}'
                          className="w-full h-[92px] p-2.5 bg-theme-surface border border-theme-border rounded-xl text-xs text-theme-text font-mono outline-none focus:border-emerald-500 transition resize-none custom-scrollbar"
                        />
                      </div>
                      {/* Upload Area */}
                      <div className="flex flex-col">
                        <label className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-1.5 block">Upload File (KML or GEOJSON)</label>
                        <div className="border border-dashed border-emerald-500/50 rounded-xl flex flex-col items-center justify-center relative bg-theme-surface-hover0/5 h-[92px] hover:bg-theme-surface-hover0/10 transition cursor-pointer">
                          <input type="file" accept=".kml,.geojson,.json" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                          <span className="text-xs font-bold text-emerald-400">Click to upload</span>
                          <span className="text-[10px] text-theme-text-dim mt-1">Supports .kml and .geojson</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4 border-t border-theme-border">
                    <Button type="submit" variant="accent" loading={submitting}>Submit</Button>
                    <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Close</Button>
                  </div>
                </div>

                <div className="lg:col-span-7 h-[500px] lg:h-auto border border-theme-border rounded-xl overflow-hidden shadow-inner bg-theme-surface">
                  <RouteBuilderMap routeCoords={routeCoords} setRouteCoords={setRouteCoords} borderColor={form.color} lanes={form.lanes} setLanes={newLanes => setForm(prev => ({ ...prev, lanes: newLanes }))} distance={form.distance} setDistance={dist => setForm(prev => ({ ...prev, distance: dist }))} geojsonText={form.geojson} setGeojsonText={txt => setForm(prev => ({ ...prev, geojson: txt }))} />
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="flex flex-col h-[600px]">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div><CardTitle>Routes Directory</CardTitle><CardDescription>Registered map routes.</CardDescription></div>
            <Input placeholder="Filter routes..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} className="w-64" />
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Table
                headers={[<div key="s" className="text-center w-16">S. No.</div>, "Name", "Identification", "Distance (km)", "Ward", "Shift", <div key="a" className="text-right pr-4 w-24">Action</div>]}
                isLoading={loading}
                emptyState="No routes found."
              >
                {filteredRoutes.map((route, idx) => (
                  <tr key={route.id} className="hover:bg-theme-base/40 transition-colors group">
                    <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-3 px-5 font-semibold text-theme-text">{route.route_name}</td>
                    <td className="py-3 px-5 text-theme-text-dim">{route.identification}</td>
                    <td className="py-3 px-5 font-mono font-semibold text-theme-accent">{route.distance}</td>
                    <td className="py-3 px-5 text-theme-text-dim">{route.ward_name || "-"}</td>
                    <td className="py-3 px-5 text-theme-text-dim"><span className="px-2 py-0.5 rounded bg-theme-surface-hover0 text-theme-text text-[10px] uppercase font-bold">{route.shift_name || "-"}</span></td>
                    <td className="py-3 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <EditButton onClick={() => handleOpenEditForm(route)} />
                        <DeleteButton onDelete={() => handleDeleteRoute(route.id, route.route_name)} confirmMessage={`Delete ${route.route_name}?`} />
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
