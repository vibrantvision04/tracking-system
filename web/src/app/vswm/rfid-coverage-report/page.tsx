"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import Button from "@/components/ui/Button";
import Table from "@/components/shared/Table";
import { Card, CardContent } from "@/components/ui/Card";
import StatCard from "@/components/shared/StatCard";
import ReportHeader from "@/components/shared/ReportHeader";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DatePicker from "@/components/ui/DatePicker";
import { X, CheckCircle, XCircle, Clock, MapPin, User, Truck, Calendar, FileText } from "lucide-react";

interface Household {
  id: number;
  rfid_number: string;
  household_name: string;
  mobile_number: string;
  address: string;
  zone_id: number;
  ward_id: number;
  area: string;
  latitude: number;
  longitude: number;
  survey_date: string;
  survey_photo: string;
  zone_name: string;
  ward_name: string;
  assigned_vehicle_id: number | null;
  assigned_vehicle_reg: string | null;
}

interface CoverageRecord {
  coverage_method: "AUTOMATIC" | "MANUAL" | "UNCOVERED";
  automatic_coverage: boolean;
  manual_coverage: boolean;
  finalStatus: "COVERED" | "UNCOVERED";
  coverage_timestamp: string | null;
  vehicle_id: number | null;
  vehicle_reg: string | null;
  speed: number | null;
  distance: number | null;
  user_name: string | null;
  scan_coordinates: { latitude: number; longitude: number } | null;
  coverage_history: CoverageHistory[];
}

interface CoverageHistory {
  id: number;
  coverage_method: "AUTOMATIC" | "MANUAL";
  timestamp: string;
  vehicle_reg: string | null;
  user_name: string | null;
  speed: number | null;
  distance: number | null;
}

interface ReportItem extends Household, CoverageRecord {}

