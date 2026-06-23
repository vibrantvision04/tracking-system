import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';

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
          className={`w-full h-9 bg-white text-gray-900 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#DC2626]/30 transition-all appearance-none pr-10 cursor-pointer ${
            error ? "border-[#EF4444]" : ""
          } ${className}`}
          {...props}
        >
          {options
            ? options.map((opt, idx) => (
                <option key={`${opt.value}-${idx}`} value={opt.value} className="bg-white text-gray-900">
                  {opt.label}
                </option>
              ))
            : children}
        </select>

        {/* Chevron icon */}
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-500">
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>

      {error && (
        <p className="text-xs text-[#EF4444] mt-1">{error}</p>
      )}
    </div>
  );
}
