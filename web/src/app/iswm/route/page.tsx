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

interface Route {
  id: number; route_name: string; identification: string; distance: number; route_type_id: number;
  route_type_name: string; geometry_id?: number; ward_id?: number; ward_name: string;
  shift_id?: number; shift_name: string; lanes: any[]; is_active: boolean; geojson: string;
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
    distance: 0, color: "#fba339", geojson: "", lanes: [] as any[],
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
      if (prev.distance === distKm && prev.geojson === geojsonStr) return prev;
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
      if (text.includes("<kml") || text.includes("<Placemark")) {
        const match = text.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
        if (match && match[1]) {
          const rawCoords = match[1].trim().split(/\s+/);
          const pts = rawCoords.map(pair => {
            const parts = pair.split(",");
            return { lat: parseFloat(parts[1]), lng: parseFloat(parts[0]) };
          }).filter(pt => !isNaN(pt.lat) && !isNaN(pt.lng));
          if (pts.length > 0) {
            setRouteCoords(pts);
            const distKm = getRouteDistance(pts);
            setForm(prev => ({
              ...prev, distance: distKm,
              geojson: JSON.stringify({ type: "Feature", geometry: { type: "LineString", coordinates: pts.map(p => [p.lng, p.lat]) }, properties: {} }, null, 2)
            }));
            toast.success("KML uploaded successfully.");
          } else toast.error("No valid coordinates found.");
        } else toast.error("No <coordinates> tag found.");
      } else {
        try {
          const parsed = JSON.parse(text);
          let pts: any[] = [];
          if (parsed.type === "FeatureCollection" && parsed.features) {
            for (const feat of parsed.features) {
              if (feat.geometry && feat.geometry.type === "LineString") { pts = feat.geometry.coordinates; break; }
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
            setForm(prev => ({ ...prev, distance: distKm, geojson: JSON.stringify(parsed, null, 2) }));
            toast.success("GeoJSON uploaded successfully.");
          } else toast.error("No LineString found.");
        } catch (err) { toast.error("Invalid file format."); }
      }
    };
    reader.readAsText(file);
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
                    <div className="mb-4">
                      <label className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-1.5 block">Upload File (KML/GEOJSON)</label>
                      <div className="border border-dashed border-emerald-500/50 rounded-xl flex flex-col items-center justify-center relative bg-theme-surface-hover0/5 h-[92px] hover:bg-theme-surface-hover0/10 transition cursor-pointer">
                        <input type="file" accept=".kml,.geojson,.json" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                        <span className="text-xs font-bold text-emerald-400">Click to upload</span>
                        <span className="text-[10px] text-theme-text-dim mt-1">Supports .kml and .geojson</span>
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
