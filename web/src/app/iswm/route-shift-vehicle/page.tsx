"use client";
import React, { useState, useEffect } from 'react';
import { api, post } from '@/lib/api';
import { toast } from 'react-toastify';

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

type Vehicle = { id: number; registration_no: string; is_active: boolean };
type Route = { id: number; route_name: string; is_active: boolean };
type Shift = { id: number; shift_name: string };

export default function RouteShiftVehicle() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [selectedShift, setSelectedShift] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api('/api/vehicles').then((data: any) => { if (data.success) setVehicles(data.data); });
    api('/api/routes').then((data: any) => { if (data.success) setRoutes(data.data); });
    api('/api/shifts').then((data: any) => { if (data.success) setShifts(data.data); });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!selectedVehicle || !selectedRoute) {
      toast.warning("Please select both a vehicle and a route.");
      setLoading(false);
      return;
    }

    try {
      const res: any = await post(`/api/vehicles/${selectedVehicle}/assign-route`, {
        route_id: parseInt(selectedRoute),
        shift_id: selectedShift ? parseInt(selectedShift) : null,
        date: selectedDate
      });
      if (res.success) {
        toast.success("Route assigned to vehicle successfully.");
      } else {
        toast.error(res.error || "Failed to assign route.");
      }
    } catch (err: any) {
      toast.error("Error assigning route: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">
      
      <PageHeader
        title="Route & Shift Assignment"
        description="Assign a specific route and shift to a vehicle for a given date."
        breadcrumbs={[{ label: "ISWM", href: "/iswm/shift" }, { label: "Vehicle Route Assignment" }]}
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar pb-8">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Assign Route and Shift</CardTitle>
              <CardDescription>Select a date, vehicle, route, and shift to create an assignment.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Input 
                    type="date" 
                    label="Date"
                    required
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                  />

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider block">Select Vehicle <span className="text-rose-500">*</span></label>
                    <select 
                      value={selectedVehicle}
                      onChange={e => setSelectedVehicle(e.target.value)}
                      required
                      className="w-full bg-theme-surface border border-theme-border rounded-xl px-4 py-2.5 text-sm text-theme-text focus:outline-none focus:border-emerald-500 transition"
                    >
                      <option value="" disabled>-- Choose a Vehicle --</option>
                      {vehicles.map(v => <option key={v.id} value={v.id}>{v.registration_no}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider block">Select Route <span className="text-rose-500">*</span></label>
                    <select 
                      value={selectedRoute}
                      onChange={e => setSelectedRoute(e.target.value)}
                      required
                      className="w-full bg-theme-surface border border-theme-border rounded-xl px-4 py-2.5 text-sm text-theme-text focus:outline-none focus:border-emerald-500 transition"
                    >
                      <option value="" disabled>-- Choose a Route --</option>
                      {routes.map(r => <option key={r.id} value={r.id}>{r.route_name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider block">Select Shift</label>
                    <select 
                      value={selectedShift}
                      onChange={e => setSelectedShift(e.target.value)}
                      className="w-full bg-theme-surface border border-theme-border rounded-xl px-4 py-2.5 text-sm text-theme-text focus:outline-none focus:border-emerald-500 transition"
                    >
                      <option value="">-- Choose a Shift (Optional) --</option>
                      {shifts.map(s => <option key={s.id} value={s.id}>{s.shift_name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="pt-6 border-t border-theme-border flex justify-end">
                  <Button 
                    type="submit" 
                    variant="accent" 
                    loading={loading}
                    loadingText="Assigning..."
                  >
                    Assign Route
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
