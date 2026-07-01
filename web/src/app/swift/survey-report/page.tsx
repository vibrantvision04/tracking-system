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
import { X, User, MapPin, Calendar, TrendingUp, CheckCircle, Clock, FileText, Radio } from "lucide-react";

interface Supervisor {
  id: number;
  name: string;
  employee_id: string;
  mobile_number: string;
  assigned_zone: string;
  assigned_ward: string;
  total_rfid_installed: number;
  today_installations: number;
  monthly_installations: number;
  last_installation_date: string | null;
  survey_completion_rate: number;
  surveys: SurveyRecord[];
}

interface SurveyRecord {
  id: number;
  rfid_number: string;
  household_name: string;
  mobile_number: string;
  address: string;
  zone: string;
  ward: string;
  area: string;
  supervisor_id: number;
  supervisor_name: string;
  survey_date: string;
  status: "Completed" | "Pending" | "Rejected" | "Approved";
  has_photo: boolean;
  has_coordinates: boolean;
  rfid_activated: boolean;
}

// ─── Dummy Data ──────────────────────────────────────────────────────────────

const DUMMY_SUPERVISORS: Supervisor[] = [
  { id: 1, name: "Anil Sharma", employee_id: "EMP001", mobile_number: "9829012345", assigned_zone: "HMZ", assigned_ward: "Ward 10", total_rfid_installed: 245, today_installations: 12, monthly_installations: 89, last_installation_date: "2026-06-10", survey_completion_rate: 92, surveys: [] },
  { id: 2, name: "Vinod Yadav", employee_id: "EMP002", mobile_number: "9829012346", assigned_zone: "Mansarovar", assigned_ward: "Ward 20", total_rfid_installed: 198, today_installations: 8, monthly_installations: 72, last_installation_date: "2026-06-10", survey_completion_rate: 85, surveys: [] },
  { id: 3, name: "Suresh Meena", employee_id: "EMP003", mobile_number: "9829012347", assigned_zone: "Sanganer", assigned_ward: "Ward 30", total_rfid_installed: 312, today_installations: 15, monthly_installations: 110, last_installation_date: "2026-06-09", survey_completion_rate: 78, surveys: [] },
  { id: 4, name: "Ramesh Kumar", employee_id: "EMP004", mobile_number: "9829012348", assigned_zone: "Civil Lines", assigned_ward: "Ward 40", total_rfid_installed: 176, today_installations: 5, monthly_installations: 65, last_installation_date: "2026-06-08", survey_completion_rate: 88, surveys: [] },
  { id: 5, name: "Rajesh Yadav", employee_id: "EMP005", mobile_number: "9829012355", assigned_zone: "Vidhyadhar Nagar", assigned_ward: "Ward 50", total_rfid_installed: 89, today_installations: 3, monthly_installations: 34, last_installation_date: "2026-06-07", survey_completion_rate: 95, surveys: [] },
];

