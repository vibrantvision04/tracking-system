"use client";
import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Table from '@/components/shared/Table';
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";

export default function DelayCompletingWasteCollection() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  
  // Dropdown data
  const [zones, setZones] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);

  // Filters
  const [zoneId, setZoneId] = useState("");
  const [wardId, setWardId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    api('/api/zones').then((d: any) => d.success && setZones(d.data || [])).catch(() => setZones([]));
    api('/api/wards').then((d: any) => d.success && setWards(d.data || [])).catch(() => setWards([]));
    api('/api/shifts?group=VEHICLE_MOVEMENT').then((d: any) => d.success && setShifts(d.data || [])).catch(() => setShifts([]));
  }, []);

  const handleLoad = async () => {
    setLoading(true);
    try {
      // Mock data for demonstration - replace with actual API call
      // Logic: Compare first lane point hit time with allocated shift time to calculate delay
      const mockData = [
        {
          id: 1,
          vehicle_reg_no: "RJ01-AB-1234",
          route_name: "Route A - Adarsh Nagar",
          zone: "Zone 4 - Adarsh Nagar Zone",
          ward: "Ward 1",
          shift_time: "06:00:00",
          reporting_time: "06:45:30",
          delay_minutes: 45
        },
        {
          id: 2,
          vehicle_reg_no: "RJ01-CD-5678",
          route_name: "Route B - Civil Lines",
          zone: "Zone 5 - Civil Lines Zone",
          ward: "Ward 2",
          shift_time: "07:00:00",
          reporting_time: "07:30:15",
          delay_minutes: 30
        },
        {
          id: 3,
          vehicle_reg_no: "RJ01-EF-9012",
          route_name: "Route C - Industrial Area",
          zone: "Zone 6 - Industrial Area Zone",
          ward: "Ward 3",
          shift_time: "08:00:00",
          reporting_time: "09:15:45",
          delay_minutes: 75
        },
        {
          id: 4,
          vehicle_reg_no: "RJ01-GH-3456",
          route_name: "Route D - Mansarovar",
          zone: "Zone 7 - Mansarovar Zone",
          ward: "Ward 4",
          shift_time: "06:30:00",
          reporting_time: "06:55:20",
          delay_minutes: 25
        },
        {
          id: 5,
          vehicle_reg_no: "RJ01-IJ-7890",
          route_name: "Route E - Sodala",
          zone: "Zone 8 - Sodala Zone",
          ward: "Ward 5",
          shift_time: "07:30:00",
          reporting_time: "08:40:10",
          delay_minutes: 70
        },
        {
          id: 6,
          vehicle_reg_no: "RJ01-KL-2345",
          route_name: "Route F - Vaishali Nagar",
          zone: "Zone 4 - Adarsh Nagar Zone",
          ward: "Ward 6",
          shift_time: "06:00:00",
          reporting_time: "06:20:00",
          delay_minutes: 20
        },
        {
          id: 7,
          vehicle_reg_no: "RJ01-MN-6789",
          route_name: "Route G - Shyam Nagar",
          zone: "Zone 5 - Civil Lines Zone",
          ward: "Ward 7",
          shift_time: "07:00:00",
          reporting_time: "08:05:30",
          delay_minutes: 65
        },
        {
          id: 8,
          vehicle_reg_no: "RJ01-OP-0123",
          route_name: "Route H - Vidhyadhar Nagar",
          zone: "Zone 6 - Industrial Area Zone",
          ward: "Ward 8",
          shift_time: "08:00:00",
          reporting_time: "08:35:45",
          delay_minutes: 35
        },
      ];
      
      setData(mockData);
    } catch (err) {
      console.error(err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const getDelayColor = (minutes: number) => {
    if (minutes >= 60) return 'text-red-600 bg-red-50';
    if (minutes >= 30) return 'text-amber-600 bg-amber-50';
    return 'text-emerald-600 bg-emerald-50';
  };

  const DelayBadge = ({ minutes }: { minutes: number }) => (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${getDelayColor(minutes)}`}>
      {minutes} min late
    </span>
  );

  return (
    <div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans w-full">
      
      {/* Header */}
      <div className="bg-theme-surface px-6 py-3 border-b border-theme-border shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-theme-text">Delay Completing Waste Collection</h2>
          <div className="h-[3px] w-8 bg-theme-accent mt-1"></div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button
            onClick={() => window.print()}
            variant="outline"
            className="px-3 py-1.5 text-xs font-semibold"
          >
            PDF
          </Button>
          <Button
            variant="outline"
            className="px-3 py-1.5 text-xs font-semibold"
          >
            CSV
          </Button>
        </div>
      </div>

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
                    ...zones.map((z) => ({ value: z.id?.toString() || "", label: z.region_name || z.name || "Unknown" }))
                  ]}
                  placeholder="Select Zone"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Ward</span>
                <Select
                  value={wardId}
                  onChange={(e) => setWardId(e.target.value)}
                  options={[
                    { value: "", label: "Select Ward" },
                    ...wards.map((w) => ({ value: w.id?.toString() || "", label: w.region_name || w.name || "Unknown" }))
                  ]}
                  placeholder="Select Ward"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Shift</span>
                <Select
                  value={shiftId}
                  onChange={(e) => setShiftId(e.target.value)}
                  options={[
                    { value: "", label: "Select Shift" },
                    ...shifts.map((s) => ({ value: s.id?.toString() || "", label: s.shift_name || "Unknown" }))
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
            <span key="vehicle" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Vehicle Reg. No.</span>,
            <span key="route" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Route</span>,
            <span key="zone" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Zone</span>,
            <span key="ward" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Ward</span>,
            <div key="shift" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Shift Time</div>,
            <div key="reporting" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Reporting Time</div>,
            <div key="delay" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Delay</div>,
          ]}
          isLoading={loading}
          itemsPerPage={10}
          emptyState={
            <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-theme-text-dim/60">
              <span className="text-3xl">📭</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider">No data available</span>
              <span className="text-[10px]">Select filters and click "Load" to fetch delay data.</span>
            </div>
          }
        >
          {data.map((row, idx) => (
            <tr key={row.id} className="border-b border-theme-border/30 transition-colors">
              <td className="px-6 py-3 text-center text-theme-text-dim font-mono text-[11px]">{idx + 1}</td>
              <td className="px-6 py-3 text-theme-text text-[12px] font-semibold">{row.vehicle_reg_no}</td>
              <td className="px-6 py-3 text-theme-text text-[12px]">{row.route_name}</td>
              <td className="px-6 py-3 text-theme-text text-[12px]">{row.zone}</td>
              <td className="px-6 py-3 text-theme-text text-[12px]">{row.ward}</td>
              <td className="px-6 py-3 text-center text-theme-text-dim text-[12px] font-mono">{row.shift_time}</td>
              <td className="px-6 py-3 text-center text-theme-text-dim text-[12px] font-mono">{row.reporting_time}</td>
              <td className="px-6 py-3 text-center">
                <DelayBadge minutes={row.delay_minutes} />
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
