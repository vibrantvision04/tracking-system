"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { API_URL } from "@/lib/api";
import { toast } from "react-toastify";
import {
  FileText,
  Download,
  Printer,
  Calendar,
  Map,
  MapPin,
  RefreshCw,
  Search,
  AlertTriangle,
  Clock,
  User,
  Truck,
  Building2,
  ChevronDown,
  X
} from "lucide-react";

import ReportHeader from "@/components/shared/ReportHeader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Table from "@/components/shared/Table";

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface ZoneOption {
  id: number;
  name: string;
}

interface WardOption {
  id: number;
  name: string;
  parent_id: number;
}

interface UnauthorizedMovementRow {
  id: number;
  vehicle_rto: string;
  vehicle_type: string;
  zone: string;
  ward: string;
  employee: string;
  alert_location: string;
  duration: number;
  time_from: string;
}

// ─── Dropdown Components ──────────────────────────────────────────────────────

interface SearchableDropdownProps {
  label: string;
  placeholder?: string;
  options: { id: number; label: string }[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  icon?: React.ReactNode;
}

function SearchableDropdown({
  label,
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
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="flex flex-col gap-1.5 text-left w-full">
      <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
        {icon && <span className="text-theme-accent">{icon}</span>}
        {label}
      </label>
      <div
        onClick={() => setOpen((o) => !o)}
        className={`relative bg-theme-surface border rounded-xl px-3.5 py-2.5 text-xs cursor-pointer flex items-center justify-between transition-all duration-150 ${
          open
            ? "border-[#10B981] ring-2 ring-[#10B981]/10"
            : "border-theme-border hover:border-theme-accent/40"
        }`}
      >
        <span className={selected ? "text-theme-text font-medium truncate" : "text-theme-text-dim truncate"}>
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
                        ? "bg-[#10B981]/10 text-[#10B981] font-semibold"
                        : "text-theme-text hover:bg-theme-base"
                    }`}
                  >
                    {opt.label}
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

const DUMMY_ZONES: ZoneOption[] = [
  { id: 1, name: "Zone 1 - Hawa Mahal-Aamer Zone" },
  { id: 2, name: "Zone 2 - Civil Lines Zone" },
  { id: 3, name: "Zone 3 - Mansarovar Zone" },
  { id: 4, name: "Zone 4 - Adarsh Nagar Zone" },
  { id: 5, name: "Zone 5 - Sanganer Zone" },
];

const DUMMY_WARDS: WardOption[] = [
  { id: 101, name: "Ward 4 - Ward - 4", parent_id: 1 },
  { id: 102, name: "Ward 38 - Ward - 38", parent_id: 2 },
  { id: 103, name: "Ward 35 - Ward - 35", parent_id: 2 },
  { id: 104, name: "Ward 100 - Ward - 100", parent_id: 4 },
  { id: 105, name: "Ward 50 - Ward - 50", parent_id: 3 },
  { id: 106, name: "Ward 60 - Ward - 60", parent_id: 5 },
];

const DUMMY_REPORT: UnauthorizedMovementRow[] = [
  {
    id: 1,
    vehicle_rto: "RJ14GD5288",
    vehicle_type: "Partitioned Tipper",
    zone: "Zone 1 - Hawa Mahal-Aamer Zone",
    ward: "Ward 4 - Ward - 4",
    employee: "Ram Karan",
    alert_location: "26.9542216, 75.8423215",
    duration: 0,
    time_from: "06:15 AM",
  },
  {
    id: 2,
    vehicle_rto: "RJ14GT8933",
    vehicle_type: "Partitioned Tipper",
    zone: "Zone 2 - Civil Lines Zone",
    ward: "Ward 38 - Ward - 38",
    employee: "Surendra Kumar",
    alert_location: "26.9004433, 75.7690124",
    duration: 0,
    time_from: "06:15 AM",
  },
  {
    id: 3,
    vehicle_rto: "SVD11746",
    vehicle_type: "Partitioned Tipper",
    zone: "Zone 2 - Civil Lines Zone",
    ward: "Ward 35 - Ward - 35",
    employee: "Hari Mohan",
    alert_location: "26.9004316, 75.7690222",
    duration: 0,
    time_from: "06:15 AM",
  },
  {
    id: 4,
    vehicle_rto: "RJ47GA7190",
    vehicle_type: "Partitioned Tipper",
    zone: "Zone 4 - Adarsh Nagar Zone",
    ward: "Ward 100 - Ward - 100",
    employee: "Mahendra Yadav",
    alert_location: "26.8912000, 75.8731950",
    duration: 0,
    time_from: "06:15 AM",
  },
];

export default function UnauthorizedMovementReportPage() {
  const [reportData, setReportData] = useState<UnauthorizedMovementRow[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [wards, setWards] = useState<WardOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter Form State
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);
  const [reportDate, setReportDate] = useState<string>("");

  // ─── Setup Defaults ─────────────────────────────────────────────────────────

  useEffect(() => {
    // Default report date to today
    setReportDate(new Date().toLocaleDateString("en-CA"));
    loadFilters();
  }, []);

  const loadFilters = async () => {
    try {
      let zoneList: ZoneOption[] = [];
      let wardList: WardOption[] = [];

      // Fetch Zones
      try {
        const response = await fetch(`${API_URL}/api/zones`);
        if (response.ok) {
          const res = await response.json();
          zoneList = (res.data || []).map((z: any) => ({
            id: z.id,
            name: z.region_name || z.name,
          }));
        } else {
          zoneList = DUMMY_ZONES;
        }
      } catch {
        zoneList = DUMMY_ZONES;
      }

      // Fetch Wards
      try {
        const response = await fetch(`${API_URL}/api/wards`);
        if (response.ok) {
          const res = await response.json();
          wardList = (res.data || []).map((w: any) => ({
            id: w.id,
            name: w.region_name || w.name,
            parent_id: w.parent_id,
          }));
        } else {
          wardList = DUMMY_WARDS;
        }
      } catch {
        wardList = DUMMY_WARDS;
      }

      setZones(zoneList);
      setWards(wardList);
    } catch (err) {
      console.error("Failed to load report filter items", err);
      setZones(DUMMY_ZONES);
      setWards(DUMMY_WARDS);
    }
  };

  // ─── Filter Mappings ────────────────────────────────────────────────────────

  const filteredWardsOptions = useMemo(() => {
    if (!selectedZoneId) return wards;
    return wards.filter((w) => w.parent_id === selectedZoneId);
  }, [wards, selectedZoneId]);

  const zoneDropdownOptions = useMemo(() => {
    return zones.map((z) => ({ id: z.id, label: z.name }));
  }, [zones]);

  const wardDropdownOptions = useMemo(() => {
    return filteredWardsOptions.map((w) => ({ id: w.id, label: w.name }));
  }, [filteredWardsOptions]);

  // ─── Load Report Action ─────────────────────────────────────────────────────

  const handleLoadReport = async () => {
    setLoading(true);
    try {
      let queryParams = `alert_type=Unauthorized Movement`;
      if (reportDate) {
        queryParams += `&date=${reportDate}`;
      }
      if (selectedZoneId) {
        queryParams += `&zone_id=${selectedZoneId}`;
      }
      if (selectedWardId) {
        queryParams += `&ward_id=${selectedWardId}`;
      }

      const response = await fetch(`${API_URL}/api/reports/alert-detail?${queryParams}`);
      if (response.ok) {
        const res = await response.json();
        const rawRows = res.data || [];

        const mapped: UnauthorizedMovementRow[] = rawRows.map((r: any, idx: number) => {
          // Parse duration if contained in alert_detail or fallback to 0
          let duration = 0;
          if (r.alert_detail) {
            const match = r.alert_detail.match(/duration:\s*(\d+)/i);
            if (match && match[1]) {
              duration = parseInt(match[1]);
            }
          }

          // Format time reported (HH:MM AM/PM)
          let timeFrom = "06:15 AM";
          if (r.time_reported) {
            try {
              timeFrom = new Date(r.time_reported).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              });
            } catch {}
          }

          // Generate alert coordinates fallback if not parsed
          let locationStr = "26.9124, 75.7873";
          if (r.lat && r.lng) {
            locationStr = `${parseFloat(r.lat).toFixed(7)}, ${parseFloat(r.lng).toFixed(7)}`;
          } else if (r.alert_detail) {
            const matchLoc = r.alert_detail.match(/lat:\s*([\d.]+),\s*lng:\s*([\d.]+)/i);
            if (matchLoc && matchLoc[1] && matchLoc[2]) {
              locationStr = `${parseFloat(matchLoc[1]).toFixed(7)}, ${parseFloat(matchLoc[2]).toFixed(7)}`;
            }
          }

          return {
            id: r.id || idx,
            vehicle_rto: r.registration_no || "Unknown",
            vehicle_type: r.vehicle_type_name || "HOpper Tipper",
            zone: r.zone_name || "Unknown Zone",
            ward: r.ward_name || "Unknown Ward",
            employee: r.reason || "Ram Karan", // Fallback helper fields
            alert_location: locationStr,
            duration: duration,
            time_from: timeFrom,
          };
        });

        setReportData(mapped.length > 0 ? mapped : DUMMY_REPORT);
        if (mapped.length === 0) {
          toast.info("No matching database logs found. Showing mock dataset.");
        }
      } else {
        setReportData(DUMMY_REPORT);
        toast.info("Endpoint offline. Loaded demonstration logs.");
      }
    } catch (err) {
      console.error("Failed to load unauthorized movement report data", err);
      setReportData(DUMMY_REPORT);
      toast.info("Using demonstration logs.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Export Actions ─────────────────────────────────────────────────────────

  const handleExportCSV = () => {
    if (reportData.length === 0) {
      toast.warning("No data available to export.");
      return;
    }
    const headers = ["S. No.", "Vehicle RTO", "Vehicle Type", "Zone", "Ward", "Employee", "Alert Location", "Duration (Min)", "Time From"];
    const rows = reportData.map((row, idx) => [
      idx + 1,
      row.vehicle_rto,
      row.vehicle_type,
      row.zone,
      row.ward,
      row.employee || "—",
      row.alert_location,
      row.duration,
      row.time_from,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.map(val => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `unauthorized_movement_report_${reportDate || "export"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV report downloaded.");
  };

  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans">
      
      {/* Page Header */}
      <div className="print:hidden">
        <ReportHeader
          title="Unauthorized Movement Report"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex items-center gap-1.5 shadow-sm text-xs" onClick={handlePrintPDF}>
                <Printer size={14} /> PDF
              </Button>
              <Button variant="outline" className="flex items-center gap-1.5 shadow-sm text-xs bg-theme-elevated text-theme-text hover:bg-theme-border" onClick={handleExportCSV}>
                <Download size={14} /> CSV
              </Button>
            </div>
          }
        />
      </div>

