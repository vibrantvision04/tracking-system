"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function D2DRouteCoverageReport() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  
  // Dropdown data
  const [zones, setZones] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [routeTypes, setRouteTypes] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);

  // Filters
  const [zoneId, setZoneId] = useState("");
  const [wardId, setWardId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [routeTypeId, setRouteTypeId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [parkingSpot, setParkingSpot] = useState("");
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const totalPages = Math.ceil(data.length / pageSize);
  const paginatedData = data.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    api('/api/zones').then((d: any) => d.success && setZones(d.data)).catch(console.error);
    api('/api/wards').then((d: any) => d.success && setWards(d.data)).catch(console.error);
    api('/api/shifts').then((d: any) => d.success && setShifts(d.data)).catch(console.error);
    api('/api/route-types').then((d: any) => d.success && setRouteTypes(d.data)).catch(console.error);
    api('/api/routes').then((d: any) => d.success && setRoutes(d.data)).catch(console.error);
  }, []);

  const handleLoad = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        from_date: fromDate,
        to_date: toDate,
        ...(zoneId && { zone_id: zoneId }),
        ...(wardId && { ward_id: wardId }),
        ...(shiftId && { shift_id: shiftId }),
        ...(routeTypeId && { route_type_id: routeTypeId }),
        ...(routeId && { route_id: routeId }),
      });
      const res: any = await api(`/api/reports/d2d-coverage?${query.toString()}`);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setData([]);
      }
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 p-6 lg:p-8 bg-[#f4f6f8] min-h-screen text-theme-text">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 border-b-2 border-emerald-500 pb-2 bg-theme-surface p-4 shadow-sm rounded-t-md">
        <h1 className="text-xl font-bold text-theme-text tracking-tight">D2D Vehicle Route Coverage Report</h1>
        <div className="flex gap-2 mt-4 md:mt-0">
          <button className="bg-slate-600 hover:bg-slate-700 text-theme-text px-4 py-1.5 rounded text-sm font-medium transition-colors shadow-sm">
            PDF
          </button>
          <button className="bg-slate-600 hover:bg-slate-700 text-theme-text px-4 py-1.5 rounded text-sm font-medium transition-colors shadow-sm">
            CSV
          </button>
        </div>
      </div>

      {/* Filters Form */}
      <div className="bg-theme-surface rounded-md shadow-sm border border-theme-border p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
          
          <div className="space-y-1">
            <label className="text-xs text-theme-text-dim font-medium">Zone</label>
            <select 
              value={zoneId} onChange={e => setZoneId(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-theme-text focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-theme-surface"
            >
              <option value="">Select Zone</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.region_name}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-theme-text-dim font-medium">Ward</label>
            <select 
              value={wardId} onChange={e => setWardId(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-theme-text focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-theme-surface"
            >
              <option value="">Select Ward</option>
              {wards.map(w => <option key={w.id} value={w.id}>{w.region_name}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-theme-text-dim font-medium">Shift</label>
            <select 
              value={shiftId} onChange={e => setShiftId(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-theme-text focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-theme-surface"
            >
              <option value="">Select Shift</option>
              {shifts.map(s => <option key={s.id} value={s.id}>{s.shift_name}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-theme-text-dim font-medium">Route Type</label>
            <select 
              value={routeTypeId} onChange={e => setRouteTypeId(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-theme-text focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-theme-surface"
            >
              <option value="">Search Route Type</option>
              {routeTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-theme-text-dim font-medium">Route</label>
            <select 
              value={routeId} onChange={e => setRouteId(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-theme-text focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-theme-surface"
            >
              <option value="">Select Route</option>
              {routes.map(r => <option key={r.id} value={r.id}>{r.route_name}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-theme-text-dim font-medium">Parking Spot</label>
            <select 
              value={parkingSpot} onChange={e => setParkingSpot(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-theme-text focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-theme-surface"
            >
              <option value="">Select Parking Spot</option>
              <option value="1">Main Depot</option>
              <option value="2">North Yard</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-theme-text-dim font-medium">From Date</label>
            <input 
              type="date"
              value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-theme-text focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-theme-surface"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-theme-text-dim font-medium">To Date</label>
            <input 
              type="date"
              value={toDate} onChange={e => setToDate(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-theme-text focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-theme-surface"
            />
          </div>

        </div>

        <div className="mt-6 pt-4 border-t border-slate-100">
          <button 
            onClick={handleLoad}
            disabled={loading}
            className="bg-[#449e48] hover:bg-theme-accent text-white px-6 py-2 rounded text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load"}
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-theme-surface rounded-md shadow-sm border border-theme-border overflow-hidden flex flex-col">
        <div className="overflow-x-auto overflow-y-auto max-h-[45vh]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="sticky top-0 bg-theme-surface shadow-sm z-10">
              <tr className="bg-theme-surface text-theme-text-dim text-[11px] font-bold uppercase tracking-wider border-b-2 border-theme-border">
                <th className="px-6 py-4">S. NO.</th>
                <th className="px-6 py-4">DATE</th>
                <th className="px-6 py-4">ROUTE</th>
                <th className="px-6 py-4">ZONE</th>
                <th className="px-6 py-4">WARD</th>
                <th className="px-6 py-4">VEHICLE REG. NO.</th>
                <th className="px-6 py-4">COVERED %</th>
                <th className="px-6 py-4">INORDER % COVERED</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-theme-text">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-theme-text-dim">
                    No data available.
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-theme-surface transition-colors">
                    <td className="px-6 py-3">{(currentPage - 1) * pageSize + idx + 1}</td>
                    <td className="px-6 py-3">{row.date}</td>
                    <td className="px-6 py-3 text-theme-text-dim">{row.route_name}</td>
                    <td className="px-6 py-3">{row.zone_name || '-'}</td>
                    <td className="px-6 py-3">{row.ward_name || '-'}</td>
                    <td className="px-6 py-3 font-medium">
                      {row.imei ? (
                        <Link 
                          href={`/playback?imei=${row.imei}&date=${row.date}&route_id=${row.route_id}`}
                          className="text-[#f39c12] hover:text-[#d68910] hover:underline"
                        >
                          {row.vehicle_reg_no}
                        </Link>
                      ) : (
                        <span className="text-[#f39c12]">{row.vehicle_reg_no}</span>
                      )}
                    </td>
                    <td className="px-6 py-3">{row.covered_percentage}</td>
                    <td className="px-6 py-3">{row.in_order_percentage}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {data.length > 0 && (
          <div className="flex items-center justify-between border-t border-theme-border p-4 bg-theme-surface">
            <div className="flex items-center gap-4">
              <span className="text-sm text-theme-text-dim">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, data.length)} of {data.length} entries
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border border-slate-300 rounded px-2 py-1 text-sm text-theme-text focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-theme-surface"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-theme-text-dim px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
