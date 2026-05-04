"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";

const nav = [
  { href: "/",         icon: "🗺️", label: "Live Tracking" },
  { href: "/zones",    icon: "🏛️", label: "Zones & Wards" },
  { href: "/playback", icon: "⏪", label: "Playback" },
  { href: "/reports",  icon: "📊", label: "Reports" },
  { href: "/alerts",   icon: "🔔", label: "Alerts" },
  { href: "/devices",  icon: "📡", label: "GPS Devices" },
  { href: "/vehicles", icon: "🚛", label: "Vehicles" },
];

export default function Sidebar() {
  const path = usePathname();
  const { sidebarOpen, setSidebarOpen } = useStore();

  return (
    <>
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1001] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-[1002] w-[260px] flex flex-col bg-[var(--bg-sidebar)] border-r border-white/[.05]
        transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/[.05]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-500/20">
              IS
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-tight leading-none mb-1">ISWM Jaipur</div>
              <div className="text-[9px] text-slate-500 uppercase tracking-[.15em]">Heritage Municipal</div>
            </div>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-white p-1"
          >
            ✕
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto custom-scrollbar">
          {nav.map((n) => {
            const active = path === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-5 py-2.5 text-[13px] transition-all duration-150
                  ${active
                    ? "bg-indigo-500/[.12] text-indigo-400 border-r-[3px] border-indigo-500 font-medium"
                    : "text-slate-500 hover:text-slate-300 hover:bg-white/[.02]"
                  }`}
              >
                <span className="text-[16px] w-5 text-center">{n.icon}</span>
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/[.05] flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold">
            AD
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-200 truncate">Admin</div>
            <div className="text-[10px] text-slate-500 truncate">Master Admin</div>
          </div>
        </div>
      </aside>
    </>
  );
}
