import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'accent' | 'danger' | 'primary' | 'secondary' | 'outline';
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
}

export default function Button({
  variant = 'primary',
  loading = false,
  loadingText = "Loading...",
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = "inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-all duration-200 focus:outline-none disabled:opacity-50 select-none shadow-sm";
  
  const variants = {
    accent: "bg-theme-accent hover:bg-theme-accent-hover text-white shadow-emerald-500/5 hover:shadow",
    danger: "bg-red-600 hover:bg-red-700 text-white shadow-red-500/5 hover:shadow",
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/5 hover:shadow",
    secondary: "bg-theme-surface border border-theme-border text-theme-text hover:bg-theme-surface-hover",
    outline: "border border-theme-border bg-transparent text-theme-text hover:bg-theme-surface"
  };

  return (
    <button
      disabled={disabled || loading}
      className={`${baseStyles} ${variants[variant]} ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
          <span>{loadingText}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
