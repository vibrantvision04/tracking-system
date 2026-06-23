"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { API_URL } from "@/lib/api";
import { toast } from "react-toastify";
import {
  Map,
  Briefcase,
  Plus,
  Search,
  Trash2,
  X,
  ChevronDown,
  Layers,
  LayoutGrid,
  List,
  Filter,
  RefreshCw,
  FolderLock
} from "lucide-react";

import PageHeader from "@/components/shared/PageHeader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import Table from "@/components/shared/Table";
import StatCard from "@/components/shared/StatCard";

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface RegionTypeOption {
  id: number;
  name: string;
}

interface DesignationOption {
  id: number;
  name: string;
}

interface RegionTypeDesignationMapping {
  id: number;
  region_type_id: number;
  region_type_name: string;
  designation_id: number;
  designation_name: string;
  created_at: string;
}

// ─── Searchable Dropdown Options ──────────────────────────────────────────────

interface DropdownItem {
  id: number;
  label: string;
  sublabel?: string;
}

interface SearchableDropdownProps {
  label: string;
  required?: boolean;
  placeholder?: string;
  options: DropdownItem[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  icon?: React.ReactNode;
}

function SearchableDropdown({
  label,
  required,
  placeholder = "Select…",
  options,
  selectedId,
  onSelect,
  icon,
}: SearchableDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.id === selectedId);
  const filtered = options.filter(
    (o) =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      (o.sublabel && o.sublabel.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div ref={ref} className="flex flex-col gap-1.5 text-left">
      <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
        {icon && <span className="text-theme-accent">{icon}</span>}
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      <div
        onClick={() => setOpen((o) => !o)}
        className={`relative bg-theme-surface border rounded-xl px-3.5 py-2.5 text-xs cursor-pointer flex items-center justify-between transition-all duration-150 ${
          open
            ? "border-theme-accent ring-2 ring-theme-accent/10"
            : "border-theme-border hover:border-theme-accent/40"
        }`}
      >
        <span
          className={
            selected
              ? "text-theme-text font-medium truncate"
              : "text-theme-text-dim truncate"
          }
        >
          {selected ? selected.label : placeholder}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {selected && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(null);
              }}
              className="text-theme-text-dim hover:text-rose-400 transition"
            >
              <X size={12} />
            </button>
          )}
          <ChevronDown
            size={14}
            className={`text-theme-text-dim transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>

        {open && (
          <div
            className="absolute left-0 top-[calc(100%+6px)] w-full bg-theme-surface border border-theme-border rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-theme-border">
              <input
                type="text"
                autoFocus
                placeholder={`Search ${label}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-xs text-theme-text placeholder:text-theme-text-dim outline-none"
              />
            </div>
            <div className="max-h-52 overflow-y-auto custom-scrollbar">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-xs text-theme-text-dim italic text-center">
                  No options found
                </div>
              ) : (
                filtered.map((opt) => (
                  <div
                    key={opt.id}
                    onClick={() => {
                      onSelect(opt.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={`px-4 py-2 cursor-pointer text-xs transition-colors text-left ${
                      opt.id === selectedId
                        ? "bg-theme-accent/10 text-theme-accent font-semibold"
                        : "text-theme-text hover:bg-theme-base"
                    }`}
                  >
                    <div className="font-medium pt-1">{opt.label}</div>
                    {opt.sublabel && (
                      <div className="text-[10px] text-theme-text-dim pb-1">
                        {opt.sublabel}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dummy Fallback Data ──────────────────────────────────────────────────────

const DUMMY_REGION_TYPES: RegionTypeOption[] = [
  { id: 1, name: "Zone" },
  { id: 2, name: "Ward" },
  { id: 3, name: "City" },
  { id: 4, name: "Sector" },
];

const DUMMY_DESIGNATIONS: DesignationOption[] = [
  { id: 101, name: "Admin" },
  { id: 102, name: "Deputy Commissioner" },
  { id: 103, name: "HO" },
  { id: 104, name: "NGO Zone Head" },
  { id: 105, name: "Daroga" },
  { id: 106, name: "Driver" },
  { id: 107, name: "CSI" },
  { id: 108, name: "Supervisor" },
  { id: 109, name: "Helper" },
  { id: 110, name: "Commissioner" },
];

const DUMMY_MAPPINGS: RegionTypeDesignationMapping[] = [
  { id: 1, region_type_id: 1, region_type_name: "Zone", designation_id: 101, designation_name: "Admin", created_at: "2026-06-24 10:00:00" },
  { id: 2, region_type_id: 1, region_type_name: "Zone", designation_id: 102, designation_name: "Deputy Commissioner", created_at: "2026-06-24 10:05:00" },
  { id: 3, region_type_id: 1, region_type_name: "Zone", designation_id: 103, designation_name: "HO", created_at: "2026-06-24 10:10:00" },
  { id: 4, region_type_id: 1, region_type_name: "Zone", designation_id: 104, designation_name: "NGO Zone Head", created_at: "2026-06-24 10:15:00" },
  { id: 5, region_type_id: 2, region_type_name: "Ward", designation_id: 105, designation_name: "Daroga", created_at: "2026-06-24 10:20:00" },
  { id: 6, region_type_id: 2, region_type_name: "Ward", designation_id: 106, designation_name: "Driver", created_at: "2026-06-24 10:25:00" },
  { id: 7, region_type_id: 2, region_type_name: "Ward", designation_id: 108, designation_name: "Supervisor", created_at: "2026-06-24 10:30:00" },
  { id: 8, region_type_id: 3, region_type_name: "City", designation_id: 110, designation_name: "Commissioner", created_at: "2026-06-24 10:35:00" },
];

export default function RegionTypeDesignationPage() {
  const [mappings, setMappings] = useState<RegionTypeDesignationMapping[]>([]);
  const [regionTypes, setRegionTypes] = useState<RegionTypeOption[]>([]);
  const [designations, setDesignations] = useState<DesignationOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Layout View Modes: "board" (Grouped by Region Type cards) or "table" (Standard Flat Search list)
  const [viewMode, setViewMode] = useState<"board" | "table">("board");

  // Form State
  const [selectedRegionTypeId, setSelectedRegionTypeId] = useState<number | null>(null);
  const [selectedDesigId, setSelectedDesigId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilterRegionType, setSelectedFilterRegionType] = useState<string>("All");

  // ─── Data Loading ─────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      let regionTypeData: RegionTypeOption[] = [];
      let desigData: DesignationOption[] = [];
      let mappingData: RegionTypeDesignationMapping[] = [];

      // Fetch Region Types
      try {
        const response = await fetch(`${API_URL}/api/region-types`);
        if (response.ok) {
          const res = await response.json();
          const rawRegionTypes = res.data || [];
          regionTypeData = rawRegionTypes.map((r: any) => ({
            id: r.id,
            name: r.title || r.name || "Unknown",
          }));
        } else {
          regionTypeData = DUMMY_REGION_TYPES;
        }
      } catch {
        regionTypeData = DUMMY_REGION_TYPES;
      }

      // Fetch Designations
      try {
        const response = await fetch(`${API_URL}/api/designations`);
        if (response.ok) {
          const res = await response.json();
          desigData = res.data || [];
        } else {
          desigData = DUMMY_DESIGNATIONS;
        }
      } catch {
        desigData = DUMMY_DESIGNATIONS;
      }

      // Fetch Mappings
      try {
        const response = await fetch(`${API_URL}/api/region-type-designations`);
        if (response.ok) {
          const res = await response.json();
          mappingData = res.data || [];
        } else {
          const local = localStorage.getItem("vswm_regiontype_desig_mappings");
          if (local) {
            mappingData = JSON.parse(local);
          } else {
            mappingData = DUMMY_MAPPINGS;
          }
        }
      } catch {
        const local = localStorage.getItem("vswm_regiontype_desig_mappings");
        if (local) {
          mappingData = JSON.parse(local);
        } else {
          mappingData = DUMMY_MAPPINGS;
        }
      }

      setRegionTypes(regionTypeData);
      setDesignations(desigData);
      setMappings(mappingData);
    } catch (err) {
      console.error("Failed to load page data", err);
      setRegionTypes(DUMMY_REGION_TYPES);
      setDesignations(DUMMY_DESIGNATIONS);
      setMappings(DUMMY_MAPPINGS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRegionTypeId || !selectedDesigId) {
      toast.warning("Please select both Region Type and Designation.");
      return;
    }

    const regType = regionTypes.find((r) => r.id === selectedRegionTypeId);
    const desig = designations.find((d) => d.id === selectedDesigId);

    if (!regType || !desig) return;

    // Check if mapping already exists
    const duplicate = mappings.some(
      (m) => m.region_type_id === selectedRegionTypeId && m.designation_id === selectedDesigId
    );
    if (duplicate) {
      toast.error(`${desig.name} is already assigned to Region Type "${regType.name}".`);
      return;
    }

    setSubmitting(true);

    const newMapping: RegionTypeDesignationMapping = {
      id: Date.now(),
      region_type_id: selectedRegionTypeId,
      region_type_name: regType.name,
      designation_id: selectedDesigId,
      designation_name: desig.name,
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19),
    };

    try {
      const response = await fetch(`${API_URL}/api/region-type-designations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region_type_id: selectedRegionTypeId,
          designation_id: selectedDesigId,
        }),
      });

      if (response.ok) {
        toast.success("Designation assigned successfully.");
        setSelectedRegionTypeId(null);
        setSelectedDesigId(null);
        loadData();
      } else {
        throw new Error("API error");
      }
    } catch {
      // Local Fallback with LocalStorage
      const updated = [newMapping, ...mappings];
      setMappings(updated);
      localStorage.setItem("vswm_regiontype_desig_mappings", JSON.stringify(updated));
      toast.success("Designation assigned successfully (Local Mode).");
      setSelectedRegionTypeId(null);
      setSelectedDesigId(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/api/region-type-designations/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        toast.success("Mapping deleted.");
        loadData();
      } else {
        throw new Error("API Error");
      }
    } catch {
      const updated = mappings.filter((m) => m.id !== id);
      setMappings(updated);
      localStorage.setItem("vswm_regiontype_desig_mappings", JSON.stringify(updated));
      toast.success("Mapping deleted (Local Mode).");
    }
  };

  // ─── Filter & Grouping Computations ───────────────────────────────────────

  const filteredMappings = useMemo(() => {
    return mappings.filter((m) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        m.region_type_name.toLowerCase().includes(q) ||
        m.designation_name.toLowerCase().includes(q);

      const matchRegType = selectedFilterRegionType === "All" || m.region_type_name === selectedFilterRegionType;

      return matchSearch && matchRegType;
    });
  }, [mappings, searchQuery, selectedFilterRegionType]);

  // Group mappings by Region Type name
  const groupedBoards = useMemo(() => {
    const groups: Record<string, { id: number; items: RegionTypeDesignationMapping[] }> = {};
    
    // Core types listed first
    regionTypes.forEach((rt) => {
      groups[rt.name] = { id: rt.id, items: [] };
    });

    // Populate with mappings
    filteredMappings.forEach((m) => {
      if (!groups[m.region_type_name]) {
        groups[m.region_type_name] = { id: m.region_type_id, items: [] };
      }
      groups[m.region_type_name].items.push(m);
    });

    return groups;
  }, [regionTypes, filteredMappings]);

  // Options lists
  const regTypeDropdownOptions = useMemo(() => {
    return regionTypes.map((r) => ({
      id: r.id,
      label: r.name,
    }));
  }, [regionTypes]);

  const desigDropdownOptions = useMemo(() => {
    return designations.map((d) => ({
      id: d.id,
      label: d.name,
    }));
  }, [designations]);

  // Summary Metrics
  const uniqueTypesCount = useMemo(() => {
    return new Set(mappings.map((m) => m.region_type_name)).size;
  }, [mappings]);

  const uniqueDesigsCount = useMemo(() => {
    return new Set(mappings.map((m) => m.designation_name)).size;
  }, [mappings]);

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
      
      {/* Page Header */}
      <PageHeader
        title="Region Type to Designation"
        description="Establish and manage associations between region categories (Zone, Ward, City) and workforce designations."
        breadcrumbs={[
          { label: "VSWM", href: "/vswm/shift" },
          { label: "HR / Staff", href: "/vswm/employee" },
          { label: "Region Type to Designation" },
        ]}
      />

      {/* Metrics Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 shrink-0">
        <StatCard
          title="Total Mappings"
          value={mappings.length}
          icon={<Layers size={18} className="text-[#10B981]" />}
          description="Total active mapping links"
        />
        <StatCard
          title="Mapped Region Types"
          value={uniqueTypesCount}
          icon={<Map size={18} className="text-blue-500" />}
          description="Active region categories mapped"
        />
        <StatCard
          title="Mapped Designations"
          value={uniqueDesigsCount}
          icon={<Briefcase size={18} className="text-purple-500" />}
          description="Distinct employee roles mapped"
        />
      </div>

      {/* Workspace Area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-5 overflow-hidden">
        
        {/* Left Side: Mapping Listings / Workspace Grid */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <Card className="flex flex-col h-full shadow-sm overflow-hidden border border-theme-border bg-theme-surface">
            
            {/* Toolbar Header */}
            <CardHeader className="py-4 border-b border-theme-border bg-theme-base/20 flex flex-col md:flex-row items-center justify-between gap-3 shrink-0">
              <div className="text-left w-full md:w-auto">
                <CardTitle className="text-xs uppercase tracking-wider text-theme-text">
                  Region Type & Role Assignments
                </CardTitle>
                <CardDescription className="text-[10px] text-theme-text-dim mt-0.5">
                  Browse, filter, and audit region classification job structures.
                </CardDescription>
              </div>

              {/* Toolbar Controls */}
              <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                {/* Search Input */}
                <div className="relative w-full md:w-48 lg:w-56 shrink-0">
                  <input
                    type="text"
                    placeholder="Search roles..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-theme-surface border border-theme-border rounded-xl pl-8 pr-4 py-1.5 text-xs text-theme-text placeholder:text-theme-text-dim outline-none focus:border-[#10B981] transition animate-fade-in"
                  />
                  <Search size={12} className="absolute left-3 top-2.5 text-theme-text-dim" />
                </div>

                {/* Filter Dropdown */}
                <div className="relative">
                  <select
                    value={selectedFilterRegionType}
                    onChange={(e) => setSelectedFilterRegionType(e.target.value)}
                    className="bg-theme-surface border border-theme-border rounded-xl px-3 py-1.5 text-xs text-theme-text font-bold outline-none cursor-pointer hover:border-theme-accent/40"
                  >
                    <option value="All">All Regions</option>
                    {regionTypes.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Layout View Toggle */}
                <div className="flex items-center border border-theme-border rounded-xl p-0.5 bg-theme-surface/60 shadow-inner">
                  <button
                    onClick={() => setViewMode("board")}
                    className={`p-1.5 rounded-lg transition ${
                      viewMode === "board"
                        ? "bg-[#10B981] text-white"
                        : "text-theme-text-dim hover:text-theme-text"
                    }`}
                    title="Grouped Board View"
                  >
                    <LayoutGrid size={13} />
                  </button>
                  <button
                    onClick={() => setViewMode("table")}
                    className={`p-1.5 rounded-lg transition ${
                      viewMode === "table"
                        ? "bg-[#10B981] text-white"
                        : "text-theme-text-dim hover:text-theme-text"
                    }`}
                    title="Flat List Table View"
                  >
                    <List size={13} />
                  </button>
                </div>
              </div>
            </CardHeader>

            {/* Content Container */}
            <CardContent className="p-0 flex-1 overflow-hidden bg-theme-base/5">
              <div className="h-full overflow-y-auto custom-scrollbar p-4">
                
                {loading ? (
                  <div className="h-full flex items-center justify-center text-xs text-theme-text-dim animate-pulse">
                    Loading region category mappings…
                  </div>
                ) : mappings.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-20 text-center">
                    <FolderLock className="h-10 w-10 text-theme-text-dim opacity-30 mb-3" />
                    <div className="text-xs font-bold text-theme-text uppercase tracking-wide">
                      No Mappings Configured
                    </div>
                    <div className="text-[10px] text-theme-text-dim mt-1">
                      Configure region type to designation mappings in the panel on the right.
                    </div>
                  </div>
                ) : viewMode === "board" ? (
                  
                  /* BOARD VIEW: Modern grid grouped by region category */
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {Object.entries(groupedBoards).map(([regTypeName, group]) => {
                      if (selectedFilterRegionType !== "All" && regTypeName !== selectedFilterRegionType) return null;
                      return (
                        <div
                          key={regTypeName}
                          className="border border-theme-border bg-theme-surface rounded-2xl p-4 flex flex-col gap-3 shadow-sm hover:border-[#10B981]/30 transition group duration-200"
                        >
                          {/* Board Header */}
                          <div className="flex items-center justify-between pb-2 border-b border-theme-border/60">
                            <div className="flex items-center gap-2 text-left">
                              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 font-bold text-xs shrink-0 shadow-sm">
                                <Map size={13} />
                              </div>
                              <div>
                                <h4 className="text-xs font-black uppercase text-theme-text tracking-wide">
                                  {regTypeName}
                                </h4>
                                <p className="text-[9px] text-theme-text-dim">
                                  {group.items.length} Job Role{group.items.length === 1 ? "" : "s"}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedRegionTypeId(group.id)}
                              className="w-6 h-6 rounded-lg bg-theme-base border border-theme-border hover:border-[#10B981] hover:text-[#10B981] flex items-center justify-center text-theme-text-dim transition cursor-pointer"
                              title="Assign role to this region type"
                            >
                              <Plus size={11} />
                            </button>
                          </div>

                          {/* Board Designations List */}
                          <div className="flex-1 space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1 min-h-[60px]">
                            {group.items.length === 0 ? (
                              <div className="h-full flex items-center justify-center text-[10px] text-theme-text-dim italic py-6">
                                No job roles mapped
                              </div>
                            ) : (
                              group.items.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between p-2 rounded-xl bg-theme-base/40 hover:bg-theme-base/75 border border-theme-border/40 hover:border-theme-border transition duration-150 text-left"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Briefcase size={11} className="text-[#10B981] shrink-0" />
                                    <span className="text-xs font-semibold text-theme-text truncate leading-none">
                                      {item.designation_name}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(item.id)}
                                    className="text-theme-text-dim hover:text-rose-500 hover:bg-rose-50 p-1 rounded-lg transition shrink-0 ml-2"
                                    title={`Remove ${item.designation_name} from ${regTypeName}`}
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  
                  /* TABLE VIEW: Flat search list with table headers */
                  <div className="border border-theme-border rounded-2xl overflow-hidden bg-theme-surface shadow-sm">
                    <Table
                      headers={[
                        <div key="s" className="text-center w-12">S. No.</div>,
                        "REGION TYPE",
                        "DESIGNATION",
                        "DATE ADDED",
                        <div key="a" className="text-right pr-6 w-20">ACTION</div>,
                      ]}
                      isLoading={loading}
                      emptyState="No region-category-to-designation mappings matched your criteria."
                    >
                      {filteredMappings.map((item, idx) => (
                        <tr
                          key={item.id}
                          className="hover:bg-theme-base/30 transition-colors"
                        >
                          <td className="py-3 px-4 text-center text-theme-text-dim font-mono text-[10px]">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4 text-left">
                            <div className="font-bold text-theme-text text-xs flex items-center gap-1.5">
                              <Map size={11} className="text-blue-500" />
                              {item.region_type_name}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-left">
                            <div className="font-bold text-theme-text text-xs flex items-center gap-1.5">
                              <Briefcase size={11} className="text-[#10B981]" />
                              {item.designation_name}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-theme-text-dim font-mono">
                            {item.created_at}
                          </td>
                          <td className="py-3 px-4 text-right pr-6">
                            <DeleteButton
                              onDelete={() => handleDelete(item.id)}
                              confirmMessage={`Delete mapping for ${item.designation_name} in region category ${item.region_type_name}?`}
                            />
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                )}

              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Sleek Assignment Action Panel */}
        <div className="w-full lg:w-[380px] shrink-0">
          <Card className="flex flex-col h-full overflow-hidden shadow-sm border border-theme-border bg-theme-surface">
            
            {/* Card Header */}
            <CardHeader className="py-4 shrink-0 border-b border-theme-border bg-theme-base/20">
              <CardTitle className="text-xs uppercase tracking-wider text-theme-text flex items-center gap-2">
                <Plus size={14} className="text-[#10B981]" />
                Assign Region Category Role
              </CardTitle>
              <CardDescription className="text-[10px] text-theme-text-dim mt-0.5">
                Map a workforce designation role to a region category.
              </CardDescription>
            </CardHeader>

            {/* Card Form Content */}
            <CardContent className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6 text-left">
              <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* Select Region Type */}
                <SearchableDropdown
                  label="Region Type"
                  required
                  placeholder="Select region category…"
                  options={regTypeDropdownOptions}
                  selectedId={selectedRegionTypeId}
                  onSelect={setSelectedRegionTypeId}
                  icon={<Map size={12} />}
                />

                {/* Select Designation */}
                <SearchableDropdown
                  label="Designation"
                  required
                  placeholder="Select workforce role…"
                  options={desigDropdownOptions}
                  selectedId={selectedDesigId}
                  onSelect={setSelectedDesigId}
                  icon={<Briefcase size={12} />}
                />

                {/* Helper Guidelines Card */}
                <div className="bg-theme-base/40 border border-theme-border rounded-xl p-3.5 space-y-2 text-[10px] text-theme-text-dim text-left select-none leading-relaxed">
                  <h5 className="font-bold text-theme-text uppercase tracking-wider flex items-center gap-1.5">
                    <Layers size={10} className="text-[#10B981]" />
                    Mapping Rules
                  </h5>
                  <ul className="list-disc list-inside space-y-1">
                    <li>One designation can be mapped to multiple region levels (e.g. Zone and Ward).</li>
                    <li>Designations are required to link staff in employee roster.</li>
                    <li>Deleting a mapping does not delete the core region category or designation record.</li>
                  </ul>
                </div>

                {/* Submit Buttons */}
                <div className="pt-4 border-t border-theme-border flex items-center justify-end gap-3">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => {
                      setSelectedRegionTypeId(null);
                      setSelectedDesigId(null);
                    }}
                  >
                    Reset
                  </Button>
                  <Button
                    variant="accent"
                    type="submit"
                    loading={submitting}
                    loadingText="Assigning…"
                  >
                    Assign Role
                  </Button>
                </div>

              </form>
            </CardContent>

          </Card>
        </div>

      </div>
    </div>
  );
}
