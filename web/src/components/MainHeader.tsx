"use client";
import React from "react";
import { useStore } from "@/lib/store";
import { Menu } from "lucide-react";

export default function MainHeader() {
  const setSidebarOpen = useStore((state) => state.setSidebarOpen);
  const sidebarOpen = useStore((state) => state.sidebarOpen);

  return (
    <header className="bg-theme-surface border-b border-theme-border h-16 shrink-0 flex items-center justify-between px-6 shadow-sm z-[9999] sticky top-0 select-none print:hidden w-full">
      <div className="flex items-center gap-3.5">
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-10 h-10 flex items-center justify-center text-theme-text-dim hover:text-theme-text rounded-lg hover:bg-theme-elevated transition-colors"
          title="Toggle Navigation Menu"
        >
          <Menu className="w-5.5 h-5.5 text-emerald-600" />
        </button>
        <a href="/" className="flex items-center gap-2 shrink-0">
          <img 
            src="/Jaipur_Municipal_Corporation_Logo.png" 
            alt="Jaipur Municipal Corporation Logo" 
            className="h-12 w-[62px] object-contain shrink-0 hover:scale-105 transition-transform duration-200"
          />
        </a>
        <div className="flex flex-col min-w-0">
          <h1 className="text-xs sm:text-sm font-extrabold text-theme-text tracking-tight leading-none uppercase truncate">
            VSWM - NAGAR NIGAM JAIPUR
          </h1>
          <span className="text-[8px] sm:text-[9px] font-bold text-theme-text-dim uppercase tracking-widest mt-1 truncate">
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
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 border border-emerald-400/20 flex items-center justify-center text-white text-[11px] font-black shadow shadow-emerald-500/10 select-none">
          AD
        </div>
      </div>
    </header>
  );
}
