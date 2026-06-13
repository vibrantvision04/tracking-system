"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore, ENABLE_FUEL_FEATURES } from "@/lib/store";
import { useState, useRef, useEffect } from "react";
import { Label } from "recharts";

const navData = [
  {
    label: "Dashboard",
    icon: "🏠",
    href: "/",
  },
  {
    label: "Vehicles",
    icon: "🚛",
    children: [
      { label: "Vehicle List", href: "/vehicles" },
      { label: "Vehicle Type", href: "/vswm/vehicle-type" },
      { label: "Vehicle Make", href: "/vswm/vehicle-make" },
      { label: "Vehicle Group", href: "/vswm/vehicle-groups" },
      { label: "Capacity Type", href: "/vswm/capacity-type" },
      { label: "Fuel Rate", href: "/vswm/fuel-rate" },
      { label: "Contractors", href: "/vswm/contractors" },
      {
        label: "Assignments",
        children: [
          { label: "GPS Device To Vehicle", href: "/vswm/gpsdevice-vehicle" },
          { label: "Vehicle To Region", href: "/vswm/vehicle-region" },
          { label: "Vehicle To Department", href: "/vswm/vehicle-department" },
          { label: "Vehicle To Groups", href: "/vswm/vehicle-groups-mapping" },
          { label: "Fuel To Vehicle", href: "/vswm/vehicle-fuel" },
        ],
      },
      {
        label: "Adhoc",
        children: [
          { label: "Temporary Vehicle", href: "/vswm/temporary-vehicle" },
        ],
      },
    ],
  },
  {
    label: "GPS Devices",
    icon: "📡",
    children: [
      { label: "GPS Device List", href: "/devices" },
      { label: "GPS Device Type", href: "/vswm/gps-device-type" },
      { label: "POS Device", href: "/vswm/pos-device" },
      { label: "Weigh Bridge", href: "/vswm/weigh-bridge" },
      {
        label: "Assignments",
        children: [
          { label: "POS Device To Fuelstation", href: "/vswm/posdevice-fuelstation" },
          { label: "WeighBridge to TS", href: "/vswm/weighbridge-transferstation" },
        ],
      },
    ],
  },
  {
    label: "Regions & Routes",
    icon: "🏛️",
    children: [
      { label: "Zones & Wards", href: "/zones" },
      { label: "Region Type", href: "/vswm/region-type" },
      { label: "Route", href: "/vswm/route" },
      { label: "Route Type", href: "/vswm/route-type" },
      { label: "Shift", href: "/vswm/shift" },
      { label: "Collection Type", href: "/vswm/vehicle-purpose" },
      { label: "Reason", href: "/vswm/reason" },
      {
        label: "Assignments",
        children: [
          { label: "Route To Ward", href: "/vswm/route-ward" },
          { label: "Route To Vehicle & Shift", href: "/vswm/route-shift-vehicle" },
          { label: "Route Type To Vehicle Type", href: "/vswm/routetype-vehicletype" },
          { label: "Transfer Station To Ward", href: "/vswm/transferstation-ward" },
          { label: "Fuel Station To Zone", href: "/vswm/fuelstation-zone" },
          { label: "Parking Spot To Zone", href: "/vswm/parkingspot-zone" },
        ],
      },
    ],
  },
  {
    label: "POIs",
    icon: "📍",
    children: [
      { label: "Transfer Station", href: "/vswm/transfer-station" },
      { label: "Workshop", href: "/vswm/workshop" },
      { label: "Parking Spots", href: "/vswm/parking-spot" },
      { label: "Open Depot", href: "/vswm/open-depot" },
      { label: "Fuel Station", href: "/vswm/fuel-station" },
      { label: "Fuel Companies", href: "/vswm/fuel-company" },
      { label: "Fuel Type", href: "/vswm/fuel-type" },
      { label: "Upload Fuel Transactions", href: "/vswm/upload-fuel-transaction" },
      {
        label: "Depute",
        children: [
          { label: "Incharge at TS", href: "/vswm/incharge-transferstation" },
          { label: "Incharge at Fuel Station", href: "/vswm/incharge-fuelstation" },
        ],
      },
    ],
  },
  {
    label: "HR / Staff",
    icon: "👥",
    children: [
      { label: "Employee List", href: "/vswm/employee" },
      { label: "Department", href: "/vswm/department" },
      { label: "Designation", href: "/vswm/designation" },
      {
        label: "Assignments",
        children: [
          { label: "Driver/Helper to Shift & Vehicle", href: "/vswm/employee-shift-vehicle" },
          { label: "Employee to Designation & Department", href: "/vswm/employee-department-designation" },
          { label: "Role To User", href: "/vswm/role-user" },
          { label: "Department to Designation", href: "/vswm/department-designation" },
          { label: "Region Type to Designation", href: "/vswm/regiontype-designation" },
        ],
      },
      {
        label: "Adhoc",
        children: [
          { label: "Temporary Driver", href: "/vswm/temporary-driver" },
        ],
      },
    ],
  },
  {
    label: "Data Entry",
    icon: "⌨️",
    children: [
      { label: "Trenching Ground Weighbridge Entry", href: "/vswm/trenching-ground-weighbridge-entry" },
      { label: "Weighbridge 3 Bin Entry", href: "/vswm/weighbridge-3-bin-entry" },
    ],
  },
  {
    label: "Monitor",
    icon: "📺",
    children: [
      { label: "Vehicle Location", href: "/vswm/vehicle-location" },
      { label: "Employee Location", href: "/vswm/employee-location" },
      { label: "D2D", href: "/vswm/d2d" },
      { label: "Open Depot Live Map", href: "/vswm/open-depot-live-map" },
      { label: "Alert Manager", href: "/vswm/alert-manager" },
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
          { label: "Active Vehicle Summary", href: "/vswm/active-vehicle-summary" },
          { label: "Ward Wise Active Vehicle Summary", href: "/vswm/active-inactive-vehicle-summary-by-ward" },
          { label: "Unauthorized Movement Report", href: "/vswm/unauthorized-movement" },
          { label: "Vehicle Not Moving Report", href: "/vswm/vehicle-not-moving" },
          { label: "Vehicle Based On Distance Report", href: "/vswm/vehicle-based-on-distance" },
          { label: "Vehicle Under Maintenance Report", href: "/vswm/vehicle-under-maintenance" },
          { label: "Vehicle Deployment Report", href: "/vswm/vehicle-deployment" },
          { label: "Vehicle Breaking Geofence Report", href: "/vswm/vehicle-breaking-geofence" },
          { label: "Vehicle Status Report", href: "/vswm/vehicle-status-report" },
          { label: "Vehicle Summary Report", href: "/vswm/vehicle-summary-report" },
        ],
      },
      {
        label: "Waste Collection & D2D",
        children: [
          { label: "D2D Vehicle Route Coverage Report", href: "/vswm/d2d-vehicle-route-coverage-report" },
          { label: "D2D Zone Ward Coverage Report", href: "/vswm/D2D-zone-ward-coverage-report" },
          { label: "Lane Monitoring Report", href: "/vswm/lane-monitoring-report" },
          { label: "Lane Point Coverage Report", href: "/vswm/lane-point-coverage-report" },
          { label: "First Lane Monitoring Report", href: "/vswm/first-lane-monitoring-report" },
          { label: "Last Lane Monitoring Report", href: "/vswm/last-lane-coverage-report" },
          { label: "Litterbin Coverage Summary Report", href: "/vswm/litterbin-coverage-summary-report" },
          { label: "Collection Point Summary Report", href: "/vswm/collection-point-summary-report" },
          { label: "Litterbin Coverage Report", href: "/vswm/litterbin-coverage-report" },
          { label: "Collection Point Coverage Report", href: "/vswm/collection-point-coverage-report" },
          { label: "Waste Generator Coverage Report", href: "/vswm/waste-generator-coverage-report" },
          { label: "Waste Generator Summary Report", href: "/vswm/waste-generator-summary-report" },
          { label: "Waste Weight Report", href: "/vswm/waste-weight-report" },
          { label: "Open Depot Cleaning Report", href: "/vswm/open-depot-cleaning-report" },
        ],
      },
      {
        label: "Weighbridge & TS",
        children: [
          { label: "GTS Trip Report", href: "/vswm/trips-to-transferstation-report" },
          { label: "GTS Weighbridge Summary Report", href: "/vswm/gts-weighbridge-summary" },
          { label: "Weighbridge Latest Data Report", href: "/vswm/weighbridge-latest-data-report" },
          { label: "Weighbridge Data Report", href: "/vswm/weighbridge-data-report" },
          { label: "Weighbridge Source Summaries Report", href: "/vswm/weighbridge-source-summaries-report" },
          { label: "Weighbridge Waste Type Summaries Report", href: "/vswm/weighbridge-waste-type-summaries-report" },
        ],
      },
      {
        label: "Alerts & Events",
        children: [
          { label: "GPS Log Report", href: "/vswm/gps-log-report" },
          { label: "Alerts And Events Report", href: "/vswm/alert-and-event-report" },
          { label: "Alert Detail Report", href: "/vswm/alert-detail" },
          { label: "Speed Violation Report", href: "/vswm/speed-violation" },
          { label: "Geofence Event Report", href: "/vswm/geofence-event" },
          { label: "GPS Not Reporting Report", href: "/vswm/gps-not-reporting-report" },
        ],
      },
      {
        label: "Fuel",
        children: [
          { label: "Fuel Summary Report", href: "/vswm/fuel-summary-report" },
          { label: "Fuel Transaction Report", href: "/vswm/fuel-transaction-report" },
          { label: "Fuel Consumption Report", href: "/vswm/fuel-consumption-report" },
        ],
      },
      {
        label: "Operations",
        children: [
          { label: "Delay In Starting Waste Collection Report", href: "/vswm/delay-in-starting-waste-collection-report" },
          { label: "Delay In Completing Waste Collection Report", href: "/vswm/delay-completing-waste-collection" },
          { label: "Hydrant Trip Report", href: "/vswm/hydrant-trip-report" },
          { label: "Vehicle Check Point Status Report", href: "/vswm/vehicle-check-point-status-report" },
          { label: "Vehicle Check List Summary Report", href: "/vswm/vehicle-check-list-summary-report" },
          { label: "Vehicle Check List Report", href: "/vswm/vehicle-check-list-report" },
          { label: "Ward Geofance Report", href: "/vswm/ward-geofance-report" },
        ],
      },
    ],
  },
  {
    label: "Ultimate Reports",
    icon: "📈",
    children: [
      { label: "Daily Ultimate Report", href: "/ultimate-reports/daily" },
    ],
  },
  {
    label: "Approvals",
    icon: "✅",
    children: [
      { label: "Open Depot Cleaning", href: "/vswm/open-depot-cleaning" }
    ],
  },
  {
    label: "Playback",
    icon: "⏪",
    href: "/playback",
  },
];

