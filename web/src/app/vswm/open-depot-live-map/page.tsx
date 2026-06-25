"use client";
import React from "react";
import dynamic from "next/dynamic";

const OpenDepotLiveMap = dynamic(() => import("@/components/OpenDepotLiveMap"), { ssr: false });

export default function OpenDepotLiveMapPage() {
  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none">
      
      {/* Premium Header */}
      <div className="bg-theme-surface px-6 py-4 border-b border-theme-border shrink-0 flex items-center justify-between shadow-sm">
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-theme-text tracking-tight">Open Depot Live Map</h1>
          <div className="h-[3px] w-8 bg-theme-accent rounded-full"></div>
        </div>
      </div>

      {/* Map Content Viewport */}
      <div className="flex-1 min-h-[300px] relative">
        <OpenDepotLiveMap />
      </div>

    </div>
  );
}
