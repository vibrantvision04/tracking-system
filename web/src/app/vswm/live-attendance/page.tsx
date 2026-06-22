"use client";
import { useEffect, useState } from "react";
import { api, API_URL } from "@/lib/api";
import { toast } from "react-toastify";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { 
  Camera, 
  MapPin, 
  User, 
  Clock, 
  Search, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle,
  Truck
} from "lucide-react";

interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  role: string;
  punch_in_at: string;
  punch_out_at: string | null;
  punch_out_mode: string | null;
  driver_name: string | null;
  helper_name: string | null;
  helper_present: boolean;
  vehicle_no: string | null;
  photo_path: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  ward_name: string | null;
  marked_by_name: string | null;
  is_valid: boolean;
  shift_name: string | null;
  created_at: string;
}

export default function LiveAttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);

  const fetchLiveAttendance = async () => {
    try {
      setLoading(true);
      const res = await api<{ success: boolean; data: AttendanceRecord[] }>("/api/attendance?live=true");
      if (res.success) {
        setRecords(res.data || []);
      }
    } catch (err) {
      toast.error("Failed to load live attendance records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveAttendance();
    // Poll every 30 seconds for live updates
    const interval = setInterval(fetchLiveAttendance, 30000);
    return () => clearInterval(interval);
  }, []);

  const getRoleBadgeColor = (role: string) => {
    switch (role.toLowerCase()) {
      case "driver":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "supervisor":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "zone_manager":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      default:
        return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    }
  };

  const formatRoleName = (role: string) => {
    if (role === "zone_manager") return "Zone Manager";
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const filteredRecords = records.filter((rec) => {
    const name = rec.employee_name.toLowerCase();
    const id = rec.employee_id.toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchesSearch = name.includes(q) || id.includes(q) || (rec.vehicle_no && rec.vehicle_no.toLowerCase().includes(q));
    
    const matchesRole = roleFilter === "all" || rec.role.toLowerCase() === roleFilter.toLowerCase();
    
    return matchesSearch && matchesRole;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Live Attendance Monitor"
        description="Real-time status of employees active on field today. Track punch-in times, captured selfies, assigned vehicles, and GPS locations."
        breadcrumbs={[{ label: "Attendance", href: "/vswm/employee" }, { label: "Live Attendance" }]}
        actions={
          <Button onClick={fetchLiveAttendance} variant="outline" className="flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-theme-surface border border-theme-border p-4 rounded-xl">
        <div className="flex flex-1 w-full sm:w-auto items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-text-dim" />
            <input
              type="text"
              placeholder="Search by name, employee ID, vehicle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-theme-base border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <span className="text-xs text-theme-text-dim font-medium whitespace-nowrap">Filter Role:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2 bg-theme-base border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition"
          >
            <option value="all">All Roles</option>
            <option value="driver">Driver</option>
            <option value="supervisor">Supervisor</option>
            <option value="zone_manager">Zone Manager</option>
          </select>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-8">
        {loading && records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-theme-text-dim">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
            <p className="text-sm font-semibold uppercase tracking-wider">Loading live attendance feed...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-theme-surface border border-theme-border rounded-xl text-theme-text-dim">
            <span className="text-3xl mb-3">📭</span>
            <p className="text-sm font-semibold uppercase tracking-wider">No live attendance logs found</p>
            <p className="text-xs text-theme-text-dim/80 mt-1">No employees have punched in matching the current filters today.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredRecords.map((rec) => {
              const hasPhoto = rec.photo_path;
              const photoUrl = hasPhoto 
                ? (rec.photo_path!.startsWith("http") ? rec.photo_path! : `${API_URL}${rec.photo_path}`)
                : null;

              return (
                <Card 
                  key={rec.id} 
                  hoverable 
                  className="flex flex-col cursor-pointer group"
                  onClick={() => setSelectedRecord(rec)}
                >
                  {/* Card Thumbnail */}
                  <div className="relative h-48 w-full bg-theme-base flex items-center justify-center overflow-hidden border-b border-theme-border">
                    {photoUrl ? (
                      <img 
                        src={photoUrl} 
                        alt={rec.employee_name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-theme-text-dim/60">
                        <Camera className="w-10 h-10" />
                        <span className="text-[10px] uppercase tracking-wider font-semibold">No Image Captured</span>
                      </div>
                    )}
                    {/* Role badge */}
                    <span className={`absolute top-3 left-3 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-md border ${getRoleBadgeColor(rec.role)}`}>
                      {formatRoleName(rec.role)}
                    </span>
                    {/* Punch out badge */}
                    {rec.punch_out_at && (
                      <span className="absolute top-3 right-3 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        Punched Out
                      </span>
                    )}
                  </div>

                  <CardContent className="flex-1 flex flex-col justify-between p-4 gap-3">
                    <div>
                      <h4 className="font-bold text-theme-text text-sm truncate group-hover:text-emerald-400 transition-colors" title={rec.employee_name}>
                        {rec.employee_name}
                      </h4>
                      <p className="text-[11px] text-theme-text-dim font-mono">{rec.employee_id}</p>
                    </div>

                    <div className="space-y-1.5 text-xs text-theme-text-dim">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Punch In: <strong>{rec.punch_in_at.split(" ")[1]}</strong></span>
                      </div>
                      
                      {rec.vehicle_no && (
                        <div className="flex items-center gap-2">
                          <Truck className="w-3.5 h-3.5 text-blue-400" />
                          <span>Vehicle: <strong>{rec.vehicle_no}</strong></span>
                        </div>
                      )}

                      {rec.ward_name && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-rose-400" />
                          <span className="truncate" title={rec.ward_name}>Ward: <strong>{rec.ward_name}</strong></span>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-theme-border/50 pt-2 flex items-center justify-between text-[10px] text-theme-text-dim/80 font-mono">
                      <span>Shift: {rec.shift_name || "General"}</span>
                      {rec.marked_by_name ? (
                        <span className="text-amber-400">Marked by Sup.</span>
                      ) : (
                        <span className="text-emerald-400">Self Punch</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Details Dialog Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-theme-surface border border-theme-border rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-fade-in">
            {/* Modal Header */}
            <div className="p-5 border-b border-theme-border flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-theme-text text-base">{selectedRecord.employee_name}</h3>
                <p className="text-xs text-theme-text-dim font-mono">ID: {selectedRecord.employee_id} • Role: {formatRoleName(selectedRecord.role)}</p>
              </div>
              <button 
                onClick={() => setSelectedRecord(null)}
                className="w-8 h-8 rounded-lg hover:bg-theme-base text-theme-text-dim hover:text-theme-text transition flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* Left Column: Picture */}
              <div className="space-y-4">
                <div className="h-64 rounded-xl bg-theme-base flex items-center justify-center overflow-hidden border border-theme-border relative">
                  {selectedRecord.photo_path ? (
                    <img 
                      src={selectedRecord.photo_path.startsWith("http") ? selectedRecord.photo_path : `${API_URL}${selectedRecord.photo_path}`} 
                      alt={selectedRecord.employee_name} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-theme-text-dim/60">
                      <Camera className="w-12 h-12" />
                      <span className="text-xs uppercase tracking-wider font-semibold">No Image Available</span>
                    </div>
                  )}
                </div>
                {selectedRecord.photo_path && (
                  <a
                    href={selectedRecord.photo_path.startsWith("http") ? selectedRecord.photo_path : `${API_URL}${selectedRecord.photo_path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 bg-theme-base hover:bg-theme-border border border-theme-border text-xs font-bold text-theme-text rounded-xl flex items-center justify-center gap-2 transition"
                  >
                    <Camera className="w-4 h-4" /> Open Full Resolution Photo
                  </a>
                )}
              </div>

              {/* Right Column: Attendance Specs */}
              <div className="space-y-4 text-sm text-theme-text-dim">
                <div className="bg-theme-base/40 p-4 rounded-xl border border-theme-border/50 space-y-3">
                  <h4 className="text-xs font-bold text-theme-text uppercase tracking-wider border-b border-theme-border pb-1">Shift & Punch Details</h4>
                  
                  <div className="flex justify-between">
                    <span>Shift Type:</span>
                    <span className="font-semibold text-theme-text">{selectedRecord.shift_name || "General Shift"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Punch In Time:</span>
                    <span className="font-semibold text-theme-text">{selectedRecord.punch_in_at}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Punch Out Time:</span>
                    <span className="font-semibold text-theme-text">{selectedRecord.punch_out_at || "—"}</span>
                  </div>
                  {selectedRecord.punch_out_mode && (
                    <div className="flex justify-between">
                      <span>Punch Out Mode:</span>
                      <span className="font-semibold text-theme-text uppercase text-xs">{selectedRecord.punch_out_mode}</span>
                    </div>
                  )}
                </div>

                {selectedRecord.role.toLowerCase() === "driver" && (
                  <div className="bg-theme-base/40 p-4 rounded-xl border border-theme-border/50 space-y-3">
                    <h4 className="text-xs font-bold text-theme-text uppercase tracking-wider border-b border-theme-border pb-1">Driver & Crew Details</h4>
                    <div className="flex justify-between">
                      <span>Assigned Vehicle:</span>
                      <span className="font-bold text-emerald-400">{selectedRecord.vehicle_no || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Driver Declared Name:</span>
                      <span className="font-semibold text-theme-text">{selectedRecord.driver_name || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Helper Present:</span>
                      <span className="font-semibold text-theme-text">{selectedRecord.helper_present ? "Yes" : "No"}</span>
                    </div>
                    {selectedRecord.helper_present && (
                      <div className="flex justify-between">
                        <span>Helper Name:</span>
                        <span className="font-semibold text-theme-text">{selectedRecord.helper_name || "—"}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-theme-base/40 p-4 rounded-xl border border-theme-border/50 space-y-3">
                  <h4 className="text-xs font-bold text-theme-text uppercase tracking-wider border-b border-theme-border pb-1">Location & Verification</h4>
                  
                  {selectedRecord.ward_name && (
                    <div className="flex justify-between">
                      <span>Assigned Ward:</span>
                      <span className="font-semibold text-theme-text">{selectedRecord.ward_name}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span>Punch GPS Coordinates:</span>
                    {selectedRecord.gps_lat ? (
                      <span className="font-mono text-theme-text">{selectedRecord.gps_lat.toFixed(6)}, {selectedRecord.gps_lng?.toFixed(6)}</span>
                    ) : (
                      <span>—</span>
                    )}
                  </div>

                  <div className="flex justify-between">
                    <span>Audit Status:</span>
                    <span className="flex items-center gap-1">
                      {selectedRecord.is_valid ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">Verified Valid</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-rose-400" />
                          <span className="text-rose-400 font-bold">Suspicious / Flagged</span>
                        </>
                      )}
                    </span>
                  </div>

                  {selectedRecord.marked_by_name && (
                    <div className="flex justify-between border-t border-theme-border/30 pt-2 text-xs">
                      <span>Marked Manually By:</span>
                      <span className="font-bold text-amber-400">{selectedRecord.marked_by_name}</span>
                    </div>
                  )}

                  {selectedRecord.gps_lat && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${selectedRecord.gps_lat},${selectedRecord.gps_lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white rounded-xl flex items-center justify-center gap-2 transition mt-2"
                    >
                      <MapPin className="w-4 h-4" /> View Punch-In Location on Maps
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-theme-base/30 border-t border-theme-border flex items-center justify-end">
              <Button onClick={() => setSelectedRecord(null)} variant="primary">
                Close Details
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
