"use client";

import { useEffect, useState } from "react";
import { api, API_URL } from "@/lib/api";

interface Exception {
  vehicle_reg_no?: string;
  exception_type?: string;
  replacement_vehicle?: string;
  remarks?: string;
  
  // Fallbacks for before Go backend restart
  VehicleRegNo?: string;
  ExceptionType?: string;
  ReplacementVehicle?: string;
  Remarks?: string;
}

export default function UltimateDailyReportPage() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [exceptions, setExceptions] = useState<Record<string, Exception>>({});
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Form states for new exception
  const [regNo, setRegNo] = useState("");
  const [excType, setExcType] = useState("NOT_WORKED");
  const [replacement, setReplacement] = useState("");
  const [remarks, setRemarks] = useState("");

  const loadExceptions = (d: string) => {
    setLoading(true);
    api<{ success: boolean; data: Record<string, Exception> }>(`/api/ultimate-reports/exceptions?date=${d}`)
      .then((res) => {
        if (res.success && res.data) {
          setExceptions(res.data);
        } else {
          setExceptions({});
        }
      })
      .catch((err) => console.error("Error loading exceptions:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadExceptions(date);
  }, [date]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`${API_URL}/api/ultimate-reports/daily-excel?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to download");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ultimate-report-${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      alert("Error downloading report.");
      console.error(err);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`${API_URL}/api/ultimate-reports/template`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to download template");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ultimate-report-template.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      alert("Error downloading template.");
      console.error(err);
    }
  };

  const handleAddException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regNo) return;

    try {
      await api("/api/ultimate-reports/exceptions", {
        method: "POST",
        body: JSON.stringify({
          report_date: date,
          vehicle_reg_no: regNo,
          exception_type: excType,
          replacement_vehicle: excType === "REPLACED" ? replacement : "",
          remarks: remarks
        })
      });
      setRegNo("");
      setReplacement("");
      setRemarks("");
      loadExceptions(date);
    } catch (err) {
      alert("Failed to add exception");
      console.error(err);
    }
  };

  const handleDeleteException = async (vehicleRegNo: string) => {
    if (!confirm(`Delete exception for ${vehicleRegNo}?`)) return;
    try {
      await api(`/api/ultimate-reports/exceptions?date=${date}&vehicle_reg_no=${encodeURIComponent(vehicleRegNo)}`, {
        method: "DELETE"
      });
      loadExceptions(date);
    } catch (err) {
      alert("Failed to delete exception");
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#f8fafc] text-slate-800 overflow-hidden font-sans">
      <div className="bg-white px-6 py-3 border-b border-slate-200 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-700">Daily Ultimate Report</h2>
          <div className="h-[3px] w-8 bg-emerald-500 mt-1"></div>
        </div>
        <button 
          onClick={handleDownloadTemplate}
          className="text-sm font-medium text-emerald-600 hover:text-emerald-700 underline"
        >
          Download Master Template
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {/* Generation Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-800 mb-2">Generate Report</h3>
              <p className="text-sm text-slate-500 mb-4">
                Generates the fully formatted Excel workbook using system data for the selected date. Any manual overrides below will be applied.
              </p>
              <div className="flex gap-4 items-center">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Report Date</label>
                  <input 
                    type="date" 
                    value={date} 
                    onChange={(e) => setDate(e.target.value)}
                    className="px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-sm font-medium text-slate-700"
                  />
                </div>
                <div className="self-end">
                  <button 
                    onClick={handleDownload}
                    disabled={downloading}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {downloading ? "Generating..." : "Generate & Download Excel"}
                  </button>
                </div>
              </div>
            </div>
            <div className="hidden md:block w-32 h-32 shrink-0 opacity-20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full text-emerald-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
          </div>

          {/* Exceptions Management */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-800">Manual Exceptions & Overrides for {date.split('-').reverse().join('/')}</h3>
              <p className="text-xs text-slate-500 mt-1">
                Add overrides here (e.g. GPS TAMPERED, NETWORK ISSUE) instead of modifying the Excel sheet manually.
              </p>
            </div>
            
            {/* Add Exception Form */}
            <form onSubmit={handleAddException} className="p-6 border-b border-slate-200 bg-white grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Vehicle Reg No *</label>
                <input 
                  type="text" 
                  required
                  value={regNo} 
                  onChange={(e) => setRegNo(e.target.value.toUpperCase())}
                  placeholder="e.g. RJ14GN1234"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-sm font-medium uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Exception Type</label>
                <select 
                  value={excType} 
                  onChange={(e) => setExcType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-sm font-medium"
                >
                  <option value="NOT_WORKED">Not Worked</option>
                  <option value="GPS_TAMPERED">GPS Tampered</option>
                  <option value="NETWORK_ISSUE">Network Issue</option>
                  <option value="VEHICLE_BREAKDOWN">Vehicle Breakdown</option>
                  <option value="REPLACED">Replaced</option>
                  <option value="OTHER">Other (Specify in Remarks)</option>
                </select>
              </div>
              {excType === "REPLACED" ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Replacement Reg No</label>
                  <input 
                    type="text" 
                    value={replacement} 
                    onChange={(e) => setReplacement(e.target.value.toUpperCase())}
                    placeholder="e.g. RJ14GN9999"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-sm font-medium uppercase"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Custom Remarks</label>
                  <input 
                    type="text" 
                    value={remarks} 
                    onChange={(e) => setRemarks(e.target.value.toUpperCase())}
                    placeholder="Optional label"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-sm font-medium uppercase"
                  />
                </div>
              )}
              <div className="md:col-span-2">
                <button type="submit" className="w-full px-4 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900 transition-colors">
                  Add Override
                </button>
              </div>
            </form>

            {/* List of Exceptions */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Vehicle</th>
                    <th className="px-6 py-3 font-semibold">Type</th>
                    <th className="px-6 py-3 font-semibold">Replacement / Remarks</th>
                    <th className="px-6 py-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400 font-medium">Loading overrides...</td></tr>
                  ) : Object.keys(exceptions).length === 0 ? (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400 font-medium">No overrides for this date.</td></tr>
                  ) : (
                    Object.values(exceptions).map((exc, idx) => {
                      const regNo = exc.vehicle_reg_no || exc.VehicleRegNo || "";
                      const typeStr = exc.exception_type || exc.ExceptionType || "";
                      const repl = exc.replacement_vehicle || exc.ReplacementVehicle || "";
                      const rem = exc.remarks || exc.Remarks || "";
                      
                      return (
                        <tr key={regNo || idx} className="hover:bg-slate-50">
                          <td className="px-6 py-3 font-bold text-slate-800">{regNo}</td>
                          <td className="px-6 py-3">
                            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded text-xs font-bold tracking-wide">
                              {typeStr.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-6 py-3 font-medium text-slate-600">
                            {typeStr === "REPLACED" ? `Replaced by ${repl}` : rem || "-"}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <button 
                              onClick={() => handleDeleteException(regNo)}
                              className="text-red-500 hover:text-red-700 font-medium text-xs px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 transition"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
