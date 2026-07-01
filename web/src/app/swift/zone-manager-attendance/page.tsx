"use client";
import { useEffect, useState } from "react";
import { api, API_URL } from "@/lib/api";
import { toast } from "react-toastify";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Table from "@/components/shared/Table";
import { 
  Camera, 
  MapPin, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle,
  ExternalLink
} from "lucide-react";

interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  role: string;
  punch_in_at: string;
  punch_out_at: string | null;
  punch_out_mode: string | null;
  photo_path: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  ward_name: string | null;
  is_valid: boolean;
  shift_name: string | null;
  created_at: string;
}

export default function ZoneManagerAttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      let path = "/api/attendance?role=zone_manager";
      if (dateFilter) {
        path += `&date=${dateFilter}`;
      }
      const res = await api<{ success: boolean; data: AttendanceRecord[] }>(path);
      if (res.success) {
        setRecords(res.data || []);
      }
    } catch (err) {
      toast.error("Failed to load zone manager attendance records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [dateFilter]);

  const filteredRecords = records.filter((rec) => {
    const name = rec.employee_name.toLowerCase();
    const id = rec.employee_id.toLowerCase();
    const q = searchQuery.toLowerCase();
    return name.includes(q) || id.includes(q);
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Zone Manager Attendance Report"
        description="Historical and current logs of Zone Manager punch-ins, including location audits and selfie captures."
        breadcrumbs={[{ label: "Attendance", href: "/swift/employee" }, { label: "Zone Manager Attendance" }]}
        actions={
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-4 py-2 bg-theme-surface border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition"
            />
            <button 
              onClick={() => { setDateFilter(""); setSearchQuery(""); }} 
              className="px-4 py-2 bg-theme-surface hover:bg-theme-surface-hover border border-theme-border rounded-xl text-sm font-semibold transition"
            >
              Clear
            </button>
            <button 
              onClick={fetchAttendance} 
              className="p-2.5 bg-theme-surface hover:bg-theme-surface-hover border border-theme-border rounded-xl transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle>Attendance Log</CardTitle>
              <CardDescription>Review and audit all recorded zone manager punch events.</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-text-dim" />
              <input
                type="text"
                placeholder="Search name, ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-theme-base border border-theme-border rounded-xl text-xs text-theme-text outline-none focus:border-emerald-500 transition"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table
              headers={[
                <div key="s" className="w-12">S.No</div>,
                "Photo",
                "Employee ID",
                "Name",
                "Punch In",
                "Punch Out",
                "GPS Location",
                "Status"
              ]}
              isLoading={loading}
              emptyState={searchQuery ? "No matching records found" : "No attendance logs found for this date"}
            >
              {filteredRecords.map((rec, idx) => {
                const photoUrl = rec.photo_path 
                  ? (rec.photo_path.startsWith("http") ? rec.photo_path : `${API_URL}${rec.photo_path}`)
                  : null;

                return (
                  <tr key={rec.id} className="hover:bg-theme-base/40 transition-colors group text-theme-text-dim text-xs">
                    <td className="py-3 px-5 font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-2 px-5">
                      {photoUrl ? (
                        <div 
                          className="w-10 h-10 rounded-lg overflow-hidden border border-theme-border cursor-pointer relative group/thumb bg-theme-base"
                          onClick={() => setSelectedPhoto(photoUrl)}
                        >
                          <img src={photoUrl} className="w-full h-full object-cover" alt="Preview" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity">
                            <Camera className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg border border-dashed border-theme-border flex items-center justify-center text-theme-text-dim/40 bg-theme-base/20">
                          <Camera className="w-4 h-4" />
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-5 font-mono text-[11px]">{rec.employee_id}</td>
                    <td className="py-3 px-5 font-semibold text-theme-text">{rec.employee_name}</td>
                    <td className="py-3 px-5 font-mono text-[11px]">{rec.punch_in_at}</td>
                    <td className="py-3 px-5 font-mono text-[11px]">
                      {rec.punch_out_at ? (
                        <div>
                          <span>{rec.punch_out_at}</span>
                          <span className="block text-[9px] uppercase tracking-wider text-theme-text-dim/60 font-sans mt-0.5">Mode: {rec.punch_out_mode || "auto"}</span>
                        </div>
                      ) : (
                        <span className="text-emerald-400 font-semibold uppercase text-[10px]">Active Shift</span>
                      )}
                    </td>
                    <td className="py-3 px-5">
                      {rec.gps_lat ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${rec.gps_lat},${rec.gps_lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-mono text-[10px] group/link"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>View Map</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                        </a>
                      ) : (
                        <span className="text-theme-text-dim/60">—</span>
                      )}
                    </td>
                    <td className="py-3 px-5">
                      {rec.is_valid ? (
                        <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Valid</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-rose-400 font-semibold">
                          <AlertTriangle className="w-4 h-4" />
                          <span>Flagged</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
            <div className="p-4 border-t border-theme-border bg-theme-surface text-xs font-semibold text-theme-text-dim flex items-center justify-between">
              <span>{filteredRecords.length} records retrieved</span>
              <span className="text-[10px] text-theme-text-dim uppercase tracking-widest font-mono">SWIFT ATTENDANCE</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lightbox Photo Preview */}
      {selectedPhoto && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl border border-theme-border shadow-2xl animate-fade-in bg-theme-surface">
            <img src={selectedPhoto} className="w-full h-full object-contain max-h-[80vh]" alt="Full screen preview" />
            <div className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white rounded-lg p-2 transition text-xs font-bold font-sans select-none">
              ✕ Close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
