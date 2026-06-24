"use client";

import { useEffect, useState } from "react";
import { api, post, put, del } from "@/lib/api";
import { toast } from "react-toastify";
import dynamic from "next/dynamic";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

const DepotMap = dynamic(() => import("@/components/DepotMap"), { ssr: false });

interface OpenDepot {
  id: number;
  name: string;
  zone_id: number;
  ward_id: number;
  latitude: number;
  longitude: number;
  radius: number;
  status: string;
  cleaning_percentage: number;
  last_cleaned_at: string | null;
  created_at: string;
  updated_at: string;
  zone_name: string;
  ward_name: string;
}

interface Zone {
  id: number;
  region_name: string;
}

interface Ward {
  id: number;
  region_name: string;
  parent_id: number;
}

export default function OpenDepotPage() {
  const [depots, setDepots] = useState<OpenDepot[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [allWards, setAllWards] = useState<Ward[]>([]);
  const [filteredWards, setFilteredWards] = useState<Ward[]>([]);

  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingDepot, setEditingDepot] = useState<OpenDepot | null>(null);
  const [selectedDepot, setSelectedDepot] = useState<OpenDepot | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [form, setForm] = useState({
    name: "",
    zone_id: "",
    ward_id: "",
    latitude: "",
    longitude: "",
    radius: "50",
    status: "Active",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const depotsRes = await api<{ data: OpenDepot[] }>("/api/open-depots");
      setDepots(depotsRes.data || []);
      
      const zonesRes = await api<{ data: Zone[] }>("/api/zones");
      setZones(zonesRes.data || []);
      
      const wardsRes = await api<{ data: Ward[] }>("/api/wards");
      setAllWards(wardsRes.data || []);
    } catch (err) {
      toast.error("Failed to load initial open depots data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter Wards when selected Zone changes
  useEffect(() => {
    if (form.zone_id) {
      const zoneId = parseInt(form.zone_id);
      const filtered = allWards.filter((w) => w.parent_id === zoneId);
      setFilteredWards(filtered);
      
      // Clear Ward selection if not in filtered list
      const hasSelectedWardInFilter = filtered.some(w => w.id.toString() === form.ward_id);
      if (!hasSelectedWardInFilter && form.ward_id !== "") {
        setForm(prev => ({ ...prev, ward_id: "" }));
      }
    } else {
      setFilteredWards([]);
      setForm(prev => ({ ...prev, ward_id: "" }));
    }
  }, [form.zone_id, allWards]);

  const closeForm = () => {
    setFormOpen(false);
    setEditingDepot(null);
    setForm({
      name: "",
      zone_id: "",
      ward_id: "",
      latitude: "",
      longitude: "",
      radius: "50",
      status: "Active",
    });
  };

  const handleEdit = (depot: OpenDepot) => {
    setEditingDepot(depot);
    
    // Make sure filtered wards are updated immediately for this zone
    const zoneIdStr = depot.zone_id.toString();
    const zoneWards = allWards.filter(w => w.parent_id === depot.zone_id);
    setFilteredWards(zoneWards);

    setForm({
      name: depot.name || "",
      zone_id: zoneIdStr,
      ward_id: depot.ward_id.toString(),
      latitude: depot.latitude.toString(),
      longitude: depot.longitude.toString(),
      radius: depot.radius.toString(),
      status: depot.status || "Active",
    });
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!form.name.trim()) {
      toast.error("Open Depot Name is required");
      return;
    }
    if (!form.zone_id) {
      toast.error("Zone selection is required");
      return;
    }
    if (!form.ward_id) {
      toast.error("Ward selection is required");
      return;
    }
    
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    const rad = parseFloat(form.radius);

    if (isNaN(lat) || lat === 0) {
      toast.error("A valid Latitude is required");
      return;
    }
    if (isNaN(lng) || lng === 0) {
      toast.error("A valid Longitude is required");
      return;
    }
    if (isNaN(rad) || rad <= 0) {
      toast.error("Radius must be greater than 0");
      return;
    }

    const payload = {
      name: form.name,
      zone_id: parseInt(form.zone_id),
      ward_id: parseInt(form.ward_id),
      latitude: lat,
      longitude: lng,
      radius: rad,
      status: form.status,
    };

    setSubmitting(true);
    try {
      if (editingDepot) {
        await put(`/api/open-depots/${editingDepot.id}`, payload);
        toast.success("Open Depot updated successfully.");
      } else {
        await post("/api/open-depots", payload);
        toast.success("Open Depot created successfully.");
      }
      closeForm();
      loadData();
      setSelectedDepot(null);
    } catch (err) {
      // toast.error is handled inside api helper
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (depot: OpenDepot) => {
    try {
      await del(`/api/open-depots/${depot.id}`);
      toast.success("Open Depot deleted successfully.");
      loadData();
      if (selectedDepot?.id === depot.id) {
        setSelectedDepot(null);
      }
    } catch (err) {
      // Handled inside api helper
    }
  };

  const handleMapLocationChange = (lat: number, lng: number) => {
    setForm((prev) => ({
      ...prev,
      latitude: lat.toString(),
      longitude: lng.toString(),
    }));
  };

  const filteredDepots = depots.filter(
    (d) =>
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.zone_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.ward_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Open Depot Management"
        description="Configure Open Waste Depots, geofence radius parameters, and assignments."
        breadcrumbs={[
          { label: "VSWM", href: "/vswm/shift" },
          { label: "Open Depot" },
        ]}
        actions={
          <Button
            onClick={formOpen ? closeForm : () => setFormOpen(true)}
            variant={formOpen ? "secondary" : "primary"}
          >
            {formOpen ? "✕ Close Form" : "+ Add Open Depot"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {/* Form Container */}
        {formOpen && (
          <Card className="animate-fade-in relative z-20 border border-theme-border">
            <CardHeader>
              <CardTitle>
                {editingDepot ? "✏️ Edit Open Depot" : "📍 Create Open Depot"}
              </CardTitle>
              <CardDescription>
                Select location on the map, draw geofence circle, and assign Zone & Ward.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Form Inputs (Left) */}
                <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <Input
                      label="Open Depot Name"
                      placeholder="e.g. Depot Near Chowk"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <Select
                        label="Zone"
                        required
                        value={form.zone_id}
                        onChange={(e) => setForm({ ...form, zone_id: e.target.value })}
                      >
                        <option value="">Select Zone</option>
                        {zones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.region_name}
                          </option>
                        ))}
                      </Select>

                      <Select
                        label="Ward"
                        required
                        value={form.ward_id}
                        disabled={!form.zone_id}
                        onChange={(e) => setForm({ ...form, ward_id: e.target.value })}
                      >
                        <option value="">Select Ward</option>
                        {filteredWards.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.region_name}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <Input
                        label="Latitude"
                        type="number"
                        step="any"
                        placeholder="e.g. 26.9124"
                        required
                        value={form.latitude}
                        onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                      />
                      <Input
                        label="Longitude"
                        type="number"
                        step="any"
                        placeholder="e.g. 75.7873"
                        required
                        value={form.longitude}
                        onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                      />
                      <Input
                        label="Radius (Meters)"
                        type="number"
                        min="1"
                        placeholder="e.g. 50"
                        required
                        value={form.radius}
                        onChange={(e) => setForm({ ...form, radius: e.target.value })}
                      />
                    </div>

                    <div className="flex flex-col">
                      <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">
                        Geofence Radius Preview (Meters)
                      </label>
                      <input
                        type="range"
                        min="5"
                        max="500"
                        step="5"
                        value={form.radius || "50"}
                        onChange={(e) => setForm({ ...form, radius: e.target.value })}
                        className="w-full h-1.5 bg-theme-border rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                      <div className="flex justify-between text-[10px] text-theme-text-dim mt-1 font-semibold">
                        <span>5m</span>
                        <span className="text-emerald-400 font-bold">{form.radius}m</span>
                        <span>500m</span>
                      </div>
                    </div>

                    <Select
                      label="Status"
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </Select>
                  </div>

                  <div className="flex gap-3 pt-6 border-t border-theme-border mt-4">
                    <Button
                      type="submit"
                      variant="accent"
                      loading={submitting}
                      loadingText="Saving..."
                    >
                      Save Depot
                    </Button>
                    <Button type="button" onClick={closeForm} variant="outline">
                      Cancel
                    </Button>
                  </div>
                </div>

                {/* Map Preview (Right) */}
                <div className="lg:col-span-7 h-[380px] lg:h-[420px] flex flex-col">
                  <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5 block">
                    Geofence Live View
                  </span>
                  <div className="flex-1 border border-theme-border rounded-xl overflow-hidden relative shadow-sm">
                    <DepotMap
                      key={editingDepot ? `edit-${editingDepot.id}` : "create"}
                      latitude={parseFloat(form.latitude)}
                      longitude={parseFloat(form.longitude)}
                      radius={parseFloat(form.radius)}
                      onLocationChange={handleMapLocationChange}
                      onRadiusChange={(r) => setForm((prev) => ({ ...prev, radius: r.toString() }))}
                    />
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Directory Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* List Card */}
          <Card className={`flex flex-col h-[580px] xl:col-span-2 ${selectedDepot ? "" : "xl:col-span-3"}`}>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <div>
                <CardTitle>Open Depots Directory</CardTitle>
                <CardDescription>
                  Registered open dumping depots and coordinates.
                </CardDescription>
              </div>
              <Input
                placeholder="Filter by name, zone, ward..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 bg-theme-surface border-theme-border"
              />
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto custom-scrollbar">
                <Table
                  headers={[
                    <div key="s" className="text-center w-12">S.No.</div>,
                    "Depot Name",
                    "Zone",
                    "Ward",
                    "Coordinates",
                    "Radius",
                    "Status",
                    <div key="a" className="text-right pr-4 w-24">Actions</div>,
                  ]}
                  isLoading={loading}
                  emptyState="No Open Depots registered yet."
                >
                  {filteredDepots.map((depot, idx) => (
                    <tr
                      key={depot.id}
                      onClick={() => setSelectedDepot(depot)}
                      className={`hover:bg-theme-surface-hover cursor-pointer transition-colors group ${
                        selectedDepot?.id === depot.id ? "bg-emerald-500/[.04] border-l-2 border-emerald-500" : ""
                      }`}
                    >
                      <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-5 font-semibold text-theme-text">
                        {depot.name} <span className="text-[10px] text-theme-text-dim/60 font-mono ml-1">#ID:{depot.id}</span>
                      </td>
                      <td className="py-3 px-5 text-sm">{depot.zone_name || `Zone ${depot.zone_id}`}</td>
                      <td className="py-3 px-5 text-sm">{depot.ward_name || `Ward ${depot.ward_id}`}</td>
                      <td className="py-3 px-5 font-mono text-[11px] text-theme-text-dim">
                        {depot.latitude.toFixed(5)}, {depot.longitude.toFixed(5)}
                      </td>
                      <td className="py-3 px-5 font-semibold text-sm">
                        {depot.radius}m
                      </td>
                      <td className="py-3 px-5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                            depot.status === "Active"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                              : "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-400"
                          }`}
                        >
                          ● {depot.status}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <EditButton onClick={() => handleEdit(depot)} />
                          <DeleteButton
                            onDelete={() => handleDelete(depot)}
                            confirmMessage={`Are you sure you want to delete open depot "${depot.name}"?`}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Quick Preview panel (Right column when item is selected) */}
          {selectedDepot && (
            <Card className="flex flex-col h-[580px] border border-theme-border animate-fade-in">
              <CardHeader className="py-4 border-b border-theme-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-emerald-500 font-bold">🎯 Row Map Preview</CardTitle>
                  <button
                    onClick={() => setSelectedDepot(null)}
                    className="text-theme-text-dim hover:text-theme-text font-bold text-xs"
                  >
                    ✕ Close
                  </button>
                </div>
                <CardDescription className="font-semibold text-theme-text pt-1">
                  {selectedDepot.name}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 flex-1 flex flex-col space-y-4">
                <div className="flex-1 min-h-[200px] border border-theme-border rounded-xl overflow-hidden relative shadow-inner">
                  <DepotMap
                    key={selectedDepot.id}
                    latitude={selectedDepot.latitude}
                    longitude={selectedDepot.longitude}
                    radius={selectedDepot.radius}
                    previewOnly={true}
                  />
                </div>

                <div className="bg-theme-base/60 p-4 rounded-xl space-y-2 border border-theme-border text-xs">
                  <div className="flex justify-between">
                    <span className="text-theme-text-dim uppercase font-bold text-[9px] tracking-wider">Zone:</span>
                    <span className="font-bold text-theme-text">{selectedDepot.zone_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-text-dim uppercase font-bold text-[9px] tracking-wider">Ward:</span>
                    <span className="font-bold text-theme-text">{selectedDepot.ward_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-text-dim uppercase font-bold text-[9px] tracking-wider">Latitude:</span>
                    <span className="font-bold text-theme-text font-mono text-[11px]">{selectedDepot.latitude.toFixed(6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-text-dim uppercase font-bold text-[9px] tracking-wider">Longitude:</span>
                    <span className="font-bold text-theme-text font-mono text-[11px]">{selectedDepot.longitude.toFixed(6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-text-dim uppercase font-bold text-[9px] tracking-wider">Geofence Radius:</span>
                    <span className="font-bold text-emerald-400">{selectedDepot.radius} Meters</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-text-dim uppercase font-bold text-[9px] tracking-wider">Created At:</span>
                    <span className="text-theme-text-dim font-mono text-[11px]">
                      {new Date(selectedDepot.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
