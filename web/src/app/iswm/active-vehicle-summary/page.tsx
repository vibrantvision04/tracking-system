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

interface VehicleType {
  id: number;
  name: string;
}

interface ActiveVehicleSummaryRow {
  zone_id: number;
  zone_name: string;
  total_vehicles: number;
  active_vehicles: number;
  inactive_vehicles: number;
}

export default function ActiveVehicleSummaryReportPage() {
  const [data, setData] = useState<ActiveVehicleSummaryRow[]>([]);
  const [zones, setZones] = useState<Region[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);

  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);

  // Filters state
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedVehicleTypeId, setSelectedVehicleTypeId] = useState<number | null>(null);

  // Search states for dropdowns
  const [zoneSearch, setZoneSearch] = useState("");
  const [vehicleTypeSearch, setVehicleTypeSearch] = useState("");

  // Dropdown open states
  const [zoneDropdownOpen, setZoneDropdownOpen] = useState(false);
  const [vehicleTypeDropdownOpen, setVehicleTypeDropdownOpen] = useState(false);

  // Refs for click outside
  const zoneRef = useRef<HTMLDivElement>(null);
  const vehicleTypeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (zoneRef.current && !zoneRef.current.contains(e.target as Node)) setZoneDropdownOpen(false);
      if (vehicleTypeRef.current && !vehicleTypeRef.current.contains(e.target as Node)) setVehicleTypeDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadMetaData = async () => {
    setMetaLoading(true);
    try {
      const [regRes, vtRes] = await Promise.all([
        api<Region[]>("/api/regions"),
        api<{ data: VehicleType[] }>("/api/vehicle-types")
      ]);

      const allRegions = Array.isArray(regRes) ? regRes : (regRes as any).data || [];
      setZones(allRegions.filter((r: Region) => r.region_type_id === 2));
      setVehicleTypes(vtRes.data || []);
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
      if (selectedZoneId) params.append("zone_id", String(selectedZoneId));
      if (selectedVehicleTypeId) params.append("vehicle_type_id", String(selectedVehicleTypeId));

      const res = await api<{ data: ActiveVehicleSummaryRow[] }>(`/api/reports/active-vehicle-summary?${params.toString()}`);
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
    // Fetch initial report data on load
    const fetchInitialData = async () => {
      try {
        const res = await api<{ data: ActiveVehicleSummaryRow[] }>("/api/reports/active-vehicle-summary");
        setData(res.data || []);
      } catch {
        // Silently catch initial load errors
      }
    };
    fetchInitialData();
  }, []);

  const handleExportCSV = () => {
    if (data.length === 0) {
      toast.warning("No data to export");
      return;
    }
    const headers = ["S. NO.", "ZONE", "TOTAL VEHICLES", "ACTIVE VEHICLES", "INACTIVE VEHICLES"];
    const rows = data.map((row, idx) => [
      idx + 1,
      `"${row.zone_name.replace(/"/g, '""')}"`,
      row.total_vehicles,
      row.active_vehicles,
      row.inactive_vehicles
    ]);
    
    // Append totals row to CSV
    const totalRow = [
      "",
      "Total",
      totals.total,
      totals.active,
      totals.inactive
    ];
    rows.push(totalRow);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `active_vehicle_summary_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculations for totals
  const totals = data.reduce(
    (acc, curr) => {
      acc.total += curr.total_vehicles;
      acc.active += curr.active_vehicles;
      acc.inactive += curr.inactive_vehicles;
      return acc;
    },
    { total: 0, active: 0, inactive: 0 }
  );

  const filteredZones = zones.filter(z => z.region_name.toLowerCase().includes(zoneSearch.toLowerCase()));
  const filteredVehicleTypes = vehicleTypes.filter(vt => vt.name.toLowerCase().includes(vehicleTypeSearch.toLowerCase()));

  const selectedZoneName = zones.find(z => z.id === selectedZoneId)?.region_name || "Select Zone";
  const selectedVehicleTypeName = vehicleTypes.find(vt => vt.id === selectedVehicleTypeId)?.name || "Select Vehicle Type";

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
        title="Active Vehicle Summary Report"
        description="Real-time summary of total, active, and inactive vehicles grouped by zone."
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "Active Vehicle Summary" }]}
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

              <SearchableDropdown
                label="Vehicle Type"
                selectedName={selectedVehicleTypeName}
                isSelected={!!selectedVehicleTypeId}
                isOpen={vehicleTypeDropdownOpen}
                setOpen={setVehicleTypeDropdownOpen}
                search={vehicleTypeSearch}
                setSearch={setVehicleTypeSearch}
                items={filteredVehicleTypes}
                dropdownRef={vehicleTypeRef}
                keyField="id"
                displayField="name"
                onSelect={(id: number) => {
                  if (selectedVehicleTypeId === id) {
                    setSelectedVehicleTypeId(null);
                  } else {
                    setSelectedVehicleTypeId(id);
                  }
                  setVehicleTypeDropdownOpen(false);
                  setVehicleTypeSearch("");
                }}
              />
            </div>

            <div className="flex justify-start pt-4 border-t border-theme-border">
              <Button onClick={loadReport} variant="accent" loading={loading} loadingText="Loading...">
                Load
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col min-h-[500px] print:border-none print:shadow-none">
          <CardContent className="p-0 flex-1 flex flex-col justify-between">
            <div className="flex-1">
              <Table
                headers={[
                  <div key="s" className="text-center w-16">S. NO.</div>,
                  "ZONE",
                  "TOTAL VEHICLES",
                  "ACTIVE VEHICLES",
                  "INACTIVE VEHICLES"
                ]}
                isLoading={loading || metaLoading}
                emptyState="No records found."
                paginate={false}
              >
                {data.map((row, idx) => (
                  <tr key={row.zone_id} className="hover:bg-theme-base/40 transition-colors border-b border-theme-border/50 print:border-black">
                    <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px] print:text-black w-16">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-5 font-semibold text-theme-text text-[12px] print:text-black">
                      {row.zone_name}
                    </td>
                    <td className="py-3 px-5 font-medium text-theme-text text-[12px] print:text-black">
                      {row.total_vehicles}
                    </td>
                    <td className="py-3 px-5 text-emerald-400 font-semibold text-[12px] print:text-black">
                      {row.active_vehicles}
                    </td>
                    <td className="py-3 px-5 text-rose-400 font-semibold text-[12px] print:text-black">
                      {row.inactive_vehicles}
                    </td>
                  </tr>
                ))}
                {data.length > 0 && !loading && (
                  <tr className="bg-theme-base/50 font-bold border-t-2 border-theme-border/80 print:bg-slate-100 print:text-black print:border-black">
                    <td className="py-3 px-5 text-center w-16 print:text-black">—</td>
                    <td className="py-3 px-5 print:text-black">Total</td>
                    <td className="py-3 px-5 print:text-black">{totals.total}</td>
                    <td className="py-3 px-5 text-emerald-400 print:text-black">{totals.active}</td>
                    <td className="py-3 px-5 text-rose-400 print:text-black">{totals.inactive}</td>
                  </tr>
                )}
              </Table>
            </div>
            {data.length > 0 && !loading && (
              <div className="bg-theme-base/30 border-t border-theme-border px-5 py-3 text-xs text-theme-text-dim print:hidden rounded-b-xl select-none">
                {data.length} total
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
