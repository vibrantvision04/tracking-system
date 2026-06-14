import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface CoverageChartProps {
  title: string;
  percentage: number;
  color?: string;
  subtitle?: string;
  onClick?: () => void;
}

export default function CoverageChart({ title, percentage, color = '#3b82f6', subtitle, onClick }: CoverageChartProps) {
  const data = [
    { name: 'Covered', value: percentage },
    { name: 'Remaining', value: Math.max(0, 100 - percentage) },
  ];

  return (
    <div 
      onClick={onClick}
      className={`bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-full ${onClick ? 'cursor-pointer hover:border-slate-300 hover:bg-slate-50/50 active:scale-[0.99]' : ''}`}
    >
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">{title}</h3>
      <div className="flex-1 relative min-h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="65%"
              outerRadius="85%"
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              stroke="none"
            >
              <Cell key="cell-0" fill={color} />
              <Cell key="cell-1" fill="#f1f5f9" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-3xl font-extrabold text-slate-900">{percentage}%</span>
          {subtitle && <span className="text-[10px] font-semibold text-slate-400 uppercase mt-1 tracking-wider">{subtitle}</span>}
        </div>
      </div>
    </div>
  );
}
