import React from 'react';

interface ReportHeaderProps {
  title: string;
  subtitle?: string;
  variant?: 'compact' | 'detailed';
  actions?: React.ReactNode;
  printHiddenActions?: boolean;
  className?: string;
}

export default function ReportHeader({
  title,
  subtitle,
  variant = 'compact',
  actions,
  printHiddenActions = true,
  className = ""
}: ReportHeaderProps) {
  return (
    <div
      className={`relative border-b border-theme-border px-4 sm:px-6 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 overflow-hidden ${
        variant === 'detailed' ? 'py-3 sm:py-4' : 'py-2.5 sm:py-3'
      } ${className}`}
    >
      {/* Subtle background wash */}
      <div className="absolute inset-0 bg-linear-to-r from-emerald-50/80 via-white to-emerald-50/40 pointer-events-none" />

      <div className="flex items-center gap-3 min-w-0 relative z-10">
        {/* Accent bar */}
        <div className="w-1 self-stretch min-h-[24px] bg-linear-to-b from-emerald-500 to-emerald-400 rounded-full shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.3)]" />
        <div className="min-w-0">
          {variant === 'detailed' ? (
            <>
              <h1 className="text-sm sm:text-lg font-extrabold text-theme-text tracking-tight truncate leading-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="text-[10px] sm:text-xs font-semibold text-theme-text-dim mt-0.5 uppercase tracking-wider truncate">
                  {subtitle}
                </p>
              )}
            </>
          ) : (
            <>
              <h2 className="text-xs sm:text-sm font-bold text-theme-text truncate leading-tight">
                {title}
              </h2>
              <p className="text-[9px] sm:text-[10px] font-semibold text-emerald-600/70 uppercase tracking-widest mt-0.5 leading-none">
                Report
              </p>
            </>
          )}
        </div>
      </div>

      {actions && (
        <div className={`flex items-center gap-2 shrink-0 relative z-10 ${printHiddenActions ? 'print:hidden' : ''}`}>
          {actions}
        </div>
      )}
    </div>
  );
}
