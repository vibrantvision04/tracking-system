/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { api, post, put, del } from "@/lib/api";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import TextArea from "@/components/ui/TextArea";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";
import Select from "@/components/ui/Select";
import { useConfirm } from "@/context/ConfirmContext";

const RegionMap = dynamic(() => import("@/components/RegionMap"), { ssr: false });

interface RegionType {
  id: number;
  title: string;
}

interface Region {
  id: number;
  region_name: string;
  region_code: string;
  estimated_population: number;
  region_type_id: number;
  region_type_title: string;
  parent_id: number | null;
  parent_region_name: string;
  geofence_id: number | null;
  geojson?: any;
  color?: string;
  is_active: boolean;
}

export default function RegionManager() {
  const confirm = useConfirm();
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionTypes, setRegionTypes] = useState<RegionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  
  const [form, setForm] = useState({
    region_name: "",
    region_code: "",
    estimated_population: 0,
    region_type_id: "" as string | number,
    parent_id: "" as string | number,
    geojson: "",
    color: "#fba339",
    sub_region_ids: [] as number[],
  });

  const [wardSearch, setWardSearch] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [filterText, setFilterText] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Pagination states removed. Handled by reusable Table component.

  const loadData = async () => {
    try {
      setLoading(true);
      const [regionsRes, typesRes] = await Promise.all([
        api<{ success: boolean; data: Region[] }>("/api/regions"),
        api<{ success: boolean; data: RegionType[] }>("/api/region-types")
      ]);

      if (regionsRes.success && regionsRes.data) {
        setRegions(regionsRes.data);
      }
      if (typesRes.success && typesRes.data) {
        setRegionTypes(typesRes.data);
      }
    } catch (err) {
      console.error("Failed to load regions or types data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddClick = () => {
    setEditingRegion(null);
    setForm({
      region_name: "",
      region_code: "",
      estimated_population: 0,
      region_type_id: "",
      parent_id: "",
      geojson: "",
      color: "#fba339",
      sub_region_ids: [],
    });
    setWardSearch("");
    setFormOpen(true);
    setMessage(null);
    setIsDrawing(false); // Default to split-screen mode
  };

  const handleEditClick = (reg: Region) => {
    setEditingRegion(reg);
    // Find all Wards currently belonging to this Zone
    const currentSubRegionIDs = regions
      .filter((r) => r.region_type_id === 3 && r.parent_id === reg.id)
      .map((r) => r.id);

    setForm({
      region_name: reg.region_name,
      region_code: reg.region_code,
      estimated_population: reg.estimated_population,
      region_type_id: reg.region_type_id,
      parent_id: reg.parent_id !== null ? reg.parent_id : "",
      geojson: reg.geojson ? JSON.stringify(reg.geojson, null, 2) : "",
      color: reg.color || "#fba339",
      sub_region_ids: currentSubRegionIDs,
    });
    setWardSearch("");
    setFormOpen(true);
    setMessage(null);
    setIsDrawing(false); // Default to split-screen mode
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingRegion(null);
    setForm({
      region_name: "",
      region_code: "",
      estimated_population: 0,
      region_type_id: "",
      parent_id: "",
      geojson: "",
      color: "#fba339",
      sub_region_ids: [],
    });
    setWardSearch("");
    setMessage(null);
    setIsDrawing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const typeIdVal = Number(form.region_type_id);
    const parentIdVal = form.parent_id === "" ? null : Number(form.parent_id);
    const populationVal = Number(form.estimated_population);

    let parsedGeoJSON: any = null;
    if (form.geojson && form.geojson.trim() !== "") {
      try {
        parsedGeoJSON = JSON.parse(form.geojson);
      } catch (err) {
        setMessage({ text: "Invalid GEOJSON format. Please check the JSON coordinates structure.", type: "error" });
        setLoading(false);
        return;
      }
    }

    const payload = {
      region_name: form.region_name,
      region_code: form.region_code,
      estimated_population: populationVal,
      region_type_id: typeIdVal,
      parent_id: parentIdVal,
      geojson: parsedGeoJSON,
      color: form.color,
      sub_region_ids: form.sub_region_ids,
    };

    try {
      if (editingRegion) {
        const res: any = await put(`/api/regions/${editingRegion.id}`, payload);
        if (res.success) {
          setMessage({ text: "Region updated successfully!", type: "success" });
          setTimeout(() => handleCloseForm(), 1500);
          loadData();
        } else {
          setMessage({ text: res.error || "Failed to update region", type: "error" });
        }
      } else {
        const res: any = await post("/api/regions", payload);
        if (res.success) {
          setMessage({ text: "Region created successfully!", type: "success" });
          setForm({
            region_name: "",
            region_code: "",
            estimated_population: 0,
            region_type_id: "",
            parent_id: "",
            geojson: "",
            color: "#fba339",
            sub_region_ids: [],
          });
          setTimeout(() => setFormOpen(false), 1500);
          loadData();
        } else {
          setMessage({ text: res.error || "Failed to create region", type: "error" });
        }
      }
    } catch (err: any) {
      setMessage({ text: err.message || "An error occurred", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    const isConfirmed = await confirm({
      title: "Delete Region",
      message: "Are you sure you want to delete this region?",
      variant: "danger"
    });
    if (!isConfirmed) return;
    try {
      const res: any = await del(`/api/regions/${id}`);
      if (res.success) {
        loadData();
      } else {
        alert(res.error || "Failed to delete region");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // ─── File Upload Handler (KML or GeoJSON) ───
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      
      if (file.name.endsWith(".geojson") || file.name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(text);
          setForm((prev) => ({
            ...prev,
            geojson: JSON.stringify(parsed, null, 2),
          }));
        } catch (err) {
          alert("Invalid GeoJSON file structure.");
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
            const lat = parseFloat(lines[i+1]);
            if (!isNaN(lng) && !isNaN(lat)) {
              coordinates.push([lng, lat]);
            }
          }

          if (coordinates.length >= 3) {
            if (coordinates[0][0] !== coordinates[coordinates.length-1][0] || coordinates[0][1] !== coordinates[coordinates.length-1][1]) {
              coordinates.push(coordinates[0]);
            }

            const parsedFeature = {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: { Name: file.name.replace(".kml", "") },
                  geometry: {
                    type: "Polygon",
                    coordinates: [coordinates],
                  },
                },
              ],
            };
            setForm((prev) => ({
              ...prev,
              geojson: JSON.stringify(parsedFeature, null, 2),
            }));
          } else {
            alert("Could not extract enough valid polygon coordinates from KML.");
          }
        } else {
          alert("KML coordinates tags (<coordinates>) not found in the file.");
        }
      } else {
        alert("Unsupported file format. Please upload .geojson, .json, or .kml files.");
      }
    };
    reader.readAsText(file);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFilterText(searchQuery);
  };

  const generateZoneBoundary = async (selectedIds: number[]) => {
    const selectedWards = regions.filter(r => r.region_type_id === 3 && selectedIds.includes(r.id) && r.geojson && r.geojson !== "null");
    if (selectedWards.length === 0) {
      setForm(prev => ({ ...prev, geojson: "" }));
      return;
    }
    try {
      const { feature, featureCollection, union } = await import("@turf/turf");
      const features: any[] = [];
      for (const ward of selectedWards) {
        try {
          const geom = typeof ward.geojson === 'string' ? JSON.parse(ward.geojson) : ward.geojson;
          if (!geom) continue;
          if (geom.type === "FeatureCollection" && geom.features) {
            features.push(...geom.features);
          } else if (geom.type === "Feature") {
            features.push(geom);
          } else if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
            features.push(feature(geom));
          }
        } catch (e) {
          console.warn("Failed to parse geometry for ward", ward.id);
        }
      }
      if (features.length === 0) {
        setForm(prev => ({ ...prev, geojson: "" }));
        return;
      }
      
      let unioned = features[0];
      for (let i = 1; i < features.length; i++) {
        try {
          unioned = union(featureCollection([unioned, features[i]]));
        } catch(e) {
          console.error(`Failed to union ward ${i}:`, e);
        }
      }
      if (unioned) {
        const fc = featureCollection([unioned]);
        setForm(prev => ({ ...prev, geojson: JSON.stringify(fc, null, 2) }));
      }
    } catch(e) {
      console.error("Failed to generate union:", e);
    }
  };

  const renderFormFields = () => (
    <>
      {/* Name */}
      <Input
        label="Name *"
        type="text"
        required
        placeholder="Enter Region Name"
        value={form.region_name}
        onChange={(e) => setForm({ ...form, region_name: e.target.value })}
      />

      {/* Code */}
      <Input
        label="Code"
        type="text"
        placeholder="Enter Region Code"
        value={form.region_code}
        onChange={(e) => setForm({ ...form, region_code: e.target.value })}
      />

      {/* Region Type */}
      <Select
        label="Region Type"
        required
        value={form.region_type_id}
        onChange={(e) => setForm({ ...form, region_type_id: e.target.value })}
      >
        <option value="">Select</option>
        {regionTypes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </Select>

      {/* Parent Region */}
      <Select
        label="Parent Region"
        value={form.parent_id}
        onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
      >
        <option value="">Select</option>
        {regions
          .filter((r) => !editingRegion || r.id !== editingRegion.id)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.region_name}
            </option>
          ))}
      </Select>

      {/* Wards Assignment Multi-Select for Zones */}
      {Number(form.region_type_id) === 2 && (
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="flex justify-between items-end">
            <label className="text-[9px] font-black text-theme-text-dim uppercase tracking-wider block">
              Wards Assignment ({form.sub_region_ids.length} Selected)
            </label>
          </div>
          <div className="bg-theme-surface border border-theme-border rounded-xl p-3 space-y-2 shadow-inner">
            <Input
              type="text"
              placeholder="Filter Wards..."
              value={wardSearch}
              onChange={(e) => setWardSearch(e.target.value)}
            />
            <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1 pr-1">
              {regions
                .filter((r) => r.region_type_id === 3)
                .filter((r) => r.region_name.toLowerCase().includes(wardSearch.toLowerCase()))
                .map((w) => {
                  const isChecked = form.sub_region_ids.includes(w.id);
                  return (
                    <label key={w.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-200 cursor-pointer select-none transition text-xs font-semibold text-theme-text">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const newSubRegionIds = e.target.checked 
                            ? [...form.sub_region_ids, w.id] 
                            : form.sub_region_ids.filter((id) => id !== w.id);
                          
                          setForm((prev) => ({
                            ...prev,
                            sub_region_ids: newSubRegionIds,
                          }));
                          generateZoneBoundary(newSubRegionIds);
                        }}
                        className="rounded border-slate-350 text-emerald-650 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                      />
                      <span>{w.region_name}</span>
                    </label>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Estimated Population */}
      <Input
        label="Est. Population *"
        type="number"
        required
        min="0"
        placeholder="Enter est. population"
        value={form.estimated_population || ""}
        onChange={(e) => setForm({ ...form, estimated_population: Number(e.target.value) })}
      />

      {/* Color Selector */}
      <div className="space-y-1.5 w-full">
        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1 leading-none select-none">
          Border / Fill Color
        </label>
        <div className="flex gap-2">
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="w-12 h-[38px] p-0.5 bg-theme-surface border border-theme-border rounded-[12px] cursor-pointer"
          />
          <input
            type="text"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="flex-1 bg-theme-surface border border-theme-border rounded-[12px] px-3 py-2 text-xs text-theme-text outline-none focus:bg-theme-surface focus:ring-2 focus:ring-[#10B981]/30 transition-all font-mono font-semibold"
          />
        </div>
      </div>

      {/* Set Geometry divider */}
      <div className="pt-2 border-t border-slate-100 space-y-3">
        <span className="text-[10px] font-black text-theme-accent uppercase tracking-wider block">
          Set Geometry
        </span>

        {/* GeoJSON box */}
        <TextArea
          label="GEOJSON / KML *"
          placeholder="Enter JSON coordinates"
          rows={3}
          value={form.geojson}
          onChange={(e) => setForm({ ...form, geojson: e.target.value })}
        />

        {/* Drag & drop upload */}
        <div className="space-y-1">
          <label className="text-[9px] font-black text-theme-text-dim uppercase tracking-wider block">
            Upload File
          </label>
          <div className="border border-dashed border-theme-border rounded-xl flex items-center justify-center p-3.5 hover:border-emerald-400 cursor-pointer bg-theme-surface/50 hover:bg-theme-surface transition-all relative">
            <input
              type="file"
              accept=".geojson,.json,.kml"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <svg className="w-5 h-5 text-theme-text-dim mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-[10px] font-bold text-theme-text-dim">
              Click to upload (GEOJSON / KML)
            </span>
          </div>
        </div>
      </div>
    </>
  );

  const filteredRegions = regions.filter((reg) => {
    const term = filterText.toLowerCase();
    return (
      reg.region_name.toLowerCase().includes(term) ||
      reg.region_code.toLowerCase().includes(term) ||
      reg.region_type_title.toLowerCase().includes(term) ||
      reg.parent_region_name.toLowerCase().includes(term)
    );
  });

  // Pagination endpoints sliced. Handled inside Table.
  const startIndex = 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden relative select-none font-sans">
      {formOpen && isDrawing ? (
        /* ─── CASE A.1: Full-Screen Interactive Editing Map Layout (Drawing Active) ─── */
        <div className="flex-1 w-full h-full relative overflow-hidden flex flex-col">
          {/* Header over map */}
          <header className="h-14 bg-theme-surface/90 backdrop-blur-md px-6 flex items-center justify-between border-b border-theme-border shrink-0 shadow-sm z-[11]">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-theme-accent text-white font-bold text-[11px] shrink-0 flex items-center justify-center">
                JN
              </div>
              <h1 className="text-xs font-black text-theme-text uppercase tracking-wider leading-none">
                {editingRegion ? "Full-Screen Editor — Nagar Nigam Jaipur" : "Drawing Workspace — Nagar Nigam Jaipur"}
              </h1>
            </div>
            <div className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider bg-slate-100 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              GIS Canvas Active
            </div>
          </header>

          {/* Full Screen Map container */}
          <div className="flex-grow w-full h-full z-0 relative">
            <RegionMap
              geoJSON={form.geojson}
              color={form.color}
              onChangeGeoJSON={(val) => setForm((prev) => ({ ...prev, geojson: val }))}
              regions={regions}
              isDrawing={isDrawing}
              setIsDrawing={setIsDrawing}
              editingRegionId={editingRegion?.id}
            />
          </div>
        </div>
      ) : (
        /* ─── CASES WITH STANDARD HEADER ─── */
        <div className="flex-grow overflow-y-auto p-6 lg:p-8 custom-scrollbar space-y-6 flex flex-col h-full">
          {formOpen ? (
            /* ─── CASE A.2: Split-Screen Form (Form Card Left, Map Card Right) ─── */
            <div className="w-full space-y-6 flex-grow flex flex-col">
              <PageHeader
                title={editingRegion ? "Edit Region" : "Create Region"}
                description="Define name, parent hierarchy, population, and draw the region coordinates."
                breadcrumbs={[
                  { label: "Regions & Wards", href: "/zones" },
                  { label: editingRegion ? "Edit" : "New" }
                ]}
                actions={
                  <Button onClick={handleCloseForm} variant="secondary" size="sm">
                    Back to List
                  </Button>
                }
              />

              {/* Side-by-Side split content */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch flex-grow">
                {/* Form Card (Left) */}
                <Card className="flex flex-col justify-between h-full">
                  <CardHeader>
                    <CardTitle>Region Details</CardTitle>
                    <CardDescription>Enter demographic information and configure geo boundaries.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-grow flex flex-col justify-between space-y-6">
                    <div>
                      {message && (
                        <div
                          className={`p-3 rounded-[12px] mb-4 text-xs font-bold ${
                            message.type === "success"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : "bg-red-50 text-red-700 border border-red-100"
                          }`}
                        >
                          {message.text}
                        </div>
                      )}

                      <form onSubmit={handleSubmit} className="space-y-4">
                        {renderFormFields()}
                      </form>
                    </div>

                    {/* Submissions Row */}
                    <div className="flex gap-2.5 pt-4 border-t border-slate-100">
                      <Button
                        type="button"
                        loading={loading}
                        loadingText="Submitting..."
                        onClick={handleSubmit}
                        className="flex-1 font-bold text-xs"
                      >
                        Submit
                      </Button>
                      <Button
                        type="button"
                        onClick={handleCloseForm}
                        variant="secondary"
                        className="font-bold text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Map Card (Right) */}
                <Card className="p-2 flex flex-col relative min-h-[500px] h-full">
                  <div className="flex-1 w-full h-full rounded-[12px] overflow-hidden relative">
                    <RegionMap
                      geoJSON={form.geojson}
                      color={form.color}
                      onChangeGeoJSON={(val) => setForm((prev) => ({ ...prev, geojson: val }))}
                      regions={regions}
                      isDrawing={isDrawing}
                      setIsDrawing={setIsDrawing}
                      editingRegionId={editingRegion?.id}
                    />
                  </div>
                </Card>
              </div>
            </div>
          ) : (
            /* ─── CASE B: Table List ─── */
            <div className="w-full space-y-6 flex-grow flex flex-col">
              <PageHeader
                title="Region & Ward Boundaries"
                description="Manage administrative levels (Zones, Wards, Sectors) and map their geographic coordinates."
                breadcrumbs={[
                  { label: "Settings" },
                  { label: "Regions & Wards" }
                ]}
                actions={
                  <Button onClick={handleAddClick} size="sm">
                    + Add Region
                  </Button>
                }
              />

              {/* Table listing */}
              <Card className="flex flex-col p-4 flex-grow">
                <div className="flex justify-end mb-4">
                  <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full md:w-80 select-none">
                    <Input
                      type="text"
                      placeholder="Type to filter..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <Button
                      type="submit"
                      variant="secondary"
                      className="shrink-0 font-bold text-xs"
                    >
                      Search
                    </Button>
                  </form>
                </div>

                <Table
                  headers={["S. No.", "Name", "Code", "Region Type", "Parent Region", "Fill Color", "Action"]}
                  emptyState="No regions configured."
                >
                  {filteredRegions.map((reg, index) => (
                    <tr key={reg.id} className="hover:bg-theme-surface-hover/50 transition-colors">
                      <td className="py-3 px-4 font-mono text-theme-text-dim text-xs">{index + 1}</td>
                      <td className="py-3 px-4 text-theme-text font-bold text-xs">{reg.region_name}</td>
                      <td className="py-3 px-4 text-xs font-semibold text-slate-500">{reg.region_code || <span className="text-theme-text-dim">—</span>}</td>
                      <td className="py-3 px-4 text-xs">
                        <span className="px-2 py-0.5 rounded-full text-[9px] bg-slate-100 border border-slate-200 text-slate-650 font-black uppercase tracking-wider">
                          {reg.region_type_title}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-theme-text-dim text-xs font-semibold">
                        {reg.parent_region_name || <span className="text-slate-300 font-normal">—</span>}
                      </td>
                      <td className="py-3 px-4 text-center text-xs">
                        <div className="inline-flex items-center gap-1.5">
                          <span
                            className="w-3.5 h-3.5 rounded border border-theme-border shadow-sm"
                            style={{ backgroundColor: reg.color || "#fba339" }}
                          />
                          <span className="text-[10px] font-mono text-theme-text-dim uppercase">
                            {reg.color || "#fba339"}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex gap-2">
                          <EditButton
                            onClick={() => handleEditClick(reg)}
                            title="Edit Region on Map"
                          />
                          <DeleteButton
                            onDelete={() => handleDelete(reg.id)}
                            confirmMessage="Are you sure you want to delete this region?"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </Table>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
