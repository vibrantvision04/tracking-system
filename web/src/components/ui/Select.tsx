import React, { useId } from 'react';

interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: SelectOption[];
}

export default function Select({
  label,
  error,
  options,
  className = "",
  children,
  id,
  ...props
}: SelectProps) {
  const reactId = useId();
  const generatedId = id || `select-${reactId}`;

  return (
    <div className="space-y-1.5 w-full">
      {label && (
        <label
          htmlFor={generatedId}
          className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider block"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <select
          id={generatedId}
          className={`w-full bg-theme-base border border-theme-border rounded-lg px-3 py-2 text-theme-text placeholder:text-theme-text-dim focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all appearance-none pr-10 cursor-pointer ${
            error ? "border-red-500/60 focus:ring-red-500/20" : "focus:border-indigo-500"
          } ${className}`}
          {...props}
        >
          {options
            ? options.map((opt, idx) => (
                <option key={`${opt.value}-${idx}`} value={opt.value} className="bg-theme-surface text-theme-text">
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        
        {/* Custom Chevron Arrow */}
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-theme-text-dim">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {error && (
        <p className="text-[11px] font-medium text-red-400 mt-1 animate-fade-in">
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
