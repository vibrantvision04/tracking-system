import React, { useState } from 'react';
import { IndianRupee } from 'lucide-react';

export default function RevenueCard() {
  const [selectedMonth, setSelectedMonth] = useState('Current Month');
  
  // Mock data - replace with API data when available
  const revenue = '12,45,000';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col justify-between h-full">
      <div className="flex justify-between items-start mb-4 gap-2">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider shrink-0">Revenue</h3>
        <select 
          value={selectedMonth} 
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 outline-none focus:border-emerald-500 cursor-pointer"
        >
          <option>Current Month</option>
          <option>Last Month</option>
          <option>YTD</option>
        </select>
      </div>
      <div className="flex items-center gap-3 mt-auto pt-2">
        <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 shrink-0">
          <IndianRupee size={28} strokeWidth={2.5} />
        </div>
        <div className="text-4xl font-extrabold text-slate-900 tracking-tight truncate" title={revenue}>{revenue}</div>
      </div>
    </div>
  );
}
