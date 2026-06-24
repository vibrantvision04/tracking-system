"use client";
import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Table from '@/components/shared/Table';
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";

export default function GPSNotReportingReport() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  
  // Dropdown data
  const [zones, setZones] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);

  // Filters
  const [zoneId, setZoneId] = useState("");
  const [wardId, setWardId] = useState("");

  useEffect(() => {
    api('/api/zones').then((d: any) => d.success && setZones(d.data || [])).catch(() => setZones([]));
    api('/api/wards').then((d: any) => d.success && setWards(d.data || [])).catch(() => setWards([]));
  }, []);

  const handleLoad = async () => {
    setLoading(true);
    try {
      // Mock data for demonstration - replace with actual API call
      const mockData = [
        {
          id: 1,
          vehicle_reg_no: "RJ01-AB-1234",
          zone: "Zone 4 - Adarsh Nagar Zone",
          ward: "Ward 1",
          last_location: "26.9124, 75.7873",
          last_updated: "2026-06-24 08:30:15"
        },
        {
          id: 2,
          vehicle_reg_no: "RJ01-CD-5678",
          zone: "Zone 5 - Civil Lines Zone",
          ward: "Ward 2",
          last_location: "26.9234, 75.7983",
          last_updated: "2026-06-24 07:45:30"
        },
        {
          id: 3,
          vehicle_reg_no: "RJ01-EF-9012",
          zone: "Zone 6 - Industrial Area Zone",
          ward: "Ward 3",
          last_location: "26.9344, 75.8093",
          last_updated: "2026-06-24 06:15:45"
        },
        {
          id: 4,
          vehicle_reg_no: "RJ01-GH-3456",
          zone: "Zone 7 - Mansarovar Zone",
          ward: "Ward 4",
          last_location: "26.9454, 75.8203",
          last_updated: "2026-06-24 05:30:20"
        },
        {
          id: 5,
          vehicle_reg_no: "RJ01-IJ-7890",
          zone: "Zone 8 - Sodala Zone",
          ward: "Ward 5",
          last_location: "26.9564, 75.8313",
          last_updated: "2026-06-24 04:45:10"
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

  return (
    <div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans w-full">
      
      {/* Header */}
      <div className="bg-theme-surface px-6 py-3 border-b border-theme-border shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-theme-text">GPS Not Reporting Report</h2>
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
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
            <span key="zone" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Zone</span>,
            <span key="ward" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Ward</span>,
            <span key="location" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Last Location</span>,
            <div key="updated" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Last Updated</div>,
          ]}
          isLoading={loading}
          itemsPerPage={10}
          emptyState={
            <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-theme-text-dim/60">
              <span className="text-3xl">📭</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider">No data available</span>
              <span className="text-[10px]">Select filters and click "Load" to fetch GPS data.</span>
            </div>
          }
        >
          {data.map((row, idx) => (
            <tr key={row.id} className="border-b border-theme-border/30 transition-colors">
              <td className="px-6 py-3 text-center text-theme-text-dim font-mono text-[11px]">{idx + 1}</td>
              <td className="px-6 py-3 text-theme-text text-[12px] font-semibold">{row.vehicle_reg_no}</td>
              <td className="px-6 py-3 text-theme-text text-[12px]">{row.zone}</td>
              <td className="px-6 py-3 text-theme-text text-[12px]">{row.ward}</td>
              <td className="px-6 py-3 text-theme-text-dim text-[12px] font-mono">{row.last_location}</td>
              <td className="px-6 py-3 text-center text-theme-text-dim text-[12px]">{row.last_updated}</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
