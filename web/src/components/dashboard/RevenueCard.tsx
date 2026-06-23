import React, { useState } from 'react';
import { IndianRupee } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export default function RevenueCard() {
  const [selectedMonth, setSelectedMonth] = useState('Current Month');
  
  // Mock data - replace with API data when available
  const revenue = '0';

  return (
    <Card hoverable className="p-6 flex flex-col justify-between h-full relative overflow-hidden">
      <div className="flex justify-between items-start mb-4 gap-2 z-10">
        <h3 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider shrink-0 leading-none">Revenue</h3>
        <select 
          value={selectedMonth} 
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="text-[10px] font-bold text-theme-text-dim bg-theme-elevated border border-theme-border rounded-md px-2 py-1 outline-none focus:border-[#10B981] cursor-pointer"
        >
          <option>Current Month</option>
          <option>Last Month</option>
          <option>YTD</option>
        </select>
      </div>
      <div className="flex items-center gap-3.5 mt-auto pt-2 z-10">
        <div className="p-2.5 bg-[#10B981]/10 text-[#10B981] rounded-full border border-[#10B981]/20 shrink-0 flex items-center justify-center">
          <IndianRupee size={20} strokeWidth={2.5} />
        </div>
        <div className="text-4xl font-extrabold text-theme-text tracking-tight truncate" title={revenue}>{revenue}</div>
      </div>

      {/* Subtle red wave decoration at the bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-6 pointer-events-none opacity-20 select-none overflow-hidden">
        <svg viewBox="0 0 120 28" className="w-full h-full text-[#10B981]" fill="none" preserveAspectRatio="none">
          <path 
            d="M0 18 C 30 18, 40 4, 70 4 C 100 4, 110 22, 120 22" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round"
          />
        </svg>
      </div>
    </Card>
  );
}
