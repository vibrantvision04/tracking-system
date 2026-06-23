import React, { useId } from 'react';

interface DatePickerProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  type?: 'date' | 'datetime-local' | 'time';
}

export function DatePicker({
  label,
  error,
  type = 'date',
  className = '',
  id,
  ...props
}: DatePickerProps) {
  const reactId = useId();
  const generatedId = id || `datepicker-${reactId}`;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={generatedId}
          className="text-xs font-semibold uppercase tracking-wider text-theme-text-dim block mb-1.5"
        >
          {label}
        </label>
      )}

      <input
        type={type}
        id={generatedId}
        className={`w-full h-9 bg-white text-gray-900 border border-gray-300 rounded-[8px] px-3 focus:outline-none focus:ring-2 focus:ring-[#10B981]/30 transition-all duration-150 ${
          error ? 'border-[#EF4444]' : ''
        } ${className}`}
        {...props}
      />

      {error && (
        <p className="text-xs text-[#EF4444] mt-1">{error}</p>
      )}
    </div>
  );
}

export default DatePicker;
