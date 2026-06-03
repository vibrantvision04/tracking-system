import React, { useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({
  label,
  error,
  className = "",
  type = "text",
  id,
  ...props
}: InputProps) {
  const reactId = useId();
  const generatedId = id || `input-${reactId}`;

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
      
      <input
        type={type}
        id={generatedId}
        className={`w-full bg-theme-base border border-theme-border rounded-lg px-3 py-2 text-theme-text placeholder:text-theme-text-dim focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all ${
          error ? "border-red-500/60 focus:ring-red-500/20" : "focus:border-indigo-500"
        } ${className}`}
        {...props}
      />

      {error && (
        <p className="text-[11px] font-medium text-red-400 mt-1 animate-fade-in">
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
