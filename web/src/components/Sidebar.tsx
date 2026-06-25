"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore, ENABLE_FUEL_FEATURES } from "@/lib/store";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Home,
  Truck,
  Cpu,
  Map,
  MapPin,
  Users,
  Tv,
  BarChart3,
  TrendingUp,
  CheckCircle2,
  Rewind,
  CalendarCheck,
  Radio,
  ChevronRight,
  ChevronLeft,
  X,
  AlertCircle,
  LayoutDashboard
} from "lucide-react";

const fullNavData = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/",
  },

  {
    label: "Vehicles",
    icon: Truck,
    children: [
      { label: "Vehicle List", href: "/vehicles" },
      { label: "Vehicle Type", href: "/vswm/vehicle-type" },
      { label: "Vehicle Master Data", href: "/vswm/vehicle-make" },
      { label: "Capacity Type", href: "/vswm/capacity-type" },
      {
        label: "Assignments",
        children: [
          { label: "Vehicle To Region", href: "/vswm/vehicle-region" },
          { label: "Vehicle To Department", href: "/vswm/vehicle-department" },
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
    icon: Cpu,
    href: "/devices"

  },
  {
    label: "Regions & Routes",
    icon: Map,
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
    icon: MapPin,
    children: [
      { label: "Transfer Station", href: "/vswm/transfer-station" },
      { label: "Workshop", href: "/vswm/workshop" },
      { label: "Parking Spots", href: "/vswm/parking-spot" },
      { label: "Open Depot", href: "/vswm/open-depot" },
      { label: "Fuel Station", href: "/vswm/fuel-station" },
      { label: "Fuel Companies", href: "/vswm/fuel-company" },
      {
        label: "Depute",
        children: [
          { label: "Incharge at TS", href: "/vswm/incharge-transferstation" },
        ],
      },
    ],
  },
  {
    label: "RFID",
    icon: Radio,
    children: [
      { label: "RFID Coverage Report", href: "/vswm/rfid-coverage-report" },
      { label: "Survey Report", href: "/vswm/survey-report" },
      { label: "Survey List", href: "/vswm/survey-list" },
      { label: "Survey Payment Report", href: "/vswm/survey-payment-report" },
    ],
  },
  {
    label: "HR / Staff",
    icon: Users,
    children: [
      { label: "Department", href: "/vswm/department" },
      { label: "Designation", href: "/vswm/designation" },
      {
        label: "Assignments",
        children: [
          { label: "Driver to Vehicle", href: "/vswm/employee-vehicle" },
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
    label: "Attendance",
    icon: CalendarCheck,
    children: [
      { label: "Employee List", href: "/vswm/employee" },
      { label: "Live Attendance", href: "/vswm/live-attendance" },
      { label: "Driver Attendance", href: "/vswm/driver-attendance" },
      { label: "Supervisor Attendance", href: "/vswm/supervisor-attendance" },
      { label: "Zone Manager Attendance", href: "/vswm/zone-manager-attendance" },
    ],
  },
  {
    label: "Monitor",
    icon: Tv,
    children: [
      { label: "Vehicle Location", href: "/vswm/vehicle-location" },
      { label: "D2D", href: "/vswm/d2d" },
      { label: "Open Depot Live Map", href: "/vswm/open-depot-live-map" },
      { label: "Employee Monitoring", href: "/vswm/employee-monitoring" },
      { label: "Household Monitoring", href: "/vswm/household-monitoring" },
    ],
  },
  {
    label: "Reports",
    icon: BarChart3,
    children: [
      {
        label: "Primary Reports",
        children: [
          { label: "Vehicle Movement Report", href: "/reports" },
          { label: "Open Depot Report", href: "/vswm/open-depot-cleaning-report" },
          { label: "Special Operations Report", href: "/vswm/special-operations-report" },
        ],
      },
      {
        label: "Vehicle & Movement",
        children: [
          { label: "Active Vehicle Summary", href: "/vswm/active-vehicle-summary" },
          { label: "Ward Wise Active Vehicle Summary", href: "/vswm/active-inactive-vehicle-summary-by-ward" },
          { label: "Unauthorized Movement Report", href: "/vswm/unauthorized-movement" },
          { label: "Early Departed Report", href: "/vswm/early-departed-report" },
          { label: "Vehicle Deployment Report", href: "/vswm/vehicle-deployment" },
          { label: "Vehicle Summary Report", href: "/vswm/vehicle-summary-report" },
        ],
      },
      {
        label: "Waste Collection & D2D",
        children: [
          { label: "D2D Vehicle Route Coverage Report", href: "/vswm/d2d-vehicle-route-coverage-report" },
          { label: "D2D Zone Ward Coverage Report", href: "/vswm/D2D-zone-ward-coverage-report" },
          { label: "Lane Monitoring Report", href: "/vswm/lane-monitoring-report" },
          { label: "Litterbin Coverage Summary Report", href: "/vswm/litterbin-coverage-summary-report" },
          { label: "Collection Point Summary Report", href: "/vswm/collection-point-summary-report" },
        ],
      },
      {
        label: "Weighbridge & TS",
        children: [
          { label: "GTS Trip Report", href: "/vswm/trips-to-transferstation-report" },
          { label: "GTS Weighbridge Summary Report", href: "/vswm/gts-weighbridge-summary" },
          { label: "Weighbridge Data Report", href: "/vswm/weighbridge-data-report" },

        ],
      },
      {
        label: "Alerts & Events",
        children: [
          { label: "Alert Detail Report", href: "/vswm/alert-detail" },
          { label: "Geofence Event Report", href: "/vswm/geofence-event" },
          { label: "GPS Not Reporting Report", href: "/vswm/gps-not-reporting-report" },
        ],
      },
      {
        label: "Operations",
        children: [
          { label: "Delay In Completing Waste Collection Report", href: "/vswm/delay-completing-waste-collection" },
          { label: "Root Geofance Report", href: "/vswm/ward-geofance-report" },
        ],
      },
    ],
  },
  {
    label: "Master Consolidated Report",
    icon: TrendingUp,
    children: [
      { label: "Daily Master Consolidated Report", href: "/ultimate-reports/daily" },
    ],
  },
  {
    label: "Approvals",
    icon: CheckCircle2,
    children: [
      { label: "Open Depot Cleaning", href: "/vswm/open-depot-cleaning" }
    ],
  },
  {
    label: "Complaints",
    icon: AlertCircle,
    children: [
      { label: "Complaint List", href: "/complaints" },
    ],
  },
  {
    label: "Playback",
    icon: Rewind,
    href: "/playback",
  },
  {
    label: "Users",
    icon: Users,
    href: "/vswm/role-user",
  },
];

const adminOnlySections = new Set(["Users"]);

const roleNavData = (role: string | undefined, items: any[]): any[] => {
  const filtered = role === "ADMIN" ? items : items.filter((item) => !adminOnlySections.has(item.label));
  const fuelFiltered = ENABLE_FUEL_FEATURES ? filtered : filterFuelItems(filtered);
  if (!ENABLE_FUEL_FEATURES) {
    return fuelFiltered;
  }
  return filtered;
};

const filterFuelItems = (items: any[]): any[] => {
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

const isCategoryActive = (category: any, currentPath: string): boolean => {
  if (category.href && currentPath === category.href) return true;
  if (category.children) {
    return category.children.some((child: any) => isCategoryActive(child, currentPath));
  }
  return false;
};

export default function Sidebar() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { user } = useAuth();
  const path = usePathname();
  const sidebarOpen = useStore((state) => state.sidebarOpen);
  const setSidebarOpen = useStore((state) => state.setSidebarOpen);
  const storeCollapsed = useStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useStore((state) => state.setSidebarCollapsed);

  const sidebarCollapsed = mounted ? storeCollapsed : false;

  const navData = roleNavData(user?.role, fullNavData);

  // State to track active category for flyout
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [renderedCategory, setRenderedCategory] = useState<string | null>(null);
  const [flyoutTop, setFlyoutTop] = useState<number>(0);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<any>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

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
      {/* Overlay with premium glass effect */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[10001] transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Sidebar Drawer - Premium light aesthetic */}
      <aside className={`
        fixed inset-y-0 left-0 z-[10002] flex flex-col bg-theme-surface border-r border-theme-border w-[260px]
        transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
        ${sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}
      `}>
        <div className="flex flex-col items-center py-4 border-b border-theme-border w-full relative px-4">
          <div className="flex items-center gap-2.5 w-full">
            <a href="/" className="flex items-center gap-2.5 min-w-0" onClick={() => setSidebarOpen(false)}>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100 shrink-0 shadow-sm">
                               <img src="/Jaipur_Municipal_Corporation_Logo.png" alt="SWIFT Logo" className="w-6 h-6" />

              </div>
              <div className="flex flex-col select-none min-w-0">
                <div className="text-sm font-black text-theme-text tracking-tight uppercase leading-none">
                  SWIFT
                </div>
                <div className="text-[8px] font-bold text-theme-text-dim mt-1.5 leading-tight truncate">
                  Smart Waste Integrated
                </div>
                <div className="text-[8px] font-bold text-theme-text-dim leading-none truncate">
                  Fleet Tracking
                </div>
              </div>
            </a>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-theme-text-dim hover:text-theme-text transition-colors absolute top-4 right-4 hover:bg-theme-elevated p-1 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation with micro-interactions */}
        <nav className="flex-1 py-3 space-y-0.5 text-[11px] overflow-y-auto custom-scrollbar">
          {navData.map((category) => {
            const hasChildren = category.children && category.children.length > 0;
            const isActive = activeCategory === category.label;
            const isCurrentPath = category.href && path === category.href;
            const isParentActive = isCategoryActive(category, path);

            return (
              <div
                key={category.label}
                className="px-1.5"
                onMouseEnter={(e) => {
                  if (closeTimeoutRef.current) {
                    clearTimeout(closeTimeoutRef.current);
                    closeTimeoutRef.current = null;
                  }
                  if (hasChildren) {
                    setActiveCategory(category.label);
                    const rect = e.currentTarget.getBoundingClientRect();
                    setFlyoutTop(rect.top);
                  } else {
                    setActiveCategory(null);
                  }
                }}
                onMouseLeave={() => {
                  if (hasChildren) {
                    closeTimeoutRef.current = setTimeout(() => {
                      setActiveCategory(null);
                    }, 250);
                  }
                }}
              >
                {category.href ? (
                  <Link
                    href={category.href}
                    prefetch={false}
                    onClick={() => {
                      setSidebarOpen(false);
                      setActiveCategory(null);
                    }}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors duration-150 group
                      ${isCurrentPath
                        ? "border-l-[3px] border-[#10B981] bg-theme-elevated text-theme-accent font-medium"
                        : "text-theme-text-dim hover:text-theme-text hover:bg-theme-elevated"
                      }`}
                  >
                    <span className="w-4 flex justify-center group-hover:scale-110 transition-transform shrink-0">
                      <category.icon className="w-4 h-4 text-emerald-500" />
                    </span>
                    <span className="truncate transition-all duration-300 opacity-100">{category.label}</span>
                  </Link>
                ) : (
                  <button
                    onClick={() => setActiveCategory(isActive ? null : category.label)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors duration-150 group
                      ${isActive || isParentActive
                        ? "border-l-[3px] border-[#10B981] bg-theme-elevated text-theme-accent font-medium"
                        : "text-theme-text-dim hover:text-theme-text hover:bg-theme-elevated"
                      }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-4 flex justify-center group-hover:scale-110 transition-transform shrink-0">
                        <category.icon className={`w-4 h-4 ${isActive || isParentActive ? "text-[#10B981]" : "text-emerald-500"}`} />
                      </span>
                      <span className="truncate transition-all duration-300 opacity-100">{category.label}</span>
                    </div>
                    {hasChildren && (
                      <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${isActive ? "rotate-90 text-[#10B981]" : (isParentActive ? "text-[#10B981]" : "text-theme-text-dim")}`} />
                    )}
                  </button>
                )}

                {/* Mobile/Tablet inline sub-menu (accordion) - hidden on desktop where flyout is used */}
                {hasChildren && isActive && (
                  <div className="lg:hidden mt-0.5 ml-4 pl-3 border-l-2 border-emerald-200/60 space-y-0.5 py-1">
                    {category.children.map((sub: any) => {
                      const hasSubChildren = sub.children && sub.children.length > 0;
                      return (
                        <div key={sub.label}>
                          {sub.href ? (
                            <Link
                              href={sub.href}
                              prefetch={false}
                              onClick={() => {
                                setSidebarOpen(false);
                                setActiveCategory(null);
                              }}
                              className={`block px-2.5 py-1.5 rounded-md text-[11px] transition-colors ${
                                path === sub.href
                                  ? "text-[#10B981] font-semibold bg-emerald-50/50"
                                  : "text-theme-text-dim hover:text-theme-text hover:bg-theme-elevated"
                              }`}
                            >
                              {sub.label}
                            </Link>
                          ) : (
                            <div className="px-2.5 pt-2 pb-1 text-[9px] font-bold text-theme-text-dim uppercase tracking-wider">
                              {sub.label}
                            </div>
                          )}
                          {hasSubChildren && (
                            <div className="ml-2 space-y-0.5">
                              {sub.children.map((item: any) => (
                                <Link
                                  key={item.label}
                                  href={item.href}
                                  prefetch={false}
                                  onClick={() => {
                                    setSidebarOpen(false);
                                    setActiveCategory(null);
                                  }}
                                  className={`block px-2.5 py-1.5 rounded-md text-[11px] transition-colors ${
                                    path === item.href
                                      ? "text-[#10B981] font-semibold bg-emerald-50/50"
                                      : "text-theme-text-dim hover:text-theme-text hover:bg-theme-elevated"
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
                )}
              </div>
            );
          })}
        </nav>

        {/* Company Branding */}
        <div className="px-3 py-2 border-t border-theme-border flex items-center gap-2.5 mt-auto bg-theme-elevated/10">
          <img
            src="/vibrant_vision_logo.png"
            alt="Vibrant Visions Logo"
            className="w-7 h-7 object-contain select-none shrink-0"
          />
          <div className="min-w-0">
            <div className="text-[8px] font-extrabold text-[#10B981] uppercase tracking-widest leading-none">Powered by</div>
            <div className="text-[11px] font-black text-theme-text mt-1 truncate tracking-tight">Vibrant Visions</div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-theme-border flex items-center gap-2">
          <div className={`w-9 h-9 rounded-full bg-gradient-to-br text-white text-[10px] font-bold shrink-0 flex items-center justify-center ${user?.role === "ADMIN" ? "from-emerald-500 to-teal-400" : "from-blue-500 to-indigo-400"}`}>
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="min-w-0 transition-all duration-300 opacity-100">
            <div className="text-xs font-semibold text-theme-text truncate whitespace-nowrap">{user?.email?.split("@")[0] || "User"}</div>
            <div className="text-[10px] text-theme-text-dim truncate whitespace-nowrap">{user?.role === "ADMIN" ? "Administrator" : "User"}</div>
          </div>
        </div>
      </aside>

      {/* Flyout Mega Menu - Glassmorphism & Slide-in Animation */}
      {/* Hidden on mobile/tablet, visible on desktop only */}
      <div className="hidden lg:block">
        <div
          ref={flyoutRef}
          onMouseEnter={() => {
            if (closeTimeoutRef.current) {
              clearTimeout(closeTimeoutRef.current);
              closeTimeoutRef.current = null;
            }
          }}
          onMouseLeave={() => {
            closeTimeoutRef.current = setTimeout(() => {
              setActiveCategory(null);
            }, 250);
          }}
          className={`fixed z-[10003] bg-theme-surface/95 backdrop-blur-xl border border-theme-border rounded-xl shadow-2xl flex flex-col h-fit
            transition-all duration-300 ease-out
            left-[260px]
            ${activeCategory
              ? "opacity-100 translate-x-0"
              : "opacity-0 -translate-x-4 pointer-events-none"
            }
          `}
          style={{
            top: `${flyoutTop}px`,
            maxHeight: `calc(100vh - ${flyoutTop + 16}px)`,
            width: (activeCategory || renderedCategory) === "Reports" ? "600px" : "350px"
          }}
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
                <X className="w-4 h-4" />
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
                          className={`text-[11px] font-medium transition-colors block ${path === sub.href ? "text-[#10B981] font-semibold" : "text-theme-text hover:text-theme-accent"
                            }`}
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
                                  ? "text-[#10B981] font-semibold"
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
      </div>
    </>
  );
}
