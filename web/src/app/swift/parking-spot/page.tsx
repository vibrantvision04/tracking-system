"use client";

import { useEffect, useState } from "react";
import { api, post, put, del } from "@/lib/api";
import { toast } from "react-toastify";
import dynamic from "next/dynamic";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

const RegionMap = dynamic(() => import("@/components/RegionMap"), { ssr: false });

interface ParkingSpot {
  id: number;
  name: string;
  address: string;
  contact_number: string;
  geofence_id: number | null;
  is_active: boolean;
  created_at: string;
  geojson: any;
  color: string;
}

export default function ParkingSpotPage() {
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingSpot, setEditingSpot] = useState<ParkingSpot | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [form, setForm] = useState({
    name: "",
    contact_number: "",
    address: "",
    border_color: "#000000",
    fill_color: "#000000",
    geojson: "",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api<{ data: ParkingSpot[] }>("/api/parking-spots");
      setSpots(res.data || []);
    } catch {
      toast.error("Failed to load parking spots.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const closeForm = () => {
    setFormOpen(false);
    setEditingSpot(null);
    setIsDrawing(false);
    setForm({ name: "", contact_number: "", address: "", border_color: "#000000", fill_color: "#000000", geojson: "" });
  };

  const handleEdit = (spot: ParkingSpot) => {
    setEditingSpot(spot);
    setForm({
      name: spot.name || "",
      contact_number: spot.contact_number || "",
      address: spot.address || "",
      border_color: spot.color || "#000000",
      fill_color: spot.color || "#000000",
      geojson: spot.geojson ? JSON.stringify(spot.geojson, null, 2) : "",
    });
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.contact_number || !form.address) {
      toast.warning("Please fill all required fields.");
      return;
    }

    let parsedGeoJSON: any = null;
    if (form.geojson && form.geojson.trim() !== "") {
      try { parsedGeoJSON = JSON.parse(form.geojson); }
      catch { toast.error("Invalid GEOJSON format."); return; }
    }

    const payload = {
      name: form.name, contact_number: form.contact_number, address: form.address,
      geojson: parsedGeoJSON, color: form.fill_color,
    };

    setSubmitting(true);
    try {
      if (editingSpot) {
        await put(`/api/parking-spots/${editingSpot.id}`, payload);
        toast.success("Parking spot updated successfully.");
      } else {
        await post("/api/parking-spots", payload);
        toast.success("Parking spot created successfully.");
      }
      closeForm(); loadData();
    } catch {
      toast.error("Failed to save parking spot.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (spot: ParkingSpot) => {
    try {
      await del(`/api/parking-spots/${spot.id}`);
      toast.success("Parking spot deleted."); loadData();
    } catch { toast.error("Failed to delete parking spot."); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (file.name.endsWith(".geojson") || file.name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(text);
          setForm(prev => ({ ...prev, geojson: JSON.stringify(parsed, null, 2) }));
        } catch { toast.error("Invalid GeoJSON file structure."); }
      } else if (file.name.endsWith(".kml")) {
        const coordRegex = /<coordinates>([\s\S]*?)<\/coordinates>/i;
        const match = coordRegex.exec(text);
        if (match && match[1]) {
          const coordsStr = match[1].trim();
          const lines = coordsStr.split(/[\s,]+/);
          const coordinates: [number, number][] = [];
          for (let i = 0; i < lines.length; i += 3) {
            const lng = parseFloat(lines[i]);
            const lat = parseFloat(lines[i+1]);
            if (!isNaN(lng) && !isNaN(lat)) coordinates.push([lng, lat]);
          }
          if (coordinates.length >= 3) {
            if (coordinates[0][0] !== coordinates[coordinates.length-1][0] || coordinates[0][1] !== coordinates[coordinates.length-1][1]) {
              coordinates.push(coordinates[0]);
            }
            const parsedFeature = {
              type: "FeatureCollection",
              features: [{ type: "Feature", properties: { Name: file.name.replace(".kml", "") }, geometry: { type: "Polygon", coordinates: [coordinates] } }]
            };
            setForm(prev => ({ ...prev, geojson: JSON.stringify(parsedFeature, null, 2) }));
          } else toast.error("Could not extract enough valid polygon coordinates from KML.");
        } else toast.error("KML coordinates tags not found.");
      } else toast.error("Unsupported file format.");
    };
    reader.readAsText(file);
  };

  const mapRegions = spots.map(s => ({
    id: s.id, region_name: s.name, region_code: "", estimated_population: 0,
    region_type_title: "Parking Spot", parent_region_name: "", geojson: s.geojson, color: s.color,
  }));

  const filteredSpots = spots.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.address.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">

      <PageHeader
        title="Parking Spot Management"
        description="Manage vehicle parking locations, their geofences, and contact details."
        breadcrumbs={[{ label: "SWIFT", href: "/swift/shift" }, { label: "Parking Spots" }]}
        actions={
          <Button onClick={formOpen ? closeForm : () => setFormOpen(true)} variant={formOpen ? "secondary" : "primary"}>
            {formOpen ? "✕ Close" : "+ Add Parking Spot"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {formOpen && (
          <Card className="animate-fade-in relative z-20">
            <CardHeader>
              <CardTitle>{editingSpot ? "✏️ Edit Parking Spot" : "📍 Add Parking Spot"}</CardTitle>
              <CardDescription>Configure parking spot details and draw or upload its geofence boundary.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Form Side */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Name" placeholder="Eg. Nagar Nigam" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                    <Input label="Contact Number" placeholder="Eg. 9999999999" required value={form.contact_number} onChange={e => setForm({ ...form, contact_number: e.target.value })} />
                  </div>
                  
                  <div className="flex flex-col">
                    <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Address <span className="text-red-400">*</span></label>
                    <textarea placeholder="Eg. Indore" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm text-theme-text placeholder:text-theme-text-dim outline-none focus:border-emerald-500 transition" />
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-emerald-400 border-b border-theme-border pb-1 mb-3">Set Geometry</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <label className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-1.5">Border Color</label>
                        <input type="color" value={form.border_color} onChange={e => setForm({ ...form, border_color: e.target.value })} className="h-10 w-full rounded cursor-pointer border border-theme-border bg-theme-surface p-1" />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-1.5">Fill Color</label>
                        <input type="color" value={form.fill_color} onChange={e => setForm({ ...form, fill_color: e.target.value })} className="h-10 w-full rounded cursor-pointer border border-theme-border bg-theme-surface p-1" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-1.5">GEOJSON/KML <span className="text-red-400">*</span></label>
                      <textarea placeholder="Enter JSON" value={form.geojson} onChange={e => setForm({ ...form, geojson: e.target.value })} rows={4} className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text placeholder:text-theme-text-dim outline-none focus:border-emerald-500 transition font-mono" />
                    </div>
                    <div className="flex flex-col justify-end">
                      <label className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-1.5">Upload File (KML/GEOJSON)</label>
                      <div className="border border-dashed border-emerald-500/50 rounded-xl flex items-center justify-center relative bg-theme-surface-hover0/5 h-[92px] hover:bg-theme-surface-hover0/10 transition cursor-pointer">
                        <input type="file" accept=".kml,.geojson,.json" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                        <span className="text-xs font-bold text-emerald-400">Click to upload</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-theme-border">
                    <Button onClick={handleSubmit} variant="accent" loading={submitting} loadingText="Submitting...">Submit</Button>
                    <Button onClick={closeForm} variant="outline">Close</Button>
                  </div>
                </div>

                {/* Map Side */}
                <div className="h-[400px] lg:h-[500px] border border-theme-border rounded-xl overflow-hidden relative shadow-inner bg-theme-surface">
                  <RegionMap geoJSON={form.geojson} color={form.fill_color} onChangeGeoJSON={val => setForm(prev => ({ ...prev, geojson: val }))} regions={mapRegions} isDrawing={isDrawing} setIsDrawing={setIsDrawing} editingRegionId={editingSpot?.id} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="flex flex-col h-[600px]">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div><CardTitle>Parking Spots Directory</CardTitle><CardDescription>Registered fleet parking locations.</CardDescription></div>
            <Input placeholder="Filter spots..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-64" />
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Table
                headers={[<div key="s" className="text-center w-16">S. No.</div>, "Name", "Geofence", "Contact Number", "Address", <div key="a" className="text-right pr-4 w-24">Action</div>]}
                isLoading={loading}
                emptyState="No parking spots found."
              >
                {filteredSpots.map((spot, idx) => (
                  <tr key={spot.id} className="hover:bg-theme-base/40 transition-colors group">
                    <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-3 px-5 font-medium">{spot.name}</td>
                    <td className="py-3 px-5">{spot.geofence_id || "-"}</td>
                    <td className="py-3 px-5 text-theme-text-dim">{spot.contact_number}</td>
                    <td className="py-3 px-5 text-theme-text-dim">{spot.address}</td>
                    <td className="py-3 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <EditButton onClick={() => handleEdit(spot)} />
                        <DeleteButton onDelete={() => handleDelete(spot)} confirmMessage={`Delete ${spot.name}?`} />
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
