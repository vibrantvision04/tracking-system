"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";

import StatCard from "@/components/shared/StatCard";

const LiveMap = dynamic(() => import("@/components/LiveMap"), { ssr: false });

export default function HomePage() {
  const vehicles = useStore((state) => state.vehicles);
  const devices = useStore((state) => state.devices);
  const loaded = useStore((state) => state.loaded);
  const loadAll = useStore((state) => state.loadAll);

  const [zonesCount, setZonesCount] = useState<number | string>("...");
  const [wardsCount, setWardsCount] = useState<number | string>("...");
  const [routesCount, setRoutesCount] = useState<number | string>("...");
  const [selectedLanguage, setSelectedLanguage] = useState("en");

  useEffect(() => {
    if (!loaded) {
      loadAll();
    }
  }, [loaded, loadAll]);

  useEffect(() => {
    // Fetch zones count
    api<{ data: any[] }>("/api/zones")
      .then((res) => setZonesCount(res.data ? res.data.length : 0))
      .catch((err) => {
        console.error("Failed to load zones", err);
        setZonesCount("N/A");
      });

    // Fetch wards count
    api<{ data: any[] }>("/api/wards")
      .then((res) => setWardsCount(res.data ? res.data.length : 0))
      .catch((err) => {
        console.error("Failed to load wards", err);
        setWardsCount("N/A");
      });

    // Fetch routes count
    api<{ data: any[] }>("/api/routes")
      .then((res) => setRoutesCount(res.data ? res.data.length : 0))
      .catch((err) => {
        console.error("Failed to load routes", err);
        setRoutesCount("N/A");
      });
  }, []);

  const loading = !loaded;
  const liveVehiclesCount = vehicles.filter((v) => v.status !== "offline").length;

  const cards = [
    {
      title: "ALL ZONE(S)",
      value: zonesCount,
      link: "/zones",
      icon: (
        <svg className="w-5 h-5 text-theme-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      ),
      description: "Municipal administrative zones"
    },
    {
      title: "ALL WARD(S)",
      value: wardsCount,
      link: "/zones",
      icon: (
        <svg className="w-5 h-5 text-theme-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      description: "Sub-zone residential wards"
    },
    {
      title: "ALL VEHICLE(S)",
      value: loading ? "..." : vehicles.length,
      link: "/vehicles",
      icon: (
        <svg className="w-5 h-5 text-theme-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      description: "Registered fleet catalog"
    },
    {
      title: "ALL GPS DEVICE(S)",
      value: loading ? "..." : devices.length,
      link: "/devices",
      icon: (
        <svg className="w-5 h-5 text-theme-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      ),
      description: "Monitored hardware devices"
    },
    {
      title: "ACTIVE VEHICLE(S)",
      value: loading ? "..." : liveVehiclesCount,
      link: "/reports",
      icon: (
        <svg className="w-5 h-5 text-theme-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      description: "Vehicles actively transmitting"
    },
    {
      title: "ALL ROUTE(S)",
      value: routesCount,
      link: "/iswm/route",
      icon: (
        <svg className="w-5 h-5 text-theme-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 7a2 2 0 100-4 2 2 0 000 4zM8.5 8h4.5a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 001.5 1.5h1.5" />
        </svg>
      ),
      description: "Optimized collection lines"
    },
    {
      title: "TRANSFER STATION(S)",
      value: "N/A",
      link: null,
      icon: (
        <svg className="w-5 h-5 text-theme-text-dim/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      ),
      description: "Waste collection hubs"
    },
    {
      title: "WORKSHOP(S)",
      value: "N/A",
      link: null,
      icon: (
        <svg className="w-5 h-5 text-theme-text-dim/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      description: "Repair and maintenance units"
    },
    {
      title: "PARKING SPOT(S)",
      value: "N/A",
      link: null,
      icon: (
        <svg className="w-5 h-5 text-theme-text-dim/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      description: "Night parking geofences"
    },
    {
      title: "FUEL STATION(S)",
      value: "N/A",
      link: null,
      icon: (
        <svg className="w-5 h-5 text-theme-text-dim/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
      description: "Dedicated fuel stations"
    },
    {
      title: "EMPLOYEE(S)",
      value: "N/A",
      link: null,
      icon: (
        <svg className="w-5 h-5 text-theme-text-dim/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      description: "Active drivers and staff"
    },
    {
      title: "FIT VEHICLE(S)",
      value: "N/A",
      link: null,
      icon: (
        <svg className="w-5 h-5 text-theme-text-dim/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      description: "Fleet certified operational"
    },
    {
      title: "UNFIT VEHICLE(S)",
      value: "N/A",
      link: null,
      icon: (
        <svg className="w-5 h-5 text-theme-text-dim/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      description: "Fleet under maintenance/repair"
    },
    {
      title: "LANE COVERAGE",
      value: "N/A",
      link: null,
      icon: (
        <svg className="w-5 h-5 text-theme-text-dim/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
      description: "D2D collection street coverage"
    }
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none font-sans">
      {/* Premium light-grey header bar */}
      <header className="h-16 bg-theme-surface px-6 flex items-center justify-between border-b border-theme-border shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-theme-accent text-white font-bold text-[13px] shadow-md shadow-emerald-500/20 shrink-0 flex items-center justify-center">
            JN
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-theme-text tracking-tight leading-none uppercase">
              ISWM - Nagar Nigam Jaipur
            </h1>
            <span className="text-[9px] text-theme-text-dim font-bold uppercase tracking-wider">
              Integrated Solid Waste Management Dashboard
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center bg-theme-surface border border-theme-border rounded-lg px-2 py-1 select-none">
            <span className="text-[10px] text-theme-text-dim uppercase font-extrabold mr-1.5">Lang:</span>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="bg-transparent text-xs text-theme-text-dim font-bold outline-none cursor-pointer pr-1"
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
            </select>
          </div>

          <div className="flex items-center gap-2 border-l border-theme-border pl-4">
            <div className="text-right hidden sm:block">
              <div className="text-[11px] font-bold text-theme-text leading-none">Admin User</div>
              <span className="text-[8px] font-semibold text-theme-accent uppercase tracking-wider">
                Online
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs font-black shadow-md shadow-emerald-500/20 flex items-center justify-center">
              AD
            </div>
          </div>
        </div>
      </header>

      {/* Main split container */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 relative">

        {/* Left Grid: ISWM Dashboard */}
        <div className="w-full lg:w-[50%] xl:w-[55%] flex flex-col h-full overflow-y-auto custom-scrollbar p-6 bg-theme-base border-r border-theme-border">
          <div className="mb-5 flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-lg font-extrabold text-theme-text tracking-tight">ISWM Overview</h2>
              <p className="text-xs text-theme-text-dim">Corporate statistical indicators & operational monitoring</p>
            </div>
            <div className="text-xs text-theme-accent font-bold bg-theme-surface border border-theme-border px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Telemetry Active
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-6">
            {cards.map((card, i) => {
              const isNA = card.value === "N/A";
              const statCardNode = (
                <StatCard
                  key={i}
                  title={card.title}
                  value={card.value}
                  icon={card.icon}
                  description={card.description}
                  className={`h-[125px] cursor-pointer ${isNA ? "opacity-75" : ""}`}
                />
              );

              return card.link ? (
                <Link key={i} href={card.link} className="block transition duration-200">
                  {statCardNode}
                </Link>
              ) : (
                statCardNode
              );
            })}
          </div>
        </div>

        {/* Right Panel: Live Tracking Map */}
        <div className="w-full lg:w-[50%] xl:w-[45%] flex flex-col p-6 h-[500px] lg:h-full shrink-0 lg:shrink bg-theme-base">
          <div className="flex-1 bg-theme-surface rounded-3xl border border-theme-border overflow-hidden shadow-md flex flex-col relative group">
            {/* Map Header Overlay */}
            <div className="absolute top-4 left-4 z-[1000] bg-theme-surface/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-theme-border shadow-sm pointer-events-none select-none flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-theme-text uppercase tracking-wider leading-none">
                Live Map View
              </span>
            </div>

            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-theme-surface gap-3">
                <div className="w-8 h-8 rounded-full border-4 border-theme-border border-t-emerald-600 animate-spin" />
                <div className="text-theme-text-dim text-xs font-semibold animate-pulse">
                  Connecting to Leaflet telemetry...
                </div>
              </div>
            ) : (
              <LiveMap vehicles={vehicles} showMenu={false} />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
