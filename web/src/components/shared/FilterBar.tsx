import React from 'react';

interface FilterBarProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function FilterBar({ children, actions, className = '' }: FilterBarProps) {
  return (
    <div className={`flex flex-wrap gap-2 sm:gap-3 items-center p-2.5 sm:p-3 bg-theme-surface border border-theme-border rounded-[12px] ${className}`}>
      {children}
      {actions && <div className="flex items-center gap-2 sm:ml-auto w-full sm:w-auto justify-end sm:justify-start">{actions}</div>}
    </div>
  );
}

export default FilterBar;