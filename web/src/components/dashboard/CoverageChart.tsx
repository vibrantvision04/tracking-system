import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface CoverageChartProps {
  title: string;
  percentage: number;
  color?: string;
  subtitle?: string;
  onClick?: () => void;
}

export default function CoverageChart({ 
  title, 
  percentage, 
  color = '#10B981', 
  subtitle, 
  onClick 
}: CoverageChartProps) {
  
  const data = [
    { name: 'Covered', value: percentage },
    { name: 'Remaining', value: Math.max(0, 100 - percentage) },
  ];

  // Derive gradient coordinates depending on color
  const gradientId = `grad-${title.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

  return (
    <div
      onClick={onClick}
      className={`p-5 rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white/95 to-slate-50/50 flex flex-col h-full shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 group ${
        onClick ? 'cursor-pointer active:scale-[0.99] hover:border-emerald-300' : ''
      }`}
    >
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5 leading-none">{title}</h3>
      <div className="flex-1 relative min-h-[120px] flex items-center justify-center w-full max-w-[90%] mx-auto">
        <ResponsiveContainer width="100%" height="100%" minWidth={120}>
          <PieChart>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="70%"
              outerRadius="90%"
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              stroke="none"
            >
              <Cell key="cell-0" fill={`url(#${gradientId})`} />
              <Cell key="cell-1" fill="#f1f5f9" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        
        {/* Central visual indicator */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
          <span className="text-3xl font-black text-slate-800 font-sans tracking-tight leading-none">{percentage}%</span>
          {subtitle && (
            <span className="text-[9px] font-extrabold text-slate-400 uppercase mt-2 tracking-wider max-w-[80%] text-center truncate">
              {subtitle}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
