"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { get, post, put, del } from "@/lib/api";
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

function parseGeoJSONText(text: string): Coordinate[] | null {
  if (!text || !text.trim()) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      let pts: any[] = [];
      if (parsed.type === "FeatureCollection" && parsed.features) {
        for (const feat of parsed.features) {
          if (feat.geometry && feat.geometry.type === "LineString") { pts = feat.geometry.coordinates; break; }
        }
      } else if (parsed.type === "Feature" && parsed.geometry && parsed.geometry.type === "LineString") {
        pts = parsed.geometry.coordinates;
      } else if (parsed.type === "LineString" && parsed.coordinates) {
        pts = parsed.coordinates;
      } else if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
        pts = parsed;
      }
      if (pts && pts.length > 0) {
        return pts.map((p: any) => ({ lat: parseFloat(p[1]), lng: parseFloat(p[0]) })).filter(pt => !isNaN(pt.lat) && !isNaN(pt.lng));
      }
    } catch {}
  }
  try {
    const pairs: Coordinate[] = [];
    const regex = /\[\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*\]/g;
    let match;
    while ((match = regex.exec(trimmed)) !== null) {
      const lng = parseFloat(match[1]); const lat = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) pairs.push({ lat, lng });
    }
    if (pairs.length > 0) return pairs;
  } catch {}
  return null;
}

interface SweepingRoute {
  id: number; route_code: string; ward_id: number; ward_name: string; name: string;
  polyline: string; point_a: string; point_b: string;
  point_a_radius_m: number; point_b_radius_m: number;
  length_m: number | null; direction: string; status: string;
  created_at: string;
}

