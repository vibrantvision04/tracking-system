"use client";
import { useStore } from "@/lib/store";
import { usePathname } from "next/navigation";

export default function MobileHeader() {
  const setSidebarOpen = useStore((state) => state.setSidebarOpen);
  const path = usePathname();

  const getTitle = () => {
    switch (path) {
      case "/": return "Live Tracking";
      case "/zones": return "Zones & Wards";
      case "/playback": return "Playback";
      case "/reports": return "Reports";
      case "/alerts": return "Alerts";
      case "/devices": return "GPS Devices";
      case "/vehicles": return "Vehicles";
      default: return "ISWM Jaipur";
    }
  };

  return (
    <header className="lg:hidden h-14 bg-[var(--bg-card)] px-4 flex items-center justify-between border-b border-white/[.05] shrink-0 z-[1000]">
      <div className="flex items-center gap-3">
        <button 
          onClick={() => setSidebarOpen(true)}
          className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-sm font-bold tracking-tight text-white">{getTitle()}</h1>
      </div>
      
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-[10px]">
        IS
      </div>
    </header>
  );
}
