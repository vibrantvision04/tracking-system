import React from 'react';
import { Route, Building2, SquareParking, Fuel, Wrench, Users } from 'lucide-react';

interface InfrastructureCardProps {
  routesCount: number | string;
  transferStationsCount: number | string;
  parkingLotsCount: number | string;
  fuelStationsCount: number | string;
  workshopsCount: number | string;
  employeesCount: number | string;
}

export default function InfrastructureCard({
  routesCount,
  transferStationsCount,
  parkingLotsCount,
  fuelStationsCount,
  workshopsCount,
  employeesCount
}: InfrastructureCardProps) {
  return (
    <div className="p-5 rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white/95 to-slate-50/50 flex flex-col h-full shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 group">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 leading-none">
        Infrastructure Summary
      </h3>
      
      <div className="grid grid-cols-2 gap-4 flex-1">
        {/* Column 1: Routes & Regions */}
        <div className="flex flex-col gap-3.5 pr-2 border-r border-slate-100">
          <h4 className="text-[9px] font-extrabold text-[#10B981] uppercase tracking-wider mb-0.5">
            Routes & Regions
          </h4>
          
          <div className="flex items-center gap-3 group/item">
            <div className="p-2 bg-emerald-50 text-[#10B981] rounded-xl border border-emerald-100 transition-all duration-300 group-hover/item:scale-110 flex items-center justify-center shrink-0 shadow-sm">
              <Route size={16} />
            </div>
            <div>
              <div className="text-base font-black text-slate-800 leading-none">{routesCount}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1.5 leading-none">Total Routes</div>
            </div>
          </div>

          <div className="flex items-center gap-3 group/item">
            <div className="p-2 bg-emerald-50 text-[#10B981] rounded-xl border border-emerald-100 transition-all duration-300 group-hover/item:scale-110 flex items-center justify-center shrink-0 shadow-sm">
              <Building2 size={16} />
            </div>
            <div>
              <div className="text-base font-black text-slate-800 leading-none">{transferStationsCount}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1.5 leading-none">Transfer Stations</div>
            </div>
          </div>

          <div className="flex items-center gap-3 group/item">
            <div className="p-2 bg-emerald-50 text-[#10B981] rounded-xl border border-emerald-100 transition-all duration-300 group-hover/item:scale-110 flex items-center justify-center shrink-0 shadow-sm">
              <SquareParking size={16} />
            </div>
            <div>
              <div className="text-base font-black text-slate-800 leading-none">{parkingLotsCount}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1.5 leading-none">Parking Lots</div>
            </div>
          </div>
        </div>

        {/* Column 2: Sites & Staff */}
        <div className="flex flex-col gap-3.5 pl-2">
          <h4 className="text-[9px] font-extrabold text-blue-500 uppercase tracking-wider mb-0.5">
            Sites & Staff
          </h4>

          <div className="flex items-center gap-3 group/item">
            <div className="p-2 bg-blue-50 text-blue-500 rounded-xl border border-blue-100 transition-all duration-300 group-hover/item:scale-110 flex items-center justify-center shrink-0 shadow-sm">
              <Fuel size={16} />
            </div>
            <div>
              <div className="text-base font-black text-slate-800 leading-none">{fuelStationsCount}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1.5 leading-none">Fuel Stations</div>
            </div>
          </div>

          <div className="flex items-center gap-3 group/item">
            <div className="p-2 bg-blue-50 text-blue-500 rounded-xl border border-blue-100 transition-all duration-300 group-hover/item:scale-110 flex items-center justify-center shrink-0 shadow-sm">
              <Wrench size={16} />
            </div>
            <div>
              <div className="text-base font-black text-slate-800 leading-none">{workshopsCount}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1.5 leading-none">Workshops</div>
            </div>
          </div>

          <div className="flex items-center gap-3 group/item">
            <div className="p-2 bg-blue-50 text-blue-500 rounded-xl border border-blue-100 transition-all duration-300 group-hover/item:scale-110 flex items-center justify-center shrink-0 shadow-sm">
              <Users size={16} />
            </div>
            <div>
              <div className="text-base font-black text-slate-800 leading-none">{employeesCount}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1.5 leading-none">Employees</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

