import React from 'react';

interface FilterBarProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function FilterBar({ children, actions, className = '' }: FilterBarProps) {
  return (
    <div className={`
      grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap
      gap-3 items-stretch lg:items-center
      p-3 sm:p-3
      bg-theme-surface border border-theme-border rounded-[12px]
      *:min-h-[44px] *:max-w-full
      ${className}
    `}>
      {children}
      {actions && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2
          col-span-1 sm:col-span-2 lg:ml-auto lg:w-auto min-h-[44px]">
          {actions}
        </div>
      )}
    </div>
  );
}

export default FilterBar;