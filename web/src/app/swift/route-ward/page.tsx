"use client";

import { useEffect, useState, useRef } from "react";
import { api, post, del } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

interface RouteWard {
  id: number;
  route_id: number;
  route_name: string;
  ward_id: number;
  ward_name: string;
}

interface Route {
  id: number;
  route_name: string;
}

interface Region {
  id: number;
  region_name: string;
  region_type_id: number;
}

export default function RouteWardPage() {
  const [routeWards, setRouteWards] = useState<RouteWard[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [wards, setWards] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);
  const [routeSearch, setRouteSearch] = useState("");
  const [wardSearch, setWardSearch] = useState("");
  const [routeDropdownOpen, setRouteDropdownOpen] = useState(false);
  const [wardDropdownOpen, setWardDropdownOpen] = useState(false);
  const [tableFilter, setTableFilter] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const routeRef = useRef<HTMLDivElement>(null);
  const wardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (routeRef.current && !routeRef.current.contains(e.target as Node)) setRouteDropdownOpen(false);
      if (wardRef.current && !wardRef.current.contains(e.target as Node)) setWardDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rwRes, rRes, regRes] = await Promise.all([
        api<{ data: RouteWard[] }>("/api/route-wards"),
        api<{ data: Route[] }>("/api/routes"),
        api<{ data: Region[] }>("/api/regions")
      ]);
      setRouteWards(rwRes.data || []);
      setRoutes(rRes.data || []);
      setWards((regRes.data || []).filter(r => r.region_type_id === 3));
    } catch {
      toast.error("Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const closeForm = () => {
    setFormOpen(false); 
    setSelectedRouteId(null); 
    setSelectedWardId(null);
    setRouteSearch(""); 
    setWardSearch("");
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!selectedRouteId || !selectedWardId) { toast.warning("Both Route and Ward must be selected."); return; }
    setSubmitting(true);
    try {
      if (editingId) {
        await del(`/api/route-wards/${editingId}`);
      }
      await post("/api/route-wards", { route_id: selectedRouteId, ward_id: selectedWardId });
      toast.success(editingId ? "Mapping updated successfully!" : "Assigned successfully!");
      closeForm(); loadData();
    } catch {
      toast.error("Failed to assign route to ward.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEditForm = (rw: RouteWard) => {
    setEditingId(rw.id);
    setSelectedRouteId(rw.route_id);
    setSelectedWardId(rw.ward_id);
    setFormOpen(true);
  };

  const handleDelete = async (rw: RouteWard) => {
    try {
      await del(`/api/route-wards/${rw.id}`);
      toast.success("Removed assignment.");
      loadData();
    } catch {
      toast.error("Failed to remove assignment.");
    }
  };

  const filteredRouteWards = routeWards.filter(rw => {
    const search = tableFilter.toLowerCase();
    return rw.route_name?.toLowerCase().includes(search) || rw.ward_name?.toLowerCase().includes(search);
  });

  const filteredRoutes = routes.filter(r => r.route_name.toLowerCase().includes(routeSearch.toLowerCase()));
  const filteredWards = wards.filter(w => w.region_name.toLowerCase().includes(wardSearch.toLowerCase()));
  const selectedRouteName = routes.find(r => r.id === selectedRouteId)?.route_name || "Select Route";
  const selectedWardName = wards.find(w => w.id === selectedWardId)?.region_name || "Select Ward";

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">

      <PageHeader
        title="Route To Ward Assignment"
        description="Map collection routes to their corresponding ward boundaries."
        breadcrumbs={[{ label: "SWIFT", href: "/swift/shift" }, { label: "Route-Ward" }]}
        actions={
          <Button onClick={formOpen ? closeForm : () => setFormOpen(true)} variant={formOpen ? "secondary" : "primary"}>
            {formOpen ? "✕ Close" : "+ Assign Route To Ward"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">

        {formOpen && (
          <Card className="animate-fade-in relative z-20">
            <CardHeader>
              <CardTitle>{editingId ? "✏️ Edit Route to Ward Mapping" : "Assign Route to Ward"}</CardTitle>
              <CardDescription>Select a route and ward to create a mapping.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                {/* Route Searchable Dropdown */}
                <div className="flex flex-col relative" ref={routeRef}>
                  <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Route <span className="text-red-400">*</span></span>
                  <div
                    className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm text-theme-text cursor-pointer flex justify-between items-center hover:border-theme-accent/40 transition"
                    onClick={() => setRouteDropdownOpen(!routeDropdownOpen)}
                  >
                    <span className={selectedRouteId ? "text-theme-text" : "text-theme-text-dim"}>{selectedRouteName}</span>
                    <span className="text-theme-text-dim text-xs">▼</span>
                  </div>
                  {routeDropdownOpen && (
                    <div className="absolute top-[60px] left-0 w-full bg-theme-surface border border-theme-border rounded-lg shadow-xl overflow-hidden z-50">
                      <div className="p-2 border-b border-theme-border"><input type="text" placeholder="🔍 Search Route..." value={routeSearch} onChange={e => setRouteSearch(e.target.value)} className="w-full bg-transparent text-sm text-theme-text outline-none" autoFocus /></div>
                      <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        {filteredRoutes.map(r => (
                          <div key={r.id} className="px-4 py-2 text-sm text-theme-text hover:bg-theme-accent/20 hover:text-emerald-400 cursor-pointer" onClick={() => { setSelectedRouteId(r.id); setRouteDropdownOpen(false); setRouteSearch(""); }}>
                            {r.route_name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Ward Searchable Dropdown */}
                <div className="flex flex-col relative" ref={wardRef}>
                  <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Ward <span className="text-red-400">*</span></span>
                  <div
                    className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm text-theme-text cursor-pointer flex justify-between items-center hover:border-theme-accent/40 transition"
                    onClick={() => setWardDropdownOpen(!wardDropdownOpen)}
                  >
                    <span className={selectedWardId ? "text-theme-text" : "text-theme-text-dim"}>{selectedWardName}</span>
                    <span className="text-theme-text-dim text-xs">▼</span>
                  </div>
                  {wardDropdownOpen && (
                    <div className="absolute top-[60px] left-0 w-full bg-theme-surface border border-theme-border rounded-lg shadow-xl overflow-hidden z-50">
                      <div className="p-2 border-b border-theme-border"><input type="text" placeholder="🔍 Search Ward..." value={wardSearch} onChange={e => setWardSearch(e.target.value)} className="w-full bg-transparent text-sm text-theme-text outline-none" autoFocus /></div>
                      <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        {filteredWards.map(w => (
                          <div key={w.id} className="px-4 py-2 text-sm text-theme-text hover:bg-theme-accent/20 hover:text-emerald-400 cursor-pointer" onClick={() => { setSelectedWardId(w.id); setWardDropdownOpen(false); setWardSearch(""); }}>
                            {w.region_name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-theme-border">
                <Button onClick={handleSubmit} variant="accent" loading={submitting} loadingText="Submitting...">Submit</Button>
                <Button onClick={closeForm} variant="outline">Close</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="flex flex-col h-[600px]">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div><CardTitle>Route-Ward Assignments</CardTitle><CardDescription>All route-to-ward mappings for waste collection.</CardDescription></div>
            <Input placeholder="Filter..." value={tableFilter} onChange={e => setTableFilter(e.target.value)} className="w-64" />
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Table
                headers={[<div key="s" className="text-center w-16">S. No.</div>, "Route", "Ward", <div key="a" className="text-right pr-4 w-24">Action</div>]}
                isLoading={loading}
                emptyState="No assignments found."
              >
                {filteredRouteWards.map((rw, idx) => (
                  <tr key={rw.id} className="hover:bg-theme-base/40 transition-colors group">
                    <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-3 px-5 font-medium">{rw.route_name}</td>
                    <td className="py-3 px-5 text-theme-text-dim">{rw.ward_name}</td>
                    <td className="py-3 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <EditButton onClick={() => handleOpenEditForm(rw)} />
                        <DeleteButton onDelete={() => handleDelete(rw)} confirmMessage={`Remove assignment for ${rw.route_name}?`} />
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
