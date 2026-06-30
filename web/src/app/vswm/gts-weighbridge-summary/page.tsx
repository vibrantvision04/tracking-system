"use client";
import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import ReportHeader from '@/components/shared/ReportHeader';
import Table from '@/components/shared/Table';
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";

export default function GTSWeighbridgeSummaryReport() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  
  // Dropdown data
  const [zones, setZones] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [transferStations, setTransferStations] = useState<any[]>([]);

  // Filters
  const [zoneId, setZoneId] = useState("");
  const [wardId, setWardId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [transferStationId, setTransferStationId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    api('/api/zones').then((d: any) => d.success && setZones(d.data || [])).catch(console.error);
    api('/api/wards').then((d: any) => d.success && setWards(d.data || [])).catch(console.error);
    api('/api/vehicles').then((d: any) => d.success && setVehicles(d.data || [])).catch(console.error);
    api('/api/transfer-stations').then((d: any) => d.success && setTransferStations(d.data || [])).catch(console.error);
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
        title="GTS Weighbridge Summary Report"
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

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Vehicle(s) RTO</span>
                <Select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  options={[
                    { value: "", label: "Select Vehicle" },
                    ...vehicles.map((v) => ({ value: v.id?.toString() || "", label: v.vehicle_reg_no || v.reg_no || "Unknown" }))
                  ]}
                  placeholder="Select Vehicle"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Transfer Station(s)</span>
                <Select
                  value={transferStationId}
                  onChange={(e) => setTransferStationId(e.target.value)}
                  options={[
                    { value: "", label: "Select TransferStation" },
                    ...transferStations.map((ts) => ({ value: ts.id?.toString() || "", label: ts.name || ts.station_name || "Unknown" }))
                  ]}
                  placeholder="Select TransferStation"
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
            <span key="zone" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Zone</span>,
            <span key="ward" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Ward</span>,
            <span key="vehicle" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Vehicle(s) RTO</span>,
            <span key="ts" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Transfer Station(s)</span>,
            <div key="dry" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Dry Weight(KG.)</div>,
            <div key="wet" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Wet Weight(KG.)</div>,
            <div key="gross" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Vehicle Gross Weight(KG.)</div>,
            <div key="total" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Total Garbage Weight(KG.)</div>,
            <div key="trips" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Trips Count</div>,
          ]}
          isLoading={loading}
          itemsPerPage={10}
          emptyState={
            <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-theme-text-dim/60">
              <span className="text-3xl">📭</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider">No data available</span>
              <span className="text-[10px]">Select filters and click "Load" to fetch weighbridge data.</span>
            </div>
          }
        >
          {data.map((row, idx) => (
            <tr key={row.id} className="border-b border-theme-border/30 transition-colors">
              <td className="px-6 py-3 text-center text-theme-text-dim font-mono text-[11px]">{idx + 1}</td>
              <td className="px-6 py-3 text-theme-text text-[12px]">{row.zone}</td>
              <td className="px-6 py-3 text-theme-text text-[12px]">{row.ward}</td>
              <td className="px-6 py-3 text-theme-text-dim text-[12px]">{row.vehicle_rto}</td>
              <td className="px-6 py-3 text-theme-text-dim text-[12px]">{row.transfer_station}</td>
              <td className="px-6 py-3 text-center text-theme-text font-mono text-[12px] font-semibold">{row.dry_weight}</td>
              <td className="px-6 py-3 text-center text-theme-text font-mono text-[12px] font-semibold">{row.wet_weight}</td>
              <td className="px-6 py-3 text-center text-theme-text font-mono text-[12px] font-semibold">{row.vehicle_gross_weight}</td>
              <td className="px-6 py-3 text-center text-theme-text font-mono text-[12px] font-semibold text-emerald-600">{row.total_garbage_weight}</td>
              <td className="px-6 py-3 text-center text-theme-text font-mono text-[12px] font-semibold">{row.trips_count}</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
