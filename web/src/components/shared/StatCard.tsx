import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  description?: string;
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

  return (
    <div
      className={`relative overflow-hidden bg-theme-surface border border-theme-border rounded-xl p-5 shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all duration-200 group flex flex-col justify-between min-h-[120px] ${className}`}
    >
      {/* Decorative accent top line */}
      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-indigo-500 to-indigo-600/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
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
          <div className="p-2 bg-theme-base/60 text-theme-text border border-theme-border/40 rounded-lg group-hover:scale-105 transition-transform duration-200">
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
