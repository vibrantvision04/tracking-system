"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import {
  Search,
  SlidersHorizontal,
  RefreshCw,
  Download,
  Building2,
  Users,
  CheckCircle,
  Home,
  Phone,
  Mail,
  FileText,
  MapPin,
  CreditCard,
  ChevronRight,
  ChevronLeft,
  X,
  Grid,
  List,
  Camera,
  Check,
  Info,
  Calendar,
  Hash,
  User,
  Sliders,
  DollarSign,
  Layers,
  Map,
  BadgeAlert
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

interface SurveyRecord {
  id: number;
  date: string;
  zone: string;
  ward: string;
  area: string;
  colonyName: string;
  plotNo: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  ownerName: string; // Combined full name for searching
  phone: string;
  email: string;
  floor: string;
  flatNo: string;
  numFlats: string;
  pinCode: string;
  address: string;
  landmark: string;
  aadhaar: string;
  status: string; // e.g. RESIDENTIAL, COMMERCIAL, INDUSTRIAL, INSTITUTIONAL
  propertyType: string;
  propertySubType: string;
  userCharges: number;
  rfid: string;
  supervisor: string;
  isSurveyorSupervisor: boolean;
  latitude: number;
  longitude: number;
}

// ─── Constants for Dropdowns ──────────────────────────────────────────────────

const PROPERTY_STATUS_OPTIONS = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "INSTITUTIONAL", "MIXED-USE"];

const PROPERTY_TYPE_OPTIONS = [
  "Houses having area more than 50 sq. yards",
  "Houses having area less than 50 sq. yards",
  "Commercial shops",
  "Medium/Large commercial outlets",
  "Government buildings",
  "Educational institutions",
];

const PROPERTY_SUB_TYPE_OPTIONS = [
  "Independent House",
  "Apartment/Flats",
  "Row House",
  "Office",
  "Retail Shop",
  "Restaurant",
  "Hospital/Clinic",
  "School/College",
];

const ZONE_OPTIONS = ["HMZ", "Mansarovar", "Sanganer", "Civil Lines", "Vidhyadhar Nagar"];
const WARD_OPTIONS = ["ward 10", "ward 20", "ward 30", "ward 40", "ward 50"];
const AREA_OPTIONS = ["Zorawar Singh Gate", "Ghat Gate", "Sector 11", "Sector 2", "Sanganer Ind Area"];
const COLONY_OPTIONS = ["Brahampuri", "Ghat Gate Road", "Sector 11 Market", "Sector 2 Extension", "Sanganer Industrial Area"];
const PLOT_OPTIONS = ["12", "92", "102", "157", "248", "Shop 12", "Showroom 2", "101", "202"];
const SUPERVISOR_OPTIONS = ["Anil Sharma", "Vinod Yadav", "Suresh Meena", "Ramesh Kumar"];

// ─── Dummy Data (incorporating user's screenshot details) ─────────────────────

