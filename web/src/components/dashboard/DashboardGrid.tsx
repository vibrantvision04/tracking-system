import React from 'react';

interface DashboardGridProps {
  greetingCard?: React.ReactNode;
  row1: React.ReactNode; // KPI Cards
  row2Left: React.ReactNode; // Coverage Charts
  row2Right: React.ReactNode; // Infrastructure
  chartsRow?: React.ReactNode; // Charts / Graphs
  row3Left: React.ReactNode; // RFID & Revenue
  row3Right: React.ReactNode; // Devices
  mapCard: React.ReactNode; // Geofence Map
}

export default function DashboardGrid({
  greetingCard, row1, row2Left, row2Right, chartsRow, row3Left, row3Right, mapCard
}: DashboardGridProps) {
  return (
    <div className="flex-1 flex flex-col xl:flex-row min-h-0 relative bg-theme-base">
      {/* Left Column: Data Rows */}
      <div className="w-full xl:w-[50%] flex flex-col h-full overflow-y-auto custom-scrollbar p-4 sm:p-5 lg:p-6 bg-transparent border-r border-theme-border">
        <div className="max-w-5xl mx-auto w-full space-y-4 sm:space-y-5 lg:space-y-6">
          
          {/* Greeting Card */}
          {greetingCard}
          
          {/* Row 1: Summary KPI Cards - 1-col mobile, 2-col tablet, 3-col desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
            {row1}
          </div>

          {/* Row 2: 1-col mobile, 2-col desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 lg:gap-6">
            <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
              {row2Left}
            </div>
            <div className="h-full">
              {row2Right}
            </div>
          </div>

          {/* Charts Row */}
          {chartsRow && (
            <div className="w-full">
              {chartsRow}
            </div>
          )}

          {/* Row 3: 1-col mobile, 2-col desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 lg:gap-6 pb-4 sm:pb-5 lg:pb-6">
            <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
              {row3Left}
            </div>
            <div className="h-full">
              {row3Right}
            </div>
          </div>

        </div>
      </div>

      {/* Right Column: Map - full-width stacked below on mobile/tablet, side-by-side at xl: */}
      <div className="w-full xl:w-[50%] flex flex-col p-4 sm:p-5 lg:p-6 min-h-[300px] sm:min-h-[350px] h-[350px] sm:h-[400px] xl:h-full shrink-0 xl:shrink bg-transparent">
        {mapCard}
      </div>
    </div>
  );
}

