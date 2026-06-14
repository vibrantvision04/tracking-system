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
}

interface GeofenceEventRow {
  id: number;
  registration_no: string;
  vehicle_type_name: string;
  zone_name: string;
  ward_name: string;
  entity: string;
  entity_name: string;
  event_type: string;
  event_time: string;
  ward_inside?: string;
  ward_outside?: string;
  zone_inside?: string;
  zone_outside?: string;
}

export default function GeofenceEventReportPage() {
  const [data, setData] = useState<GeofenceEventRow[]>([]);
  const [zones, setZones] = useState<Region[]>([]);
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);

  // Filters state
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [date, setDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  // Search states for dropdowns
  const [zoneSearch, setZoneSearch] = useState("");

  // Dropdown open states
  const [zoneDropdownOpen, setZoneDropdownOpen] = useState(false);

  // Refs for click outside
  const zoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (zoneRef.current && !zoneRef.current.contains(e.target as Node)) setZoneDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadMetaData = async () => {
    setMetaLoading(true);
    try {
      const regRes = await api<Region[]>("/api/regions");
      const allRegions = Array.isArray(regRes) ? regRes : (regRes as any).data || [];
      setZones(allRegions.filter((r: Region) => r.region_type_id === 2));
    } catch {
      toast.error("Failed to load filter options.");
    } finally {
      setMetaLoading(false);
    }
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (date) params.append("date", date);
      if (selectedZoneId) params.append("zone_id", String(selectedZoneId));

      const res = await api<{ data: GeofenceEventRow[] }>(`/api/reports/geofence-event?${params.toString()}`);
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
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "—";
    }
  };

  const handleExportCSV = () => {
    if (data.length === 0) {
      toast.warning("No data to export");
      return;
    }
    const headers = [
      "S. NO.",
      "VEHICLE(S) RTO",
      "VEHICLE TYPE",
      "ZONE",
      "WARD",
      "ENTITY",
      "ENTITY NAME",
      "EVENT TYPE",
      "EVENT TIME",
      "WARD INSIDE",
      "WARD OUTSIDE",
      "ZONE INSIDE",
      "ZONE OUTSIDE"
    ];
    const rows = data.map((row, idx) => [
      idx + 1,
      `"${row.registration_no.replace(/"/g, '""')}"`,
      `"${row.vehicle_type_name.replace(/"/g, '""')}"`,
      `"${row.zone_name.replace(/"/g, '""')}"`,
      `"${row.ward_name.replace(/"/g, '""')}"`,
      `"${row.entity.replace(/"/g, '""')}"`,
      `"${row.entity_name.replace(/"/g, '""')}"`,
      `"${row.event_type.replace(/"/g, '""')}"`,
      `"${formatTime(row.event_time)}"`,
      `"${(row.ward_inside || "").replace(/"/g, '""')}"`,
      `"${(row.ward_outside || "").replace(/"/g, '""')}"`,
      `"${(row.zone_inside || "").replace(/"/g, '""')}"`,
      `"${(row.zone_outside || "").replace(/"/g, '""')}"`
    ]);
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `geofence_event_report_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredZones = zones.filter(z => z.region_name.toLowerCase().includes(zoneSearch.toLowerCase()));
  const selectedZoneName = zones.find(z => z.id === selectedZoneId)?.region_name || "Select Zone";

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
        title="Geofence Event Report"
        description="Track vehicle enter and exit events across geofenced areas like transfer stations, parking lots, and workshops."
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "Geofence Event Report" }]}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
                  setZoneDropdownOpen(false);
                  setZoneSearch("");
                }}
              />

              <div className="flex flex-col">
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
                "VEHICLE(S) RTO",
                "VEHICLE TYPE",
                "ZONE",
                "WARD",
                "ENTITY",
                "ENTITY NAME",
                "EVENT TYPE",
                "EVENT TIME",
                "WARD INSIDE",
                "WARD OUTSIDE",
                "ZONE INSIDE",
                "ZONE OUTSIDE"
              ]}
              isLoading={loading || metaLoading}
              emptyState="No data to display. Select a zone and date, then click Load."
            >
              {data.map((row, idx) => (
                <tr key={row.id} className="hover:bg-theme-base/40 transition-colors border-b border-theme-border/50 print:border-black">
                  <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px] print:text-black">
                    {idx + 1}
                  </td>
                  <td className="py-3 px-5 font-bold text-theme-text text-[12px] print:text-black">
                    {row.registration_no}
                  </td>
                  <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
                    {row.vehicle_type_name}
                  </td>
                  <td className="py-3 px-5 font-semibold text-theme-text text-[12px] print:text-black">
                    {row.zone_name || "—"}
                  </td>
                  <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
                    {row.ward_name || "—"}
                  </td>
                  <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
                    {row.entity}
                  </td>
                  <td className="py-3 px-5 font-semibold text-theme-text text-[12px] print:text-black">
                    {row.entity_name}
                  </td>
                  <td className="py-3 px-5 text-[12px] print:text-black">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      row.event_type === "enter"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                        : "bg-orange-500/15 text-orange-400 border border-orange-500/20"
                    }`}>
                      {row.event_type}
                    </span>
                  </td>
                  <td className="py-3 px-5 text-theme-text font-medium text-[12px] print:text-black">
                    {formatTime(row.event_time)}
                  </td>
                  <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black font-mono">
                    {row.ward_inside || "—"}
                  </td>
                  <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black font-mono">
                    {row.ward_outside || "—"}
                  </td>
                  <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black font-mono">
                    {row.zone_inside || "—"}
                  </td>
                  <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black font-mono">
                    {row.zone_outside || "—"}
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
