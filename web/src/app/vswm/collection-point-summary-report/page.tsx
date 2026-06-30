"use client";
import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import ReportHeader from '@/components/shared/ReportHeader';
import Table from '@/components/shared/Table';
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";

export default function CollectionPointSummaryReport() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  
  // Dropdown data
  const [zones, setZones] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);

  // Filters
  const [zoneId, setZoneId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    api('/api/zones').then((d: any) => d.success && setZones(d.data || [])).catch(console.error);
    api('/api/shifts?group=VEHICLE_MOVEMENT').then((d: any) => d.success && setShifts(d.data || [])).catch(console.error);
  }, []);

  const handleLoad = async () => {
    setLoading(true);
    try {
      setData([]);
    } catch (err) {
      console.error(err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans w-full">
      
      <ReportHeader
        title="Collection Point Summary Report"
        actions={
          <div className="flex gap-2">
            <Button onClick={() => window.print()} variant="outline" className="px-3 py-1.5 text-xs font-semibold">PDF</Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8 print:overflow-visible print:pb-0 print:p-0">
        
        {/* Filters Form */}
        <Card hoverable className="print:hidden">
          <CardContent className="p-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
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

              <DatePicker
                label="Date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
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
            <span key="region" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Region Name</span>,
            <div key="total" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Total</div>,
            <div key="collected" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Collected</div>,
            <div key="partial" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Partially Collected</div>,
            <div key="notcollected" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Not Collected</div>,
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
              <td className="px-6 py-3 text-theme-text text-[12px]">{row.region_name}</td>
              <td className="px-6 py-3 text-center text-theme-text font-mono text-[12px] font-semibold">{row.total}</td>
              <td className="px-6 py-3 text-center text-theme-text font-mono text-[12px] font-semibold text-emerald-600">{row.collected}</td>
              <td className="px-6 py-3 text-center text-theme-text font-mono text-[12px] font-semibold text-amber-600">{row.partially_collected}</td>
              <td className="px-6 py-3 text-center text-theme-text font-mono text-[12px] font-semibold text-red-600">{row.not_collected}</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