// Helper to recursively filter out fuel-related menus if feature toggle is disabled
const filterFuelItems = (items: any[]): any[] => {
  if (ENABLE_FUEL_FEATURES) return items;
  return items
    .filter(item => {
      const isFuel = item.label.toLowerCase().includes("fuel") || (item.href && item.href.toLowerCase().includes("fuel"));
      return !isFuel;
    })
    .map(item => {
      if (item.children) {
        return {
          ...item,
          children: filterFuelItems(item.children)
        };
      }
      return item;
    });
};

const filteredNavData = filterFuelItems(navData);

export default function Sidebar() {
  const path = usePathname();
  const sidebarOpen = useStore((state) => state.sidebarOpen);
  const setSidebarOpen = useStore((state) => state.setSidebarOpen);
  const sidebarCollapsed = useStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useStore((state) => state.setSidebarCollapsed);

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

  const currentCategoryData = filteredNavData.find(cat => cat.label === (activeCategory || renderedCategory));

  return (
    <>
      {/* Overlay for mobile with glass effect */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-theme-surface backdrop-blur-sm z-[1001] lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Sidebar - Premium dark aesthetic */}
      <aside className={`
        fixed inset-y-0 left-0 z-[1002] flex flex-col bg-theme-surface border-r border-theme-border
        transition-all duration-300 ease-in-out lg:relative lg:translate-x-0
        ${sidebarCollapsed ? "w-[64px]" : "w-[160px]"}
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        {/* Brand with subtle glow */}
        <div className={`flex items-center justify-between px-4 py-4 border-b border-theme-border ${sidebarCollapsed ? "lg:justify-center" : ""}`}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 text-white font-bold text-[11px] shadow-lg shadow-emerald-600/20 shrink-0">
              IS
            </div>
            <div className={`transition-all duration-300 ${sidebarCollapsed ? "lg:opacity-0 lg:w-0 lg:overflow-hidden" : "opacity-100"}`}>
              <div className="text-[11px] font-bold text-theme-text tracking-tight leading-none mb-0.5 whitespace-nowrap">VSWM Jaipur</div>
              <div className="text-[7px] text-theme-text-dim uppercase tracking-[.15em] whitespace-nowrap">Heritage</div>
            </div>
          </div>
          {!sidebarCollapsed && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-theme-text-dim hover:text-theme-text transition-colors animate-fade-in"
            >
              ✕
            </button>
          )}
          {sidebarCollapsed && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-theme-text-dim hover:text-theme-text transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Navigation with micro-interactions */}
        <nav className="flex-1 py-3 space-y-0.5 text-[11px] overflow-y-auto custom-scrollbar">
          {filteredNavData.map((category) => {
            const hasChildren = category.children && category.children.length > 0;
            const isActive = activeCategory === category.label;
            const isCurrentPath = category.href && path === category.href;

            return (
              <div key={category.label} className="px-1.5">
                {category.href ? (
                  <Link
                    href={category.href}
                    prefetch={false}
                    onClick={() => {
                      setSidebarOpen(false);
                      setActiveCategory(null);
                    }}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-200 group
                      ${sidebarCollapsed ? "lg:justify-center" : ""}
                      ${isCurrentPath
                        ? "bg-gradient-to-r from-emerald-500/[.15] to-transparent text-theme-accent font-medium"
                        : "text-theme-text-dim hover:text-theme-text hover:bg-theme-surface"
                      }`}
                  >
                    <span className="w-4 flex justify-center text-[13px] group-hover:scale-110 transition-transform shrink-0">{category.icon}</span>
                    <span className={`truncate transition-all duration-300 ${sidebarCollapsed ? "lg:opacity-0 lg:w-0 lg:overflow-hidden" : "opacity-100"}`}>{category.label}</span>
                  </Link>
                ) : (
                  <button
                    onClick={() => setActiveCategory(isActive ? null : category.label)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-all duration-200 group
                      ${sidebarCollapsed ? "lg:justify-center" : ""}
                      ${isActive
                        ? "bg-gradient-to-r from-emerald-500/[.15] to-transparent text-theme-accent font-medium"
                        : "text-theme-text-dim hover:text-theme-text hover:bg-theme-surface"
                      }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-4 flex justify-center text-[13px] group-hover:scale-110 transition-transform shrink-0">{category.icon}</span>
                      <span className={`truncate transition-all duration-300 ${sidebarCollapsed ? "lg:opacity-0 lg:w-0 lg:overflow-hidden" : "opacity-100"}`}>{category.label}</span>
                    </div>
                    {hasChildren && !sidebarCollapsed && (
                      <span className={`text-[7px] transition-transform duration-200 lg:block hidden ${isActive ? "rotate-90 text-theme-accent" : "text-theme-text-dim"}`}>▶</span>
                    )}
                    {hasChildren && sidebarCollapsed && (
                      <span className={`text-[7px] transition-transform duration-200 lg:hidden block ${isActive ? "rotate-90 text-theme-accent" : "text-theme-text-dim"}`}>▶</span>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </nav>

        {/* Toggle Collapse Button */}
        <div className="hidden lg:flex px-3 py-1.5 border-t border-theme-border items-center justify-center">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full py-1.5 rounded-md text-theme-text-dim hover:text-theme-text hover:bg-theme-surface transition-all flex items-center justify-center text-[10px] font-bold gap-1.5"
            title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            <span>{sidebarCollapsed ? "▶" : "◀"}</span>
            {!sidebarCollapsed && <span className="uppercase tracking-wider text-[8px] text-theme-text-dim">Collapse</span>}
          </button>
        </div>

        {/* Footer */}
        <div className={`px-3 py-3 border-t border-theme-border flex items-center gap-2 ${sidebarCollapsed ? "lg:justify-center" : ""}`}>
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500 text-white text-[10px] font-bold shrink-0">
            AD
          </div>
          <div className={`min-w-0 transition-all duration-300 ${sidebarCollapsed ? "lg:opacity-0 lg:w-0 lg:overflow-hidden" : "opacity-100"}`}>
            <div className="text-[11px] font-semibold text-theme-text truncate whitespace-nowrap">Admin</div>
            <div className="text-[8px] text-theme-text-dim truncate whitespace-nowrap">Master Admin</div>
          </div>
        </div>
      </aside>

      {/* Flyout Mega Menu - Glassmorphism & Slide-in Animation */}
      <div
        ref={flyoutRef}
        className={`fixed inset-y-0 z-[1003] bg-theme-surface/95 backdrop-blur-xl border-r border-theme-border shadow-2xl shadow-slate-200/70 flex flex-col
          transition-all duration-300 ease-out
          ${sidebarCollapsed ? "left-[64px]" : "left-[160px]"}
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
            <div className="flex items-center justify-between px-4 py-4 border-b border-theme-border">
              <div className="flex items-center gap-2">
                <span className="text-theme-accent font-bold text-xs">{currentCategoryData.label}</span>
                <span className="text-theme-text-dim text-[10px] uppercase tracking-wider">Options</span>
              </div>
              <button
                onClick={() => setActiveCategory(null)}
                className="text-theme-text-dim hover:text-theme-text transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Content - Grid of Columns */}
            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
              <div className={`grid ${(activeCategory || renderedCategory) === "Reports" ? "grid-cols-3" : "grid-cols-2"} gap-x-6 gap-y-6`}>
                {currentCategoryData.children?.map((sub: any) => {
                  const hasSubChildren = sub.children && sub.children.length > 0;

                  return (
                    <div key={sub.label} className="space-y-1.5">
                      {sub.href ? (
                        <Link
                          href={sub.href}
                          prefetch={false}
                          onClick={() => {
                            setSidebarOpen(false);
                            setActiveCategory(null);
                          }}
                          className="text-[11px] font-medium text-theme-text hover:text-theme-accent transition-colors block"
                        >
                          {sub.label}
                        </Link>
                      ) : (
                        <div className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-0.5">
                          {sub.label}
                        </div>
                      )}

                      {/* Level 3 Links */}
                      {hasSubChildren && (
                        <div className="space-y-0.5 flex flex-col">
                          {sub.children!.map((item: any) => (
                            <Link
                              key={item.label}
                              href={item.href}
                              prefetch={false}
                              onClick={() => {
                                setSidebarOpen(false);
                                setActiveCategory(null);
                              }}
                              className={`text-[11px] leading-relaxed transition-colors py-0.5 rounded-md
                                ${path === item.href
                                  ? "text-theme-accent font-medium"
                                  : "text-theme-text-dim hover:text-theme-text"
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
