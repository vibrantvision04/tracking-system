"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { Card, CardContent } from "@/components/ui/Card";
import StatCard from "@/components/shared/StatCard";
import ReportHeader from "@/components/shared/ReportHeader";
import { Users, User, MapPin, Wifi, WifiOff, Search, Filter } from "lucide-react";

const EmployeeMap = dynamic(() => import("@/components/EmployeeMap"), {
  ssr: false,
});

export interface Employee {
  id: number;
  employee_id: string;
  name: string;
  designation: "Road Sweeping Staff" | "Supervisor" | "Zone Manager";
  mobile_number: string;
  zone: string;
  ward: string;
  area: string;
  latitude: number;
  longitude: number;
  last_gps_update: string;
  status: "Online" | "Offline";
}

export default function EmployeeMonitoringPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Filter states
  const [filters, setFilters] = useState({
    employee_type: "",
    zone: "",
    ward: "",
    area: "",
    status: "",
    search: "",
  });

  // Generate realistic dummy data
  const generateDummyData = () => {
    const roadSweepingStaff = [
      { id: 1, name: "Ramesh Kumar", employee_id: "EMP001", mobile_number: "9876543210" },
      { id: 2, name: "Suresh Sharma", employee_id: "EMP002", mobile_number: "9812345678" },
      { id: 3, name: "Mukesh Meena", employee_id: "EMP003", mobile_number: "9887654321" },
      { id: 4, name: "Dinesh Yadav", employee_id: "EMP004", mobile_number: "9765432109" },
      { id: 5, name: "Sunil Verma", employee_id: "EMP005", mobile_number: "9654321098" },
      { id: 6, name: "Ravi Gurjar", employee_id: "EMP006", mobile_number: "9543210987" },
      { id: 7, name: "Mahendra Meena", employee_id: "EMP007", mobile_number: "9432109876" },
      { id: 8, name: "Omprakash Sharma", employee_id: "EMP008", mobile_number: "9321098765" },
      { id: 9, name: "Vinod Jat", employee_id: "EMP009", mobile_number: "9210987654" },
      { id: 10, name: "Raju Kumar", employee_id: "EMP010", mobile_number: "9109876543" },
    ];

    const supervisors = [
      { id: 11, name: "Praveen Sharma", employee_id: "EMP011", mobile_number: "9087654321" },
      { id: 12, name: "Rohit Beniwal", employee_id: "EMP012", mobile_number: "8976543210" },
      { id: 13, name: "Anil Beniwal", employee_id: "EMP013", mobile_number: "8865432109" },
      { id: 14, name: "Mahesh Kumar", employee_id: "EMP014", mobile_number: "8754321098" },
    ];

    const zoneManagers = [
      { id: 15, name: "Ravi Sharma", employee_id: "EMP015", mobile_number: "8643210987" },
      { id: 16, name: "Deepak Gupta", employee_id: "EMP016", mobile_number: "8532109876" },
    ];

    const zones = ["Zone A", "Zone B", "Zone C", "Zone D", "Zone E"];
    const wards = ["Ward 12", "Ward 22", "Ward 34", "Ward 45", "Ward 55"];
    const areas = ["Malviya Nagar", "Jagatpura", "Jawahar Nagar", "Sanganer", "Transport Nagar", "Mansarovar", "Tonk Road"];

    // Jaipur base coordinates
    const jaipurBase = { lat: 26.9124, lng: 75.7873 };

    const allEmployees: Employee[] = [
      ...roadSweepingStaff.map((emp, i) => ({
        ...emp,
        designation: "Road Sweeping Staff" as const,
        zone: zones[i % zones.length],
        ward: wards[i % wards.length],
        area: areas[i % areas.length],
        latitude: jaipurBase.lat + (Math.random() - 0.5) * 0.05,
        longitude: jaipurBase.lng + (Math.random() - 0.5) * 0.05,
        last_gps_update: new Date(Date.now() - Math.random() * 300000).toISOString(),
        status: (Math.random() > 0.3 ? "Online" : "Offline") as "Online" | "Offline",
      })),
      ...supervisors.map((emp, i) => ({
        ...emp,
        designation: "Supervisor" as const,
        zone: zones[i % zones.length],
        ward: wards[i % wards.length],
        area: areas[(i + 2) % areas.length],
        latitude: jaipurBase.lat + (Math.random() - 0.5) * 0.05,
        longitude: jaipurBase.lng + (Math.random() - 0.5) * 0.05,
        last_gps_update: new Date(Date.now() - Math.random() * 300000).toISOString(),
        status: (Math.random() > 0.2 ? "Online" : "Offline") as "Online" | "Offline",
      })),
      ...zoneManagers.map((emp, i) => ({
        ...emp,
        designation: "Zone Manager" as const,
        zone: zones[i % zones.length],
        ward: wards[i % wards.length],
        area: areas[(i + 4) % areas.length],
        latitude: jaipurBase.lat + (Math.random() - 0.5) * 0.05,
        longitude: jaipurBase.lng + (Math.random() - 0.5) * 0.05,
        last_gps_update: new Date(Date.now() - Math.random() * 300000).toISOString(),
        status: (Math.random() > 0.1 ? "Online" : "Offline") as "Online" | "Offline",
      })),
    ];

    setEmployees(allEmployees);
    setHasLoaded(true);
  };

  // Real-time GPS simulation
  useEffect(() => {
    if (!hasLoaded) return;

    const interval = setInterval(() => {
      setEmployees(prev => prev.map(emp => {
        if (emp.status === "Offline") return emp;
        
        // Slight movement simulation
        const movement = 0.0001;
        return {
          ...emp,
          latitude: emp.latitude + (Math.random() - 0.5) * movement,
          longitude: emp.longitude + (Math.random() - 0.5) * movement,
          last_gps_update: new Date().toISOString(),
        };
      }));
    }, 8000); // Update every 8 seconds

    return () => clearInterval(interval);
  }, [hasLoaded]);

  // Status update simulation
  useEffect(() => {
    if (!hasLoaded) return;

    const interval = setInterval(() => {
      setEmployees(prev => prev.map(emp => {
        // Randomly flip status occasionally
        if (Math.random() > 0.95) {
          return {
            ...emp,
            status: emp.status === "Online" ? "Offline" : "Online",
            last_gps_update: new Date().toISOString(),
          };
        }
        return emp;
      }));
    }, 15000); // Check status every 15 seconds

    return () => clearInterval(interval);
  }, [hasLoaded]);

  const loadEmployees = () => {
    setLoading(true);
    setTimeout(() => {
      generateDummyData();
      setLoading(false);
    }, 500);
  };

  // Filter logic
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (filters.employee_type && emp.designation !== filters.employee_type) return false;
      if (filters.zone && emp.zone !== filters.zone) return false;
      if (filters.ward && emp.ward !== filters.ward) return false;
      if (filters.area && emp.area !== filters.area) return false;
      if (filters.status && emp.status !== filters.status) return false;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (!emp.name.toLowerCase().includes(searchLower) &&
            !emp.employee_id.toLowerCase().includes(searchLower) &&
            !emp.mobile_number.includes(searchLower)) {
          return false;
        }
      }
      return true;
    });
  }, [employees, filters]);

  // Extract unique values for filters
  const uniqueZones = [...new Set(employees.map(e => e.zone))];
  const uniqueWards = [...new Set(employees.map(e => e.ward))];
  const uniqueAreas = [...new Set(employees.map(e => e.area))];

  // Statistics
  const stats = useMemo(() => {
    return {
      total: employees.length,
      roadSweepingStaff: employees.filter(e => e.designation === "Road Sweeping Staff").length,
      supervisors: employees.filter(e => e.designation === "Supervisor").length,
      zoneManagers: employees.filter(e => e.designation === "Zone Manager").length,
      online: employees.filter(e => e.status === "Online").length,
      offline: employees.filter(e => e.status === "Offline").length,
    };
  }, [employees]);

  const handleEmployeeClick = (employee: Employee) => {
    setSelectedEmployee(employee);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans">
      <ReportHeader
        title="Employee Monitoring"
        subtitle="Real-time Employee GPS Tracking"
        variant="detailed"
      />

      {/* Filters */}
      <div className="bg-theme-surface border-b border-theme-border px-6 py-3 flex flex-wrap items-end gap-3 shrink-0">
        {/* Employee Type */}
        <div className="flex flex-col w-40">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
            Employee Type
          </label>
          <SearchableSelect
            value={filters.employee_type}
            onChange={(val) => setFilters((prev) => ({ ...prev, employee_type: val }))}
            options={[
              { value: "", label: "All Types" },
              { value: "Road Sweeping Staff", label: "Road Sweeping Staff" },
              { value: "Supervisor", label: "Supervisor" },
              { value: "Zone Manager", label: "Zone Manager" },
            ]}
            placeholder="All Types"
          />
        </div>

        {/* Zone */}
        <div className="flex flex-col w-36">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
            Zone
          </label>
          <SearchableSelect
            value={filters.zone}
            onChange={(val) => setFilters((prev) => ({ ...prev, zone: val, ward: "" }))}
            options={[
              { value: "", label: "All Zones" },
              ...uniqueZones.map((z) => ({ value: z, label: z }))
            ]}
            placeholder="All Zones"
          />
        </div>

        {/* Ward */}
        <div className="flex flex-col w-36">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
            Ward
          </label>
          <SearchableSelect
            value={filters.ward}
            onChange={(val) => setFilters((prev) => ({ ...prev, ward: val }))}
            options={[
              { value: "", label: "All Wards" },
              ...uniqueWards.map((w) => ({ value: w, label: w }))
            ]}
            placeholder="All Wards"
          />
        </div>

        {/* Area */}
        <div className="flex flex-col w-36">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
            Area
          </label>
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

        {/* Status */}
        <div className="flex flex-col w-32">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
            Status
          </label>
          <SearchableSelect
            value={filters.status}
            onChange={(val) => setFilters((prev) => ({ ...prev, status: val }))}
            options={[
              { value: "", label: "All" },
              { value: "Online", label: "Online" },
              { value: "Offline", label: "Offline" },
            ]}
            placeholder="All"
          />
        </div>

        {/* Search */}
        <div className="flex flex-col">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
            Search
          </label>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            placeholder="Name, ID, Mobile"
            className="w-48 bg-white border border-slate-200 px-3 py-1.5 rounded text-sm text-black hover:border-slate-300 focus:border-emerald-500 outline-none transition font-medium shadow-sm placeholder:text-slate-400"
          />
        </div>

        {/* Reset */}
        <button
          onClick={() => setFilters({ employee_type: "", zone: "", ward: "", area: "", status: "", search: "" })}
          className="self-end h-9 px-4 text-xs font-bold border border-theme-border bg-theme-base hover:bg-theme-surface-hover text-theme-text-dim rounded-lg transition cursor-pointer"
        >
          ↺ Reset
        </button>

        {/* Load Button */}
        <button
          onClick={loadEmployees}
          disabled={loading}
          className="self-end h-9 px-4 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition cursor-pointer disabled:opacity-50"
        >
          {loading ? "Loading..." : "Load Employees"}
        </button>
      </div>

      {/* Stats Banner */}
      {hasLoaded && (
        <div className="bg-theme-surface/50 border-b border-theme-border px-6 py-2.5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
          <StatCard title="Total Employees" value={stats.total} icon={<Users size={20} />} />
          <StatCard title="Road Sweeping Staff" value={stats.roadSweepingStaff} icon={<User size={20} />} />
          <StatCard title="Supervisors" value={stats.supervisors} icon={<User size={20} />} />
          <StatCard title="Zone Managers" value={stats.zoneManagers} icon={<User size={20} />} />
          <StatCard title="Online" value={stats.online} icon={<Wifi size={20} />} />
          <StatCard title="Offline" value={stats.offline} icon={<WifiOff size={20} />} />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative min-h-0">
          {!hasLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-theme-base">
              <div className="text-center">
                <div className="text-4xl mb-4">👥</div>
                <p className="text-sm font-bold text-theme-text-dim uppercase tracking-wider">
                  Click "Load Employees" to start monitoring
                </p>
              </div>
            </div>
          )}
          {hasLoaded && filteredEmployees.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-theme-base/80 backdrop-blur-sm z-10">
              <div className="text-center">
                <div className="text-4xl mb-4">🔍</div>
                <p className="text-sm font-bold text-theme-text-dim uppercase tracking-wider">
                  No employees match filters
                </p>
                <button
                  onClick={() => setFilters({ employee_type: "", zone: "", ward: "", area: "", status: "", search: "" })}
                  className="mt-3 text-xs font-bold text-emerald-500 underline cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            </div>
          )}
          {hasLoaded && <EmployeeMap employees={filteredEmployees} selectedEmployee={selectedEmployee} onEmployeeClick={handleEmployeeClick} />}
        </div>

        {/* Employee List Panel */}
        {hasLoaded && (
          <div className="w-96 bg-theme-surface border-l border-theme-border flex flex-col shrink-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-theme-border">
              <h3 className="text-sm font-bold text-theme-text uppercase tracking-wider flex items-center gap-2">
                <Users size={16} />
                Employee List ({filteredEmployees.length})
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {filteredEmployees.map((employee) => (
                <div
                  key={employee.id}
                  onClick={() => handleEmployeeClick(employee)}
                  className={`px-4 py-3 border-b border-theme-border cursor-pointer transition hover:bg-theme-elevated ${
                    selectedEmployee?.id === employee.id ? "bg-theme-elevated border-l-4 border-l-emerald-500" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-semibold text-sm text-theme-text">{employee.name}</div>
                      <div className="text-[10px] text-theme-text-dim">{employee.employee_id}</div>
                    </div>
                    <span className={`px-2 py-1 rounded text-[9px] font-bold ${
                      employee.status === "Online" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                    }`}>
                      {employee.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[9px] font-bold text-theme-text-dim uppercase block">Designation</span>
                      <span className="text-theme-text">{employee.designation}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-theme-text-dim uppercase block">Zone</span>
                      <span className="text-theme-text">{employee.zone}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-theme-text-dim uppercase block">Ward</span>
                      <span className="text-theme-text">{employee.ward}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-theme-text-dim uppercase block">Last Update</span>
                      <span className="text-theme-text">
                        {new Date(employee.last_gps_update).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