const INITIAL_SURVEYS: SurveyRecord[] = [
  {
    id: 1,
    date: "2026-06-23T09:33:00Z",
    zone: "HMZ",
    ward: "ward 20",
    area: "Zorawar Singh Gate",
    colonyName: "Brahampuri",
    plotNo: "157",
    first_name: "Assan das",
    middle_name: "",
    last_name: "parwani",
    ownerName: "Assan das parwani",
    phone: "",
    email: "",
    floor: "Ground Floor",
    flatNo: "1",
    numFlats: "1",
    pinCode: "302002",
    address: "157, 157, Brahampuri, Jaipur, Rajasthan, 302002",
    landmark: "Near Temple",
    aadhaar: "",
    status: "RESIDENTIAL",
    propertyType: "Houses having area more than 50 sq. yards",
    propertySubType: "Independent House",
    userCharges: 80,
    rfid: "1804573725",
    supervisor: "Anil Sharma",
    isSurveyorSupervisor: false,
    latitude: 26.9372,
    longitude: 75.8264
  },
  {
    id: 2,
    date: "2026-06-22T11:48:00Z",
    zone: "HMZ",
    ward: "ward 20",
    area: "Zorawar Singh Gate",
    colonyName: "Brahampuri",
    plotNo: "248",
    first_name: "mukesh",
    middle_name: "kumar",
    last_name: "gupta",
    ownerName: "mukesh kumar gupta",
    phone: "9829460635",
    email: "mukesh.gupta@gmail.com",
    floor: "First Floor",
    flatNo: "A-2",
    numFlats: "4",
    pinCode: "302002",
    address: "248, Brahampuri, Jaipur, Rajasthan",
    landmark: "Opposite Park",
    aadhaar: "5544-2211-9988",
    status: "RESIDENTIAL",
    propertyType: "Houses having area more than 50 sq. yards",
    propertySubType: "Apartment/Flats",
    userCharges: 80,
    rfid: "9829460635", // Screen shows Mobile No as 9829460635, let's keep details matching
    supervisor: "Anil Sharma",
    isSurveyorSupervisor: true,
    latitude: 26.9381,
    longitude: 75.8272
  },
  {
    id: 3,
    date: "2026-06-21T10:33:00Z",
    zone: "HMZ",
    ward: "ward 20",
    area: "Zorawar Singh Gate",
    colonyName: "Brahampuri",
    plotNo: "92",
    first_name: "manoj",
    middle_name: "",
    last_name: "wadhwani",
    ownerName: "manoj wadhwani",
    phone: "",
    email: "",
    floor: "Ground Floor",
    flatNo: "3",
    numFlats: "1",
    pinCode: "302002",
    address: "92, Brahampuri, Jaipur, 302002",
    landmark: "Near Chowk",
    aadhaar: "",
    status: "RESIDENTIAL",
    propertyType: "Houses having area less than 50 sq. yards",
    propertySubType: "Row House",
    userCharges: 80,
    rfid: "1804573542",
    supervisor: "Vinod Yadav",
    isSurveyorSupervisor: false,
    latitude: 26.9365,
    longitude: 75.8251
  },
  {
    id: 4,
    date: "2026-06-21T10:00:00Z",
    zone: "HMZ",
    ward: "ward 20",
    area: "Zorawar Singh Gate",
    colonyName: "Brahampuri",
    plotNo: "102",
    first_name: "Sugnomal",
    middle_name: "",
    last_name: "wanwani",
    ownerName: "Sugnomal wanwani",
    phone: "",
    email: "",
    floor: "Ground Floor",
    flatNo: "4",
    numFlats: "1",
    pinCode: "302002",
    address: "102, Brahampuri, Jaipur, Rajasthan",
    landmark: "Near Water Tank",
    aadhaar: "",
    status: "RESIDENTIAL",
    propertyType: "Houses having area more than 50 sq. yards",
    propertySubType: "Independent House",
    userCharges: 80,
    rfid: "1804573112",
    supervisor: "Vinod Yadav",
    isSurveyorSupervisor: false,
    latitude: 26.9395,
    longitude: 75.8291
  },
  {
    id: 5,
    date: "2026-06-21T09:30:00Z",
    zone: "HMZ",
    ward: "ward 10",
    area: "Zorawar Singh Gate",
    colonyName: "Ghat Gate Road",
    plotNo: "12",
    first_name: "bhagwati",
    middle_name: "",
    last_name: "agarwal",
    ownerName: "bhagwati agarwal",
    phone: "",
    email: "",
    floor: "Ground Floor",
    flatNo: "5",
    numFlats: "1",
    pinCode: "302001",
    address: "12, Ghat Gate Road, Jaipur",
    landmark: "Near Circle",
    aadhaar: "",
    status: "RESIDENTIAL",
    propertyType: "Houses having area more than 50 sq. yards",
    propertySubType: "Independent House",
    userCharges: 80,
    rfid: "1804573887",
    supervisor: "Suresh Meena",
    isSurveyorSupervisor: false,
    latitude: 26.9152,
    longitude: 75.8192
  },
  {
    id: 6,
    date: "2026-06-20T14:15:00Z",
    zone: "Mansarovar",
    ward: "ward 30",
    area: "Sector 11",
    colonyName: "Sector 11 Market",
    plotNo: "Shop 12",
    first_name: "Rajesh",
    middle_name: "",
    last_name: "Chandani",
    ownerName: "Rajesh Chandani",
    phone: "9414012345",
    email: "rajesh.chandani@yahoo.com",
    floor: "Ground Floor",
    flatNo: "Shop 12",
    numFlats: "1",
    pinCode: "302020",
    address: "Shop 12, Sector 11 Market, Mansarovar, Jaipur",
    landmark: "Opposite Metro Station",
    aadhaar: "1122-3344-5566",
    status: "COMMERCIAL",
    propertyType: "Commercial shops",
    propertySubType: "Retail Shop",
    userCharges: 250,
    rfid: "1804574221",
    supervisor: "Ramesh Kumar",
    isSurveyorSupervisor: false,
    latitude: 26.8524,
    longitude: 75.7615
  },
  {
    id: 7,
    date: "2026-06-19T16:40:00Z",
    zone: "Mansarovar",
    ward: "ward 30",
    area: "Sector 11",
    colonyName: "Sector 11 Market",
    plotNo: "Showroom 2",
    first_name: "Jaipur Sweets & Bakers",
    middle_name: "",
    last_name: "",
    ownerName: "Jaipur Sweets & Bakers",
    phone: "0141258963",
    email: "info@jaipursweets.com",
    floor: "Ground Floor",
    flatNo: "Showroom 2",
    numFlats: "1",
    pinCode: "302020",
    address: "Showroom 2, Sector 11 Road, Mansarovar, Jaipur",
    landmark: "Near SBI Bank",
    aadhaar: "",
    status: "COMMERCIAL",
    propertyType: "Medium/Large commercial outlets",
    propertySubType: "Restaurant",
    userCharges: 500,
    rfid: "1804574998",
    supervisor: "Ramesh Kumar",
    isSurveyorSupervisor: false,
    latitude: 26.8532,
    longitude: 75.7628
  }
];

