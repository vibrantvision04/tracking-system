"use client";
import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Table from '@/components/shared/Table';
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import ReportHeader from '@/components/shared/ReportHeader';
import { FileText, Download, Calendar, Map, Clock, Truck, BarChart3, CheckSquare } from 'lucide-react';

export default function D2DZoneWardCoverageReport() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  
  // Dropdown data
  const [zones, setZones] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [routeTypes, setRouteTypes] = useState<any[]>([]);

  // Filters
  const [zoneId, setZoneId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [routeTypeId, setRouteTypeId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [allWards, setAllWards] = useState(false);

  useEffect(() => {
    api('/api/zones').then((d: any) => d.success && setZones(d.data || [])).catch(console.error);
    api('/api/shifts?group=VEHICLE_MOVEMENT').then((d: any) => d.success && setShifts(d.data || [])).catch(console.error);
    api('/api/route-types').then((d: any) => d.success && setRouteTypes(d.data || [])).catch(console.error);
  }, []);

  const handleLoad = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        date: date,
        ...(zoneId && { zone_id: zoneId }),
        ...(shiftId && { shift_id: shiftId }),
        ...(routeTypeId && { route_type_id: routeTypeId }),
        ...(allWards && { all_wards: "true" }),
      });
      
      setData([]);
    } catch (err) {
      console.error(err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const calculateAverage = (field: string) => {
    if (data.length === 0) return 0;
    const sum = data.reduce((acc, item) => acc + (item[field] || 0), 0);
    return (sum / data.length).toFixed(1);
  };

  const getCoverageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-emerald-600 bg-emerald-50';
    if (percentage >= 75) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  const CoverageBadge = ({ percentage }: { percentage: number }) => (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${getCoverageColor(percentage)}`}>
      {percentage}%
    </span>
  );

  const ProgressBar = ({ percentage }: { percentage: number }) => (
    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
      <div 
        className={`h-2 rounded-full transition-all duration-500 ${
          percentage >= 90 ? 'bg-emerald-500' : 
          percentage >= 75 ? 'bg-amber-500' : 'bg-red-500'
        }`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans w-full">
      
      <ReportHeader
        title="D2D Zone Ward Coverage Report"
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Zone</span>
                <Select
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                  options={[
                    { value: "", label: "Select Zone" },
                    ...zones.map((z) => ({ value: z.id.toString(), label: z.region_name }))
                  ]}
                  placeholder="Select Zone"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Shift</span>
                <Select
                  value={shiftId}
                  onChange={(e) => setShiftId(e.target.value)}
                  options={[
                    { value: "", label: "Select Shift" },
                    ...shifts.map((s) => ({ value: s.id.toString(), label: s.shift_name }))
                  ]}
                  placeholder="Select Shift"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Route Type</span>
                <Select
                  value={routeTypeId}
                  onChange={(e) => setRouteTypeId(e.target.value)}
                  options={[
                    { value: "", label: "Search Route Type" },
                    ...routeTypes.map((rt) => ({ value: rt.id.toString(), label: rt.name }))
                  ]}
                  placeholder="Search Route Type"
                />
              </div>

              <DatePicker
                label="Date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="mt-6 pt-4 border-t border-theme-border/60 flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allWards}
                  onChange={(e) => setAllWards(e.target.checked)}
                  className="w-4 h-4 rounded border-theme-border text-theme-accent focus:ring-theme-accent"
                />
                <span className="text-sm text-theme-text">All Wards</span>
              </label>
            </div>

            <div className="mt-6 pt-4 border-t border-theme-border/60 flex gap-3">
              <Button 
                onClick={handleLoad}
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
            <div key="sno" className="text-center w-16 text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">S. No.</div>,
            <span key="region" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Region</span>,
            <span key="shift" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Shift</span>,
            <div key="routes" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">No. of Routes</div>,
            <div key="vehicles" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">No. of Vehicles</div>,
            <div key="overall" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Overall % Covered</div>,
            <div key="inorder" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Inorder % Covered</div>,
          ]}
          isLoading={loading}
          itemsPerPage={10}
          emptyState={
            <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-theme-text-dim/60">
              <span className="text-3xl">📭</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider">No data available</span>
              <span className="text-[10px]">Select filters and click "Load" to fetch coverage data.</span>
            </div>
          }
        >
          {data.map((row, idx) => (
            <tr key={row.id} className="border-b border-theme-border/30 transition-colors">
              <td className="px-6 py-3 text-center text-theme-text-dim font-mono text-[11px]">{idx + 1}</td>
              <td className="px-6 py-3 text-theme-text text-[12px]">{row.region}</td>
              <td className="px-6 py-3 text-theme-text-dim text-[12px]">{row.shift}</td>
              <td className="px-6 py-3 text-theme-text text-[12px]">{row.no_of_routes}</td>
              <td className="px-6 py-3 text-theme-text text-[12px]">{row.no_of_vehicles}</td>
              <td className="px-6 py-3 text-theme-text font-mono text-[12px] font-semibold">{row.overall_covered}%</td>
              <td className="px-6 py-3 text-theme-text font-mono text-[12px] font-semibold">{row.inorder_covered}%</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
