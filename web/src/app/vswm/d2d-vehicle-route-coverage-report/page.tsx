"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import ReportHeader from '@/components/shared/ReportHeader';
import Table from '@/components/shared/Table';
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DatePicker from "@/components/ui/DatePicker";

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
  


  useEffect(() => {
    api('/api/zones').then((d: any) => d.success && setZones(d.data || [])).catch(console.error);
    api('/api/wards').then((d: any) => d.success && setWards(d.data || [])).catch(console.error);
    api('/api/shifts?group=VEHICLE_MOVEMENT').then((d: any) => d.success && setShifts(d.data || [])).catch(console.error);
    api('/api/route-types').then((d: any) => d.success && setRouteTypes(d.data || [])).catch(console.error);
    api('/api/routes').then((d: any) => d.success && setRoutes(d.data || [])).catch(console.error);
  }, []);

  const allowHistoricalRecalculation = true; // Set to false to disable recalculation in UI

  const handleLoad = async (forceRecalc: boolean = false) => {
    setLoading(true);
    
    // Check if ?debug=true is present in browser URL
    const isDebugEnabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'true';
    const requestStartTime = new Date();

    if (isDebugEnabled) {
      console.log(`[D2D-FRONTEND] Request Start: ${requestStartTime.toISOString()}`);
    }

    try {
      const query = new URLSearchParams({
        from_date: fromDate,
        to_date: toDate,
        ...(zoneId && { zone_id: zoneId }),
        ...(wardId && { ward_id: wardId }),
        ...(shiftId && { shift_id: shiftId }),
        ...(routeTypeId && { route_type_id: routeTypeId }),
        ...(routeId && { route_id: routeId }),
        ...(forceRecalc && { force_recalc: "true" }),
        ...(isDebugEnabled && { debug: "true" }),
      });
      const res: any = await api(`/api/reports/d2d-coverage?${query.toString()}`);
      
      const requestEndTime = new Date();
      const durationMs = requestEndTime.getTime() - requestStartTime.getTime();

      if (res.success && res.data) {
        setData(res.data);
      } else {
        setData([]);
      }
      
      if (isDebugEnabled) {
        console.log(`[D2D-FRONTEND] Request End: ${requestEndTime.toISOString()}`);
        console.log(`[D2D-FRONTEND] Request Duration: ${durationMs}ms`);
        const responseSize = JSON.stringify(res).length;
        console.log(`[D2D-FRONTEND] Response Size: ${responseSize} bytes`);

        const vehicles = res.data || [];
        console.log("[D2D-FRONTEND] Vehicle Coverage:", vehicles.map((v: any) => `${v.vehicle_reg_no}: ${v.covered_percentage}%`));

        const zeroCoverageVehicles = vehicles.filter((v: any) => v.covered_percentage === 0);
        console.log("[D2D-FRONTEND] Vehicle Zero Coverage:", zeroCoverageVehicles.map((v: any) => v.vehicle_reg_no));

        const missingVehicles = vehicles.filter((v: any) => v.total_checkpoints === 0);
        console.log("[D2D-FRONTEND] Vehicle Missing:", missingVehicles.map((v: any) => v.vehicle_reg_no));

        console.log("[D2D-FRONTEND] Backend Debug Payload:", res.debug_payload || []);

        const backendErrors = (res.debug_payload || []).filter((line: string) => line.includes("[CRITICAL]"));
        console.log("[D2D-FRONTEND] Backend Errors:", backendErrors);
      }


    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans w-full">
      
      <ReportHeader
        title="D2D Vehicle Route Coverage Report"
        actions={
          <div className="flex gap-2">
            <Button onClick={() => window.print()} variant="outline" className="px-3 py-1.5 text-xs font-semibold">PDF</Button>
            <Button variant="outline" className="px-3 py-1.5 text-xs font-semibold">CSV</Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8 print:overflow-visible print:pb-0 print:p-0">
        {/* Filters Form */}
        <Card hoverable className="print:hidden">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
              
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Zone</span>
                <SearchableSelect
                  value={zoneId}
                  onChange={setZoneId}
                  options={[
                    { value: "", label: "Select Zone" },
                    ...zones.map((z) => ({ value: z.id.toString(), label: z.region_name }))
                  ]}
                  placeholder="Select Zone"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Ward</span>
                <SearchableSelect
                  value={wardId}
                  onChange={setWardId}
                  options={[
                    { value: "", label: "Select Ward" },
                    ...wards.map((w) => ({ value: w.id.toString(), label: w.region_name }))
                  ]}
                  placeholder="Select Ward"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Shift</span>
                <SearchableSelect
                  value={shiftId}
                  onChange={setShiftId}
                  options={[
                    { value: "", label: "Select Shift" },
                    ...shifts.map((s) => ({ value: s.id.toString(), label: s.shift_name }))
                  ]}
                  placeholder="Select Shift"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Route Type</span>
                <SearchableSelect
                  value={routeTypeId}
                  onChange={setRouteTypeId}
                  options={[
                    { value: "", label: "Search Route Type" },
                    ...routeTypes.map((rt) => ({ value: rt.id.toString(), label: rt.name }))
                  ]}
                  placeholder="Search Route Type"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Route</span>
                <SearchableSelect
                  value={routeId}
                  onChange={setRouteId}
                  options={[
                    { value: "", label: "Select Route" },
                    ...routes.map((r) => ({ value: r.id.toString(), label: r.route_name }))
                  ]}
                  placeholder="Select Route"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Parking Spot</span>
                <SearchableSelect
                  value={parkingSpot}
                  onChange={setParkingSpot}
                  options={[
                    { value: "", label: "Select Parking Spot" },
                    { value: "1", label: "Main Depot" },
                    { value: "2", label: "North Yard" }
                  ]}
                  placeholder="Select Parking Spot"
                />
              </div>

              <DatePicker
                label="From Date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />

              <DatePicker
                label="To Date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />

            </div>

            <div className="mt-6 pt-4 border-t border-theme-border/60 flex gap-3">
              <Button 
                onClick={() => handleLoad(false)}
                disabled={loading}
                variant="primary"
                className="font-semibold px-6 py-2 rounded text-xs"
              >
                Load
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Data Table */}
        <Table
          headers={[
            <div key="s" className="text-center w-16 text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">S. No.</div>,
            <span key="date" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Date</span>,
            <span key="route" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Route</span>,
            <span key="zone" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Zone</span>,
            <span key="ward" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Ward</span>,
            <span key="veh" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Vehicle Reg. No.</span>,
            <span key="cov" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Covered %</span>,
            <span key="inorder" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Inorder % Covered</span>,
          ]}
          isLoading={loading}
          itemsPerPage={10}
          emptyState={
            <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-theme-text-dim/60">
              <span className="text-3xl">📭</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider">No data available</span>
              <span className="text-[10px]">Select filters and click "Load" to fetch coverage logs.</span>
            </div>
          }
        >
          {data.map((row, idx) => (
            <tr key={idx} className="border-b border-theme-border/30 transition-colors">
              <td className="px-6 py-3 text-center text-theme-text-dim font-mono text-[11px]">{idx + 1}</td>
              <td className="px-6 py-3 text-theme-text text-[12px]">{row.date}</td>
              <td className="px-6 py-3 text-theme-text-dim text-[12px]">{row.route_name}</td>
              <td className="px-6 py-3 text-theme-text-dim text-[12px]">{row.zone_name || '-'}</td>
              <td className="px-6 py-3 text-theme-text-dim text-[12px]">{row.ward_name || '-'}</td>
              <td className="px-6 py-3 font-medium text-[12px]">
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
              <td className="px-6 py-3 text-theme-text font-mono text-[12px] font-semibold">{row.covered_percentage}%</td>
              <td className="px-6 py-3 text-theme-text font-mono text-[12px] font-semibold">{row.in_order_percentage}%</td>
            </tr>
          ))}
        </Table>
      </div>

    </div>
  );
}
