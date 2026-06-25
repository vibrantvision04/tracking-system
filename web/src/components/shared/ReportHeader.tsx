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
  if (variant === 'detailed') {
    return (
      <div className={`bg-theme-surface border-b border-theme-border px-6 py-4 shrink-0 flex items-center justify-between ${className}`}>
        <div>
          <h1 className="text-lg font-extrabold text-theme-text tracking-tight uppercase">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs font-bold text-theme-text-dim mt-1 uppercase tracking-wider">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className={`flex gap-2 ${printHiddenActions ? 'print:hidden' : ''}`}>
            {actions}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-theme-surface px-6 py-3 border-b border-theme-border shrink-0 flex items-center justify-between ${className}`}>
      <div>
        <h2 className="text-base font-bold text-theme-text">{title}</h2>
        <div className="h-[3px] w-8 bg-theme-accent mt-1"></div>
      </div>
      {actions && (
        <div className={`flex gap-2 ${printHiddenActions ? 'print:hidden' : ''}`}>
          {actions}
        </div>
      )}
    </div>
  );
}
