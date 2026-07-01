import React from 'react';
import { Shield } from 'lucide-react';

export default function DashboardHeader() {
  return (
    <header className="bg-theme-surface border-b border-theme-border h-16 shrink-0 flex items-center justify-between px-6 shadow-sm z-10 sticky top-0 select-none">
      {/* Left: City Logo / Brand */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-theme-accent rounded-xl flex items-center justify-center text-white shadow-md shrink-0">
          <Shield size={20} strokeWidth={2.5} />
        </div>
        <div className="flex flex-col">
          <h1 className="text-sm font-extrabold text-theme-text tracking-tight leading-none uppercase">
            Nagar Nigam Jaipur
          </h1>
          <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-widest mt-0.5">
            Command & Control Center
          </span>
        </div>
      </div>

      {/* Center: Software Name */}
      <div className="hidden lg:flex flex-col items-center absolute left-1/2 -translate-x-1/2">
        <span className="text-xs font-black text-theme-text tracking-[0.2em] uppercase">
          SWIFT Core
        </span>
        <span className="text-[9px] font-semibold text-theme-text-dim uppercase tracking-widest mt-0.5">
          Enterprise Operations Dashboard
        </span>
      </div>

      {/* Right: User / System Status */}
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-theme-elevated border border-theme-border rounded-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider">System Online</span>
        </div>
        <div className="w-9 h-9 rounded-full bg-theme-elevated border border-theme-border flex items-center justify-center text-xs font-extrabold text-theme-text-dim cursor-pointer hover:bg-theme-card transition-colors">
          AD
        </div>
      </div>
    </header>
  );
}