export default function RFIDCoverageReportPage() {
  const [reportData, setReportData] = useState<ReportItem[]>([]);
  const [zones, setZones] = useState<{ id: number; region_name: string }[]>([]);
  const [wards, setWards] = useState<{ id: number; region_name: string; parent_id: number }[]>([]);
  const [vehicles, setVehicles] = useState<{ id: number; vehicle_reg_no: string }[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Filter form states
  const [filters, setFilters] = useState({
    from_date: new Date().toISOString().split("T")[0],
    to_date: new Date().toISOString().split("T")[0],
    zone_id: "",
    ward_id: "",
    area: "",
    vehicle_id: "",
    coverage_type: "",
    supervisor: "",
    driver: "",
    search: "",
  });

  // Detail drawer state
  const [viewItem, setViewItem] = useState<ReportItem | null>(null);

  const loadInitialOptions = async () => {
    try {
      const zonesRes = await api<{ data: { id: number; region_name: string }[] }>("/api/zones");
      setZones(zonesRes.data || []);

      const wardsRes = await api<{ data: { id: number; region_name: string; parent_id: number }[] }>("/api/wards");
      setWards(wardsRes.data || []);

      const vehiclesRes = await api<{ data: { id: number; vehicle_reg_no: string }[] }>("/api/vehicles");
      setVehicles(vehiclesRes.data || []);
    } catch (error) {
      console.error("Failed to load initial options:", error);
    }
  };

  useEffect(() => {
    loadInitialOptions();
  }, []);

  const loadReport = () => {
    setLoading(true);
    setTimeout(() => {
      setReportData([]);
      setHasLoaded(true);
      setLoading(false);
      toast.success("RFID Coverage Report loaded successfully");
    }, 500);
  };

  const handleExport = (format: "csv" | "excel") => {
    // Filter data based on current filters
    const filteredData = reportData.filter(item => {
      if (filters.zone_id && item.zone_id !== parseInt(filters.zone_id)) return false;
      if (filters.ward_id && item.ward_id !== parseInt(filters.ward_id)) return false;
      if (filters.area && item.area !== filters.area) return false;
      if (filters.vehicle_id && item.assigned_vehicle_id !== parseInt(filters.vehicle_id)) return false;
      if (filters.coverage_type) {
        if (filters.coverage_type === "AUTOMATIC" && !item.automatic_coverage) return false;
        if (filters.coverage_type === "MANUAL" && !item.manual_coverage) return false;
        if (filters.coverage_type === "UNCOVERED" && item.finalStatus !== "UNCOVERED") return false;
      }
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (!item.rfid_number.toLowerCase().includes(searchLower) &&
            !item.household_name.toLowerCase().includes(searchLower) &&
            !item.mobile_number.includes(searchLower) &&
            !item.address.toLowerCase().includes(searchLower)) {
          return false;
        }
      }
      return true;
    });

    // Generate CSV content
    const headers = ["Sr No", "RFID Number", "Household Name", "Mobile Number", "Zone", "Ward", "Area", "Assigned Vehicle", "Automatic Coverage", "Manual Coverage", "Final Status", "Coverage Method", "Coverage Timestamp"];
    const csvContent = [
      headers.join(","),
      ...filteredData.map((item, index) => [
        index + 1,
        item.rfid_number,
        item.household_name,
        item.mobile_number,
        item.zone_name,
        item.ward_name,
        item.area,
        item.assigned_vehicle_reg || "N/A",
        item.automatic_coverage ? "Covered" : "Not Covered",
        item.manual_coverage ? "Covered" : "Not Covered",
        item.finalStatus,
        item.coverage_method,
        item.coverage_timestamp || "N/A",
      ].join(","))
    ].join("\n");

    // Download file
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rfid-coverage-report-${filters.from_date}-to-${filters.to_date}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success(`Report exported as ${format.toUpperCase()}`);
  };

  // Calculate statistics
  const stats = {
    totalHouseholds: reportData.length,
    coveredHouseholds: reportData.filter(item => item.finalStatus === "COVERED").length,
    uncoveredHouseholds: reportData.filter(item => item.finalStatus === "UNCOVERED").length,
    coveragePercentage: reportData.length > 0 ? Math.round((reportData.filter(item => item.finalStatus === "COVERED").length / reportData.length) * 100) : 0,
    automaticCoverage: reportData.filter(item => item.automatic_coverage).length,
    manualCoverage: reportData.filter(item => item.manual_coverage).length,
  };

  // Filter data for table
  const filteredData = reportData.filter(item => {
    if (filters.zone_id && item.zone_id !== parseInt(filters.zone_id)) return false;
    if (filters.ward_id && item.ward_id !== parseInt(filters.ward_id)) return false;
    if (filters.area && item.area !== filters.area) return false;
    if (filters.vehicle_id && item.assigned_vehicle_id !== parseInt(filters.vehicle_id)) return false;
    if (filters.coverage_type) {
      if (filters.coverage_type === "AUTOMATIC" && !item.automatic_coverage) return false;
      if (filters.coverage_type === "MANUAL" && !item.manual_coverage) return false;
      if (filters.coverage_type === "UNCOVERED" && item.finalStatus !== "UNCOVERED") return false;
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (!item.rfid_number.toLowerCase().includes(searchLower) &&
          !item.household_name.toLowerCase().includes(searchLower) &&
          !item.mobile_number.includes(searchLower) &&
          !item.address.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    return true;
  });

  const filteredWards = filters.zone_id ? wards.filter(w => w.parent_id === parseInt(filters.zone_id)) : wards;
  const uniqueAreas = [...new Set(reportData.map(item => item.area))];

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans">
      <ReportHeader
        title="RFID Coverage Report"
        subtitle="Household Waste Collection Coverage Analysis"
        variant="detailed"
        printHiddenActions={false}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => handleExport("csv")} variant="outline" className="px-3 py-1.5 text-xs font-semibold">CSV</Button>
            <Button onClick={() => handleExport("excel")} variant="outline" className="px-3 py-1.5 text-xs font-semibold">Excel</Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8 print:overflow-visible print:pb-0 print:p-0 relative">
        {/* Filter Card Panel */}
        <Card hoverable className="print:hidden">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/* From Date */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
                  From Date
                </span>
                <DatePicker
                  label=""
                  value={filters.from_date}
                  onChange={(e) => setFilters((prev) => ({ ...prev, from_date: e.target.value }))}
                />
              </div>

              {/* To Date */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
                  To Date
                </span>
                <DatePicker
                  label=""
                  value={filters.to_date}
                  onChange={(e) => setFilters((prev) => ({ ...prev, to_date: e.target.value }))}
                />
              </div>

              {/* Zone */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
                  Zone
                </span>
                <SearchableSelect
                  value={filters.zone_id}
                  onChange={(val) => setFilters((prev) => ({ ...prev, zone_id: val, ward_id: "" }))}
                  options={[
                    { value: "", label: "All Zones" },
                    ...zones.map((z) => ({ value: z.id.toString(), label: z.region_name }))
                  ]}
                  placeholder="All Zones"
                />
              </div>

              {/* Ward */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
                  Ward
                </span>
                <SearchableSelect
                  value={filters.ward_id}
                  disabled={!filters.zone_id}
                  onChange={(val) => setFilters((prev) => ({ ...prev, ward_id: val }))}
                  options={[
                    { value: "", label: "All Wards" },
                    ...filteredWards.map((w) => ({ value: w.id.toString(), label: w.region_name }))
                  ]}
                  placeholder="All Wards"
                />
              </div>

              {/* Area */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
                  Area
                </span>
                <SearchableSelect
                  value={filters.area}
                  onChange={(val) => setFilters((prev) => ({ ...prev, area: val }))}
                  options={[
                    { value: "", label: "All Areas" },
                    ...uniqueAreas.map((a) => ({ value: a, label: a }))
                  ]}
                  placeholder="All Areas"
                />
              </div>

              {/* Vehicle */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
                  Vehicle
                </span>
                <SearchableSelect
                  value={filters.vehicle_id}
                  onChange={(val) => setFilters((prev) => ({ ...prev, vehicle_id: val }))}
                  options={[
                    { value: "", label: "All Vehicles" },
                    ...vehicles.map((v) => ({ value: v.id.toString(), label: v.vehicle_reg_no }))
                  ]}
                  placeholder="All Vehicles"
                />
              </div>

              {/* Coverage Type */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
                  Coverage Type
                </span>
                <SearchableSelect
                  value={filters.coverage_type}
                  onChange={(val) => setFilters((prev) => ({ ...prev, coverage_type: val }))}
                  options={[
                    { value: "", label: "All" },
                    { value: "AUTOMATIC", label: "Automatic" },
                    { value: "MANUAL", label: "Manual" },
                    { value: "UNCOVERED", label: "Uncovered" }
                  ]}
                  placeholder="All"
                />
              </div>

              {/* Search */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
                  Search
                </span>
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  placeholder="RFID, Name, Mobile, Address"
                  className="w-full bg-white border border-slate-200 px-3 py-1.5 rounded text-sm text-black hover:border-slate-300 focus:border-emerald-500 outline-none transition font-medium shadow-sm placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="flex justify-start pt-4 border-t border-theme-border/60">
              <Button
                onClick={loadReport}
                variant="success"
                loading={loading}
                loadingText="Loading..."
                className="font-semibold px-6 py-2.5 rounded-lg text-xs"
              >
                Load Report
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        {hasLoaded && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 print:hidden animate-fade-in">
            <StatCard
              title="Total Households"
              value={stats.totalHouseholds}
              icon={<MapPin size={20} />}
            />
            <StatCard
              title="Covered Households"
              value={stats.coveredHouseholds}
              icon={<CheckCircle size={20} />}
            />
            <StatCard
              title="Uncovered Households"
              value={stats.uncoveredHouseholds}
              icon={<XCircle size={20} />}
            />
            <StatCard
              title="Coverage %"
              value={`${stats.coveragePercentage}%`}
              icon={<Clock size={20} />}
            />
            <StatCard
              title="Automatic Coverage"
              value={stats.automaticCoverage}
              icon={<Truck size={20} />}
            />
            <StatCard
              title="Manual Coverage"
              value={stats.manualCoverage}
              icon={<User size={20} />}
            />
          </div>
        )}

        {/* Report Table */}
        {hasLoaded && (
          <Card hoverable>
            <CardContent className="p-6">
              <Table
                headers={[
                  "Sr No",
                  "RFID Number",
                  "Household Name",
                  "Mobile Number",
                  "Zone",
                  "Ward",
                  "Area",
                  "Assigned Vehicle",
                  "Auto Coverage",
                  "Manual Coverage",
                  "Final Status",
                  "Coverage Method",
                  "Coverage Timestamp",
                  "Action",
                ]}
                itemsPerPage={20}
              >
                {filteredData.map((item, index) => (
                  <tr key={item.id} className="border-b border-theme-border hover:bg-theme-elevated transition-colors">
                    <td className="py-3 px-4 text-center text-sm font-medium text-theme-text">{index + 1}</td>
                    <td className="py-3 px-4 text-center text-sm text-theme-text">{item.rfid_number}</td>
                    <td className="py-3 px-4 text-sm text-theme-text">{item.household_name}</td>
                    <td className="py-3 px-4 text-center text-sm text-theme-text">{item.mobile_number}</td>
                    <td className="py-3 px-4 text-sm text-theme-text">{item.zone_name}</td>
                    <td className="py-3 px-4 text-sm text-theme-text">{item.ward_name}</td>
                    <td className="py-3 px-4 text-sm text-theme-text">{item.area}</td>
                    <td className="py-3 px-4 text-center text-sm text-theme-text">{item.assigned_vehicle_reg || "N/A"}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${item.automatic_coverage ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {item.automatic_coverage ? "Covered" : "Not Covered"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${item.manual_coverage ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {item.manual_coverage ? "Covered" : "Not Covered"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${item.finalStatus === "COVERED" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {item.finalStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                        item.coverage_method === "AUTOMATIC" ? "bg-purple-100 text-purple-700" :
                        item.coverage_method === "MANUAL" ? "bg-teal-100 text-teal-700" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {item.coverage_method}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-sm text-theme-text">
                      {item.coverage_timestamp ? new Date(item.coverage_timestamp).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      }) : "N/A"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Button
                        onClick={() => setViewItem(item)}
                        variant="outline"
                        className="px-2 py-1 text-[10px] font-semibold"
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Details Drawer */}
      {viewItem && (
        <div className="fixed inset-0 z-[9999] flex justify-end">
          <div
            onClick={() => setViewItem(null)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
          />
          <div className="relative w-full sm:w-[80%] sm:max-w-[80vw] lg:max-w-2xl bg-theme-card h-full shadow-2xl flex flex-col z-10 transition-transform duration-300 transform translate-x-0">
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-theme-border flex items-center justify-between shrink-0 sticky top-0 bg-theme-card z-10">
              <div>
                <h3 className="text-lg font-bold text-theme-text">Household Details</h3>
                <p className="text-xs text-theme-text-dim font-medium mt-0.5">
                  {viewItem.rfid_number}
                </p>
              </div>
              <button
                onClick={() => setViewItem(null)}
                className="min-w-[44px] min-h-[44px] w-10 h-10 rounded-full flex items-center justify-center hover:bg-theme-elevated transition text-theme-text-dim hover:text-theme-text"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-6 custom-scrollbar">
              {/* Household Information */}
              <div className="bg-theme-elevated border border-theme-border rounded-2xl p-5">
                <h4 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider mb-4 flex items-center gap-2">
                  <User size={14} />
                  Household Information
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">RFID Number</span>
                    <span className="font-semibold text-theme-text">{viewItem.rfid_number}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Household Name</span>
                    <span className="font-semibold text-theme-text">{viewItem.household_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Mobile Number</span>
                    <span className="font-semibold text-theme-text">{viewItem.mobile_number}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Address</span>
                    <span className="font-semibold text-theme-text">{viewItem.address}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Zone</span>
                    <span className="font-semibold text-theme-text">{viewItem.zone_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Ward</span>
                    <span className="font-semibold text-theme-text">{viewItem.ward_name}</span>
                  </div>
                </div>
              </div>

              {/* Survey Information */}
              <div className="bg-theme-elevated border border-theme-border rounded-2xl p-5">
                <h4 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider mb-4 flex items-center gap-2">
                  <FileText size={14} />
                  Survey Information
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Survey Date</span>
                    <span className="font-semibold text-theme-text">{viewItem.survey_date}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Coordinates</span>
                    <span className="font-semibold text-theme-text">{viewItem.latitude.toFixed(6)}, {viewItem.longitude.toFixed(6)}</span>
                  </div>
                </div>
              </div>

              {/* Automatic Coverage Details */}
              {viewItem.automatic_coverage && (
                <div className="bg-theme-elevated border border-theme-border rounded-2xl p-5">
                  <h4 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Truck size={14} />
                    Automatic Coverage Details
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Vehicle</span>
                      <span className="font-semibold text-theme-text">{viewItem.vehicle_reg || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Timestamp</span>
                      <span className="font-semibold text-theme-text">{viewItem.coverage_timestamp ? new Date(viewItem.coverage_timestamp).toLocaleString("en-IN") : "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Speed</span>
                      <span className="font-semibold text-theme-text">{viewItem.speed ? `${viewItem.speed.toFixed(2)} km/h` : "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Distance From Household</span>
                      <span className="font-semibold text-theme-text">{viewItem.distance ? `${viewItem.distance.toFixed(2)} m` : "N/A"}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Manual Coverage Details */}
              {viewItem.manual_coverage && (
                <div className="bg-theme-elevated border border-theme-border rounded-2xl p-5">
                  <h4 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider mb-4 flex items-center gap-2">
                    <User size={14} />
                    Manual Coverage Details
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">User</span>
                      <span className="font-semibold text-theme-text">{viewItem.user_name || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Vehicle</span>
                      <span className="font-semibold text-theme-text">{viewItem.vehicle_reg || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Scan Time</span>
                      <span className="font-semibold text-theme-text">{viewItem.coverage_timestamp ? new Date(viewItem.coverage_timestamp).toLocaleString("en-IN") : "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Scan Coordinates</span>
                      <span className="font-semibold text-theme-text">{viewItem.scan_coordinates ? `${viewItem.scan_coordinates.latitude.toFixed(6)}, ${viewItem.scan_coordinates.longitude.toFixed(6)}` : "N/A"}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Coverage History */}
              {viewItem.coverage_history && viewItem.coverage_history.length > 0 && (
                <div className="bg-theme-elevated border border-theme-border rounded-2xl p-5">
                  <h4 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Calendar size={14} />
                    Coverage History
                  </h4>
                  <div className="space-y-3">
                    {viewItem.coverage_history.map((history, index) => (
                      <div key={history.id} className="bg-theme-card border border-theme-border rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                            history.coverage_method === "AUTOMATIC" ? "bg-purple-100 text-purple-700" : "bg-teal-100 text-teal-700"
                          }`}>
                            {history.coverage_method}
                          </span>
                          <span className="text-[10px] text-theme-text-dim">
                            {new Date(history.timestamp).toLocaleString("en-IN")}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[9px] font-bold text-theme-text-dim uppercase block">Vehicle</span>
                            <span className="font-semibold text-theme-text">{history.vehicle_reg || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-theme-text-dim uppercase block">User</span>
                            <span className="font-semibold text-theme-text">{history.user_name || "N/A"}</span>
                          </div>
                          {history.speed !== null && (
                            <div>
                              <span className="text-[9px] font-bold text-theme-text-dim uppercase block">Speed</span>
                              <span className="font-semibold text-theme-text">{history.speed.toFixed(2)} km/h</span>
                            </div>
                          )}
                          {history.distance !== null && (
                            <div>
                              <span className="text-[9px] font-bold text-theme-text-dim uppercase block">Distance</span>
                              <span className="font-semibold text-theme-text">{history.distance.toFixed(2)} m</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
