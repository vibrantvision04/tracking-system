import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  description?: string;
  color?: 'emerald' | 'amber' | 'red' | 'blue' | 'slate' | 'purple';
  trend?: {
    value: string;
    type: 'up' | 'down' | 'neutral';
  };
  className?: string;
}

export default function StatCard({
  title,
  value,
  icon,
  description,
  color = 'emerald',
  trend,
  className = ""
}: StatCardProps) {
  const trendColor = {
    up: "text-emerald-500 bg-emerald-500/10",
    down: "text-rose-500 bg-rose-500/10",
    neutral: "text-theme-text-dim bg-theme-base"
  }[trend?.type || 'neutral'];

  const trendIcon = {
    up: "↑",
    down: "↓",
    neutral: "•"
  }[trend?.type || 'neutral'];

  const colorStyles = {
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-200/40",
    amber: "bg-amber-50 text-amber-600 border-amber-200/40",
    red: "bg-red-50 text-red-600 border-red-200/40",
    blue: "bg-blue-50 text-blue-600 border-blue-200/40",
    slate: "bg-slate-100 text-slate-500 border-slate-200/40",
    purple: "bg-purple-50 text-purple-600 border-purple-200/40",
  }[color];

  const accentStyles = {
    emerald: "from-emerald-500 to-emerald-600/30",
    amber: "from-amber-500 to-amber-600/30",
    red: "from-red-500 to-red-600/30",
    blue: "from-blue-500 to-blue-600/30",
    slate: "from-slate-400 to-slate-500/30",
    purple: "from-purple-500 to-purple-600/30",
  }[color];

  return (
    <div
      className={`relative overflow-hidden bg-theme-surface border border-theme-border rounded-xl p-5 shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all duration-200 group flex flex-col justify-between min-h-[120px] ${className}`}
    >
      {/* Decorative accent top line */}
      <div className={`absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r ${accentStyles} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
      
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider block">
            {title}
          </span>
          <span className="text-2xl font-extrabold text-theme-text tracking-tight block">
            {value}
          </span>
        </div>
        
        {icon && (
          <div className={`p-2 border rounded-lg group-hover:scale-105 transition-transform duration-200 ${colorStyles}`}>
            {icon}
          </div>
        )}
      </div>

      {(description || trend) && (
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-theme-border/30">
          {trend && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${trendColor}`}>
              <span className="leading-none">{trendIcon}</span>
              <span>{trend.value}</span>
            </span>
          )}
          {description && (
            <span className="text-[10px] font-medium text-theme-text-dim leading-none truncate">
              {description}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
