import React from 'react';
import { Route, Building2, SquareParking, Fuel, Wrench, Users } from 'lucide-react';

interface InfraItem {
  icon: React.ReactNode;
  label: string;
  count: string | number;
}

export default function InfrastructureCard({ routesCount }: { routesCount: number | string }) {
  const items: InfraItem[] = [
    { icon: <Route size={18} />, label: 'Total Routes', count: routesCount },
    { icon: <Building2 size={18} />, label: 'Transfer Stations', count: 'N/A' },
    { icon: <SquareParking size={18} />, label: 'Parking Lots', count: 'N/A' },
    { icon: <Fuel size={18} />, label: 'Fuel Stations', count: 'N/A' },
    { icon: <Wrench size={18} />, label: 'Workshops', count: 'N/A' },
    { icon: <Users size={18} />, label: 'Employees', count: 'N/A' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-5">Infrastructure Summary</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 mt-auto">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-3 group">
            <div className="p-2 bg-slate-50 text-slate-600 rounded-lg border border-slate-100 group-hover:text-blue-600 group-hover:bg-blue-50 transition-colors">
              {item.icon}
            </div>
            <div>
              <div className="text-lg font-bold text-slate-800 leading-none">{item.count}</div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1 leading-none">{item.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
