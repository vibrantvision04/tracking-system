import React from "react";

export default function MainHeader() {
  return (
    <header className="bg-theme-surface border-b border-theme-border h-16 shrink-0 flex items-center justify-between px-6 shadow-sm z-[9999] sticky top-0 select-none print:hidden w-full">
      <div className="flex items-center gap-3.5">
        <a href="/">
          <img 
            src="/Jaipur_Municipal_Corporation_Logo.png" 
            alt="Jaipur Municipal Corporation Logo" 
            className="h-12 w-[62px] object-contain shrink-0 hover:scale-105 transition-transform duration-200"
          />
        </a>
        <div className="flex flex-col">
          <h1 className="text-sm font-extrabold text-theme-text tracking-tight leading-none uppercase">
            VSWM - NAGAR NIGAM JAIPUR
          </h1>
          <span className="text-[9px] font-bold text-theme-text-dim uppercase tracking-widest mt-1">
            INTEGRATED SOLID WASTE MANAGEMENT SYSTEM
          </span>
        </div>
      </div>

      {/* Right side: User Profile & Online Status */}
      <div className="flex items-center gap-3">
        <div className="text-right flex flex-col justify-center">
          <span className="text-xs font-bold text-theme-text">Admin User</span>
          <span className="text-[9px] font-extrabold text-[#16A34A] uppercase tracking-wider mt-0.5">
            ONLINE
          </span>
        </div>
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-red-500 to-rose-400 border border-red-400/20 flex items-center justify-center text-white text-[11px] font-black shadow shadow-red-500/10 select-none">
          AD
        </div>
      </div>
    </header>
  );
}
