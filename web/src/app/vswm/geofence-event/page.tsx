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

interface GeofenceSession {
  geofence_name: string;
  entity: string;
  status: "inside" | "outside";
  entry_time: string;
  exit_time: string | null;
  duration: string;
}

interface VehicleGeofenceSummary {
  vehicle_id: number;
  registration_no: string;
  zone_name: string;
  ward_name: string;
  total_zone_visits: number;
  total_ward_visits: number;
  total_fuel_visits: number;
  total_transport_visits: number;
  total_workshop_visits: number;
  total_parking_visits: number;
  total_events: number;
  sessions: GeofenceSession[];
}

export default function GeofenceEventReportPage() {
  const [data, setData] = useState<VehicleGeofenceSummary[]>([]);
  const [zones, setZones] = useState<Region[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);

  // Filters state
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [date, setDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  // Selected vehicle for details drawer state
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleGeofenceSummary | null>(null);

  // Search states for dropdowns
  const [zoneSearch, setZoneSearch] = useState("");
  const [shiftSearch, setShiftSearch] = useState("");

  // Dropdown open states
  const [zoneDropdownOpen, setZoneDropdownOpen] = useState(false);
  const [shiftDropdownOpen, setShiftDropdownOpen] = useState(false);

  // Refs for click outside
  const zoneRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (zoneRef.current && !zoneRef.current.contains(e.target as Node)) setZoneDropdownOpen(false);
      if (shiftRef.current && !shiftRef.current.contains(e.target as Node)) setShiftDropdownOpen(false);
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

      const shRes = await api<any[]>("/api/shifts");
      const allShifts = Array.isArray(shRes) ? shRes : (shRes as any).data || [];
      setShifts(allShifts);
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
      if (selectedShiftId) params.append("shift_id", String(selectedShiftId));

      const res = await api<{ data: VehicleGeofenceSummary[] }>(`/api/reports/geofence-event?${params.toString()}`);
      setData(res.data || []);
      setSelectedVehicle(null);
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



  const handleExportSummaryCSV = () => {
    if (data.length === 0) {
      toast.warning("No data to export");
      return;
    }
    const headers = [
      "S. NO.",
      "VEHICLE REG. NO.",
      "ZONE",
      "WARD",
      "ZONE VISITS",
      "WARD VISITS",
      "FUEL VISITS",
      "TRANSPORT VISITS",
      "WORKSHOP VISITS",
      "PARKING VISITS",
      "TOTAL RAW EVENTS"
    ];
    const rows = data.map((row, idx) => [
      idx + 1,
      `"${row.registration_no.replace(/"/g, '""')}"`,
      `"${row.zone_name.replace(/"/g, '""')}"`,
      `"${row.ward_name.replace(/"/g, '""')}"`,
      row.total_zone_visits,
      row.total_ward_visits,
      row.total_fuel_visits,
      row.total_transport_visits,
      row.total_workshop_visits,
      row.total_parking_visits,
      row.total_events
    ]);
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const shiftSuffix = selectedShiftId ? `_shift_${selectedShiftName.replace(/\s+/g, "_").toLowerCase()}` : "";
    link.setAttribute("href", url);
    link.setAttribute("download", `geofence_summary_report_${date}${shiftSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportDetailsCSV = () => {
    if (data.length === 0) {
      toast.warning("No data to export");
      return;
    }
    const headers = [
      "S. NO.",
      "VEHICLE REG. NO.",
      "ZONE",
      "WARD",
      "EVENT CATEGORY",
      "GEOFENCE NAME",
      "ENTRY TIME",
      "EXIT TIME",
      "DURATION"
    ];
    const rows: any[] = [];
    let idx = 1;
    data.forEach(vehicle => {
      if (vehicle.sessions && vehicle.sessions.length > 0) {
        vehicle.sessions.forEach(session => {
          rows.push([
            idx++,
            `"${vehicle.registration_no.replace(/"/g, '""')}"`,
            `"${vehicle.zone_name.replace(/"/g, '""')}"`,
            `"${vehicle.ward_name.replace(/"/g, '""')}"`,
            `"${session.entity.replace(/"/g, '""')}"`,
            `"${session.geofence_name.replace(/"/g, '""')}"`,
            `"${formatTime(session.entry_time)}"`,
            `"${session.exit_time ? formatTime(session.exit_time) : "Still Inside"}"`,
            `"${session.duration}"`
          ]);
        });
      }
    });

    if (rows.length === 0) {
      toast.warning("No detailed sessions to export");
      return;
    }

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const shiftSuffix = selectedShiftId ? `_shift_${selectedShiftName.replace(/\s+/g, "_").toLowerCase()}` : "";
    link.setAttribute("href", url);
    link.setAttribute("download", `geofence_details_report_${date}${shiftSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredZones = zones.filter(z => z.region_name.toLowerCase().includes(zoneSearch.toLowerCase()));
  const selectedZoneName = zones.find(z => z.id === selectedZoneId)?.region_name || "Select Zone";

  const filteredShifts = shifts.filter(s => s.shift_name.toLowerCase().includes(shiftSearch.toLowerCase()));
  const selectedShiftName = shifts.find(s => s.id === selectedShiftId)?.shift_name || "Select Shift";

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
            <Button onClick={handleExportSummaryCSV} variant="outline" className="text-xs">
              CSV (Summary)
            </Button>
            <Button onClick={handleExportDetailsCSV} variant="outline" className="text-xs">
              CSV (Details)
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8 print:overflow-visible print:pb-0">
        <Card className="relative z-20 !overflow-visible print:hidden">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
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
                  setShiftDropdownOpen(false);
                  setShiftSearch("");
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
                <div key="s" className="text-center w-12">S. NO.</div>,
                "VEHICLE REG. NO.",
                "ZONE",
                "WARD",
                <div key="zv" className="text-center">ZONE VISITS</div>,
                <div key="wv" className="text-center">WARD VISITS</div>,
                <div key="fv" className="text-center">FUEL VISITS</div>,
                <div key="tv" className="text-center">TRANSPORT VISITS</div>,
                <div key="wkv" className="text-center">WORKSHOP VISITS</div>,
                <div key="pv" className="text-center">PARKING VISITS</div>,
                "ACTIONS"
              ]}
              isLoading={loading || metaLoading}
              emptyState="No data to display. Select a zone and date, then click Load."
            >
              {data.map((row, idx) => (
                <tr key={row.vehicle_id} className="hover:bg-theme-base/20 transition-colors border-b border-theme-border/50 print:border-black">
                  <td className="py-3.5 px-5 text-center text-theme-text-dim font-mono text-[11px] w-12 print:text-black">
                    {idx + 1}
                  </td>
                  <td className="py-3.5 px-5 font-bold text-theme-text text-[12px] print:text-black text-nowrap">
                    {row.registration_no}
                  </td>
                  <td className="py-3.5 px-5 font-semibold text-theme-text text-[12px] print:text-black">
                    {row.zone_name || "—"}
                  </td>
                  <td className="py-3.5 px-5 text-theme-text-dim text-[12px] print:text-black">
                    {row.ward_name || "—"}
                  </td>
                  <td className="py-3.5 px-5 text-center font-bold text-emerald-500 text-[12px] print:text-black">
                    {row.total_zone_visits}
                  </td>
                  <td className="py-3.5 px-5 text-center font-bold text-emerald-500 text-[12px] print:text-black">
                    {row.total_ward_visits}
                  </td>
                  <td className="py-3.5 px-5 text-center font-bold text-theme-text text-[12px] print:text-black">
                    {row.total_fuel_visits}
                  </td>
                  <td className="py-3.5 px-5 text-center font-bold text-theme-text text-[12px] print:text-black">
                    {row.total_transport_visits}
                  </td>
                  <td className="py-3.5 px-5 text-center font-bold text-theme-text text-[12px] print:text-black">
                    {row.total_workshop_visits}
                  </td>
                  <td className="py-3.5 px-5 text-center font-bold text-theme-text text-[12px] print:text-black">
                    {row.total_parking_visits}
                  </td>
                  <td className="py-3.5 px-5 print:hidden">
                    <Button
                      onClick={() => setSelectedVehicle(row)}
                      variant="outline"
                      className="px-3 py-1 text-[11px] font-semibold flex items-center gap-1 min-h-[28px] border-theme-border/60 hover:bg-theme-accent/10 hover:text-theme-accent transition"
                    >
                      View Details →
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Sliding Details Drawer */}
      {selectedVehicle && (
        <div className="fixed inset-0 z-50 flex justify-end print:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setSelectedVehicle(null)}
          />

          {/* Panel */}
          <div className="relative w-screen max-w-md bg-theme-surface border-l border-theme-border flex flex-col shadow-2xl h-full animate-slide-in">
            {/* Header */}
            <div className="p-6 border-b border-theme-border flex justify-between items-center bg-theme-base/30">
              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-theme-accent bg-theme-accent/15 px-2 py-0.5 rounded-md">
                  Vehicle Report
                </span>
                <h3 className="text-base font-bold text-theme-text mt-1.5 flex items-center gap-2">
                  🚚 {selectedVehicle.registration_no}
                </h3>
                <p className="text-[11px] text-theme-text-dim mt-0.5">
                  Zone: <span className="font-semibold text-theme-text">{selectedVehicle.zone_name || "—"}</span> | Ward: <span className="font-semibold text-theme-text">{selectedVehicle.ward_name || "—"}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedVehicle(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-theme-base/50 text-theme-text-dim hover:bg-theme-border hover:text-theme-text transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Visit Stats Grid */}
            <div className="p-5 border-b border-theme-border bg-theme-base/10">
              <h4 className="text-[10px] font-bold text-theme-text uppercase tracking-wider mb-2.5">
                Summary of Visits
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Zone", count: selectedVehicle.total_zone_visits, color: "border-l-emerald-500 bg-emerald-500/5 text-emerald-400" },
                  { label: "Ward", count: selectedVehicle.total_ward_visits, color: "border-l-emerald-500 bg-emerald-500/5 text-emerald-400" },
                  { label: "Fuel", count: selectedVehicle.total_fuel_visits, color: "border-l-orange-500 bg-orange-500/5 text-orange-400" },
                  { label: "Transport", count: selectedVehicle.total_transport_visits, color: "border-l-blue-500 bg-blue-500/5 text-blue-400" },
                  { label: "Workshop", count: selectedVehicle.total_workshop_visits, color: "border-l-purple-500 bg-purple-500/5 text-purple-400" },
                  { label: "Parking", count: selectedVehicle.total_parking_visits, color: "border-l-indigo-500 bg-indigo-500/5 text-indigo-400" },
                ].map((stat, sidx) => (
                  <div
                    key={sidx}
                    className={`border-l-2 p-2 rounded-r-lg border border-theme-border/50 ${stat.color} flex flex-col justify-between`}
                  >
                    <span className="text-[9px] uppercase font-semibold text-theme-text-dim tracking-wider">
                      {stat.label}
                    </span>
                    <span className="text-xs font-extrabold mt-0.5">
                      {stat.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Chronological Timeline */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
              <div className="flex justify-between items-center mb-1">
                <h4 className="text-[10px] font-bold text-theme-text uppercase tracking-wider">
                  Detailed Timeline
                </h4>
                <span className="text-[9px] text-theme-text-dim font-bold bg-theme-base/40 px-2 py-0.5 rounded-full">
                  {selectedVehicle.total_events} raw events
                </span>
              </div>

              {(!selectedVehicle.sessions || selectedVehicle.sessions.length === 0) ? (
                <div className="text-center text-xs text-theme-text-dim italic py-12">
                  📭 No geofence sessions recorded for this day.
                </div>
              ) : (
                <div className="relative border-l border-theme-border/60 ml-2.5 pl-5 space-y-5 py-1">
                  {selectedVehicle.sessions.map((session, sIdx) => {
                    let dotColor = "bg-theme-text border-theme-border";
                    let badgeColor = "bg-theme-base/40 text-theme-text";
                    let badgeText = session.entity;

                    if (session.status === "outside") {
                      dotColor = "bg-rose-500 border-rose-500/20";
                      badgeColor = "bg-rose-500/10 text-rose-400 border border-rose-500/15";
                      badgeText = `Out of ${session.entity}`;
                    } else {
                      switch (session.entity) {
                        case "Zone":
                        case "Ward":
                          dotColor = "bg-emerald-500 border-emerald-500/20";
                          badgeColor = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15";
                          break;
                        case "Fuel Station":
                          dotColor = "bg-orange-500 border-orange-500/20";
                          badgeColor = "bg-orange-500/10 text-orange-400 border border-orange-500/15";
                          break;
                        case "Transport Station":
                          dotColor = "bg-blue-500 border-blue-500/20";
                          badgeColor = "bg-blue-500/10 text-blue-400 border border-blue-500/15";
                          break;
                        case "Workshop":
                          dotColor = "bg-purple-500 border-purple-500/20";
                          badgeColor = "bg-purple-500/10 text-purple-400 border border-purple-500/15";
                          break;
                        case "Parking":
                          dotColor = "bg-indigo-500 border-indigo-500/20";
                          badgeColor = "bg-indigo-500/10 text-indigo-400 border border-indigo-500/15";
                          break;
                      }
                    }

                    return (
                      <div key={sIdx} className="relative group">
                        {/* Timeline Dot */}
                        <div className={`absolute -left-[26px] top-1.5 w-2.5 h-2.5 rounded-full border-2 ${dotColor} group-hover:scale-125 transition-transform`} />

                        {/* Session Card */}
                        <div className="bg-theme-surface border border-theme-border/80 rounded-xl p-3 shadow-xs hover:border-theme-accent/40 transition flex flex-col justify-between space-y-1.5">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide ${badgeColor}`}>
                                {badgeText}
                              </span>
                              <div className="text-[11px] font-bold text-theme-text mt-1">
                                {session.geofence_name}
                              </div>
                            </div>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wide ${
                              session.status === "outside"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/15"
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                            }`}>
                              {session.duration}
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-[9px] text-theme-text-dim border-t border-theme-border/40 pt-1.5 font-mono mt-1.5">
                            <div>
                              <span className={`${session.status === "outside" ? "text-rose-400" : "text-emerald-500"} font-extrabold uppercase text-[7px] block tracking-wider`}>
                                {session.status === "outside" ? "Exit" : "Entry"}
                              </span>
                              {formatTime(session.entry_time)}
                            </div>
                            <div className="text-right">
                              <span className={`${session.status === "outside" ? "text-emerald-500" : "text-rose-400"} font-extrabold uppercase text-[7px] block tracking-wider`}>
                                {session.status === "outside" ? "Entry" : "Exit"}
                              </span>
                              {session.exit_time ? formatTime(session.exit_time) : (session.status === "outside" ? "Still Outside" : "Still Inside")}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
