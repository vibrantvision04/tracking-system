"use client";
import React, { useState, useEffect } from 'react';
import { api, post } from '@/lib/api';

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
  const [message, setMessage] = useState("");

  useEffect(() => {
    api('/api/vehicles').then((data: any) => {
      if (data.success) setVehicles(data.data);
    });
    api('/api/routes').then((data: any) => {
      if (data.success) setRoutes(data.data);
    });
    api('/api/shifts').then((data: any) => {
      if (data.success) setShifts(data.data);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (!selectedVehicle || !selectedRoute) {
      setMessage("Please select both a vehicle and a route.");
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
        setMessage("Route assigned to vehicle successfully.");
      } else {
        setMessage(res.error || "Failed to assign route.");
      }
    } catch (err: any) {
      setMessage("Error assigning route: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 p-6 lg:p-8 bg-[#0b0f1a] min-h-screen text-slate-200">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Route to Vehicle & Shift Assignment</h1>
          <p className="text-slate-400">Assign a specific route and shift to a vehicle for a given date.</p>
        </header>

        <div className="bg-[#131b2f] rounded-xl border border-white/[.05] shadow-2xl p-6 lg:p-8">
          {message && (
            <div className={`p-4 rounded-lg mb-6 ${message.includes("success") ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</label>
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  required
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Select Vehicle</label>
                <select 
                  value={selectedVehicle}
                  onChange={e => setSelectedVehicle(e.target.value)}
                  required
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all appearance-none"
                >
                  <option value="" disabled>-- Choose a Vehicle --</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id} className="bg-[#131b2f]">{v.registration_no}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Select Route</label>
                <select 
                  value={selectedRoute}
                  onChange={e => setSelectedRoute(e.target.value)}
                  required
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all appearance-none"
                >
                  <option value="" disabled>-- Choose a Route --</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id} className="bg-[#131b2f]">{r.route_name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Select Shift</label>
                <select 
                  value={selectedShift}
                  onChange={e => setSelectedShift(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all appearance-none"
                >
                  <option value="">-- Choose a Shift (Optional) --</option>
                  {shifts.map(s => (
                    <option key={s.id} value={s.id} className="bg-[#131b2f]">{s.shift_name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-6 border-t border-white/[.05] flex justify-end">
              <button 
                type="submit" 
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-lg font-medium transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Assigning..." : "Assign Route"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
