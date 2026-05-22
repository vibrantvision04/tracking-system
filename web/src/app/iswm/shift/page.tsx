"use client";
import React, { useState, useEffect } from 'react';
import { api, post, del } from '@/lib/api';

type Shift = {
  id: number;
  shift_name: string;
  start_time: string;
  end_time: string;
  time_duration: number;
};

export default function ShiftManager() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  
  const [form, setForm] = useState({
    shift_name: "",
    start_time: "",
    end_time: "",
    time_duration: 8
  });

  const loadShifts = async () => {
    try {
      const res: any = await api('/api/shifts');
      if (res.success && res.data) {
        setShifts(res.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadShifts();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    // Ensure seconds are included in time for postgres time format
    let st = form.start_time;
    let et = form.end_time;
    if (st.split(":").length === 2) st += ":00";
    if (et.split(":").length === 2) et += ":00";

    try {
      const res: any = await post('/api/shifts', {
        shift_name: form.shift_name,
        start_time: st,
        end_time: et,
        time_duration: Number(form.time_duration)
      });
      if (res.success) {
        setMessage("Shift created successfully!");
        setForm({ shift_name: "", start_time: "", end_time: "", time_duration: 8 });
        loadShifts();
      } else {
        setMessage(res.error || "Failed to create shift");
      }
    } catch (err: any) {
      setMessage("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this shift?")) return;
    try {
      const res: any = await del(`/api/shifts/${id}`);
      if (res.success) {
        loadShifts();
      } else {
        alert(res.error || "Failed to delete shift");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  return (
    <div className="flex-1 p-6 lg:p-8 bg-[#0b0f1a] min-h-screen text-slate-200">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Col - Create Form */}
        <div className="lg:col-span-1">
          <header className="mb-6">
            <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Shift Manager</h1>
            <p className="text-sm text-slate-400">Create and manage operational shifts.</p>
          </header>

          <div className="bg-[#131b2f] rounded-xl border border-white/[.05] shadow-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Create New Shift</h2>
            
            {message && (
              <div className={`p-3 rounded-lg mb-4 text-sm ${message.includes("success") ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Shift Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Morning Shift"
                  value={form.shift_name}
                  onChange={e => setForm({...form, shift_name: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Start Time</label>
                <input 
                  type="time" 
                  required
                  value={form.start_time}
                  onChange={e => setForm({...form, start_time: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">End Time</label>
                <input 
                  type="time" 
                  required
                  value={form.end_time}
                  onChange={e => setForm({...form, end_time: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Duration (Hours)</label>
                <input 
                  type="number" 
                  required
                  min="1" max="24"
                  value={form.time_duration}
                  onChange={e => setForm({...form, time_duration: Number(e.target.value)})}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                />
              </div>

              <div className="pt-4">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg font-medium transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50"
                >
                  {loading ? "Creating..." : "Create Shift"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Col - List */}
        <div className="lg:col-span-2">
          <div className="bg-[#131b2f] rounded-xl border border-white/[.05] shadow-2xl overflow-hidden mt-16 lg:mt-0">
            <div className="p-4 border-b border-white/[.05]">
              <h2 className="text-lg font-semibold text-white">Existing Shifts</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-white/[.02] border-b border-white/[.05] text-slate-400 text-xs uppercase tracking-wider">
                    <th className="p-4 font-semibold">ID</th>
                    <th className="p-4 font-semibold">Name</th>
                    <th className="p-4 font-semibold">Start</th>
                    <th className="p-4 font-semibold">End</th>
                    <th className="p-4 font-semibold text-center">Duration</th>
                    <th className="p-4 font-semibold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[.04]">
                  {shifts.map((s) => (
                    <tr key={s.id} className="hover:bg-white/[.02] transition-colors text-slate-300">
                      <td className="p-4 text-slate-500 font-mono">{s.id}</td>
                      <td className="p-4 font-medium text-white">{s.shift_name}</td>
                      <td className="p-4">{s.start_time}</td>
                      <td className="p-4">{s.end_time}</td>
                      <td className="p-4 text-center">{s.time_duration} hr</td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => handleDelete(s.id)}
                          className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                          title="Delete Shift"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                  {shifts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        No shifts configured yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