const DUMMY_SURVEY_RECORDS: SurveyRecord[] = [
  { id: 1, rfid_number: "RFID-10001", household_name: "Rajesh Sharma", mobile_number: "9829012345", address: "12, Brahampuri", zone: "HMZ", ward: "Ward 10", area: "Zorawar Singh Gate", supervisor_id: 1, supervisor_name: "Anil Sharma", survey_date: "2026-06-01", status: "Completed", has_photo: true, has_coordinates: true, rfid_activated: true },
  { id: 2, rfid_number: "RFID-10002", household_name: "Sunita Verma", mobile_number: "9829012346", address: "92, Ghat Gate Road", zone: "Mansarovar", ward: "Ward 20", area: "Ghat Gate", supervisor_id: 2, supervisor_name: "Vinod Yadav", survey_date: "2026-06-02", status: "Completed", has_photo: true, has_coordinates: true, rfid_activated: true },
  { id: 3, rfid_number: "RFID-10003", household_name: "Amit Gupta", mobile_number: "9829012347", address: "102, Sector 11 Market", zone: "Sanganer", ward: "Ward 30", area: "Sector 11", supervisor_id: 3, supervisor_name: "Suresh Meena", survey_date: "2026-06-03", status: "Approved", has_photo: true, has_coordinates: true, rfid_activated: true },
  { id: 4, rfid_number: "RFID-10004", household_name: "Priya Chauhan", mobile_number: "9829012348", address: "157, Sector 2 Extension", zone: "Civil Lines", ward: "Ward 40", area: "Sector 2", supervisor_id: 4, supervisor_name: "Ramesh Kumar", survey_date: "2026-06-04", status: "Completed", has_photo: false, has_coordinates: true, rfid_activated: true },
  { id: 5, rfid_number: "RFID-10005", household_name: "Vijay Meena", mobile_number: "9829012349", address: "248, Sanganer Industrial Area", zone: "Vidhyadhar Nagar", ward: "Ward 50", area: "Sanganer Ind Area", supervisor_id: 5, supervisor_name: "Rajesh Yadav", survey_date: "2026-06-05", status: "Pending", has_photo: false, has_coordinates: false, rfid_activated: false },
  { id: 6, rfid_number: "RFID-10006", household_name: "Kavita Jain", mobile_number: "9829012350", address: "Shop 12, Brahampuri", zone: "HMZ", ward: "Ward 10", area: "Zorawar Singh Gate", supervisor_id: 1, supervisor_name: "Anil Sharma", survey_date: "2026-06-06", status: "Completed", has_photo: true, has_coordinates: true, rfid_activated: true },
  { id: 7, rfid_number: "RFID-10007", household_name: "Deepak Yadav", mobile_number: "9829012351", address: "Showroom 2, Ghat Gate Road", zone: "Mansarovar", ward: "Ward 20", area: "Ghat Gate", supervisor_id: 2, supervisor_name: "Vinod Yadav", survey_date: "2026-06-07", status: "Rejected", has_photo: true, has_coordinates: true, rfid_activated: false },
  { id: 8, rfid_number: "RFID-10008", household_name: "Neha Sharma", mobile_number: "9829012352", address: "101, Sector 11 Market", zone: "Sanganer", ward: "Ward 30", area: "Sector 11", supervisor_id: 3, supervisor_name: "Suresh Meena", survey_date: "2026-06-08", status: "Completed", has_photo: true, has_coordinates: true, rfid_activated: true },
  { id: 9, rfid_number: "RFID-10009", household_name: "Ravi Kumar", mobile_number: "9829012353", address: "202, Sector 2 Extension", zone: "Civil Lines", ward: "Ward 40", area: "Sector 2", supervisor_id: 4, supervisor_name: "Ramesh Kumar", survey_date: "2026-06-09", status: "Approved", has_photo: true, has_coordinates: true, rfid_activated: true },
  { id: 10, rfid_number: "RFID-10010", household_name: "Pooja Verma", mobile_number: "9829012354", address: "55, Sanganer Industrial Area", zone: "Vidhyadhar Nagar", ward: "Ward 50", area: "Sanganer Ind Area", supervisor_id: 1, supervisor_name: "Anil Sharma", survey_date: "2026-06-10", status: "Pending", has_photo: false, has_coordinates: true, rfid_activated: true },
];

