import React from 'react';
import { Shield } from 'lucide-react';

export default function DashboardHeader() {
  return (
    <header className="bg-white border-b border-slate-200 h-16 shrink-0 flex items-center justify-between px-6 shadow-sm z-10 sticky top-0 select-none">
      {/* Left: City Logo / Brand */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
          <Shield size={20} strokeWidth={2.5} />
        </div>
        <div className="flex flex-col">
          <h1 className="text-sm font-extrabold text-slate-800 tracking-tight leading-none uppercase">
            Nagar Nigam Jaipur
          </h1>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
            Command & Control Center
          </span>
        </div>
      </div>

      {/* Center: Software Name */}
      <div className="hidden lg:flex flex-col items-center absolute left-1/2 -translate-x-1/2">
        <span className="text-xs font-black text-slate-800 tracking-[0.2em] uppercase">
          ISWM Core
        </span>
        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">
          Enterprise Operations Dashboard
        </span>
      </div>

      {/* Right: User / System Status */}
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">System Online</span>
        </div>
        <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-extrabold text-slate-600 cursor-pointer hover:bg-slate-200 transition-colors">
          AD
        </div>
      </div>
    </header>
  );
}
