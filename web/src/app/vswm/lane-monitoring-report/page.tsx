"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Table from "@/components/shared/Table";

interface Region {
  id: number;
  region_name: string;
  region_type_id: number;
  parent_id?: number | null;
}

interface Shift {
  id: number;
  shift_name: string;
}

interface Route {
  id: number;
  route_name: string;
  ward_id: number;
  shift_id: number;
}

interface LaneReportRow {
  lane_name: string;
  start_time: string | null;
  end_time: string | null;
}

export default function LaneMonitoringReportPage() {
  const [data, setData] = useState<LaneReportRow[]>([]);
  const [zones, setZones] = useState<Region[]>([]);
  const [wards, setWards] = useState<Region[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);

  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);

  // Filters state
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [date, setDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  // Search states for dropdowns
  const [zoneSearch, setZoneSearch] = useState("");
  const [wardSearch, setWardSearch] = useState("");
  const [shiftSearch, setShiftSearch] = useState("");
  const [routeSearch, setRouteSearch] = useState("");

  // Dropdown open states
  const [zoneDropdownOpen, setZoneDropdownOpen] = useState(false);
  const [wardDropdownOpen, setWardDropdownOpen] = useState(false);
  const [shiftDropdownOpen, setShiftDropdownOpen] = useState(false);
  const [routeDropdownOpen, setRouteDropdownOpen] = useState(false);

  // Refs for click outside
  const zoneRef = useRef<HTMLDivElement>(null);
  const wardRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef<HTMLDivElement>(null);
  const routeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (zoneRef.current && !zoneRef.current.contains(e.target as Node)) setZoneDropdownOpen(false);
      if (wardRef.current && !wardRef.current.contains(e.target as Node)) setWardDropdownOpen(false);
      if (shiftRef.current && !shiftRef.current.contains(e.target as Node)) setShiftDropdownOpen(false);
      if (routeRef.current && !routeRef.current.contains(e.target as Node)) setRouteDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadMetaData = async () => {
    setMetaLoading(true);
    try {
      const [regRes, shiftRes, routeRes] = await Promise.all([
        api<Region[]>("/api/regions"),
        api<{ data: Shift[] }>("/api/shifts"),
        api<{ data: Route[] }>("/api/routes")
      ]);

      const allRegions = Array.isArray(regRes) ? regRes : (regRes as any).data || [];
      setZones(allRegions.filter((r: Region) => r.region_type_id === 2));
      setWards(allRegions.filter((r: Region) => r.region_type_id === 3));
      setShifts(shiftRes.data || []);
      setRoutes(routeRes.data || []);
    } catch {
      toast.error("Failed to load filter options.");
    } finally {
      setMetaLoading(false);
    }
  };

  const loadReport = async () => {
    if (!selectedRouteId) {
      toast.warning("Please select a Route to load the report.");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("route_id", String(selectedRouteId));
      if (date) params.append("date", date);

      const res = await api<{ data: LaneReportRow[] }>(`/api/reports/lane-monitoring?${params.toString()}`);
      setData(res.data || []);
      toast.success("Data loaded successfully!");
    } catch {
      toast.error("Failed to load report data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetaData();
  }, []);

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "not arrived";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "not arrived";
    }
  };

  const handleExportCSV = () => {
    if (data.length === 0) {
      toast.warning("No data to export");
      return;
    }
    const headers = ["S. NO.", "LANE(S)", "START TIME", "END TIME"];
    const rows = data.map((row, idx) => [
      idx + 1,
      `"${row.lane_name.replace(/"/g, '""')}"`,
      `"${formatTime(row.start_time)}"`,
      `"${formatTime(row.end_time)}"`
    ]);
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `lane_monitoring_report_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter dropdown options dynamically
  const filteredZones = zones.filter(z => z.region_name.toLowerCase().includes(zoneSearch.toLowerCase()));
  
  const filteredWards = wards
    .filter(w => !selectedZoneId || w.parent_id === selectedZoneId)
    .filter(w => w.region_name.toLowerCase().includes(wardSearch.toLowerCase()));
  
  const filteredShifts = shifts.filter(s => s.shift_name.toLowerCase().includes(shiftSearch.toLowerCase()));

  const filteredRoutes = routes
    .filter(r => !selectedWardId || r.ward_id === selectedWardId)
    .filter(r => !selectedShiftId || r.shift_id === selectedShiftId)
    .filter(r => r.route_name.toLowerCase().includes(routeSearch.toLowerCase()));

  const selectedZoneName = zones.find(z => z.id === selectedZoneId)?.region_name || "Select Zone";
  const selectedWardName = wards.find(w => w.id === selectedWardId)?.region_name || "Select Ward";
  const selectedShiftName = shifts.find(s => s.id === selectedShiftId)?.shift_name || "Select Shift";
  const selectedRouteName = routes.find(r => r.id === selectedRouteId)?.route_name || "Select Route";

  const SearchableDropdown = ({ label, selectedName, isSelected, isOpen, setOpen, search, setSearch, items, onSelect, dropdownRef, keyField, displayField, searchPlaceholder }: any) => {
    return (
      <div className="flex flex-col relative" ref={dropdownRef}>
        <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">{label}</span>
        <div
          className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2 text-xs cursor-pointer flex justify-between items-center hover:border-theme-accent/40 transition min-h-[38px]"
          onClick={() => setOpen(!isOpen)}
        >
          <span className={isSelected ? "text-theme-text font-medium truncate" : "text-theme-text-dim truncate"}>{selectedName}</span>
          <span className="text-theme-text-dim text-[10px] flex-shrink-0 ml-2">{isOpen ? "▲" : "▼"}</span>
        </div>
        {isOpen && (
          <div className="absolute top-[64px] left-0 w-full bg-theme-surface border border-theme-border rounded-lg shadow-xl overflow-hidden z-50">
            <div className="p-2 border-b border-theme-border">
              <input
                type="text"
                placeholder={searchPlaceholder || `Search ${label}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-transparent text-xs text-theme-text outline-none placeholder:text-theme-text-dim"
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {items.length === 0 ? (
                <div className="px-4 py-2 text-xs text-theme-text-dim italic">No options found</div>
              ) : (
                items.map((item: any) => {
                  const id = keyField ? item[keyField] : item;
                  const text = displayField ? item[displayField] : item;
                  return (
                    <div
                      key={id}
                      className="px-4 py-2 text-xs text-theme-text hover:bg-theme-accent/20 hover:text-emerald-400 cursor-pointer transition"
                      onClick={() => onSelect(id)}
                    >
                      {text}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8 print:p-0 print:bg-white print:text-black">
      <PageHeader
        title="Lane Monitoring Report"
        description="Monitor the start and end times of vehicles covering lanes on specific routes."
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "Lane Monitoring Report" }]}
        actions={
          <div className="flex gap-2 print:hidden">
            <Button onClick={() => window.print()} variant="outline">
              PDF
            </Button>
            <Button onClick={handleExportCSV} variant="outline">
              CSV
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8 print:overflow-visible print:pb-0">
        <Card className="relative z-20 !overflow-visible print:hidden">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              <SearchableDropdown
                label="Zone"
                selectedName={selectedZoneName}
                isSelected={!!selectedZoneId}
                isOpen={zoneDropdownOpen}
                setOpen={setZoneDropdownOpen}
                search={zoneSearch}
                setSearch={setZoneSearch}
                items={filteredZones}
                dropdownRef={zoneRef}
                keyField="id"
                displayField="region_name"
                onSelect={(id: number) => {
                  if (selectedZoneId === id) {
                    setSelectedZoneId(null);
                  } else {
                    setSelectedZoneId(id);
                  }
                  setSelectedWardId(null);
                  setSelectedRouteId(null);
                  setZoneDropdownOpen(false);
                  setZoneSearch("");
                }}
              />

              <SearchableDropdown
                label="Ward"
                selectedName={selectedWardName}
                isSelected={!!selectedWardId}
                isOpen={wardDropdownOpen}
                setOpen={setWardDropdownOpen}
                search={wardSearch}
                setSearch={setWardSearch}
                items={filteredWards}
                dropdownRef={wardRef}
                keyField="id"
                displayField="region_name"
                onSelect={(id: number) => {
                  if (selectedWardId === id) {
                    setSelectedWardId(null);
                  } else {
                    setSelectedWardId(id);
                    // Autofill Zone if not selected
                    const w = wards.find(x => x.id === id);
                    if (w && w.parent_id) {
                      setSelectedZoneId(w.parent_id);
                    }
                  }
                  setSelectedRouteId(null);
                  setWardDropdownOpen(false);
                  setWardSearch("");
                }}
              />

              <SearchableDropdown
                label="Shift"
                selectedName={selectedShiftName}
                isSelected={!!selectedShiftId}
                isOpen={shiftDropdownOpen}
                setOpen={setShiftDropdownOpen}
                search={shiftSearch}
                setSearch={setShiftSearch}
                items={filteredShifts}
                dropdownRef={shiftRef}
                keyField="id"
                displayField="shift_name"
                onSelect={(id: number) => {
                  if (selectedShiftId === id) {
                    setSelectedShiftId(null);
                  } else {
                    setSelectedShiftId(id);
                  }
                  setSelectedRouteId(null);
                  setShiftDropdownOpen(false);
                  setShiftSearch("");
                }}
              />

              <SearchableDropdown
                label="Route"
                selectedName={selectedRouteName}
                isSelected={!!selectedRouteId}
                isOpen={routeDropdownOpen}
                setOpen={setRouteDropdownOpen}
                search={routeSearch}
                setSearch={setRouteSearch}
                items={filteredRoutes}
                dropdownRef={routeRef}
                keyField="id"
                displayField="route_name"
                onSelect={(id: number) => {
                  if (selectedRouteId === id) {
                    setSelectedRouteId(null);
                  } else {
                    setSelectedRouteId(id);
                    // Autofill Ward & Shift if not selected
                    const r = routes.find(x => x.id === id);
                    if (r) {
                      if (r.ward_id) {
                        setSelectedWardId(r.ward_id);
                        const w = wards.find(x => x.id === r.ward_id);
                        if (w && w.parent_id) {
                          setSelectedZoneId(w.parent_id);
                        }
                      }
                      if (r.shift_id) {
                        setSelectedShiftId(r.shift_id);
                      }
                    }
                  }
                  setRouteDropdownOpen(false);
                  setRouteSearch("");
                }}
              />

              <div className="flex flex-col md:col-span-1">
                <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2 text-xs text-theme-text placeholder:text-theme-text-dim outline-none hover:border-theme-accent/40 focus:border-theme-accent transition min-h-[38px]"
                />
              </div>
            </div>

            <div className="flex justify-start pt-4 border-t border-theme-border">
              <Button onClick={loadReport} variant="accent" loading={loading} loadingText="Loading...">
                Load
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col min-h-[500px] print:border-none print:shadow-none">
          <CardContent className="p-0 flex-1">
            <Table
              headers={[
                <div key="s" className="text-center w-16">S. NO.</div>,
                "LANE(S)",
                "START TIME",
                "END TIME"
              ]}
              isLoading={loading || metaLoading}
              emptyState="No data to display. Please select a route and click Load."
            >
              {data.map((row, idx) => (
                <tr key={idx} className="hover:bg-theme-base/40 transition-colors border-b border-theme-border/50 print:border-black">
                  <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px] print:text-black">
                    {idx + 1}
                  </td>
                  <td className="py-3 px-5 font-semibold text-theme-text text-[12px] print:text-black">
                    {row.lane_name}
                  </td>
                  <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
                    {formatTime(row.start_time)}
                  </td>
                  <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
                    {formatTime(row.end_time)}
                  </td>
                </tr>
              ))}
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
