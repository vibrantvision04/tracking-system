import React from "react";

export default function MainHeader() {
  return (
    <header className="bg-white border-b border-slate-200 h-16 shrink-0 flex items-center justify-between px-6 shadow-sm z-[9999] sticky top-0 select-none print:hidden w-full">
      {/* Left side: Brand Logo & Title */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-emerald-500/20 shrink-0">
          JN
        </div>
        <div className="flex flex-col">
          <h1 className="text-sm font-extrabold text-slate-800 tracking-tight leading-none uppercase">
            VSWM - NAGAR NIGAM JAIPUR
          </h1>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            INTEGRATED SOLID WASTE MANAGEMENT SYSTEM
          </span>
        </div>
      </div>

      {/* Right side: User Profile & Online Status */}
      <div className="flex items-center gap-3">
        <div className="text-right flex flex-col justify-center">
          <span className="text-xs font-bold text-slate-850">Admin User</span>
          <span className="text-[9px] font-extrabold text-emerald-500 uppercase tracking-wider mt-0.5">
            ONLINE
          </span>
        </div>
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 border border-emerald-400/20 flex items-center justify-center text-white text-[11px] font-black shadow shadow-emerald-500/10 select-none">
          AD
        </div>
      </div>
    </header>
  );
}
