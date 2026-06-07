import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  secondaryText?: string;
  icon?: React.ReactNode;
  accentColor?: 'blue' | 'emerald' | 'amber' | 'slate';
}

export default function StatCard({ title, value, secondaryText, icon, accentColor = 'blue' }: StatCardProps) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-100',
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col justify-between h-full group">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{title}</h3>
        {icon && (
          <div className={`p-2.5 rounded-xl border ${colorMap[accentColor]} transition-transform duration-300 group-hover:scale-110`}>
            {icon}
          </div>
        )}
      </div>
      <div>
        <div className="text-4xl font-extrabold text-slate-900 tracking-tight">{value}</div>
        {secondaryText && (
          <div className="text-sm font-medium text-slate-500 mt-2">{secondaryText}</div>
        )}
      </div>
    </div>
  );
}
