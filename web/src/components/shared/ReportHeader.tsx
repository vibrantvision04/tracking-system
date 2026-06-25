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
  const barHeight = variant === 'detailed' ? 'h-10 sm:h-12' : 'h-8 sm:h-10';

  return (
    <div
      className={`relative border-b border-theme-border px-4 sm:px-6 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 overflow-hidden ${
        variant === 'detailed' ? 'py-4' : 'py-3'
      } ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-200/70 via-emerald-100/40 via-white/95 to-emerald-50/60 animate-gradient pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-tr from-emerald-300/5 via-transparent to-emerald-200/10 animate-gradient pointer-events-none" style={{ animationDelay: '-6s', backgroundSize: '300% 300%' }} />
      <div className="flex items-start gap-3 min-w-0 relative z-10">
        <div className={`w-1 ${barHeight} bg-gradient-to-b from-theme-accent to-emerald-400 rounded-full shrink-0 mt-0.5 shadow-[0_0_8px_rgba(16,185,129,0.35)]`} />
        <div className="min-w-0">
          {variant === 'detailed' ? (
            <>
              <h1 className="text-sm sm:text-lg font-extrabold text-theme-text tracking-tight truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-[10px] sm:text-xs font-bold text-theme-text-dim mt-0.5 uppercase tracking-wider truncate">
                  {subtitle}
                </p>
              )}
            </>
          ) : (
            <>
              <h2 className="text-sm sm:text-base font-bold text-theme-text truncate">
                {title}
              </h2>
              <div className="h-[3px] w-12 sm:w-16 bg-theme-accent/15 mt-1.5 rounded-full overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-r from-theme-accent to-emerald-400 rounded-full animate-shimmer" />
              </div>
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