export default function SurveyReportPage() {
  const [supervisors, setSupervisors] = useState<Supervisor[]>(DUMMY_SUPERVISORS);
  const [surveyRecords, setSurveyRecords] = useState<SurveyRecord[]>(DUMMY_SURVEY_RECORDS);
  const [zones, setZones] = useState<{ id: number; region_name: string }[]>([]);
  const [wards, setWards] = useState<{ id: number; region_name: string; parent_id: number }[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<"performance" | "records">("performance");

  // Filter form states
  const [filters, setFilters] = useState({
    from_date: new Date().toISOString().split("T")[0],
    to_date: new Date().toISOString().split("T")[0],
    supervisor_id: "",
    zone_id: "",
    ward_id: "",
    area: "",
    survey_status: "",
    search: "",
  });

  // Detail drawer state
  const [viewSupervisor, setViewSupervisor] = useState<Supervisor | null>(null);

  const loadInitialOptions = async () => {
    try {
      const zonesRes = await api<{ data: { id: number; region_name: string }[] }>("/api/zones");
      setZones(zonesRes.data || []);

      const wardsRes = await api<{ data: { id: number; region_name: string; parent_id: number }[] }>("/api/wards");
      setWards(wardsRes.data || []);
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
      setSupervisors(DUMMY_SUPERVISORS);
      setSurveyRecords(DUMMY_SURVEY_RECORDS);
      setHasLoaded(true);
      setLoading(false);
      toast.success("RFID Survey Report loaded successfully");
    }, 500);
  };

  const handleExport = (format: "csv" | "excel") => {
    const dataToExport = activeTab === "performance" 
      ? supervisors.filter(s => applyFilters(s))
      : surveyRecords.filter(s => applySurveyFilters(s));

    const headers = activeTab === "performance"
      ? ["Sr No", "Supervisor Name", "Employee ID", "Zone", "Ward", "Total RFID Installed", "Today's Installations", "This Month Installations", "Last Installation Date", "Survey Completion Rate"]
      : ["RFID Number", "Household Name", "Mobile Number", "Address", "Zone", "Ward", "Supervisor", "Survey Date", "Status"];

    const csvContent = [
      headers.join(","),
      ...dataToExport.map((item, index) => {
        if (activeTab === "performance") {
          const sup = item as Supervisor;
          return [
            index + 1,
            sup.name,
            sup.employee_id,
            sup.assigned_zone,
            sup.assigned_ward,
            sup.total_rfid_installed,
            sup.today_installations,
            sup.monthly_installations,
            sup.last_installation_date || "N/A",
            `${sup.survey_completion_rate}%`,
          ].join(",");
        } else {
          const survey = item as SurveyRecord;
          return [
            survey.rfid_number,
            survey.household_name,
            survey.mobile_number,
            survey.address,
            survey.zone,
            survey.ward,
            survey.supervisor_name,
            survey.survey_date,
            survey.status,
          ].join(",");
        }
      })
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rfid-survey-report-${activeTab}-${filters.from_date}-to-${filters.to_date}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success(`Report exported as ${format.toUpperCase()}`);
  };

  const applyFilters = (sup: Supervisor) => {
    if (filters.supervisor_id && sup.id !== parseInt(filters.supervisor_id)) return false;
    if (filters.zone_id && sup.assigned_zone !== zones.find(z => z.id === parseInt(filters.zone_id))?.region_name) return false;
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (!sup.name.toLowerCase().includes(searchLower) &&
          !sup.employee_id.toLowerCase().includes(searchLower) &&
          !sup.mobile_number.includes(searchLower)) {
        return false;
      }
    }
    return true;
  };

  const applySurveyFilters = (survey: SurveyRecord) => {
    if (filters.from_date && survey.survey_date < filters.from_date) return false;
    if (filters.to_date && survey.survey_date > filters.to_date) return false;
    if (filters.supervisor_id && survey.supervisor_id !== parseInt(filters.supervisor_id)) return false;
    if (filters.zone_id && survey.zone !== zones.find(z => z.id === parseInt(filters.zone_id))?.region_name) return false;
    if (filters.ward_id && survey.ward !== wards.find(w => w.id === parseInt(filters.ward_id))?.region_name) return false;
    if (filters.area && survey.area !== filters.area) return false;
    if (filters.survey_status && survey.status !== filters.survey_status) return false;
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (!survey.rfid_number.toLowerCase().includes(searchLower) &&
          !survey.household_name.toLowerCase().includes(searchLower) &&
          !survey.mobile_number.includes(searchLower) &&
          !survey.address.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    return true;
  };

  // Calculate statistics
  const stats = {
    totalRfidInstalled: supervisors.reduce((acc, s) => acc + s.total_rfid_installed, 0),
    totalHouseholdsSurveyed: surveyRecords.length,
    activeSupervisors: supervisors.filter(s => s.total_rfid_installed > 0).length,
    todayInstallations: supervisors.reduce((acc, s) => acc + s.today_installations, 0),
    monthlyInstallations: supervisors.reduce((acc, s) => acc + s.monthly_installations, 0),
    averageInstallationPerSupervisor: supervisors.length > 0 
      ? Math.round(supervisors.reduce((acc, s) => acc + s.total_rfid_installed, 0) / supervisors.length)
      : 0,
  };

  const filteredSupervisors = supervisors.filter(applyFilters);
  const filteredSurveyRecords = surveyRecords.filter(applySurveyFilters);
  const filteredWards = filters.zone_id ? wards.filter(w => w.parent_id === parseInt(filters.zone_id)) : wards;

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans">
      <ReportHeader
        title="RFID Survey Report"
        subtitle="Supervisor RFID Installation Performance Tracking"
        variant="detailed"
        printHiddenActions={false}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => handleExport("csv")} variant="outline" className="px-3 py-1.5 text-xs font-semibold">CSV</Button>
            <Button onClick={() => handleExport("excel")} variant="outline" className="px-3 py-1.5 text-xs font-semibold">Excel</Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8 print:hidden relative">
        {/* Filter Card Panel */}
        <Card hoverable>
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

              {/* Supervisor */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
                  Supervisor
                </span>
                <SearchableSelect
                  value={filters.supervisor_id}
                  onChange={(val) => setFilters((prev) => ({ ...prev, supervisor_id: val }))}
                  options={[
                    { value: "", label: "All Supervisors" },
                    ...supervisors.map((s) => ({ value: s.id.toString(), label: s.name }))
                  ]}
                  placeholder="All Supervisors"
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
                    ...areas.map((a) => ({ value: a, label: a }))
                  ]}
                  placeholder="All Areas"
                />
              </div>

              {/* Survey Status */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
                  Survey Status
                </span>
                <SearchableSelect
                  value={filters.survey_status}
                  onChange={(val) => setFilters((prev) => ({ ...prev, survey_status: val }))}
                  options={[
                    { value: "", label: "All" },
                    { value: "Completed", label: "Completed" },
                    { value: "Pending", label: "Pending" },
                    { value: "Rejected", label: "Rejected" },
                    { value: "Approved", label: "Approved" }
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-fade-in">
            <StatCard
              title="Total RFID Installed"
              value={stats.totalRfidInstalled}
              icon={<Radio size={20} />}
            />
            <StatCard
              title="Total Households Surveyed"
              value={stats.totalHouseholdsSurveyed}
              icon={<User size={20} />}
            />
            <StatCard
              title="Active Supervisors"
              value={stats.activeSupervisors}
              icon={<CheckCircle size={20} />}
            />
            <StatCard
              title="Today's Installations"
              value={stats.todayInstallations}
              icon={<Calendar size={20} />}
            />
            <StatCard
              title="Current Month Installations"
              value={stats.monthlyInstallations}
              icon={<TrendingUp size={20} />}
            />
            <StatCard
              title="Avg Installation/Supervisor"
              value={stats.averageInstallationPerSupervisor}
              icon={<Clock size={20} />}
            />
          </div>
        )}

        {/* Tab Navigation */}
        {hasLoaded && (
          <div className="flex gap-2 border-b border-theme-border">
            <button
              onClick={() => setActiveTab("performance")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                activeTab === "performance"
                  ? "text-emerald-600 border-b-2 border-emerald-600"
                  : "text-theme-text-dim hover:text-theme-text"
              }`}
            >
              Supervisor Performance
            </button>
            <button
              onClick={() => setActiveTab("records")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                activeTab === "records"
                  ? "text-emerald-600 border-b-2 border-emerald-600"
                  : "text-theme-text-dim hover:text-theme-text"
              }`}
            >
              Survey Records
            </button>
          </div>
        )}

        {/* Supervisor Performance Table */}
        {hasLoaded && activeTab === "performance" && (
          <Card hoverable>
            <CardContent className="p-6">
              <Table
                headers={[
                  "Sr No",
                  "Supervisor Name",
                  "Employee ID",
                  "Zone",
                  "Ward",
                  "Total RFID Installed",
                  "Today's Installations",
                  "This Month Installations",
                  "Last Installation Date",
                  "Survey Completion Rate",
                  "Action",
                ]}
                itemsPerPage={20}
              >
                {filteredSupervisors.map((sup, index) => (
                  <tr key={sup.id} className="border-b border-theme-border hover:bg-theme-elevated transition-colors">
                    <td className="py-3 px-4 text-center text-sm font-medium text-theme-text">{index + 1}</td>
                    <td className="py-3 px-4 text-sm text-theme-text font-semibold">{sup.name}</td>
                    <td className="py-3 px-4 text-center text-sm text-theme-text">{sup.employee_id}</td>
                    <td className="py-3 px-4 text-sm text-theme-text">{sup.assigned_zone}</td>
                    <td className="py-3 px-4 text-sm text-theme-text">{sup.assigned_ward}</td>
                    <td className="py-3 px-4 text-center text-sm font-bold text-emerald-600">{sup.total_rfid_installed}</td>
                    <td className="py-3 px-4 text-center text-sm text-theme-text">{sup.today_installations}</td>
                    <td className="py-3 px-4 text-center text-sm text-theme-text">{sup.monthly_installations}</td>
                    <td className="py-3 px-4 text-center text-sm text-theme-text">
                      {sup.last_installation_date || "N/A"}
                    </td>
                    <td className="py-3 px-4 text-center text-sm font-bold text-theme-text">
                      {sup.survey_completion_rate}%
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Button
                        onClick={() => setViewSupervisor(sup)}
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

        {/* Survey Records Table */}
        {hasLoaded && activeTab === "records" && (
          <Card hoverable>
            <CardContent className="p-6">
              <Table
                headers={[
                  "RFID Number",
                  "Household Name",
                  "Mobile Number",
                  "Address",
                  "Zone",
                  "Ward",
                  "Supervisor",
                  "Survey Date",
                  "Status",
                ]}
                itemsPerPage={20}
              >
                {filteredSurveyRecords.map((survey, index) => (
                  <tr key={survey.id} className="border-b border-theme-border hover:bg-theme-elevated transition-colors">
                    <td className="py-3 px-4 text-center text-sm text-theme-text">{survey.rfid_number}</td>
                    <td className="py-3 px-4 text-sm text-theme-text">{survey.household_name}</td>
                    <td className="py-3 px-4 text-center text-sm text-theme-text">{survey.mobile_number}</td>
                    <td className="py-3 px-4 text-sm text-theme-text">{survey.address}</td>
                    <td className="py-3 px-4 text-sm text-theme-text">{survey.zone}</td>
                    <td className="py-3 px-4 text-sm text-theme-text">{survey.ward}</td>
                    <td className="py-3 px-4 text-sm text-theme-text">{survey.supervisor_name}</td>
                    <td className="py-3 px-4 text-center text-sm text-theme-text">{survey.survey_date}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                        survey.status === "Completed" ? "bg-emerald-100 text-emerald-700" :
                        survey.status === "Approved" ? "bg-blue-100 text-blue-700" :
                        survey.status === "Pending" ? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {survey.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Supervisor Details Drawer */}
      {viewSupervisor && (
        <div className="fixed inset-0 z-[9999] flex justify-end">
          <div
            onClick={() => setViewSupervisor(null)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
          />
          <div className="relative w-full sm:w-[80%] sm:max-w-[80vw] lg:max-w-2xl bg-theme-card h-full shadow-2xl flex flex-col z-10 transition-transform duration-300 transform translate-x-0">
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-theme-border flex items-center justify-between shrink-0 sticky top-0 bg-theme-card z-10">
              <div>
                <h3 className="text-lg font-bold text-theme-text">Supervisor Details</h3>
                <p className="text-xs text-theme-text-dim font-medium mt-0.5">
                  {viewSupervisor.name} ({viewSupervisor.employee_id})
                </p>
              </div>
              <button
                onClick={() => setViewSupervisor(null)}
                className="min-w-[44px] min-h-[44px] w-10 h-10 rounded-full flex items-center justify-center hover:bg-theme-elevated transition text-theme-text-dim hover:text-theme-text"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-6 custom-scrollbar">
              {/* Supervisor Information */}
              <div className="bg-theme-elevated border border-theme-border rounded-2xl p-5">
                <h4 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider mb-4 flex items-center gap-2">
                  <User size={14} />
                  Supervisor Information
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Name</span>
                    <span className="font-semibold text-theme-text">{viewSupervisor.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Employee ID</span>
                    <span className="font-semibold text-theme-text">{viewSupervisor.employee_id}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Mobile Number</span>
                    <span className="font-semibold text-theme-text">{viewSupervisor.mobile_number}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Assigned Zone</span>
                    <span className="font-semibold text-theme-text">{viewSupervisor.assigned_zone}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Assigned Ward</span>
                    <span className="font-semibold text-theme-text">{viewSupervisor.assigned_ward}</span>
                  </div>
                </div>
              </div>

              {/* RFID Installation Statistics */}
              <div className="bg-theme-elevated border border-theme-border rounded-2xl p-5">
                <h4 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Radio size={14} />
                  RFID Installation Statistics
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Total RFID Installed</span>
                    <span className="font-bold text-2xl text-emerald-600">{viewSupervisor.total_rfid_installed}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Today's Installations</span>
                    <span className="font-bold text-2xl text-blue-600">{viewSupervisor.today_installations}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Monthly Installations</span>
                    <span className="font-bold text-2xl text-purple-600">{viewSupervisor.monthly_installations}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Survey Completion Rate</span>
                    <span className="font-bold text-2xl text-amber-600">{viewSupervisor.survey_completion_rate}%</span>
                  </div>
                </div>
              </div>

              {/* Survey Map Statistics */}
              <div className="bg-theme-elevated border border-theme-border rounded-2xl p-5">
                <h4 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider mb-4 flex items-center gap-2">
                  <MapPin size={14} />
                  Survey Map Statistics
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Total Coordinates Captured</span>
                    <span className="font-bold text-xl text-emerald-600">
                      {viewSupervisor.surveys.filter(s => s.has_coordinates).length}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Total Photos Uploaded</span>
                    <span className="font-bold text-xl text-blue-600">
                      {viewSupervisor.surveys.filter(s => s.has_photo).length}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] font-bold text-theme-text-dim uppercase block mb-1">Total RFID Activated</span>
                    <span className="font-bold text-xl text-purple-600">
                      {viewSupervisor.surveys.filter(s => s.rfid_activated).length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Household Survey Breakdown */}
              <div className="bg-theme-elevated border border-theme-border rounded-2xl p-5">
                <h4 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider mb-4 flex items-center gap-2">
                  <FileText size={14} />
                  Recent Household Surveys (Last 10)
                </h4>
                <div className="space-y-3">
                  {viewSupervisor.surveys.slice(-10).reverse().map((survey) => (
                    <div key={survey.id} className="bg-theme-card border border-theme-border rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm text-theme-text">{survey.household_name}</span>
                        <span className={`px-2 py-1 rounded text-[9px] font-bold ${
                          survey.status === "Completed" ? "bg-emerald-100 text-emerald-700" :
                          survey.status === "Approved" ? "bg-blue-100 text-blue-700" :
                          survey.status === "Pending" ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {survey.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[9px] font-bold text-theme-text-dim uppercase">RFID</span>
                          <span className="font-semibold text-theme-text block">{survey.rfid_number}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-theme-text-dim uppercase">Date</span>
                          <span className="font-semibold text-theme-text block">{survey.survey_date}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-theme-text-dim uppercase">Address</span>
                          <span className="font-semibold text-theme-text block truncate">{survey.address}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
