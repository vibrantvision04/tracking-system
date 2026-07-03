"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { toast } from "react-toastify";

import { Card, CardContent } from "@/components/ui/Card";
import StatCard from "@/components/shared/StatCard";
import ReportHeader from "@/components/shared/ReportHeader";
import { Users, User, MapPin, Wifi, WifiOff } from "lucide-react";

const EmployeeMap = dynamic(() => import("@/components/EmployeeMap"), { ssr: false });

// ─── Dummy Data ──────────────────────────────────────────────────────────────

const DUMMY_EMPLOYEES: Employee[] = [
  { id: 1, employee_id: 1, name: "Rajesh Sharma", employee_code: "EMP001", contact_no: "9829012345", latitude: 26.9124, longitude: 75.7873, last_gps_update: new Date().toISOString(), status: "Online", designation: "Driver", designation_id: 1, department_name: "Collection", department_id: 1, zone: "HMZ", ward: "Ward 10", area: "Zorawar Singh Gate", mobile_number: "9829012345" },
  { id: 2, employee_id: 2, name: "Sunita Verma", employee_code: "EMP002", contact_no: "9829012346", latitude: 26.9234, longitude: 75.7981, last_gps_update: new Date().toISOString(), status: "Online", designation: "Supervisor", designation_id: 2, department_name: "Supervision", department_id: 2, zone: "Mansarovar", ward: "Ward 20", area: "Ghat Gate", mobile_number: "9829012346" },
  { id: 3, employee_id: 3, name: "Amit Gupta", employee_code: "EMP003", contact_no: "9829012347", latitude: 26.9087, longitude: 75.7765, last_gps_update: new Date(Date.now() - 60000).toISOString(), status: "Online", designation: "Road Sweeper", designation_id: 3, department_name: "Sweeping", department_id: 3, zone: "Sanganer", ward: "Ward 30", area: "Sector 11", mobile_number: "9829012347" },
  { id: 4, employee_id: 4, name: "Priya Chauhan", employee_code: "EMP004", contact_no: "9829012348", latitude: 26.9345, longitude: 75.8099, last_gps_update: new Date(Date.now() - 120000).toISOString(), status: "Online", designation: "Driver", designation_id: 1, department_name: "Collection", department_id: 1, zone: "Civil Lines", ward: "Ward 40", area: "Sector 2", mobile_number: "9829012348" },
  { id: 5, employee_id: 5, name: "Vijay Meena", employee_code: "EMP005", contact_no: "9829012349", latitude: 26.8765, longitude: 75.7654, last_gps_update: new Date(Date.now() - 300000).toISOString(), status: "Offline", designation: "Road Sweeper", designation_id: 3, department_name: "Sweeping", department_id: 3, zone: "Vidhyadhar Nagar", ward: "Ward 50", area: "Sanganer Ind Area", mobile_number: "9829012349" },
  { id: 6, employee_id: 6, name: "Kavita Jain", employee_code: "EMP006", contact_no: "9829012350", latitude: 26.9155, longitude: 75.7890, last_gps_update: new Date().toISOString(), status: "Online", designation: "Supervisor", designation_id: 2, department_name: "Supervision", department_id: 2, zone: "HMZ", ward: "Ward 10", area: "Zorawar Singh Gate", mobile_number: "9829012350" },
  { id: 7, employee_id: 7, name: "Deepak Yadav", employee_code: "EMP007", contact_no: "9829012351", latitude: 26.9276, longitude: 75.8012, last_gps_update: new Date(Date.now() - 90000).toISOString(), status: "Online", designation: "Driver", designation_id: 1, department_name: "Collection", department_id: 1, zone: "Mansarovar", ward: "Ward 20", area: "Ghat Gate", mobile_number: "9829012351" },
  { id: 8, employee_id: 8, name: "Neha Sharma", employee_code: "EMP008", contact_no: "9829012352", latitude: 26.9055, longitude: 75.7732, last_gps_update: new Date(Date.now() - 600000).toISOString(), status: "Offline", designation: "Road Sweeper", designation_id: 3, department_name: "Sweeping", department_id: 3, zone: "Sanganer", ward: "Ward 30", area: "Sector 11", mobile_number: "9829012352" },
  { id: 9, employee_id: 9, name: "Ravi Kumar", employee_code: "EMP009", contact_no: "9829012353", latitude: 26.9387, longitude: 75.8133, last_gps_update: new Date().toISOString(), status: "Online", designation: "Driver", designation_id: 1, department_name: "Collection", department_id: 1, zone: "Civil Lines", ward: "Ward 40", area: "Sector 2", mobile_number: "9829012353" },
  { id: 10, employee_id: 10, name: "Pooja Verma", employee_code: "EMP010", contact_no: "9829012354", latitude: 26.8732, longitude: 75.7621, last_gps_update: new Date(Date.now() - 180000).toISOString(), status: "Online", designation: "Supervisor", designation_id: 2, department_name: "Supervision", department_id: 2, zone: "Vidhyadhar Nagar", ward: "Ward 50", area: "Sanganer Ind Area", mobile_number: "9829012354" },
];

