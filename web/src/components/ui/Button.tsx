import React from 'react';

// 'accent' kept as backward-compat alias for 'primary'
type ButtonVariant = 'primary' | 'accent' | 'success' | 'secondary' | 'danger' | 'ghost' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:   'bg-theme-accent text-white hover:bg-theme-accent-hover',
  accent:    'bg-theme-accent text-white hover:bg-theme-accent-hover', // alias for primary
  success:   'bg-[#16A34A] text-white hover:bg-[#15803D]',
  secondary: 'bg-theme-surface text-theme-text border border-theme-border hover:bg-theme-elevated',
  danger:    'bg-red-600 text-white hover:bg-red-700',
  ghost:     'bg-transparent text-theme-text hover:bg-theme-surface',
  outline:   'bg-transparent text-theme-text border border-theme-border hover:bg-theme-surface',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingText = 'Loading...',
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center min-h-[36px] px-4 rounded-[8px] font-medium ' +
    'transition-colors duration-150 focus:outline-none select-none';

  const disabledStyles = disabled || loading ? 'opacity-50 cursor-not-allowed' : '';
  const loadingPointer = loading ? 'pointer-events-none' : '';

  return (
    <button
      disabled={disabled || loading}
      className={[
        baseStyles,
        variantClasses[variant],
        sizeClasses[size],
        disabledStyles,
        loadingPointer,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {loading ? (
        <>
          <span
            className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"
            aria-hidden="true"
          />
          <span>{loadingText}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