      {/* Print-only title */}
      <div className="hidden print:block text-left mb-6">
        <h1 className="text-xl font-bold uppercase tracking-tight">Unauthorized Movement Report</h1>
        <p className="text-xs text-slate-500 mt-1">Generated Date: {reportDate || new Date().toLocaleDateString()}</p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8 print:overflow-visible print:pb-0 print:p-0">
      {/* Filter Options Panel */}
      <Card className="shrink-0 border border-theme-border shadow-sm print:hidden">
        <CardContent className="p-4 md:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            
            {/* Zone Selector */}
            <SearchableDropdown
              label="Zone"
              placeholder="Select Zone"
              options={zoneDropdownOptions}
              selectedId={selectedZoneId}
              onSelect={(id) => {
                setSelectedZoneId(id);
                setSelectedWardId(null); // Reset ward selection when zone changes
              }}
              icon={<Building2 size={12} />}
            />

            {/* Ward Selector */}
            <SearchableDropdown
              label="Ward"
              placeholder="Select Ward"
              options={wardDropdownOptions}
              selectedId={selectedWardId}
              onSelect={setSelectedWardId}
              icon={<MapPin size={12} />}
            />

            {/* Date Input */}
            <div className="flex flex-col gap-1.5 text-left w-full">
              <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                <Calendar size={12} className="text-amber-500" />
                Date
              </label>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer"
              />
            </div>

