"use client";

import { useEffect, useState } from "react";
import { api, post, put, del } from "@/lib/api";
import { toast } from "react-toastify";
import dynamic from "next/dynamic";
import { polygon, point, booleanPointInPolygon } from "@turf/turf";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

const TransferStationMap = dynamic(() => import("@/components/TransferStationMap"), { ssr: false });

interface TransferStation {
  id: number;
  name: string;
  address: string;
  geofence_id: number | null;
  is_active: boolean;
  created_at: string;
  geojson: any;
  color: string;
  dump_zone_latitude: number | null;
  dump_zone_longitude: number | null;
  dump_zone_radius: number | null;
  entry_latitude: number | null;
  entry_longitude: number | null;
  exit_latitude: number | null;
  exit_longitude: number | null;
}

export default function TransferStationPage() {
  const [stations, setStations] = useState<TransferStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingStation, setEditingStation] = useState<TransferStation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Enhanced map and toolbar states
  const [activeTool, setActiveTool] = useState<"boundary" | "dump" | "entry" | "exit" | null>(null);
  const [isDrawingBoundary, setIsDrawingBoundary] = useState(false);

  const [dumpZone, setDumpZone] = useState<{ latitude: number; longitude: number; radius: number } | null>(null);
  const [entryPoint, setEntryPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [exitPoint, setExitPoint] = useState<{ latitude: number; longitude: number } | null>(null);

  const [form, setForm] = useState({
    name: "",
    address: "",
    border_color: "#10b981",
    fill_color: "#10b981",
    geojson: "",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api<{ data: TransferStation[] }>("/api/transfer-stations");
      setStations(res.data || []);
    } catch {
      toast.error("Failed to load transfer stations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const closeForm = () => {
    setFormOpen(false);
    setEditingStation(null);
    setActiveTool(null);
    setIsDrawingBoundary(false);
    setDumpZone(null);
    setEntryPoint(null);
    setExitPoint(null);
    setForm({ name: "", address: "", border_color: "#10b981", fill_color: "#10b981", geojson: "" });
  };

  const handleEdit = (station: TransferStation) => {
    setEditingStation(station);
    setForm({
      name: station.name || "",
      address: station.address || "",
      border_color: station.color || "#10b981",
      fill_color: station.color || "#10b981",
      geojson: station.geojson ? JSON.stringify(station.geojson, null, 2) : "",
    });

    if (station.dump_zone_latitude && station.dump_zone_longitude) {
      setDumpZone({
        latitude: station.dump_zone_latitude,
        longitude: station.dump_zone_longitude,
        radius: station.dump_zone_radius || 15,
      });
    }

    if (station.entry_latitude && station.entry_longitude) {
      setEntryPoint({
        latitude: station.entry_latitude,
        longitude: station.entry_longitude,
      });
    }

    if (station.exit_latitude && station.exit_longitude) {
      setExitPoint({
        latitude: station.exit_latitude,
        longitude: station.exit_longitude,
      });
    }

    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.address) {
      toast.warning("Please fill all required fields.");
      return;
    }

    // Validation: Require main boundary geofence
    if (!form.geojson || form.geojson.trim() === "") {
      toast.warning("Transfer station boundary geofence is required.");
      return;
    }

    let parsedGeoJSON: any = null;
    try {
      parsedGeoJSON = JSON.parse(form.geojson);
    } catch {
      toast.error("Invalid boundary GEOJSON format.");
      return;
    }

    // Validation: Require dump zone, entry, and exit points
    if (!dumpZone) {
      toast.warning("Dump zone configuration is required.");
      return;
    }
    if (!entryPoint) {
      toast.warning("Entry point configuration is required.");
      return;
    }
    if (!exitPoint) {
      toast.warning("Exit point configuration is required.");
      return;
    }

    // Validation: Points must reside within boundary polygon
    try {
      let polyGeom = parsedGeoJSON;
      if (parsedGeoJSON.type === "FeatureCollection") {
        polyGeom = parsedGeoJSON.features[0].geometry;
      } else if (parsedGeoJSON.type === "Feature") {
        polyGeom = parsedGeoJSON.geometry;
      }

      if (polyGeom.type !== "Polygon") {
        toast.error("Boundary must be a valid Polygon geometry.");
        return;
      }

      const poly = polygon(polyGeom.coordinates);

      // Validate Dump Zone inside
      const dumpPt = point([dumpZone.longitude, dumpZone.latitude]);
      if (!booleanPointInPolygon(dumpPt, poly)) {
        toast.error("Dump zone center must be inside the transfer station boundary.");
        return;
      }

      // Validate Entry Point inside
      const entryPt = point([entryPoint.longitude, entryPoint.latitude]);
      if (!booleanPointInPolygon(entryPt, poly)) {
        toast.error("Entry point must be inside the transfer station boundary.");
        return;
      }

      // Validate Exit Point inside
      const exitPt = point([exitPoint.longitude, exitPoint.latitude]);
      if (!booleanPointInPolygon(exitPt, poly)) {
        toast.error("Exit point must be inside the transfer station boundary.");
        return;
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed point-in-polygon validation check. Ensure your boundary polygon coordinates form a valid closed loop.");
      return;
    }

    const payload = {
      name: form.name,
      address: form.address,
      geojson: parsedGeoJSON,
      color: form.fill_color,
      dumpZone,
      entryPoint,
      exitPoint,
    };

    setSubmitting(true);
    try {
      if (editingStation) {
        await put(`/api/transfer-stations/${editingStation.id}`, payload);
        toast.success("Transfer station updated successfully.");
      } else {
        await post("/api/transfer-stations", payload);
        toast.success("Transfer station created successfully.");
      }
      closeForm();
      loadData();
    } catch {
      toast.error("Failed to save transfer station configuration.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (station: TransferStation) => {
    try {
      await del(`/api/transfer-stations/${station.id}`);
      toast.success("Transfer station deleted.");
      loadData();
    } catch {
      toast.error("Failed to delete transfer station.");
    }
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
          setForm((prev) => ({ ...prev, geojson: JSON.stringify(parsed, null, 2) }));
        } catch {
          toast.error("Invalid GeoJSON file structure.");
        }
      } else if (file.name.endsWith(".kml")) {
        const coordRegex = /<coordinates>([\s\S]*?)<\/coordinates>/i;
        const match = coordRegex.exec(text);
        if (match && match[1]) {
          const coordsStr = match[1].trim();
          const lines = coordsStr.split(/[\s,]+/);
          const coordinates: [number, number][] = [];
          for (let i = 0; i < lines.length; i += 3) {
            const lng = parseFloat(lines[i]);
            const lat = parseFloat(lines[i + 1]);
            if (!isNaN(lng) && !isNaN(lat)) coordinates.push([lng, lat]);
          }
          if (coordinates.length >= 3) {
            if (
              coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
              coordinates[0][1] !== coordinates[coordinates.length - 1][1]
            ) {
              coordinates.push(coordinates[0]);
            }
            const parsedFeature = {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: { Name: file.name.replace(".kml", "") },
                  geometry: { type: "Polygon", coordinates: [coordinates] },
                },
              ],
            };
            setForm((prev) => ({ ...prev, geojson: JSON.stringify(parsedFeature, null, 2) }));
          } else {
            toast.error("Could not extract enough valid polygon coordinates from KML.");
          }
        } else {
          toast.error("KML coordinates tags not found.");
        }
      } else {
        toast.error("Unsupported file format.");
      }
    };
    reader.readAsText(file);
  };

  const filteredStations = stations.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Transfer Stations"
        description="Manage waste transfer station locations, validation boundaries, and checkpoints."
        breadcrumbs={[{ label: "SWIFT", href: "/swift/shift" }, { label: "Transfer Stations" }]}
        actions={
          <Button onClick={formOpen ? closeForm : () => setFormOpen(true)} variant={formOpen ? "secondary" : "primary"}>
            {formOpen ? "✕ Close" : "+ Add Transfer Station"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {formOpen && (
          <Card className="animate-fade-in relative z-20 border border-theme-border bg-theme-surface">
            <CardHeader>
              <CardTitle>{editingStation ? "✏️ Edit Transfer Station" : "🏢 Add Transfer Station"}</CardTitle>
              <CardDescription>
                Configure advanced validation parameters including entry point, exit point, and dump zone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Form Inputs and Configuration Controls */}
                <div className="space-y-5">
                  <Input
                    label="Name"
                    placeholder="Eg. IT Park GTS"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />

                  <div className="flex flex-col">
                    <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">
                      Address <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      placeholder="Eg. Near bypass road"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      rows={2}
                      className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm text-theme-text placeholder:text-theme-text-dim outline-none focus:border-emerald-500 transition"
                    />
                  </div>

                  {/* Configurable Dump Zone Radius */}
                  <div className="border border-theme-border rounded-xl p-4 space-y-4 bg-theme-base/20">
                    <h3 className="text-xs font-bold text-emerald-400 border-b border-theme-border pb-1 mb-2 flex items-center gap-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                      Dump Zone Configuration
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <label className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-1.5">
                          Dump Zone Radius (Meters)
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={100}
                          value={dumpZone?.radius || 15}
                          onChange={(e) => {
                            const radiusVal = Math.max(5, parseInt(e.target.value) || 15);
                            if (dumpZone) {
                              setDumpZone({ ...dumpZone, radius: radiusVal });
                            } else {
                              setDumpZone({ latitude: 0, longitude: 0, radius: radiusVal });
                            }
                          }}
                          className="bg-theme-surface border border-theme-border rounded-lg px-3 py-1.5 text-xs text-theme-text outline-none focus:border-emerald-500 transition"
                        />
                      </div>
                      <div className="flex flex-col justify-center text-[10px] text-theme-text-dim font-medium leading-relaxed">
                        Recommended radius: <b>10m – 20m</b>.<br />
                        Updates visual map boundary immediately.
                      </div>
                    </div>
                  </div>

                  {/* Map Placement Helpers Toolbar */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-emerald-400 border-b border-theme-border pb-1">
                      🗺️ Map Markers Placement Tools
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTool("boundary");
                          setIsDrawingBoundary(true);
                        }}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition border ${
                          activeTool === "boundary"
                            ? "bg-emerald-600 text-white border-emerald-500"
                            : "bg-theme-surface hover:bg-theme-surface-hover text-theme-text border-theme-border"
                        }`}
                      >
                        1. Boundary
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTool("dump")}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition border ${
                          activeTool === "dump"
                            ? "bg-amber-600 text-white border-amber-500"
                            : "bg-theme-surface hover:bg-theme-surface-hover text-theme-text border-theme-border"
                        }`}
                      >
                        2. Dump Zone
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTool("entry")}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition border ${
                          activeTool === "entry"
                            ? "bg-emerald-600 text-white border-emerald-500"
                            : "bg-theme-surface hover:bg-theme-surface-hover text-theme-text border-theme-border"
                        }`}
                      >
                        3. Entry Point
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTool("exit")}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition border ${
                          activeTool === "exit"
                            ? "bg-rose-600 text-white border-rose-500"
                            : "bg-theme-surface hover:bg-theme-surface-hover text-theme-text border-theme-border"
                        }`}
                      >
                        4. Exit Point
                      </button>
                    </div>
                  </div>

                  {/* Placed Coordinates Status list */}
                  <div className="border border-theme-border rounded-xl p-3 bg-theme-base/10 text-[11px] space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-theme-text-dim">Main Boundary:</span>
                      <span className={form.geojson ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>
                        {form.geojson ? "✓ Configured" : "✗ Draw Polygon"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-theme-text-dim">Dump Zone:</span>
                      <span className={dumpZone && (dumpZone.latitude !== 0) ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>
                        {dumpZone && (dumpZone.latitude !== 0)
                          ? `✓ (${dumpZone.latitude.toFixed(5)}, ${dumpZone.longitude.toFixed(5)})`
                          : "✗ Click placement tool"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-theme-text-dim">Entry Point:</span>
                      <span className={entryPoint ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>
                        {entryPoint
                          ? `✓ (${entryPoint.latitude.toFixed(5)}, ${entryPoint.longitude.toFixed(5)})`
                          : "✗ Click placement tool"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-theme-text-dim">Exit Point:</span>
                      <span className={exitPoint ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>
                        {exitPoint
                          ? `✓ (${exitPoint.latitude.toFixed(5)}, ${exitPoint.longitude.toFixed(5)})`
                          : "✗ Click placement tool"}
                      </span>
                    </div>
                  </div>

                  {/* Colors and GeoJSON inputs */}
                  <div>
                    <h3 className="text-xs font-bold text-emerald-400 border-b border-theme-border pb-1 mb-3">
                      Styling Options
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <label className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-1.5">
                          Border Color
                        </label>
                        <input
                          type="color"
                          value={form.border_color}
                          onChange={(e) => setForm({ ...form, border_color: e.target.value })}
                          className="h-10 w-full rounded cursor-pointer border border-theme-border bg-theme-surface p-1"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-1.5">
                          Fill Color
                        </label>
                        <input
                          type="color"
                          value={form.fill_color}
                          onChange={(e) => setForm({ ...form, fill_color: e.target.value })}
                          className="h-10 w-full rounded cursor-pointer border border-theme-border bg-theme-surface p-1"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-1.5">
                        GEOJSON <span className="text-red-400">*</span>
                      </label>
                      <textarea
                        placeholder="Boundary GeoJSON"
                        value={form.geojson}
                        onChange={(e) => setForm({ ...form, geojson: e.target.value })}
                        rows={3}
                        className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text placeholder:text-theme-text-dim outline-none focus:border-emerald-500 transition font-mono"
                      />
                    </div>
                    <div className="flex flex-col justify-end">
                      <label className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-1.5">
                        Import File (KML/GEOJSON)
                      </label>
                      <div className="border border-dashed border-emerald-500/50 rounded-xl flex items-center justify-center relative bg-theme-surface h-[72px] hover:bg-theme-surface-hover transition cursor-pointer">
                        <input
                          type="file"
                          accept=".kml,.geojson,.json"
                          onChange={handleFileUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-emerald-400">Click to upload</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-theme-border">
                    <Button onClick={handleSubmit} variant="accent" loading={submitting} loadingText="Submitting...">
                      Submit
                    </Button>
                    <Button onClick={closeForm} variant="outline">
                      Cancel
                    </Button>
                  </div>
                </div>

                {/* Map Area */}
                <div className="h-[400px] lg:h-[520px] border border-theme-border rounded-xl overflow-hidden relative shadow-inner bg-theme-surface">
                  <TransferStationMap
                    boundaryGeoJSON={form.geojson}
                    onChangeBoundary={(val) => setForm((prev) => ({ ...prev, geojson: val }))}
                    dumpZone={dumpZone}
                    onChangeDumpZone={setDumpZone}
                    entryPoint={entryPoint}
                    onChangeEntryPoint={setEntryPoint}
                    exitPoint={exitPoint}
                    onChangeExitPoint={setExitPoint}
                    activeTool={activeTool}
                    setActiveTool={setActiveTool}
                    color={form.fill_color}
                    isDrawingBoundary={isDrawingBoundary}
                    setIsDrawingBoundary={setIsDrawingBoundary}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="flex flex-col h-[600px]">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle>Transfer Stations Directory</CardTitle>
              <CardDescription>Registered transfer station locations.</CardDescription>
            </div>
            <Input
              placeholder="Filter stations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Table
                headers={[
                  <div key="s" className="text-center w-16">S. No.</div>,
                  "Name",
                  "Address",
                  "Validation Points",
                  <div key="a" className="text-right pr-4 w-24">Action</div>,
                ]}
                isLoading={loading}
                emptyState="No transfer stations found."
              >
                {filteredStations.map((station, idx) => {
                  const hasValidation =
                    station.dump_zone_latitude && station.entry_latitude && station.exit_latitude;
                  return (
                    <tr key={station.id} className="hover:bg-theme-base/40 transition-colors group">
                      <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-5 font-semibold text-theme-text">{station.name}</td>
                      <td className="py-3 px-5 text-theme-text-dim text-[12px]">{station.address}</td>
                      <td className="py-3 px-5 text-[11px]">
                        {hasValidation ? (
                          <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/15">
                            Active (Radius: {station.dump_zone_radius}m)
                          </span>
                        ) : (
                          <span className="text-rose-500 font-bold bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/15">
                            Incomplete Configuration
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <EditButton onClick={() => handleEdit(station)} />
                          <DeleteButton
                            onDelete={() => handleDelete(station)}
                            confirmMessage={`Delete ${station.name}?`}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
