import React from 'react';

interface FilterBarProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function FilterBar({ children, actions, className = '' }: FilterBarProps) {
  return (
    <div className={`flex flex-wrap gap-3 items-center p-3 bg-theme-surface border border-theme-border rounded-[12px] ${className}`}>
      {children}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export default FilterBar;
