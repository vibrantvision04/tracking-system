"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useState, useRef, useEffect } from "react";

const navData = [
  {
    label: "Vehicles",
    icon: "🚛",
    children: [
      { label: "Vehicle List", href: "/vehicles" },
      { label: "Vehicle Type", href: "/iswm/vehicle-type" },
      { label: "Vehicle Make", href: "/iswm/vehicle-make" },
      { label: "Vehicle Group", href: "/iswm/vehicle-groups" },
      { label: "Capacity Type", href: "/iswm/capacity-type" },
      { label: "Fuel Rate", href: "/iswm/fuel-rate" },
      { label: "Contractors", href: "/iswm/contractors" },
      {
        label: "Assignments",
        children: [
          { label: "GPS Device To Vehicle", href: "/iswm/gpsdevice-vehicle" },
          { label: "Vehicle To Region", href: "/iswm/vehicle-region" },
          { label: "Vehicle To Department", href: "/iswm/vehicle-department" },
          { label: "Vehicle To Groups", href: "/iswm/vehicle-groups-mapping" },
          { label: "Fuel To Vehicle", href: "/iswm/vehicle-fuel" },
        ],
      },
      {
        label: "Adhoc",
        children: [
          { label: "Temporary Vehicle", href: "/iswm/temporary-vehicle" },
        ],
      },
    ],
  },
  {
    label: "GPS Devices",
    icon: "📡",
    children: [
      { label: "GPS Device List", href: "/devices" },
      { label: "GPS Device Type", href: "/iswm/gps-device-type" },
      { label: "POS Device", href: "/iswm/pos-device" },
      { label: "Weigh Bridge", href: "/iswm/weigh-bridge" },
      {
        label: "Assignments",
        children: [
          { label: "POS Device To Fuelstation", href: "/iswm/posdevice-fuelstation" },
          { label: "WeighBridge to TS", href: "/iswm/weighbridge-transferstation" },
        ],
      },
    ],
  },
  {
    label: "Regions & Routes",
    icon: "🏛️",
    children: [
      { label: "Zones & Wards", href: "/zones" },
      { label: "Region Type", href: "/iswm/region-type" },
      { label: "Route", href: "/iswm/route" },
      { label: "Route Type", href: "/iswm/route-type" },
      { label: "Shift", href: "/iswm/shift" },
      { label: "Collection Type", href: "/iswm/vehicle-purpose" },
      {
        label: "Assignments",
        children: [
          { label: "Route To Ward", href: "/iswm/route-ward" },
          { label: "Route To Vehicle & Shift", href: "/iswm/route-shift-vehicle" },
          { label: "Route Type To Vehicle Type", href: "/iswm/routetype-vehicletype" },
          { label: "Transfer Station To Ward", href: "/iswm/transferstation-ward" },
          { label: "Fuel Station To Zone", href: "/iswm/fuelstation-zone" },
          { label: "Parking Spot To Zone", href: "/iswm/parkingspot-zone" },
        ],
      },
    ],
  },
  {
    label: "POIs",
    icon: "📍",
    children: [
      { label: "Transfer Station", href: "/iswm/transfer-station" },
      { label: "Workshop", href: "/iswm/workshop" },
      { label: "Parking Spots", href: "/iswm/parking-spot" },
      { label: "Fuel Station", href: "/iswm/fuel-station" },
      { label: "Fuel Companies", href: "/iswm/fuel-company" },
      { label: "Fuel Type", href: "/iswm/fuel-type" },
      { label: "Upload Fuel Transactions", href: "/iswm/upload-fuel-transaction" },
      {
        label: "Depute",
        children: [
          { label: "Incharge at TS", href: "/iswm/incharge-transferstation" },
          { label: "Incharge at Fuel Station", href: "/iswm/incharge-fuelstation" },
        ],
      },
    ],
  },
  {
    label: "HR / Staff",
    icon: "👥",
    children: [
      { label: "Employee List", href: "/iswm/employee" },
      { label: "Department", href: "/iswm/department" },
      { label: "Designation", href: "/iswm/designation" },
      {
        label: "Assignments",
        children: [
          { label: "Driver/Helper to Shift & Vehicle", href: "/iswm/employee-shift-vehicle" },
          { label: "Employee to Designation & Department", href: "/iswm/employee-department-designation" },
          { label: "Role To User", href: "/iswm/role-user" },
          { label: "Department to Designation", href: "/iswm/department-designation" },
          { label: "Region Type to Designation", href: "/iswm/regiontype-designation" },
        ],
      },
      {
        label: "Adhoc",
        children: [
          { label: "Temporary Driver", href: "/iswm/temporary-driver" },
        ],
      },
    ],
  },
  {
    label: "Data Entry",
    icon: "⌨️",
    children: [
      { label: "Trenching Ground Weighbridge Entry", href: "/iswm/trenching-ground-weighbridge-entry" },
      { label: "Weighbridge 3 Bin Entry", href: "/iswm/weighbridge-3-bin-entry" },
    ],
  },
  {
    label: "Monitor",
    icon: "📺",
    children: [
      { label: "Vehicle Location", href: "/" },
      { label: "Employee Location", href: "/iswm/employee-location" },
      { label: "D2D", href: "/iswm/d2d" },
      { label: "Alert Manager", href: "/iswm/alert-manager" },
    ],
  },
  {
    label: "Reports",
    icon: "📊",
    children: [
      {
        label: "Vehicle & Movement",
        children: [
          { label: "Vehicle Movement Report", href: "/reports" },
          { label: "Active Vehicle Summary", href: "/iswm/active-vehicle-summary" },
          { label: "Ward Wise Active Vehicle Summary", href: "/iswm/active-inactive-vehicle-summary-by-ward" },
          { label: "Unauthorized Movement Report", href: "/iswm/unauthorized-movement" },
          { label: "Vehicle Not Moving Report", href: "/iswm/vehicle-not-moving" },
          { label: "Vehicle Based On Distance Report", href: "/iswm/vehicle-based-on-distance" },
          { label: "Vehicle Under Maintenance Report", href: "/iswm/vehicle-under-maintenance" },
          { label: "Vehicle Deployment Report", href: "/iswm/vehicle-deployment" },
          { label: "Vehicle Breaking Geofence Report", href: "/iswm/vehicle-breaking-geofence" },
          { label: "Vehicle Status Report", href: "/iswm/vehicle-status-report" },
          { label: "Vehicle Summary Report", href: "/iswm/vehicle-summary-report" },
        ],
      },
      {
        label: "Waste Collection & D2D",
        children: [
          { label: "D2D Vehicle Route Coverage Report", href: "/iswm/d2d-vehicle-route-coverage-report" },
          { label: "D2D Zone Ward Coverage Report", href: "/iswm/D2D-zone-ward-coverage-report" },
          { label: "Lane Monitoring Report", href: "/iswm/lane-monitoring-report" },
          { label: "Lane Point Coverage Report", href: "/iswm/lane-point-coverage-report" },
          { label: "First Lane Monitoring Report", href: "/iswm/first-lane-monitoring-report" },
          { label: "Last Lane Monitoring Report", href: "/iswm/last-lane-coverage-report" },
          { label: "Litterbin Coverage Summary Report", href: "/iswm/litterbin-coverage-summary-report" },
          { label: "Collection Point Summary Report", href: "/iswm/collection-point-summary-report" },
          { label: "Litterbin Coverage Report", href: "/iswm/litterbin-coverage-report" },
          { label: "Collection Point Coverage Report", href: "/iswm/collection-point-coverage-report" },
          { label: "Waste Generator Coverage Report", href: "/iswm/waste-generator-coverage-report" },
          { label: "Waste Generator Summary Report", href: "/iswm/waste-generator-summary-report" },
          { label: "Waste Weight Report", href: "/iswm/waste-weight-report" },
        ],
      },
      {
        label: "Weighbridge & TS",
        children: [
          { label: "GTS Trip Report", href: "/iswm/trips-to-transferstation-report" },
          { label: "GTS Weighbridge Summary Report", href: "/iswm/gts-weighbridge-summary" },
          { label: "Weighbridge Latest Data Report", href: "/iswm/weighbridge-latest-data-report" },
          { label: "Weighbridge Data Report", href: "/iswm/weighbridge-data-report" },
          { label: "Weighbridge Source Summaries Report", href: "/iswm/weighbridge-source-summaries-report" },
          { label: "Weighbridge Waste Type Summaries Report", href: "/iswm/weighbridge-waste-type-summaries-report" },
        ],
      },
      {
        label: "Alerts & Events",
        children: [
          { label: "GPS Log Report", href: "/iswm/gps-log-report" },
          { label: "Alerts And Events Report", href: "/iswm/alert-and-event-report" },
          { label: "Alert Detail Report", href: "/iswm/alert-detail" },
          { label: "Speed Violation Report", href: "/iswm/speed-violation" },
          { label: "Geofence Event Report", href: "/iswm/geofence-event" },
          { label: "GPS Not Reporting Report", href: "/iswm/gps-not-reporting-report" },
        ],
      },
      {
        label: "Fuel",
        children: [
          { label: "Fuel Summary Report", href: "/iswm/fuel-summary-report" },
          { label: "Fuel Transaction Report", href: "/iswm/fuel-transaction-report" },
          { label: "Fuel Consumption Report", href: "/iswm/fuel-consumption-report" },
        ],
      },
      {
        label: "Operations",
        children: [
          { label: "Delay In Starting Waste Collection Report", href: "/iswm/delay-in-starting-waste-collection-report" },
          { label: "Delay In Completing Waste Collection Report", href: "/iswm/delay-completing-waste-collection" },
          { label: "Hydrant Trip Report", href: "/iswm/hydrant-trip-report" },
          { label: "Vehicle Check Point Status Report", href: "/iswm/vehicle-check-point-status-report" },
          { label: "Vehicle Check List Summary Report", href: "/iswm/vehicle-check-list-summary-report" },
          { label: "Vehicle Check List Report", href: "/iswm/vehicle-check-list-report" },
          { label: "Ward Geofance Report", href: "/iswm/ward-geofance-report" },
        ],
      },
    ],
  },
  {
    label: "Playback",
    icon: "⏪",
    href: "/playback",
  },
];

