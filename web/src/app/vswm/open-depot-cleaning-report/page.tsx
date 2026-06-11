"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import Button from "@/components/ui/Button";
import Table from "@/components/shared/Table";
import { Card, CardContent } from "@/components/ui/Card";
import dynamic from "next/dynamic";

const CleaningMap = dynamic(() => import("@/components/CleaningMap"), { ssr: false });

interface OpenDepot {
  id: number;
  name: string;
  zone_id: number;
  ward_id: number;
  latitude: number;
  longitude: number;
  radius: number;
  status: string;
}

interface Zone {
  id: number;
  region_name: string;
}

interface Ward {
  id: number;
  region_name: string;
  parent_id: number;
}

interface CleaningReportItem {
  id: number;
  open_depot_id: number;
  image_url: string;
  uploaded_by: string;
  uploaded_latitude: number;
  uploaded_longitude: number;
  upload_time: string;
  verification_status: string;
  approval_status: string;
  jhalli_patti_used: boolean | null;
  approved_by: string | null;
  approved_time: string | null;
  remarks: string | null;
  distance_from_depot: number;
  open_depot_name: string;
  zone_name: string;
  ward_name: string;
}

export default function OpenDepotCleaningReportPage() {
  const [reportData, setReportData] = useState<CleaningReportItem[]>([]);
  const [depots, setDepots] = useState<OpenDepot[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [allWards, setAllWards] = useState<Ward[]>([]);
  const [filteredWards, setFilteredWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Filter form states
  const [filters, setFilters] = useState({
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date().toISOString().split("T")[0],
    zone_id: "",
    ward_id: "",
    open_depot_id: "",
    approval_status: "",
  });

  // Audit preview detail modal state
  const [viewItem, setViewItem] = useState<CleaningReportItem | null>(null);

  const loadInitialOptions = async () => {
    try {
      const zonesRes = await api<{ data: Zone[] }>("/api/zones");
      setZones(zonesRes.data || []);
      
      const wardsRes = await api<{ data: Ward[] }>("/api/wards");
      setAllWards(wardsRes.data || []);

      const depotsRes = await api<{ data: OpenDepot[] }>("/api/open-depots");
      setDepots(depotsRes.data || []);
    } catch (err) {
      toast.error("Failed to load initial report options.");
    }
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (filters.start_date) {
        queryParams.append("start_date", `${filters.start_date}T00:00:00Z`);
      }
      if (filters.end_date) {
        queryParams.append("end_date", `${filters.end_date}T23:59:59Z`);
      }
      if (filters.zone_id) queryParams.append("zone_id", filters.zone_id);
      if (filters.ward_id) queryParams.append("ward_id", filters.ward_id);
      if (filters.open_depot_id) queryParams.append("open_depot_id", filters.open_depot_id);
      if (filters.approval_status) queryParams.append("approval_status", filters.approval_status);

      const res = await api<{ data: CleaningReportItem[] }>(`/api/open-depots/cleanings?${queryParams.toString()}`);
      setReportData(res.data || []);
      setHasLoaded(true);
    } catch (err) {
      toast.error("Failed to load cleaning report data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialOptions();
  }, []);

  // Filter wards dynamically when zone changes
  useEffect(() => {
    if (filters.zone_id) {
      const zoneId = parseInt(filters.zone_id);
      const filtered = allWards.filter((w) => w.parent_id === zoneId);
      setFilteredWards(filtered);
      
      // Clear ward selection if not in filtered list
      const hasSelectedWardInFilter = filtered.some(w => w.id.toString() === filters.ward_id);
      if (!hasSelectedWardInFilter && filters.ward_id !== "") {
        setFilters(prev => ({ ...prev, ward_id: "" }));
      }
    } else {
      setFilteredWards([]);
      setFilters(prev => ({ ...prev, ward_id: "" }));
    }
  }, [filters.zone_id, allWards]);

  const handleExport = (format: "csv" | "excel") => {
    if (reportData.length === 0) {
      toast.warning("No data available to export.");
      return;
    }

    const headers = [
      "ID",
      "Open Depot",
      "Zone",
      "Ward",
      "Uploaded By",
      "Upload Time",
      "Verification Status",
      "Approval Status",
      "Jhalli Patti Used",
      "Distance From Depot (m)",
      "Reviewed By",
      "Reviewed Time",
      "Remarks",
    ];

    const rows = reportData.map((item) => [
      item.id,
      `"${item.open_depot_name || ""}"`,
      `"${item.zone_name || ""}"`,
      `"${item.ward_name || ""}"`,
      `"${item.uploaded_by || ""}"`,
      `"${new Date(item.upload_time).toLocaleString()}"`,
      `"${item.verification_status}"`,
      `"${item.approval_status}"`,
      item.jhalli_patti_used === null ? "N/A" : item.jhalli_patti_used ? "Yes" : "No",
      item.distance_from_depot.toFixed(2),
      `"${item.approved_by || ""}"`,
      item.approved_time ? `"${new Date(item.approved_time).toLocaleString()}"` : "",
      `"${item.remarks || ""}"`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);

    const filename = `open_depot_cleaning_report_${filters.start_date}_to_${filters.end_date}.${
      format === "csv" ? "csv" : "xls"
    }`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Report exported successfully as ${format.toUpperCase()}`);
  };

  // Filter depots based on zone and ward selection to keep filters in sync
  const filteredDepotsForFilter = depots.filter((d) => {
    if (filters.zone_id && d.zone_id !== parseInt(filters.zone_id)) return false;
    if (filters.ward_id && d.ward_id !== parseInt(filters.ward_id)) return false;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col bg-[#f8fafc] text-slate-800 overflow-hidden font-sans w-full">
      {/* Sub-header with Title & Action Exports */}
      <div className="bg-white px-6 py-3 border-b border-slate-200 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-700">Open Depot Cleaning Report</h2>
          <div className="h-[3px] w-8 bg-emerald-500 mt-1"></div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button
            onClick={() => window.print()}
            variant="outline"
            className="px-3 py-1.5 text-xs font-semibold bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700"
          >
            PDF
          </Button>
          <Button
            onClick={() => handleExport("csv")}
            variant="outline"
            className="px-3 py-1.5 text-xs font-semibold bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700"
          >
            CSV
          </Button>
          <Button
            onClick={() => handleExport("excel")}
            variant="outline"
            className="px-3 py-1.5 text-xs font-semibold bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700"
          >
            Excel
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8 print:overflow-visible print:pb-0 print:p-0">
        {/* Filter Card Panel */}
        <Card className="border border-slate-200 bg-white rounded-xl shadow-sm print:hidden">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
              {/* Zone */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Zone
                </span>
                <select
                  value={filters.zone_id}
                  onChange={(e) => setFilters((prev) => ({ ...prev, zone_id: e.target.value, open_depot_id: "" }))}
                  className="bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-700 outline-none hover:border-emerald-500/40 focus:border-emerald-500 transition min-h-[38px] cursor-pointer"
                >
                  <option value="">All Zones</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.region_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ward */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Ward
                </span>
                <select
                  value={filters.ward_id}
                  disabled={!filters.zone_id}
                  onChange={(e) => setFilters((prev) => ({ ...prev, ward_id: e.target.value, open_depot_id: "" }))}
                  className="bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-700 outline-none hover:border-emerald-500/40 focus:border-emerald-500 transition min-h-[38px] cursor-pointer disabled:opacity-50"
                >
                  <option value="">All Wards</option>
                  {filteredWards.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.region_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Open Depot */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Open Depot
                </span>
                <select
                  value={filters.open_depot_id}
                  onChange={(e) => setFilters((prev) => ({ ...prev, open_depot_id: e.target.value }))}
                  className="bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-700 outline-none hover:border-emerald-500/40 focus:border-emerald-500 transition min-h-[38px] cursor-pointer"
                >
                  <option value="">All Depots</option>
                  {filteredDepotsForFilter.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Status
                </span>
                <select
                  value={filters.approval_status}
                  onChange={(e) => setFilters((prev) => ({ ...prev, approval_status: e.target.value }))}
                  className="bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-700 outline-none hover:border-emerald-500/40 focus:border-emerald-500 transition min-h-[38px] cursor-pointer"
                >
                  <option value="">All Statuses</option>
                  <option value="Pending">Pending Review</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>

              {/* Start Date */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  From Date
                </span>
                <input
                  type="date"
                  value={filters.start_date}
                  onChange={(e) => setFilters((prev) => ({ ...prev, start_date: e.target.value }))}
                  className="bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-700 outline-none hover:border-emerald-500/40 focus:border-emerald-500 transition min-h-[38px]"
                />
              </div>

              {/* End Date */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  To Date
                </span>
                <input
                  type="date"
                  value={filters.end_date}
                  onChange={(e) => setFilters((prev) => ({ ...prev, end_date: e.target.value }))}
                  className="bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-700 outline-none hover:border-emerald-500/40 focus:border-emerald-500 transition min-h-[38px]"
                />
              </div>
            </div>

            <div className="flex justify-start pt-4 border-t border-slate-100">
              <Button
                onClick={loadReport}
                variant="accent"
                loading={loading}
                loadingText="Loading..."
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-lg text-xs transition"
              >
                Load
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results Table Card */}
        <Card className="border border-slate-200 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[400px] print:border-none print:shadow-none">
          <CardContent className="p-0 flex-1 flex flex-col justify-between overflow-hidden">
            <div className="flex-1 overflow-x-auto">
              <Table
                headers={[
                  <div key="photo" className="text-center w-16 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Photo</div>,
                  <span key="depot" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Open Depot</span>,
                  <span key="zw" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Zone / Ward</span>,
                  <span key="ub" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Uploaded By</span>,
                  <span key="ut" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Upload Time</span>,
                  <span key="ga" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Geofence (Distance)</span>,
                  <span key="as" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Approval Status</span>,
                  <span key="jp" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Jhalli Patti</span>,
                  <span key="ad" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Audit Details</span>,
                  <div key="action" className="text-right pr-4 w-24 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Action</div>,
                ]}
                isLoading={loading}
                emptyState={
                  !hasLoaded ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-slate-400">
                      <span className="text-3xl">📊</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider">Report Not Loaded</span>
                      <span className="text-[10px]">Select filters and click "Load" to fetch cleaning logs.</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-slate-400">
                      <span className="text-3xl">📭</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider">No records found</span>
                      <span className="text-[10px]">Try adjusting your filters or dates.</span>
                    </div>
                  )
                }
              >
                {reportData.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 border-b border-slate-100 transition-colors print:border-black">
                    <td className="py-3 px-5 text-center">
                      <img
                        src={item.image_url}
                        alt="Cleaning proof"
                        onClick={() => setViewItem(item)}
                        className="w-12 h-12 rounded-lg object-cover cursor-pointer border border-slate-200 hover:scale-105 transition duration-300 shadow-sm"
                        title="Click to view details"
                      />
                    </td>
                    <td className="py-3 px-5 font-bold text-slate-850 text-[12px] print:text-black">
                      {item.open_depot_name}
                    </td>
                    <td className="py-3 px-5 text-[12px] text-slate-600">
                      <span className="block font-semibold">{item.zone_name}</span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">{item.ward_name}</span>
                    </td>
                    <td className="py-3 px-5 font-semibold text-slate-700 text-[12px]">{item.uploaded_by}</td>
                    <td className="py-3 px-5 text-[11px] text-slate-400">
                      {new Date(item.upload_time).toLocaleString()}
                    </td>
                    <td className="py-3 px-5 text-[12px]">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-extrabold ${
                        item.verification_status === "VALID"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-rose-500/10 text-rose-600"
                      }`}>
                        {item.verification_status === "VALID" ? "VALID LOCATION" : "OUTSIDE GEOFENCE"}
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-1">
                        Distance: {item.distance_from_depot.toFixed(1)}m
                      </span>
                    </td>
                    <td className="py-3 px-5 text-[12px]">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold shadow-sm ${
                        item.approval_status === "Approved"
                          ? "bg-emerald-500 text-white"
                          : item.approval_status === "Rejected"
                          ? "bg-rose-500 text-white"
                          : "bg-amber-500 text-black"
                      }`}>
                        {item.approval_status}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-[12px]">
                      {item.jhalli_patti_used === null ? (
                        <span className="text-slate-400">—</span>
                      ) : item.jhalli_patti_used ? (
                        <span className="inline-block bg-teal-500/10 text-teal-600 px-2 py-0.5 rounded-full font-bold text-[9px]">
                          ✓ Yes
                        </span>
                      ) : (
                        <span className="inline-block bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full font-bold text-[9px]">
                          ✗ No
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-5 max-w-[200px] truncate text-[11px]">
                      {item.approval_status !== "Pending" ? (
                        <div className="space-y-0.5 text-slate-600">
                          <span className="block font-semibold">Audited by: {item.approved_by || "Admin"}</span>
                          {item.approved_time && (
                            <span className="block text-slate-400">
                              On: {new Date(item.approved_time).toLocaleDateString()}
                            </span>
                          )}
                          {item.remarks && (
                            <span className="block text-rose-500 italic font-semibold max-w-[180px] truncate" title={item.remarks}>
                              "{item.remarks}"
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Awaiting review</span>
                      )}
                    </td>
                    <td className="py-3 px-5 text-right print:hidden">
                      <Button
                        onClick={() => setViewItem(item)}
                        variant="outline"
                        className="text-xs px-3.5 py-1.5"
                      >
                        View Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>
            </div>

            {/* Total Count Footer */}
            <div className="bg-slate-100 border-t border-slate-200 px-5 py-3 text-xs font-bold text-slate-500 select-none uppercase tracking-wider shrink-0">
              {reportData.length} total records listed
            </div>
          </CardContent>
        </Card>
      </div>

      {/* PROFESSIONAL AUDIT DETAIL MODAL */}
      {viewItem && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-theme-surface border border-theme-border max-w-4xl w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8">
            {/* Modal Header */}
            <div className="p-4 border-b border-theme-border flex items-center justify-between bg-theme-base/40">
              <div>
                <h3 className="text-sm font-bold text-theme-text flex items-center gap-2">
                  <span>Audit Cleaning: {viewItem.open_depot_name || `Depot #${viewItem.open_depot_id}`}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                    viewItem.verification_status === "VALID" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                  }`}>
                    {viewItem.verification_status === "VALID" ? "VALID LOCATION" : "OUTSIDE RADIUS"}
                  </span>
                </h3>
                <span className="text-[10px] text-theme-text-dim block mt-0.5">
                  Submission ID: #{viewItem.id} • Submitted by {viewItem.uploaded_by} on {new Date(viewItem.upload_time).toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => setViewItem(null)}
                className="text-theme-text-dim hover:text-theme-text text-xs font-bold p-1 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1 max-h-[70vh]">
              {/* Media grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Photo container */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-theme-text-dim tracking-wider uppercase block">Submitted Photo</span>
                  <div className="border border-theme-border rounded-xl overflow-hidden aspect-video bg-black flex items-center justify-center relative shadow-inner">
                    <img src={viewItem.image_url} alt="Cleaning Proof" className="w-full h-full object-contain" />
                    <a
                      href={viewItem.image_url}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute bottom-2 right-2 bg-theme-surface/90 backdrop-blur px-2.5 py-1 rounded text-[9px] font-bold text-theme-text hover:bg-theme-surface transition shadow"
                    >
                      🔍 View original
                    </a>
                  </div>
                </div>

                {/* Map container */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-theme-text-dim tracking-wider uppercase block">Geofence Compliance Map</span>
                  <div className="h-[210px] rounded-xl overflow-hidden relative shadow-inner">
                    {(() => {
                      const activeDepotObj = depots.find(d => d.id === viewItem.open_depot_id);
                      return activeDepotObj ? (
                        <CleaningMap
                          depotLat={activeDepotObj.latitude}
                          depotLng={activeDepotObj.longitude}
                          radius={activeDepotObj.radius}
                          uploadLat={viewItem.uploaded_latitude}
                          uploadLng={viewItem.uploaded_longitude}
                          verificationStatus={viewItem.verification_status}
                          depotName={activeDepotObj.name}
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-900 flex items-center justify-center text-xs text-slate-500 font-bold">
                          Map Unavailable (Depot coordinates missing)
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Data list */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-theme-base/60 p-4 rounded-xl border border-theme-border text-xs">
                {(() => {
                  const activeDepotObj = depots.find(d => d.id === viewItem.open_depot_id);
                  return (
                    <>
                      <div>
                        <span className="text-theme-text-dim block">Depot Coordinates:</span>
                        <span className="font-semibold text-theme-text">
                          {activeDepotObj?.latitude.toFixed(6)}, {activeDepotObj?.longitude.toFixed(6)}
                        </span>
                      </div>
                      <div>
                        <span className="text-theme-text-dim block">Worker Coordinates:</span>
                        <span className="font-semibold text-theme-text">
                          {viewItem.uploaded_latitude.toFixed(6)}, {viewItem.uploaded_longitude.toFixed(6)}
                        </span>
                      </div>
                      <div>
                        <span className="text-theme-text-dim block">Depot Radius:</span>
                        <span className="font-semibold text-emerald-400">{activeDepotObj?.radius} meters</span>
                      </div>
                      <div>
                        <span className="text-theme-text-dim block">Computed Distance:</span>
                        <span className={`font-semibold ${
                          viewItem.verification_status === "VALID" ? "text-emerald-400" : "text-rose-400"
                        }`}>
                          {viewItem.distance_from_depot.toFixed(2)} meters
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Status details */}
              <div className="bg-theme-base p-4 rounded-xl border border-theme-border text-xs space-y-2">
                <div className="flex items-center gap-3">
                  <span className="font-bold">Audit Result:</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    viewItem.approval_status === "Approved" ? "bg-emerald-500/10 text-emerald-400" : viewItem.approval_status === "Rejected" ? "bg-rose-500/10 text-rose-400" : "bg-amber-500/10 text-amber-400"
                  }`}>
                    {viewItem.approval_status}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-theme-text-dim mt-1">
                  <div>Reviewed by: <strong className="text-theme-text">{viewItem.approved_by || "Admin"}</strong></div>
                  {viewItem.approved_time && (
                    <div>Reviewed on: <strong className="text-theme-text">{new Date(viewItem.approved_time).toLocaleString()}</strong></div>
                  )}
                  {viewItem.jhalli_patti_used !== null && (
                    <div>Jhalli Patti Used: <strong className="text-theme-text">{viewItem.jhalli_patti_used ? "Yes" : "No"}</strong></div>
                  )}
                </div>
                {viewItem.remarks && (
                  <div className="border-t border-theme-border/50 pt-2 text-rose-400 italic font-semibold">
                    Remarks: "{viewItem.remarks}"
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-theme-border bg-theme-base/40 flex justify-end">
              <Button
                onClick={() => setViewItem(null)}
                variant="secondary"
                className="py-2 px-5 text-xs font-bold"
              >
                Close Audit Screen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