export default function SweepingRoutesPage() {
  const [routes, setRoutes] = useState<SweepingRoute[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<SweepingRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [wards, setWards] = useState<any[]>([]);

  const [form, setForm] = useState({
    route_code: "", name: "", wardId: "", direction: "ONE_WAY",
    point_a_radius_m: "20", point_b_radius_m: "20",
    polyline: "", distance: 0,
  });

  const [routeCoords, setRouteCoords] = useState<Coordinate[]>([]);

  const loadRoutes = async () => {
    setLoading(true);
    try {
      const res = await get<any>("/api/sweeping/routes");
      setRoutes(res.data?.data || res.data || []);
    } catch { toast.error("Failed to load routes"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadRoutes();
    get<any>("/api/wards").then((r) => setWards(r?.data?.data || r?.data || r || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (routeCoords.length === 0) {
      setForm(prev => {
        if (prev.distance === 0 && prev.polyline === "") return prev;
        return { ...prev, distance: 0, polyline: "" };
      });
      return;
    }
    const distKm = getRouteDistance(routeCoords);
    setForm(prev => {
      const polylineStr = JSON.stringify(routeCoords);
      try {
        const existingCoords = prev.polyline ? JSON.parse(prev.polyline) : [];
        const match = existingCoords.length === routeCoords.length &&
          existingCoords.every((pt: any, i: number) => pt.lat === routeCoords[i].lat && pt.lng === routeCoords[i].lng);
        if (match && prev.distance === distKm) return prev;
      } catch {}
      return { ...prev, distance: distKm, polyline: polylineStr };
    });
  }, [routeCoords]);

  const filteredRoutes = routes.filter(r => {
    const term = searchFilter.toLowerCase();
    return r.route_code.toLowerCase().includes(term) || r.name.toLowerCase().includes(term) ||
      r.ward_name.toLowerCase().includes(term);
  });

  const handleOpenAddForm = () => {
    setEditingRoute(null);
    setForm({ route_code: "", name: "", wardId: wards[0]?.id ? String(wards[0].id) : "", direction: "ONE_WAY", point_a_radius_m: "20", point_b_radius_m: "20", polyline: "", distance: 0 });
    setRouteCoords([]);
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (route: SweepingRoute) => {
    setEditingRoute(route);
    let coords: Coordinate[] = [];
    if (route.polyline) {
      try { coords = JSON.parse(route.polyline); } catch {}
    }
    setForm({
      route_code: route.route_code, name: route.name,
      wardId: route.ward_id ? String(route.ward_id) : "",
      direction: route.direction, point_a_radius_m: String(route.point_a_radius_m),
      point_b_radius_m: String(route.point_b_radius_m),
      polyline: route.polyline || "",
      distance: route.length_m || getRouteDistance(coords),
    });
    setRouteCoords(coords);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: number, name: string) => {
    try {
      await del<{ success: boolean }>(`/api/sweeping/routes/${id}`);
      toast.success("Route deleted successfully.");
      loadRoutes();
    } catch { toast.error("Failed to delete route."); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const parsedCoords = parseGeoJSONText(text);
      if (parsedCoords && parsedCoords.length > 0) {
        setRouteCoords(parsedCoords);
        const distKm = getRouteDistance(parsedCoords);
        setForm(prev => ({ ...prev, distance: distKm, polyline: JSON.stringify(parsedCoords) }));
        toast.success("File uploaded successfully.");
      } else {
        toast.error("Failed to parse coordinates from file.");
      }
    };
    reader.readAsText(file);
  };

  const handleGeoJSONPaste = (text: string) => {
    const parsedCoords = parseGeoJSONText(text);
    if (parsedCoords && parsedCoords.length > 0) {
      setRouteCoords(parsedCoords);
      const distKm = getRouteDistance(parsedCoords);
      setForm(prev => ({ ...prev, distance: distKm, polyline: JSON.stringify(parsedCoords) }));
    } else if (!text.trim()) {
      setRouteCoords([]);
      setForm(prev => ({ ...prev, polyline: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.route_code || !form.name || !form.wardId) { toast.error("Route code, name, and ward are required."); return; }

    let finalPolyline = form.polyline;
    if (routeCoords.length > 0 && !finalPolyline) {
      finalPolyline = JSON.stringify(routeCoords);
    }

    let coords: Coordinate[] = [];
    try { coords = finalPolyline ? JSON.parse(finalPolyline) : routeCoords; } catch { coords = routeCoords; }

    const pointA = coords.length > 0 ? coords[0] : { lat: 0, lng: 0 };
    const pointB = coords.length > 1 ? coords[coords.length - 1] : { lat: 0, lng: 0 };

    const payload = {
      route_code: form.route_code, name: form.name,
      ward_id: Number(form.wardId), direction: form.direction,
      point_a_radius_m: Number(form.point_a_radius_m) || 20,
      point_b_radius_m: Number(form.point_b_radius_m) || 20,
      polyline: coords, point_a: pointA, point_b: pointB,
      length_m: Number(form.distance) || null,
    };

    setSubmitting(true);
    try {
      if (editingRoute) {
        await put(`/api/sweeping/routes/${editingRoute.id}`, payload);
        toast.success("Route updated successfully.");
      } else {
        await post("/api/sweeping/routes", payload);
        toast.success("Route created successfully.");
      }
      setIsFormOpen(false);
      loadRoutes();
    } catch { toast.error("Failed to save route."); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Sweeping Routes"
        description="Design and manage road sweeping routes."
        breadcrumbs={[{ label: "SWIFT", href: "/swift/shift" }, { label: "Sweeping Routes" }]}
        actions={
          <Button onClick={isFormOpen ? () => setIsFormOpen(false) : handleOpenAddForm} variant={isFormOpen ? "secondary" : "primary"}>
            {isFormOpen ? "✕ Close" : "+ Add Sweeping Route"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {isFormOpen && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>{editingRoute ? "✏️ Edit Sweeping Route" : "🛣️ Create Sweeping Route"}</CardTitle>
              <CardDescription>Draw sweeping route path or upload coordinates.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                <div className="lg:col-span-5 space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Route Code" placeholder="Eg. SW-001" required value={form.route_code} onChange={e => setForm({ ...form, route_code: e.target.value })} />
                    <Input label="Route Name" placeholder="Eg. Tilak Nagar Main Rd" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5 block">Ward <span className="text-rose-500">*</span></label>
                      <select required value={form.wardId} onChange={e => setForm({ ...form, wardId: e.target.value })} className="w-full px-4 py-2.5 bg-theme-surface border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition">
                        <option value="">Select Ward</option>
                        {wards.map((w: any) => <option key={w.id} value={w.id}>{w.region_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5 block">Direction</label>
                      <select value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })} className="w-full px-4 py-2.5 bg-theme-surface border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition">
                        <option value="ONE_WAY">One Way</option>
                        <option value="TWO_WAY">Two Way</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Point A Radius (m)" type="number" min="1" value={form.point_a_radius_m} onChange={e => setForm({ ...form, point_a_radius_m: e.target.value })} />
                    <Input label="Point B Radius (m)" type="number" min="1" value={form.point_b_radius_m} onChange={e => setForm({ ...form, point_b_radius_m: e.target.value })} />
                  </div>
                  <Input label="Distance (km)" type="number" step="0.01" value={form.distance} readOnly className="bg-theme-surface-hover0" />

                  <div className="pt-2 border-t border-theme-border">
                    <h3 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider mb-3">Geometry</h3>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="flex flex-col">
                        <label className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-1.5 block">Polyline JSON</label>
                        <textarea
                          rows={4}
                          value={form.polyline}
                          onChange={(e) => handleGeoJSONPaste(e.target.value)}
                          placeholder='[{"lat":28.61,"lng":77.23},...]'
                          className="w-full h-[92px] p-2.5 bg-theme-surface border border-theme-border rounded-xl text-xs text-theme-text font-mono outline-none focus:border-emerald-500 transition resize-none custom-scrollbar"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-1.5 block">Upload GeoJSON File</label>
                        <div className="border border-dashed border-emerald-500/50 rounded-xl flex flex-col items-center justify-center relative bg-theme-surface-hover0/5 h-[92px] hover:bg-theme-surface-hover0/10 transition cursor-pointer">
                          <input type="file" accept=".geojson,.json" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                          <span className="text-xs font-bold text-emerald-400">Click to upload</span>
                          <span className="text-[10px] text-theme-text-dim mt-1">Supports .geojson and .json</span>
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
                  <RouteBuilderMap
                    routeCoords={routeCoords}
                    setRouteCoords={setRouteCoords}
                    borderColor="#14b8a6"
                    distance={form.distance}
                    setDistance={dist => setForm(prev => ({ ...prev, distance: dist }))}
                    geojsonText={form.polyline}
                    setGeojsonText={txt => handleGeoJSONPaste(txt)}
                    maxPoints={2}
                    pointARadius={Number(form.point_a_radius_m) || 20}
                    pointBRadius={Number(form.point_b_radius_m) || 20}
                  />
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="flex flex-col h-[600px]">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div><CardTitle>Sweeping Routes Directory</CardTitle><CardDescription>Registered sweeping routes.</CardDescription></div>
            <Input placeholder="Filter routes..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} className="w-64" />
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Table
                headers={[<div key="s" className="text-center w-16">S. No.</div>, "Code", "Name", "Distance (km)", "Ward", "Direction", "Status", <div key="a" className="text-right pr-4 w-24">Action</div>]}
                isLoading={loading}
                emptyState="No sweeping routes found."
              >
                {filteredRoutes.map((route, idx) => (
                  <tr key={route.id} className="hover:bg-theme-base/40 transition-colors group">
                    <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-3 px-5 font-mono text-sm font-semibold text-theme-accent">{route.route_code}</td>
                    <td className="py-3 px-5 font-semibold text-theme-text">{route.name}</td>
                    <td className="py-3 px-5 font-mono font-semibold text-theme-text">{route.length_m ? (route.length_m / 1000).toFixed(2) : "-"}</td>
                    <td className="py-3 px-5 text-theme-text-dim">{route.ward_name || "-"}</td>
                    <td className="py-3 px-5"><span className="px-2 py-0.5 rounded bg-theme-surface-hover0 text-theme-text text-[10px] uppercase font-bold">{route.direction}</span></td>
                    <td className="py-3 px-5"><span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${route.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-500" : "bg-gray-100 text-gray-500"}`}>{route.status}</span></td>
                    <td className="py-3 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <EditButton onClick={() => handleOpenEditForm(route)} />
                        <DeleteButton onDelete={() => handleDelete(route.id, route.name)} confirmMessage={`Delete ${route.route_code}?`} />
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