export default function Sidebar() {
  const path = usePathname();
  const { sidebarOpen, setSidebarOpen } = useStore();
  
  // State to track active category for flyout
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [renderedCategory, setRenderedCategory] = useState<string | null>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  // Smooth unmount trick: keep content visible during fade out
  useEffect(() => {
    if (activeCategory) {
      setRenderedCategory(activeCategory);
    }
  }, [activeCategory]);

  // Close flyout when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (flyoutRef.current && !flyoutRef.current.contains(event.target as Node)) {
        setActiveCategory(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentCategoryData = navData.find(cat => cat.label === (activeCategory || renderedCategory));

  return (
    <>
      {/* Overlay for mobile with glass effect */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1001] lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Sidebar (160px) - Premium dark aesthetic */}
      <aside className={`
        fixed inset-y-0 left-0 z-[1002] w-[160px] flex flex-col bg-[#0b0f1a] border-r border-white/[.03]
        transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        {/* Brand with subtle glow */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/[.03]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-[11px] shadow-lg shadow-indigo-500/30">
              IS
            </div>
            <div>
              <div className="text-[11px] font-bold text-white tracking-tight leading-none mb-0.5">ISWM Jaipur</div>
              <div className="text-[7px] text-slate-500 uppercase tracking-[.15em]">Heritage</div>
            </div>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-500 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Navigation with micro-interactions */}
        <nav className="flex-1 py-3 space-y-0.5 text-[11px]">
          {navData.map((category) => {
            const hasChildren = category.children && category.children.length > 0;
            const isActive = activeCategory === category.label;
            const isCurrentPath = category.href && path === category.href;

            return (
              <div key={category.label} className="px-1.5">
                {category.href ? (
                  <Link
                    href={category.href}
                    onClick={() => {
                      setSidebarOpen(false);
                      setActiveCategory(null);
                    }}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-200 group
                      ${isCurrentPath
                        ? "bg-gradient-to-r from-indigo-500/[.15] to-transparent text-indigo-400 font-medium"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/[.02]"
                      }`}
                  >
                    <span className="w-4 flex justify-center text-[13px] group-hover:scale-110 transition-transform">{category.icon}</span>
                    <span className="truncate">{category.label}</span>
                  </Link>
                ) : (
                  <button
                    onClick={() => setActiveCategory(isActive ? null : category.label)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-all duration-200 group
                      ${isActive 
                        ? "bg-gradient-to-r from-indigo-500/[.15] to-transparent text-indigo-400 font-medium" 
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/[.02]"
                      }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-4 flex justify-center text-[13px] group-hover:scale-110 transition-transform">{category.icon}</span>
                      <span className="truncate">{category.label}</span>
                    </div>
                    {hasChildren && (
                      <span className={`text-[7px] transition-transform duration-200 ${isActive ? "rotate-90 text-indigo-400" : "text-slate-600"}`}>▶</span>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-white/[.03] flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold">
            AD
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-200 truncate">Admin</div>
            <div className="text-[8px] text-slate-600 truncate">Master Admin</div>
          </div>
        </div>
      </aside>

      {/* Flyout Mega Menu - Glassmorphism & Slide-in Animation */}
      <div 
        ref={flyoutRef}
        className={`fixed inset-y-0 left-[160px] z-[1003] bg-[#0b0f1a]/95 backdrop-blur-xl border-r border-white/[.03] shadow-2xl shadow-black/70 flex flex-col
          transition-all duration-300 ease-out
          ${activeCategory 
            ? "opacity-100 translate-x-0" 
            : "opacity-0 -translate-x-4 pointer-events-none"
          }
        `}
        style={{ width: (activeCategory || renderedCategory) === "Reports" ? "600px" : "350px" }}
      >
        {currentCategoryData && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/[.03]">
              <div className="flex items-center gap-2">
                <span className="text-indigo-400 font-bold text-xs">{currentCategoryData.label}</span>
                <span className="text-slate-600 text-[10px] uppercase tracking-wider">Options</span>
              </div>
              <button 
                onClick={() => setActiveCategory(null)}
                className="text-slate-600 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Content - Grid of Columns */}
            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
              <div className={`grid ${(activeCategory || renderedCategory) === "Reports" ? "grid-cols-3" : "grid-cols-2"} gap-x-6 gap-y-6`}>
                {currentCategoryData.children?.map((sub) => {
                  const hasSubChildren = sub.children && sub.children.length > 0;

                  return (
                    <div key={sub.label} className="space-y-1.5">
                      {sub.href ? (
                        <Link
                          href={sub.href}
                          onClick={() => {
                            setSidebarOpen(false);
                            setActiveCategory(null);
                          }}
                          className="text-[11px] font-medium text-white hover:text-indigo-400 transition-colors block"
                        >
                          {sub.label}
                        </Link>
                      ) : (
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                          {sub.label}
                        </div>
                      )}

                      {/* Level 3 Links */}
                      {hasSubChildren && (
                        <div className="space-y-0.5 flex flex-col">
                          {sub.children!.map((item) => (
                            <Link
                              key={item.label}
                              href={item.href}
                              onClick={() => {
                                setSidebarOpen(false);
                                setActiveCategory(null);
                              }}
                              className={`text-[11px] leading-relaxed transition-colors py-0.5 rounded-md
                                ${path === item.href
                                  ? "text-indigo-400 font-medium"
                                  : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                              {item.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
