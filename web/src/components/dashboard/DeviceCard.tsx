import React from 'react';
import { MapPin, Calculator, Scale, Video } from 'lucide-react';

export default function DeviceCard({ gpsDevicesCount }: { gpsDevicesCount: number | string }) {
  const items = [
    { icon: <MapPin size={18} />, label: 'GPS Devices', count: gpsDevicesCount, active: true },
    { icon: <Calculator size={18} />, label: 'POS Machines', count: 'N/A', active: false },
    { icon: <Scale size={18} />, label: 'Weight Sensors', count: 'N/A', active: false },
    { icon: <Video size={18} />, label: 'Live Cameras', count: 'N/A', active: false },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-5">Hardware Assets</h3>
      <div className="flex flex-col gap-4 mt-auto">
        {items.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center group">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg border transition-colors ${item.active ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100 group-hover:text-blue-600 group-hover:border-blue-100'}`}>
                {item.icon}
              </div>
              <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{item.label}</div>
            </div>
            <div className={`text-lg font-extrabold ${item.active ? 'text-slate-900' : 'text-slate-400'}`}>
              {item.count}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
