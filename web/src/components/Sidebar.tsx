"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore, ENABLE_FUEL_FEATURES } from "@/lib/store";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Home,
  Truck,
  Cpu,
  Map,
  MapPin,
  Users,
  Tv,
  BarChart3,
  CheckCircle2,
  Rewind,
  CalendarCheck,
  Radio,
  ChevronRight,
  ChevronLeft,
  X,
  AlertCircle,
  LayoutDashboard,
  TrendingUp
} from "lucide-react";

interface NavItem {
  label: string;
  icon?: any;
  href?: string;
  permission?: string;
  children?: NavItem[];
}

const fullNavData: NavItem[] = [
 

  {
    label: "Vehicles",
    icon: Truck,
    permission: "vehicles.view",
    children: [
      { label: "Vehicle List", href: "/vehicles" },
      { label: "Vehicle Type", href: "/swift/vehicle-type" },
      { label: "Vehicle Master Data", href: "/swift/vehicle-make" },
      { label: "Capacity Type", href: "/swift/capacity-type" },
      {
        label: "Assignments",
        children: [
          { label: "Vehicle To Region", href: "/swift/vehicle-region" },
          { label: "Vehicle To Department", href: "/swift/vehicle-department" },
        ],
      },
      {
        label: "Adhoc",
        children: [
          { label: "Temporary Vehicle", href: "/swift/temporary-vehicle" },
        ],
      },
    ],
  },
  {
    label: "GPS Devices",
    icon: Cpu,
    permission: "devices.view",
    href: "/devices"

  },
  {
    label: "Regions & Routes",
    icon: Map,
    permission: "routes.view",
    children: [
      { label: "Zones & Wards", href: "/zones" },
      { label: "Region Type", href: "/swift/region-type" },
      { label: "Route", href: "/swift/route" },
      { label: "Route Type", href: "/swift/route-type" },
      { label: "Shift", href: "/swift/shift" },
      { label: "Collection Type", href: "/swift/vehicle-purpose" },
      { label: "Reason", href: "/swift/reason" },
      {
        label: "Assignments",
        children: [
          { label: "Route To Ward", href: "/swift/route-ward" },
          { label: "Route To Vehicle & Shift", href: "/swift/route-shift-vehicle" },
          { label: "Route Type To Vehicle Type", href: "/swift/routetype-vehicletype" },
          { label: "Transfer Station To Ward", href: "/swift/transferstation-ward" },
          { label: "Fuel Station To Zone", href: "/swift/fuelstation-zone" },
          { label: "Parking Spot To Zone", href: "/swift/parkingspot-zone" },
        ],
      },
    ],
  },
  {
    label: "POIs",
    icon: MapPin,
    children: [
      { label: "Transfer Station", href: "/swift/transfer-station" },
      { label: "Workshop", href: "/swift/workshop" },
      { label: "Parking Spots", href: "/swift/parking-spot" },
      { label: "Open Depot", href: "/swift/open-depot" },
      { label: "Fuel Station", href: "/swift/fuel-station" },
      { label: "Fuel Companies", href: "/swift/fuel-company" },
      {
        label: "Depute",
        children: [
          { label: "Incharge at TS", href: "/swift/incharge-transferstation" },
        ],
      },
    ],
  },
  {
    label: "RFID",
    icon: Radio,
    children: [
      { label: "RFID Coverage Report", href: "/swift/rfid-coverage-report" },
      { label: "Survey Report", href: "/swift/survey-report" },
      { label: "Survey List", href: "/swift/survey-list" },
      { label: "Survey Payment Report", href: "/swift/survey-payment-report" },
    ],
  },
  {
    label: "Employee Management",
    icon: Users,
    permission: "employees.view",
    children: [
      { label: "Employees", href: "/swift/employee-management/employees" },
      { label: "Roles & Permissions", href: "/swift/employee-management/roles" },
      { label: "Departments", href: "/swift/employee-management/departments" },
      { label: "Designations", href: "/swift/employee-management/designations" },
      {
        label: "Operational Assignments",
        children: [
          { label: "Driver to Vehicle", href: "/swift/employee-vehicle" },
        ],
      },
    ],
  },
  {
    label: "Road Sweeping",
    icon: Map,
    permission: "sweeping.routes.view",
    children: [
      { label: "Sweeping Routes", href: "/swift/sweeping-routes" },
      { label: "Route Assignments", href: "/swift/sweeping-assignments" },
      { label: "Cleaning Tasks", href: "/swift/cleaning-tasks" },
    ],
  },
  {
    label: "Attendance",
    icon: CalendarCheck,
    children: [
      { label: "Live Attendance", href: "/swift/live-attendance" },
      { label: "Driver Attendance", href: "/swift/driver-attendance" },
      { label: "Supervisor Attendance", href: "/swift/supervisor-attendance" },
      { label: "Zone Manager Attendance", href: "/swift/zone-manager-attendance" },
    ],
  },
  {
    label: "Monitor",
    icon: Tv,
    children: [
      { label: "Vehicle Location", href: "/swift/vehicle-location" },
      { label: "D2D", href: "/swift/d2d" },
      { label: "Open Depot Live Map", href: "/swift/open-depot-live-map" },
      { label: "Employee Monitoring", href: "/swift/employee-monitoring" },
      { label: "Household Monitoring", href: "/swift/household-monitoring" },
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
          { label: "Open Depot Report", href: "/swift/open-depot-cleaning-report" },
          { label: "Special Operations Report", href: "/swift/special-operations-report" },
        ],
      },
      {
        label: "Vehicle & Movement",
        children: [
          { label: "Active Vehicle Summary", href: "/swift/active-vehicle-summary" },
          { label: "Ward Wise Active Vehicle Summary", href: "/swift/active-inactive-vehicle-summary-by-ward" },
          { label: "Unauthorized Movement Report", href: "/swift/unauthorized-movement" },
          { label: "Early Departed Report", href: "/swift/early-departed-report" },
          { label: "Vehicle Deployment Report", href: "/swift/vehicle-deployment" },
          { label: "Vehicle Summary Report", href: "/swift/vehicle-summary-report" },
        ],
      },
      {
        label: "Waste Collection & D2D",
        children: [
          { label: "D2D Vehicle Route Coverage Report", href: "/swift/d2d-vehicle-route-coverage-report" },
          { label: "D2D Zone Ward Coverage Report", href: "/swift/D2D-zone-ward-coverage-report" },
          { label: "Lane Monitoring Report", href: "/swift/lane-monitoring-report" },
          { label: "Litterbin Coverage Summary Report", href: "/swift/litterbin-coverage-summary-report" },
          { label: "Collection Point Summary Report", href: "/swift/collection-point-summary-report" },
        ],
      },
      {
        label: "Weighbridge & TS",
        children: [
          { label: "GTS Trip Report", href: "/swift/trips-to-transferstation-report" },
          { label: "GTS Weighbridge Summary Report", href: "/swift/gts-weighbridge-summary" },
          { label: "Weighbridge Data Report", href: "/swift/weighbridge-data-report" },

        ],
      },
      {
        label: "Alerts & Events",
        children: [
          { label: "Alert Detail Report", href: "/swift/alert-detail" },
          { label: "Geofence Event Report", href: "/swift/geofence-event" },
          { label: "GPS Not Reporting Report", href: "/swift/gps-not-reporting-report" },
        ],
      },
      {
        label: "Operations",
        children: [
          { label: "Delay In Completing Waste Collection Report", href: "/swift/delay-completing-waste-collection" },
          { label: "Root Geofance Report", href: "/swift/ward-geofance-report" },
        ],
      },
    ],
  },
  {
    label: "Master Consolidated Report",
    icon: TrendingUp,
    children: [
  
      { label: "Master Consolidated Reports", href: "/master-reports", permission: "reports.view" },
    ],
  },
  {
    label: "Approvals",
    icon: CheckCircle2,
    children: [
      { label: "Open Depot Cleaning", href: "/swift/open-depot-cleaning" }
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

];

const adminOnlySections = new Set(["Users"]);

const roleNavData = (role: string | undefined, items: NavItem[]): NavItem[] => {
  const filtered = role === "ADMIN" ? items : items.filter((item) => !adminOnlySections.has(item.label));
  const fuelFiltered = ENABLE_FUEL_FEATURES ? filtered : filterFuelItems(filtered);
  if (!ENABLE_FUEL_FEATURES) {
    return fuelFiltered;
  }
  return filtered;
};

/**
 * Filter nav items based on user's permission set.
 * - Items without a `permission` field are always shown (backwards compatible).
 * - Super_Admin (wildcard "*") sees everything.
 * - If permissions haven't loaded yet (empty array + loading), show all items by default.
 * - If permissions array is empty after loading (user has no RBAC configured), show all items.
 * - Children with their own `permission` field are filtered recursively, so a
 *   per-sub-item gate (e.g. `reports.view` on a single child) is honoured even
 *   when the parent has no permission gate of its own.
 */
const filterByPermissions = (
  items: NavItem[],
  hasPermission: (perm: string) => boolean,
  permissionsLoaded: boolean,
  permissions: string[]
): NavItem[] => {
  // If permissions haven't loaded yet, show all items to avoid flash of empty sidebar
  if (!permissionsLoaded) return items;

  // If no permissions are configured for this user (empty array), show everything.
  // This ensures users without RBAC setup still see the full menu.
  if (permissions.length === 0) return items;

  return items
    .filter((item) => {
      // Items without a permission field are always visible
      if (!item.permission) return true;
      return hasPermission(item.permission);
    })
    .map((item) => {
      // Recursively filter children so per-sub-item permission gates are applied
      if (item.children && item.children.length > 0) {
        return {
          ...item,
          children: filterByPermissions(item.children, hasPermission, permissionsLoaded, permissions),
        };
      }
      return item;
    });
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
  const { hasPermission, loading: permissionsLoading, permissions } = usePermissions();
  const path = usePathname();
  const sidebarOpen = useStore((state) => state.sidebarOpen);
  const setSidebarOpen = useStore((state) => state.setSidebarOpen);
  const storeCollapsed = useStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useStore((state) => state.setSidebarCollapsed);

  const sidebarCollapsed = mounted ? storeCollapsed : false;

  // Apply role-based filtering, then permission-based filtering
  const roleFiltered = roleNavData(user?.role, fullNavData);
  const navData = filterByPermissions(roleFiltered, hasPermission, !permissionsLoading, permissions);

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
                    {category.children!.map((sub: any) => {
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
              <div className="grid grid-cols-2 gap-x-6 gap-y-6">
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
