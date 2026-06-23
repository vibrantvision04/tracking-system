import React from 'react';
import { MapPin, Calculator, Scale, Video } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export default function DeviceCard({ gpsDevicesCount }: { gpsDevicesCount: number | string }) {
  const items = [
    { icon: <MapPin size={18} />, label: 'GPS Devices', count: gpsDevicesCount, active: true },
    { icon: <Calculator size={18} />, label: 'POS Machines', count: 'N/A', active: false },
    { icon: <Scale size={18} />, label: 'Weight Sensors', count: 'N/A', active: false },
    { icon: <Video size={18} />, label: 'Live Cameras', count: 'N/A', active: false },
  ];

  return (
    <Card hoverable className="p-6 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-theme-text-dim uppercase tracking-wider mb-5">Hardware Assets</h3>
      <div className="flex flex-col gap-4 mt-auto">
        {items.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center group">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#10B981]/10 text-[#10B981] rounded-full border border-[#10B981]/20 transition-all duration-300">
                {item.icon}
              </div>
              <div className="text-[11px] font-bold text-theme-text-dim uppercase tracking-wider">{item.label}</div>
            </div>
            <div className={`text-lg font-extrabold ${item.active ? 'text-theme-text' : 'text-theme-text-dim'}`}>
              {item.count}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