export default function SurveyListPage() {
  const [surveys, setSurveys] = useState<SurveyRecord[]>(INITIAL_SURVEYS);
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(1);
  const [viewMode, setViewMode] = useState<"workspace" | "table">("workspace");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  // ─── Search & Filter State ────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRfid, setFilterRfid] = useState("");
  const [filterZone, setFilterZone] = useState("");
  const [filterWard, setFilterWard] = useState("");
  const [filterArea, setFilterArea] = useState("");
  const [filterColony, setFilterColony] = useState("");
  const [filterPlot, setFilterPlot] = useState("");
  const [filterSupervisor, setFilterSupervisor] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");

  // ─── Form State for Editing/Viewing ────────────────────────────────────────
  const [editForm, setEditForm] = useState<Partial<SurveyRecord>>({});
  const [activeFormTab, setActiveFormTab] = useState<"property" | "location" | "contact">("property");

  // Selected Survey details computed
  const selectedSurvey = useMemo(() => {
    return surveys.find((s) => s.id === selectedSurveyId) || surveys[0] || null;
  }, [selectedSurveyId, surveys]);

  // Load selected survey into edit form when editing triggers or selection changes
  useEffect(() => {
    if (selectedSurvey) {
      setEditForm({ ...selectedSurvey });
    }
  }, [selectedSurvey, isEditing]);

  // ─── Filtering Logic ───────────────────────────────────────────────────────
  const filteredSurveys = useMemo(() => {
    return surveys.filter((s) => {
      // 1. Text Search query (First/Last name, Plot No, RFID, address)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesOwner = s.ownerName.toLowerCase().includes(q);
        const matchesPlot = s.plotNo.toLowerCase().includes(q);
        const matchesRfid = s.rfid.toLowerCase().includes(q);
        const matchesAddr = s.address.toLowerCase().includes(q);
        const matchesArea = s.area.toLowerCase().includes(q);

        if (!matchesOwner && !matchesPlot && !matchesRfid && !matchesAddr && !matchesArea) {
          return false;
        }
      }

      // 2. Specific filter dropdowns
      if (filterRfid.trim() && !s.rfid.includes(filterRfid.trim())) return false;
      if (filterZone && s.zone !== filterZone) return false;
      if (filterWard && s.ward !== filterWard) return false;
      if (filterArea && s.area !== filterArea) return false;
      if (filterColony && s.colonyName !== filterColony) return false;
      if (filterPlot && s.plotNo !== filterPlot) return false;
      if (filterSupervisor && s.supervisor !== filterSupervisor) return false;
      if (filterStatus && s.status !== filterStatus) return false;

      // 3. Date filter
      if (filterFromDate) {
        const fromDate = new Date(filterFromDate);
        const sDate = new Date(s.date);
        if (sDate < fromDate) return false;
      }
      if (filterToDate) {
        const toDate = new Date(filterToDate);
        // End of the day boundary for proper comparison
        toDate.setHours(23, 59, 59, 999);
        const sDate = new Date(s.date);
        if (sDate > toDate) return false;
      }

      return true;
    });
  }, [
    surveys,
    searchQuery,
    filterRfid,
    filterZone,
    filterWard,
    filterArea,
    filterColony,
    filterPlot,
    filterSupervisor,
    filterStatus,
    filterFromDate,
    filterToDate,
  ]);

  // Compute number of active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterRfid) count++;
    if (filterZone) count++;
    if (filterWard) count++;
    if (filterArea) count++;
    if (filterColony) count++;
    if (filterPlot) count++;
    if (filterSupervisor) count++;
    if (filterStatus) count++;
    if (filterFromDate) count++;
    if (filterToDate) count++;
    return count;
  }, [
    filterRfid,
    filterZone,
    filterWard,
    filterArea,
    filterColony,
    filterPlot,
    filterSupervisor,
    filterStatus,
    filterFromDate,
    filterToDate,
  ]);

  const resetFilters = () => {
    setFilterRfid("");
    setFilterZone("");
    setFilterWard("");
    setFilterArea("");
    setFilterColony("");
    setFilterPlot("");
    setFilterSupervisor("");
    setFilterStatus("");
    setFilterFromDate("");
    setFilterToDate("");
    setSearchQuery("");
    toast.info("All search filters reset.");
  };

  // ─── Stat Computations ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = filteredSurveys.length;
    const residential = filteredSurveys.filter((s) => s.status === "RESIDENTIAL").length;
    const commercial = filteredSurveys.filter((s) => s.status === "COMMERCIAL").length;
    const totalCharges = filteredSurveys.reduce((sum, s) => sum + s.userCharges, 0);

    return { total, residential, commercial, totalCharges };
  }, [filteredSurveys]);

  // ─── CRUD Handlers ─────────────────────────────────────────────────────────

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!editForm.first_name || !editForm.status || !editForm.rfid) {
      toast.warning("Please fill all required fields marked with *");
      return;
    }

    const fullName = `${editForm.first_name} ${editForm.middle_name ? editForm.middle_name + " " : ""}${editForm.last_name || ""}`.trim();
    const updatedRecord: SurveyRecord = {
      ...(editForm as SurveyRecord),
      ownerName: fullName,
    };

    setSurveys((prev) =>
      prev.map((s) => (s.id === updatedRecord.id ? updatedRecord : s))
    );

    toast.success(`Survey for "${fullName}" updated successfully!`);
    setIsEditing(false);
  };

  const handleDelete = (id: number) => {
    setSurveys((prev) => prev.filter((s) => s.id !== id));
    toast.error("Survey record deleted successfully.");
    if (selectedSurveyId === id) {
      setSelectedSurveyId(null);
    }
  };

  // ─── Export CSV ────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const headers = [
      "Sr. No.",
      "Date",
      "Zone Name",
      "Ward Name",
      "Colony Name",
      "Plot No",
      "Property Owner Name",
      "Mobile No.",
      "Pin Code",
      "Status",
      "User Charges Amount",
      "RFID Tag",
      "Supervisor",
    ];

    const rows = filteredSurveys.map((s, idx) => [
      idx + 1,
      formatDate(s.date),
      s.zone,
      s.ward,
      s.colonyName,
      s.plotNo,
      s.ownerName,
      s.phone || "—",
      s.pinCode || "—",
      s.status,
      s.userCharges,
      s.rfid,
      s.supervisor,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.map(val => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `survey_list_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("Survey list exported as CSV.");
  };

  // ─── Format helper for display ──────────────────────────────────────────────
  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }) + " " + d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
      
      {/* Page Header */}
      <PageHeader
        title="Survey List Workspace"
        description="Comprehensive log of RFID scanner installations and solid waste management property surveys."
        breadcrumbs={[
          { label: "VSWM", href: "/vswm/shift" },
          { label: "RFID Management", href: "/vswm/rfid-coverage" },
          { label: "Survey List" },
        ]}
        actions={
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="bg-theme-surface border border-theme-border rounded-xl p-1 flex items-center shadow-sm">
              <button
                onClick={() => setViewMode("workspace")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  viewMode === "workspace"
                    ? "bg-[#10B981] text-white shadow-sm"
                    : "text-theme-text-dim hover:text-theme-text"
                }`}
              >
                <Sliders size={13} />
                Interactive Workspace
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  viewMode === "table"
                    ? "bg-[#10B981] text-white shadow-sm"
                    : "text-theme-text-dim hover:text-theme-text"
                }`}
              >
                <List size={13} />
                Condensed Table
              </button>
            </div>

            {/* CSV Export */}
            <Button variant="outline" className="flex items-center gap-2 shadow-sm" onClick={handleExportCSV}>
              <Download size={14} />
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Stats Dashboard Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 shrink-0">
        <StatCard
          title="Survey Count"
          value={stats.total}
          icon={<FileText size={18} className="text-[#10B981]" />}
          description="Filtered survey entries"
        />
        <StatCard
          title="Residential"
          value={stats.residential}
          icon={<Home size={18} className="text-blue-500" />}
          description="Residential property tags"
        />
        <StatCard
          title="Commercial"
          value={stats.commercial}
          icon={<Building2 size={18} className="text-purple-500" />}
          description="Shops & warehouses"
        />
      </div>

      {/* Workspace Toolbar: Search Dock & Filter Triggers */}
      <div className="bg-theme-surface border border-theme-border rounded-2xl p-3 md:p-4 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4 shadow-sm shrink-0">
        {/* Floating Search Dock */}
        <div className="relative w-full md:w-80 lg:w-96 group">
          <input
            type="text"
            placeholder="Search by name, RFID tag, plot number, area..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-theme-base/50 text-xs text-theme-text placeholder:text-theme-text-dim border border-theme-border rounded-xl pl-9.5 pr-4 py-2.5 outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/15 transition duration-150"
          />
          <Search size={14} className="absolute left-3.5 top-3.5 text-theme-text-dim group-focus-within:text-[#10B981] transition-colors" />
        </div>

        {/* Filters and Actions */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="text-xs text-rose-500 hover:text-rose-600 font-bold px-3 py-2 bg-rose-50 hover:bg-rose-100/70 border border-rose-200/50 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={12} />
              Reset Filters
            </button>
          )}

          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm relative ${
              isFilterOpen
                ? "bg-[#10B981]/10 border-[#10B981] text-[#10B981]"
                : "bg-theme-surface border-theme-border text-theme-text hover:border-theme-accent/40"
            }`}
          >
            <SlidersHorizontal size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#10B981] text-white text-[10px] font-black flex items-center justify-center animate-bounce shadow-md">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Workspace Panel Container */}
      <div className="flex-1 flex overflow-hidden relative gap-6">
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {viewMode === "workspace" ? (
            /* Layout Mode A: Split Screen Workspace */
            <div className="flex-1 flex overflow-hidden gap-5 relative">
              
              {/* Left Panel: Card Feed List */}
              <div className={`${mobileView === "list" ? "flex" : "hidden md:flex"} w-full md:w-[350px] lg:w-[400px] flex flex-col h-full border border-theme-border rounded-2xl bg-theme-surface overflow-hidden shadow-sm shrink-0`}>
                <div className="p-4 border-b border-theme-border flex items-center justify-between bg-theme-base/20 shrink-0">
                  <div className="text-[11px] font-black uppercase tracking-wider text-theme-text-dim">
                    Survey Records ({filteredSurveys.length})
                  </div>
                  <span className="text-[9px] px-2 py-0.5 bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/20 font-bold rounded-full">
                    RFID Installed
                  </span>
                </div>
                
                {/* List Container */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 pb-10 space-y-2.5 bg-theme-base/15">
                  {filteredSurveys.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <BadgeAlert className="h-10 w-10 text-theme-text-dim opacity-40 mb-3" />
                      <p className="text-xs font-black text-theme-text uppercase tracking-wider">No Surveys Match</p>
                      <p className="text-[10px] text-theme-text-dim mt-1">Refine your active filters or clear search query.</p>
                    </div>
                  ) : (
                    filteredSurveys.map((item) => {
                      const isSelected = item.id === selectedSurveyId;
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSelectedSurveyId(item.id);
                            setIsEditing(false);
                            setMobileView("detail");
                          }}
                          className={`group border rounded-xl p-4 cursor-pointer transition-all duration-200 text-left relative ${
                            isSelected
                              ? "bg-theme-surface border-[#10B981] ring-2 ring-[#10B981]/10 shadow-md translate-x-1"
                              : "bg-theme-surface border-theme-border hover:border-theme-accent/40 hover:shadow-sm"
                          }`}
                        >
                          {/* Top Status & RFID */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                              item.status === "RESIDENTIAL" 
                                ? "bg-blue-50 text-blue-600 border border-blue-100"
                                : "bg-purple-50 text-purple-600 border border-purple-100"
                            }`}>
                              {item.status}
                            </span>
                            <span className="text-[10px] font-mono text-theme-text-dim flex items-center gap-1">
                              <Hash size={10} />
                              {item.rfid || "—"}
                            </span>
                          </div>

                          {/* Owner Name */}
                          <div className="text-sm font-bold text-theme-text group-hover:text-[#10B981] transition-colors leading-snug">
                            {item.ownerName}
                          </div>

                          {/* Details Row */}
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 mt-2.5 pt-2.5 border-t border-theme-border/60 text-[10px] text-theme-text-dim">
                            <div className="flex items-center gap-1.5">
                              <MapPin size={11} className="text-emerald-500" />
                              <span className="truncate">{item.zone} / {item.ward}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Home size={11} className="text-blue-500" />
                              <span className="truncate">Plot {item.plotNo}</span>
                            </div>
                            <div className="flex items-center gap-1.5 col-span-2">
                              <Calendar size={11} className="text-amber-500" />
                              <span>{formatDate(item.date)}</span>
                            </div>
                          </div>

                          {/* Chevron icon hover helper */}
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ChevronRight size={16} className="text-[#10B981]" />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Panel: Selected Survey Inspector Detail Panel / Form */}
              <div className={`${mobileView === "detail" ? "flex" : "hidden md:flex"} flex-1 flex flex-col h-full border border-theme-border rounded-2xl bg-theme-surface overflow-hidden shadow-sm relative`}>
                {selectedSurvey ? (
                  isEditing ? (
                    /* EDIT SURVEY FORM LAYOUT */
                    <form onSubmit={handleEditSubmit} className="flex-1 flex flex-col h-full overflow-hidden">
                      {/* Form Header */}
                      <div className="px-6 py-4 border-b border-theme-border bg-theme-base/10 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                          {/* Mobile Back Button */}
                          <button
                            type="button"
                            onClick={() => setMobileView("list")}
                            className="md:hidden p-1.5 bg-theme-base border border-theme-border rounded-lg hover:text-[#10B981] transition cursor-pointer"
                            title="Back to List"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <div>
                            <h3 className="font-black text-sm text-theme-text uppercase tracking-wider">Edit Survey Details</h3>
                            <p className="text-[10px] text-theme-text-dim font-medium mt-0.5">Modify fields and submit to save updates.</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsEditing(false)}
                          className="text-theme-text-dim hover:text-rose-500 p-1.5 hover:bg-theme-elevated rounded-lg transition"
                        >
                          <X size={15} />
                        </button>
                      </div>

                      {/* Form Tabs */}
                      <div className="px-6 border-b border-theme-border flex items-center gap-4 bg-theme-surface shrink-0">
                        {(["property", "location", "contact"] as const).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveFormTab(tab)}
                            className={`py-3 text-[10px] font-black uppercase tracking-wider border-b-2 transition-all relative cursor-pointer ${
                              activeFormTab === tab
                                ? "border-[#10B981] text-[#10B981]"
                                : "border-transparent text-theme-text-dim hover:text-theme-text"
                            }`}
                          >
                            {tab === "property" && "Property Specs"}
                            {tab === "location" && "Location Info"}
                            {tab === "contact" && "Owner & Contact"}
                          </button>
                        ))}
                      </div>

                      {/* Form Scroll Content */}
                      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-12 space-y-6">
                        
                        {activeFormTab === "property" && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
                            {/* Property Status */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim flex items-center gap-1">
                                Property Status <span className="text-rose-500">*</span>
                              </label>
                              <select
                                value={editForm.status || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer"
                              >
                                {PROPERTY_STATUS_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>

                            {/* Property Type */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim flex items-center gap-1">
                                Property Type <span className="text-rose-500">*</span>
                              </label>
                              <select
                                value={editForm.propertyType || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, propertyType: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer"
                              >
                                {PROPERTY_TYPE_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>

                            {/* Property Sub Type */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                Property Sub Type
                              </label>
                              <select
                                value={editForm.propertySubType || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, propertySubType: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer"
                              >
                                {PROPERTY_SUB_TYPE_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>

                            {/* User Charges */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                User Charges Amount (₹)
                              </label>
                              <input
                                type="number"
                                value={editForm.userCharges || 0}
                                onChange={(e) => setEditForm(prev => ({ ...prev, userCharges: Number(e.target.value) }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition"
                              />
                            </div>

                            {/* Flat No */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                Flat No.
                              </label>
                              <input
                                type="text"
                                value={editForm.flatNo || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, flatNo: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition"
                              />
                            </div>

                            {/* Floor */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                Floor
                              </label>
                              <input
                                type="text"
                                value={editForm.floor || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, floor: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition"
                              />
                            </div>

                            {/* Number of Flats */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                Number of Flats
                              </label>
                              <input
                                type="text"
                                value={editForm.numFlats || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, numFlats: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition"
                              />
                            </div>

                            {/* RFID */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim flex items-center gap-1">
                                RFID Tag ID <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={editForm.rfid || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, rfid: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition"
                              />
                            </div>
                          </div>
                        )}

                        {activeFormTab === "location" && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
                            {/* Zone */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim flex items-center gap-1">
                                Zone <span className="text-rose-500">*</span>
                              </label>
                              <select
                                value={editForm.zone || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, zone: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer"
                              >
                                {ZONE_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>

                            {/* Ward */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim flex items-center gap-1">
                                Ward <span className="text-rose-500">*</span>
                              </label>
                              <select
                                value={editForm.ward || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, ward: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer"
                              >
                                {WARD_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>

                            {/* Area */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim flex items-center gap-1">
                                Area <span className="text-rose-500">*</span>
                              </label>
                              <select
                                value={editForm.area || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, area: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer"
                              >
                                {AREA_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>

                            {/* Colony Name */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                Colony Name
                              </label>
                              <input
                                type="text"
                                value={editForm.colonyName || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, colonyName: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition"
                              />
                            </div>

                            {/* Plot Number */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                Plot Number
                              </label>
                              <input
                                type="text"
                                value={editForm.plotNo || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, plotNo: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition"
                              />
                            </div>

                            {/* Pin Code */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                Pin Code
                              </label>
                              <input
                                type="text"
                                value={editForm.pinCode || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, pinCode: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition"
                              />
                            </div>

                            {/* Address */}
                            <div className="flex flex-col gap-1.5 sm:col-span-2">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                Complete Address
                              </label>
                              <textarea
                                value={editForm.address || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                                rows={2}
                                className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition resize-none"
                              />
                            </div>

                            {/* Landmark */}
                            <div className="flex flex-col gap-1.5 sm:col-span-2">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                Landmark
                              </label>
                              <input
                                type="text"
                                value={editForm.landmark || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, landmark: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition"
                              />
                            </div>
                          </div>
                        )}

                        {activeFormTab === "contact" && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
                            {/* First Name */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim flex items-center gap-1">
                                First Name <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={editForm.first_name || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, first_name: e.target.value }))}
                                required
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition"
                              />
                            </div>

                            {/* Middle Name */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                Middle Name
                              </label>
                              <input
                                type="text"
                                value={editForm.middle_name || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, middle_name: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition"
                              />
                            </div>

                            {/* Last Name */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                Last Name
                              </label>
                              <input
                                type="text"
                                value={editForm.last_name || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, last_name: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition"
                              />
                            </div>

                            {/* Phone Number */}
                            <div className="flex flex-col gap-1.5 sm:col-span-2">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                Phone Number
                              </label>
                              <input
                                type="text"
                                value={editForm.phone || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition"
                              />
                            </div>

                            {/* Email ID */}
                            <div className="flex flex-col gap-1.5 sm:col-span-2">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                Email ID
                              </label>
                              <input
                                type="email"
                                value={editForm.email || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition"
                              />
                            </div>

                            {/* Aadhaar */}
                            <div className="flex flex-col gap-1.5 sm:col-span-2">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                Aadhaar Number
                              </label>
                              <input
                                type="text"
                                value={editForm.aadhaar || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, aadhaar: e.target.value }))}
                                placeholder="XXXX-XXXX-XXXX"
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition"
                              />
                            </div>

                            {/* Supervisor */}
                            <div className="flex flex-col gap-1.5 sm:col-span-2">
                              <label className="text-[10px] font-black uppercase tracking-wider text-theme-text-dim">
                                Assigned Supervisor
                              </label>
                              <select
                                value={editForm.supervisor || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, supervisor: e.target.value }))}
                                className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer"
                              >
                                {SUPERVISOR_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>

                            {/* Surveyor is Supervisor Toggle */}
                            <div className="flex items-center gap-3 mt-6 sm:col-span-2 lg:col-span-3">
                              <input
                                type="checkbox"
                                id="isSurveyorSupervisor"
                                checked={editForm.isSurveyorSupervisor || false}
                                onChange={(e) => setEditForm(prev => ({ ...prev, isSurveyorSupervisor: e.target.checked }))}
                                className="w-4 h-4 rounded text-[#10B981] focus:ring-[#10B981] border-theme-border transition cursor-pointer"
                              />
                              <label htmlFor="isSurveyorSupervisor" className="text-xs text-theme-text font-bold cursor-pointer select-none">
                                Surveyor is supervisor
                              </label>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Form Footer */}
                      <div className="px-6 py-4 border-t border-theme-border bg-theme-base/10 flex items-center justify-end gap-3 shrink-0">
                        <Button variant="outline" type="button" onClick={() => setIsEditing(false)}>
                          Cancel
                        </Button>
                        <Button variant="accent" type="submit">
                          Save Survey Changes
                        </Button>
                      </div>
                    </form>
                  ) : (
                    /* DETAILED INSPECTION VIEW (DEFAULT SELECTED STATE) */
                    <div className="flex-1 flex flex-col h-full overflow-y-auto custom-scrollbar">
                      
                      {/* Mobile Back Button (Visible only on mobile/tablet) */}
                      <div className="md:hidden p-4 pb-0 bg-theme-surface text-left shrink-0">
                        <button
                          type="button"
                          onClick={() => setMobileView("list")}
                          className="flex items-center gap-1.5 text-xs text-theme-text-dim hover:text-[#10B981] font-bold px-3 py-2 bg-theme-base border border-theme-border rounded-xl cursor-pointer"
                        >
                          <ChevronLeft size={14} />
                          Back to List
                        </button>
                      </div>

                      {/* Premium Cover Banner Card */}
                      <div className="relative h-44 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border-b border-theme-border p-6 flex items-end justify-between overflow-hidden shrink-0">
                        
                        {/* Scanning radar decorative background */}
                        <div className="absolute right-0 top-0 w-80 h-80 rounded-full border border-emerald-500/10 flex items-center justify-center animate-pulse pointer-events-none">
                          <div className="w-64 h-64 rounded-full border border-emerald-500/10 flex items-center justify-center">
                            <div className="w-48 h-48 rounded-full border border-emerald-500/5" />
                          </div>
                        </div>

                        {/* Banner content */}
                        <div className="flex gap-4 items-center z-10">
                          {/* Premium House SVG placeholder */}
                          <div className="w-20 h-20 bg-theme-surface border border-theme-border rounded-2xl flex items-center justify-center shadow-lg relative shrink-0">
                            <svg className="w-12 h-12 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                            </svg>
                            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 font-bold text-[8px] flex items-center justify-center shadow">
                              QR
                            </span>
                          </div>

                          <div className="flex flex-col text-left">
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border tracking-wide uppercase ${
                                selectedSurvey.status === "RESIDENTIAL" 
                                  ? "bg-blue-50/80 text-blue-600 border-blue-200"
                                  : "bg-purple-50/80 text-purple-600 border-purple-200"
                              }`}>
                                {selectedSurvey.status}
                              </span>
                              {selectedSurvey.isSurveyorSupervisor && (
                                <span className="text-[8px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold uppercase tracking-wider">
                                  Supervisor Verified
                                </span>
                              )}
                            </div>
                            <h2 className="text-lg font-black text-theme-text leading-tight mt-1.5">
                              {selectedSurvey.ownerName}
                            </h2>
                            <p className="text-[10px] text-theme-text-dim flex items-center gap-1 mt-1 font-mono">
                              <MapPin size={10} className="text-[#10B981]" />
                              Lat: {selectedSurvey.latitude.toFixed(4)}, Long: {selectedSurvey.longitude.toFixed(4)}
                            </p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2.5 z-10 shrink-0">
                          <button
                            onClick={() => setIsEditing(true)}
                            className="px-3.5 py-2 rounded-xl bg-theme-surface border border-theme-border hover:border-theme-accent/40 text-xs font-bold text-theme-text flex items-center gap-1.5 shadow transition cursor-pointer"
                          >
                            <Sliders size={12} className="text-[#10B981]" />
                            Edit Details
                          </button>
                          <DeleteButton
                            onDelete={() => handleDelete(selectedSurvey.id)}
                            confirmMessage={`Delete survey record for ${selectedSurvey.ownerName}?`}
                          />
                        </div>
                      </div>

                      {/* Content Grid */}
                      <div className="p-6 pb-12 grid grid-cols-1 lg:grid-cols-3 gap-6 text-left">
                        
                        {/* Column 1: Primary Details */}
                        <div className="lg:col-span-2 space-y-6">
                          <Card className="shadow-sm">
                            <CardHeader className="py-4">
                              <CardTitle className="text-xs uppercase tracking-wider text-theme-text-dim flex items-center gap-2">
                                <Layers size={14} className="text-emerald-500" />
                                Property Specifications
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="pb-5 pt-0">
                              <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-xs">
                                <div>
                                  <div className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-0.5">Property Type</div>
                                  <div className="font-semibold text-theme-text">{selectedSurvey.propertyType}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-0.5">Property Subtype</div>
                                  <div className="font-semibold text-theme-text">{selectedSurvey.propertySubType || "—"}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-0.5">Flat Number / Floor</div>
                                  <div className="font-semibold text-theme-text">
                                    {selectedSurvey.flatNo ? `Flat ${selectedSurvey.flatNo}` : "—"} 
                                    {selectedSurvey.floor ? ` (${selectedSurvey.floor})` : ""}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-0.5">Number of Flats</div>
                                  <div className="font-semibold text-theme-text">{selectedSurvey.numFlats || "1"}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-0.5">Assigned Supervisor</div>
                                  <div className="font-semibold text-theme-text flex items-center gap-1.5">
                                    <User size={12} className="text-[#10B981]" />
                                    {selectedSurvey.supervisor}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-0.5">Date Registered</div>
                                  <div className="font-semibold text-theme-text">{formatDate(selectedSurvey.date)}</div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="shadow-sm">
                            <CardHeader className="py-4">
                              <CardTitle className="text-xs uppercase tracking-wider text-theme-text-dim flex items-center gap-2">
                                <MapPin size={14} className="text-[#10B981]" />
                                Address & Geography
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="pb-5 pt-0">
                              <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-xs">
                                <div className="col-span-2">
                                  <div className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-0.5">Complete Address</div>
                                  <div className="font-semibold text-theme-text leading-relaxed">{selectedSurvey.address}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-0.5">Landmark</div>
                                  <div className="font-semibold text-theme-text">{selectedSurvey.landmark || "—"}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-0.5">Pin Code</div>
                                  <div className="font-semibold text-theme-text">{selectedSurvey.pinCode}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-0.5">Zone & Ward</div>
                                  <div className="font-semibold text-theme-text">{selectedSurvey.zone} / {selectedSurvey.ward}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mb-0.5">Colony & Area</div>
                                  <div className="font-semibold text-theme-text">{selectedSurvey.colonyName} / {selectedSurvey.area}</div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Column 2: RFID Metadata & Billing */}
                        <div className="space-y-6">
                          {/* RFID & QR Code Identity Card */}
                          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-lg flex flex-col justify-between h-48 relative overflow-hidden">
                            {/* Decorative background chip */}
                            <div className="absolute right-4 top-4 w-12 h-9 rounded bg-amber-500/20 border border-amber-500/30 backdrop-blur-sm" />
                            
                            <div>
                              <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">RFID Smart Fleet Tag</div>
                              <div className="text-xl font-mono tracking-widest mt-1.5 font-bold">
                                {selectedSurvey.rfid ? selectedSurvey.rfid.match(/.{1,4}/g)?.join(" ") : "SCAN PENDING"}
                              </div>
                            </div>

                            <div className="flex items-end justify-between mt-auto">
                              <div>
                                <div className="text-[8px] font-black uppercase tracking-wider text-slate-400">Owner Name</div>
                                <div className="text-xs font-bold truncate max-w-[160px]">{selectedSurvey.ownerName}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-[8px] font-black uppercase tracking-wider text-slate-400">Status</div>
                                <div className="text-xs font-bold text-[#10B981]">ACTIVE LINK</div>
                              </div>
                            </div>
                          </div>

                          {/* Billing & Charges Card */}
                          <Card className="shadow-sm">
                            <CardHeader className="py-4">
                              <CardTitle className="text-xs uppercase tracking-wider text-theme-text-dim flex items-center gap-2">
                                <CreditCard size={14} className="text-amber-500" />
                                User Charges Details
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="pb-5 pt-0 space-y-4">
                              <div className="flex items-center justify-between border-b border-theme-border pb-3 text-xs">
                                <span className="text-theme-text-dim">User Charges Amount</span>
                                <span className="font-bold text-theme-text text-sm">₹{selectedSurvey.userCharges}</span>
                              </div>
                              
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-theme-text-dim">Contact Phone</span>
                                <span className="font-medium text-theme-text font-mono">
                                  {selectedSurvey.phone ? (
                                    <span className="flex items-center gap-1">
                                      <Phone size={10} className="text-emerald-500" />
                                      {selectedSurvey.phone}
                                    </span>
                                  ) : "—"}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-xs">
                                <span className="text-theme-text-dim">Email Address</span>
                                <span className="font-medium text-theme-text max-w-[140px] truncate">
                                  {selectedSurvey.email ? (
                                    <span className="flex items-center gap-1">
                                      <Mail size={10} className="text-blue-500" />
                                      {selectedSurvey.email}
                                    </span>
                                  ) : "—"}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-xs">
                                <span className="text-theme-text-dim">Aadhaar Number</span>
                                <span className="font-medium text-theme-text font-mono">{selectedSurvey.aadhaar || "—"}</span>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                    <Info className="h-10 w-10 text-theme-text-dim opacity-30 mb-3" />
                    <p className="text-xs font-black text-theme-text uppercase tracking-wider">No Survey Selected</p>
                    <p className="text-[10px] text-theme-text-dim mt-1">Select a survey card from the list to view full details.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Layout Mode B: Condensed Full-width Table View */
            <Card className="flex flex-col h-[650px] shadow-sm">
              <CardContent className="p-0 flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto custom-scrollbar">
                  <Table
                    headers={[
                      <div key="s" className="text-center w-14">S. No.</div>,
                      "DATE",
                      "ZONE & WARD",
                      "OWNER NAME",
                      "MOBILE NO",
                      "PIN CODE",
                      "FLATS",
                      "STATUS",
                      "RFID TAG",
                      "USER CHARGES",
                      <div key="a" className="text-right pr-6 w-24">ACTION</div>,
                    ]}
                    isLoading={false}
                    emptyState="No surveys match the filter criteria."
                  >
                    {filteredSurveys.map((s, idx) => (
                      <tr
                        key={s.id}
                        onClick={() => {
                          setSelectedSurveyId(s.id);
                          setViewMode("workspace");
                          setIsEditing(false);
                        }}
                        className={`hover:bg-theme-base/30 cursor-pointer transition-colors ${
                          selectedSurveyId === s.id ? "bg-theme-elevated/40" : ""
                        }`}
                      >
                        <td className="py-3 px-4 text-center text-theme-text-dim font-mono text-[10px]">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4 text-[11px] text-theme-text-dim">
                          {formatDate(s.date)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-theme-text">{s.zone}</div>
                          <div className="text-[9px] text-theme-text-dim">{s.ward}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-theme-text text-[12px]">{s.ownerName}</div>
                          <div className="text-[9px] text-theme-text-dim font-medium truncate max-w-[150px]">
                            {s.address}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-theme-text-dim">
                          {s.phone || "—"}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-theme-text-dim">
                          {s.pinCode || "—"}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-theme-text text-[11px]">
                          {s.numFlats || "1"}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black border tracking-wide ${
                            s.status === "RESIDENTIAL" 
                              ? "bg-blue-50 text-blue-600 border-blue-100"
                              : "bg-purple-50 text-purple-600 border-purple-100"
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-theme-text-dim">
                          {s.rfid || "—"}
                        </td>
                        <td className="py-3 px-4 font-bold text-theme-text text-xs">
                          ₹{s.userCharges}
                        </td>
                        <td className="py-3 px-4 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2.5">
                            <button
                              onClick={() => {
                                setSelectedSurveyId(s.id);
                                setViewMode("workspace");
                                setIsEditing(true);
                              }}
                              className="p-1.5 text-theme-text-dim hover:text-[#10B981] hover:bg-theme-elevated rounded-lg transition"
                            >
                              <Sliders size={13} />
                            </button>
                            <DeleteButton
                              onDelete={() => handleDelete(s.id)}
                              confirmMessage={`Delete survey record for ${s.ownerName}?`}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Collapsible Filter Sidebar Panel */}
        {isFilterOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black/35 backdrop-blur-xs z-45 transition-opacity"
              onClick={() => setIsFilterOpen(false)}
            />
            <div className="fixed right-0 top-0 bottom-0 z-50 w-80 h-full bg-theme-surface border-l border-theme-border flex flex-col shadow-2xl animate-slide-in-right overflow-hidden">
              {/* Filter Header */}
              <div className="px-4 py-3.5 border-b border-theme-border bg-theme-base/20 flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                  <SlidersHorizontal size={12} className="text-[#10B981]" />
                  Filter Workspace
                </span>
                <button
                  onClick={() => setIsFilterOpen(false)}
                  className="text-theme-text-dim hover:text-theme-text p-1 hover:bg-theme-elevated rounded-lg transition cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

            {/* Filter Select Scroll Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 text-left">
              {/* RFID */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-theme-text-dim">RFID Number</label>
                <input
                  type="text"
                  placeholder="Enter RFID tag ID..."
                  value={filterRfid}
                  onChange={(e) => setFilterRfid(e.target.value)}
                  className="bg-theme-base/40 border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text placeholder:text-theme-text-dim outline-none focus:border-[#10B981]"
                />
              </div>

              {/* Zone */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-theme-text-dim">Zone</label>
                <select
                  value={filterZone}
                  onChange={(e) => setFilterZone(e.target.value)}
                  className="bg-theme-base/40 border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text outline-none focus:border-[#10B981] cursor-pointer"
                >
                  <option value="">Select zone…</option>
                  {ZONE_OPTIONS.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>

              {/* Ward */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-theme-text-dim">Ward</label>
                <select
                  value={filterWard}
                  onChange={(e) => setFilterWard(e.target.value)}
                  className="bg-theme-base/40 border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text outline-none focus:border-[#10B981] cursor-pointer"
                >
                  <option value="">Select ward…</option>
                  {WARD_OPTIONS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>

              {/* Area */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-theme-text-dim">Area</label>
                <select
                  value={filterArea}
                  onChange={(e) => setFilterArea(e.target.value)}
                  className="bg-theme-base/40 border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text outline-none focus:border-[#10B981] cursor-pointer"
                >
                  <option value="">Select area…</option>
                  {AREA_OPTIONS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>

              {/* Colony Name */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-theme-text-dim">Colony Name</label>
                <select
                  value={filterColony}
                  onChange={(e) => setFilterColony(e.target.value)}
                  className="bg-theme-base/40 border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text outline-none focus:border-[#10B981] cursor-pointer"
                >
                  <option value="">Select colony…</option>
                  {COLONY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Plot No */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-theme-text-dim">Plot No.</label>
                <select
                  value={filterPlot}
                  onChange={(e) => setFilterPlot(e.target.value)}
                  className="bg-theme-base/40 border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text outline-none focus:border-[#10B981] cursor-pointer"
                >
                  <option value="">Select plot…</option>
                  {PLOT_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Supervisor */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-theme-text-dim">Supervisor</label>
                <select
                  value={filterSupervisor}
                  onChange={(e) => setFilterSupervisor(e.target.value)}
                  className="bg-theme-base/40 border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text outline-none focus:border-[#10B981] cursor-pointer"
                >
                  <option value="">Select supervisor…</option>
                  {SUPERVISOR_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Property Status */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-theme-text-dim">Property Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-theme-base/40 border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text outline-none focus:border-[#10B981] cursor-pointer"
                >
                  <option value="">Select status…</option>
                  {PROPERTY_STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              {/* From Date */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-theme-text-dim">From Date</label>
                <input
                  type="date"
                  value={filterFromDate}
                  onChange={(e) => setFilterFromDate(e.target.value)}
                  className="bg-theme-base/40 border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text outline-none focus:border-[#10B981]"
                />
              </div>

              {/* To Date */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-theme-text-dim">To Date</label>
                <input
                  type="date"
                  value={filterToDate}
                  onChange={(e) => setFilterToDate(e.target.value)}
                  className="bg-theme-base/40 border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text outline-none focus:border-[#10B981]"
                />
              </div>
            </div>

            {/* Filter Footer Actions */}
            <div className="p-4 border-t border-theme-border bg-theme-base/10 flex items-center justify-between shrink-0">
              <Button variant="outline" size="sm" className="w-full mr-2" onClick={resetFilters}>
                Clear All
              </Button>
              <Button variant="primary" size="sm" className="w-full" onClick={() => setIsFilterOpen(false)}>
                Apply
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  </div>
);
}
