import React from 'react';
import { Route, Building2, SquareParking, Fuel, Wrench, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';

interface InfraItem {
  icon: React.ReactNode;
  label: string;
  count: string | number;
}

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
  const items: InfraItem[] = [
    { icon: <Route size={18} />, label: 'Total Routes', count: routesCount },
    { icon: <Building2 size={18} />, label: 'Transfer Stations', count: transferStationsCount },
    { icon: <SquareParking size={18} />, label: 'Parking Lots', count: parkingLotsCount },
    { icon: <Fuel size={18} />, label: 'Fuel Stations', count: fuelStationsCount },
    { icon: <Wrench size={18} />, label: 'Workshops', count: workshopsCount },
    { icon: <Users size={18} />, label: 'Employees', count: employeesCount },
  ];

  return (
    <Card hoverable className="p-6 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-theme-text-dim uppercase tracking-wider mb-5">Infrastructure Summary</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 mt-auto">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-3 group">
            <div className="p-2 bg-[#10B981]/10 text-[#10B981] rounded-full border border-[#10B981]/20 transition-all duration-300 flex items-center justify-center shrink-0">
              {item.icon}
            </div>
            <div>
              <div className="text-lg font-bold text-theme-text leading-none">{item.count}</div>
              <div className="text-[10px] font-semibold text-theme-text-dim uppercase tracking-wider mt-1 leading-none">{item.label}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
