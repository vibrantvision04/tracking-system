import React, { useId } from 'react';

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export default function TextArea({
  label,
  error,
  className = "",
  id,
  ...props
}: TextAreaProps) {
  const reactId = useId();
  const generatedId = id || `textarea-${reactId}`;

  return (
    <div className="space-y-1.5 w-full">
      {label && (
        <label
          htmlFor={generatedId}
          className="text-xs font-semibold uppercase tracking-wider text-theme-text-dim block mb-1.5"
        >
          {label}
        </label>
      )}

      <textarea
        id={generatedId}
        className={`w-full bg-(--color-theme-background-base) border border-theme-border rounded-[12px] px-3 py-2 text-theme-text placeholder:text-theme-text-dim focus:outline-none focus:ring-2 focus:ring-[#10B981]/30 transition-all duration-150 min-h-[80px] resize-y ${
          error
            ? "border-[#EF4444] focus:ring-[#EF4444]/20"
            : ""
        } ${className}`}
        {...props}
      />

      {error && (
        <p className="text-xs text-[#EF4444] mt-1">{error}</p>
      )}
    </div>
  );
}
