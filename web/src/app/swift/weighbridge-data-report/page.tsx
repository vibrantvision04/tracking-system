"use client";
import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import ReportHeader from '@/components/shared/ReportHeader';
import Table from '@/components/shared/Table';
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";

export default function WeighbridgeDataReport() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  
  // Dropdown data
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [transferStations, setTransferStations] = useState<any[]>([]);
  const [weighbridges, setWeighbridges] = useState<any[]>([]);

  // Filters
  const [vehicleId, setVehicleId] = useState("");
  const [transferStationId, setTransferStationId] = useState("");
  const [weighbridgeId, setWeighbridgeId] = useState("");
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    api('/api/vehicles').then((d: any) => d.success && setVehicles(d.data || [])).catch(() => setVehicles([]));
    api('/api/transfer-stations').then((d: any) => d.success && setTransferStations(d.data || [])).catch(() => setTransferStations([]));
    api('/api/weighbridges').then((d: any) => d.success && setWeighbridges(d.data || [])).catch(() => setWeighbridges([]));
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
        title="Weighbridge Data Report"
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

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Weighbridges(s)</span>
                <Select
                  value={weighbridgeId}
                  onChange={(e) => setWeighbridgeId(e.target.value)}
                  options={[
                    { value: "", label: "Select Weighbridges" },
                    ...weighbridges.map((wb) => ({ value: wb.id?.toString() || "", label: wb.name || wb.weighbridge_name || "Unknown" }))
                  ]}
                  placeholder="Select Weighbridges"
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
            <span key="ts" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Transfer Station Name</span>,
            <span key="device" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Device ID</span>,
            <span key="sequence" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Sequence No</span>,
            <span key="epc" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">EPC ID</span>,
            <span key="reg" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Registration No</span>,
            <div key="weight" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Weight</div>,
            <div key="datetime" className="text-center text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Date & Time</div>,
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
              <td className="px-6 py-3 text-theme-text text-[12px]">{row.transfer_station_name}</td>
              <td className="px-6 py-3 text-theme-text-dim text-[12px]">{row.device_id}</td>
              <td className="px-6 py-3 text-theme-text-dim text-[12px]">{row.sequence_no}</td>
              <td className="px-6 py-3 text-theme-text-dim text-[12px]">{row.epc_id}</td>
              <td className="px-6 py-3 text-theme-text text-[12px]">{row.registration_no}</td>
              <td className="px-6 py-3 text-center text-theme-text font-mono text-[12px] font-semibold">{row.weight}</td>
              <td className="px-6 py-3 text-center text-theme-text-dim text-[12px]">{row.date_time}</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
