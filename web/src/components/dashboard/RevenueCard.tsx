import React, { useState } from 'react';
import { IndianRupee } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';



export default function RevenueCard() {
  const [selectedMonth, setSelectedMonth] = useState<'Current Month' | 'Last Month' | 'YTD'>('Current Month');

  return (
    <div className="p-5 rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white/95 to-slate-50/50 flex flex-col h-full justify-between shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 group relative overflow-hidden">
      <div className="flex justify-between items-start mb-2 gap-2 z-10">
        <div className="flex flex-col gap-1">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Revenue</h3>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 leading-none">
            No data
          </span>
        </div>
        <select 
          value={selectedMonth} 
          onChange={(e) => setSelectedMonth(e.target.value as any)}
          className="text-[10px] font-black text-slate-400 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-300 cursor-pointer shadow-sm"
        >
          <option value="Current Month">Current Month</option>
          <option value="Last Month">Last Month</option>
          <option value="YTD">YTD</option>
        </select>
      </div>

      <div className="flex items-center gap-3.5 my-3 z-10">
        <div className="w-10 h-10 rounded-xl border border-emerald-200/40 bg-emerald-100/70 text-emerald-600 flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 shadow-sm">
          <IndianRupee size={18} strokeWidth={2.5} />
        </div>
        <div className="text-3xl font-black text-slate-800 tracking-tight leading-none font-sans select-all">₹0</div>
      </div>

      {/* Sparkline chart */}
      <div className="h-12 w-full -mx-5 -mb-5 mt-auto relative overflow-hidden rounded-b-2xl opacity-80 group-hover:opacity-100 transition-opacity duration-300 min-h-[48px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={[]} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#10B981" 
              strokeWidth={2} 
              fill="url(#revenueGrad)" 
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Decorative glow */}
      <div className="absolute -bottom-10 -right-10 w-24 h-24 rounded-full filter blur-xl opacity-10 transition-opacity duration-300 group-hover:opacity-20 pointer-events-none bg-emerald-500" />
    </div>
  );
}