export interface Employee {
  id: number;
  employee_id: number;
  name: string;
  employee_code: string;
  contact_no: string;
  latitude: number;
  longitude: number;
  last_gps_update: string;
  status: "Online" | "Offline";
  designation: string;
  designation_id: number;
  department_name: string;
  department_id: number;
  zone: string;
  ward: string;
  area: string;
  mobile_number: string;
}

export default function EmployeeMonitoringPage() {
  const [employees, setEmployees] = useState<Employee[]>(DUMMY_EMPLOYEES);
  const [loading, setLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [prevSelected, setPrevSelected] = useState<Employee | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ success: boolean; data: any[] }>("/api/employee-locations");
      const mapped: Employee[] = (res.data || []).map((e: any) => ({
        id: e.employee_id,
        employee_id: e.employee_id,
        name: e.name,
        employee_code: e.employee_code,
        contact_no: e.contact_no || "",
        latitude: e.lat,
        longitude: e.lng,
        last_gps_update: e.captured_at,
        status: e.status,
        designation: e.designation_name || "Employee",
        designation_id: e.designation_id,
        department_name: e.department_name || "",
        department_id: e.department_id,
        zone: "",
        ward: "",
        area: "",
        mobile_number: e.contact_no || "",
      }));
      setEmployees(mapped);
    } catch {
      // API unavailable — using dummy data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
    const interval = setInterval(loadEmployees, 15000);
    return () => clearInterval(interval);
  }, [loadEmployees]);

  const filteredEmployees = useMemo(() => {
    if (roleFilter === "all") return employees;
    if (roleFilter === "sweepers") return employees.filter((e) => e.designation?.toLowerCase().includes("sweep"));
    if (roleFilter === "supervisor") return employees.filter((e) => e.designation?.toLowerCase().includes("superv"));
    if (roleFilter === "zone_manager") return employees.filter((e) => e.designation?.toLowerCase().includes("zone"));
    return employees;
  }, [employees, roleFilter]);

  const onlineCount = useMemo(() => filteredEmployees.filter((e) => e.status === "Online").length, [filteredEmployees]);

  const handleEmployeeClick = useCallback((emp: Employee) => {
    setSelectedEmployee((prev) => (prev?.id === emp.id ? null : emp));
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans">
      <ReportHeader
        title="Employee Monitoring"
      />

      <div className="px-6 pb-4 flex items-center gap-4">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="Total Employees (Live)"
            value={loading ? "..." : filteredEmployees.length}
            icon={<Users size={18} className="text-[#10B981]" />}
            description="Employees with recent GPS updates"
          />
          <StatCard
            title="Online Now"
            value={loading ? "..." : onlineCount}
            icon={<Wifi size={18} className="text-blue-500" />}
            description="Active in last 5 minutes"
          />
          <StatCard
            title="Offline"
            value={loading ? "..." : filteredEmployees.length - onlineCount}
            icon={<WifiOff size={18} className="text-gray-400" />}
            description="No recent GPS ping"
          />
        </div>
        <div className="flex items-center gap-2 bg-white rounded-lg border p-1 shrink-0">
          <button onClick={() => setRoleFilter("all")} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${roleFilter === "all" ? "bg-emerald-500 text-white" : "text-gray-600 hover:bg-gray-100"}`}>All</button>
          <button onClick={() => setRoleFilter("zone_manager")} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${roleFilter === "zone_manager" ? "bg-emerald-500 text-white" : "text-gray-600 hover:bg-gray-100"}`}>💼 Zone Managers</button>
          <button onClick={() => setRoleFilter("supervisor")} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${roleFilter === "supervisor" ? "bg-emerald-500 text-white" : "text-gray-600 hover:bg-gray-100"}`}>👔 Supervisors</button>
          <button onClick={() => setRoleFilter("sweepers")} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${roleFilter === "sweepers" ? "bg-emerald-500 text-white" : "text-gray-600 hover:bg-gray-100"}`}>🧹 Sweepers</button>
        </div>
      </div>

      <div className="flex-1 mx-6 mb-6 overflow-hidden rounded-2xl border border-theme-border shadow-sm relative">
        <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200/80 shadow-md select-none flex items-center gap-2">
          <MapPin size={14} className="text-emerald-500" />
          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest leading-none">
            Employee GPS Positions
          </span>
          <span className="ml-2 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        {loading && filteredEmployees.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-theme-elevated h-full min-h-[400px] gap-3">
            <div className="w-8 h-8 rounded-full border-4 border-theme-border border-t-emerald-600 animate-spin" />
            <div className="text-theme-text-dim text-xs font-semibold animate-pulse">
              Loading Employee Locations...
            </div>
          </div>
        ) : (
          <EmployeeMap
            employees={filteredEmployees}
            selectedEmployee={selectedEmployee}
            onEmployeeClick={handleEmployeeClick}
          />
        )}
      </div>
    </div>
  );
}