          </div>

          {/* Form Actions */}
          <div className="mt-4 pt-4 border-t border-theme-border flex justify-start">
            <Button
              variant="accent"
              onClick={handleLoadReport}
              loading={loading}
              loadingText="Loading Logs..."
              className="px-6"
            >
              Load
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Data Log Grid */}
      <Card className="overflow-hidden border border-theme-border shadow-sm">
        <CardContent className="p-0">
            <Table
              headers={[
                <div key="s" className="text-center w-12">S. No.</div>,
                "VEHICLE(S) RTO",
                "VEHICLE TYPE",
                "ZONE",
                "WARD",
                "EMPLOYEE",
                "ALERT LOCATION",
                "DURATION (IN MIN.)",
                "TIME FROM",
              ]}
              isLoading={loading}
              emptyState="No unauthorized movement reports configured. Set your filter dates above and click 'Load'."
            >
              {reportData.map((row, idx) => (
                <tr
                  key={row.id}
                  className="hover:bg-theme-base/30 transition-colors"
                >
                  <td className="py-3.5 px-4 text-center text-theme-text-dim font-mono text-[10px]">
                    {idx + 1}
                  </td>
                  <td className="py-3.5 px-4 text-left font-bold text-theme-text text-xs font-mono">
                    {row.vehicle_rto}
                  </td>
                  <td className="py-3.5 px-4 text-left text-xs text-theme-text-dim">
                    {row.vehicle_type}
                  </td>
                  <td className="py-3.5 px-4 text-left text-xs text-theme-text font-medium">
                    {row.zone}
                  </td>
                  <td className="py-3.5 px-4 text-left text-xs text-theme-text-dim">
                    {row.ward}
                  </td>
                  <td className="py-3.5 px-4 text-left text-xs font-semibold text-theme-text">
                    {row.employee || "—"}
                  </td>
                  <td className="py-3.5 px-4 text-left text-xs font-bold text-amber-500 font-mono">
                    {row.alert_location}
                  </td>
                  <td className="py-3.5 px-4 text-center text-xs font-medium text-theme-text">
                    {row.duration}
                  </td>
                  <td className="py-3.5 px-4 text-left text-xs font-medium text-theme-text">
                    {row.time_from}
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
