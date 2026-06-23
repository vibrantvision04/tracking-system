import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hoverable?: boolean;
}

export function Card({ children, hoverable = false, className = "", ...props }: CardProps) {
  return (
    <div
      className={`bg-gradient-to-br from-white/95 to-slate-50/50 border border-slate-200/60 shadow-sm rounded-2xl overflow-hidden transition-all duration-300 ${
        hoverable ? "hover:shadow-lg hover:-translate-y-0.5 hover:border-[#10B981]/60 hover:shadow-emerald-500/5" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function CardHeader({ children, className = "", ...props }: CardHeaderProps) {
  return (
    <div className={`p-5 border-b border-theme-border flex flex-col gap-1.5 ${className}`} {...props}>
      {children}
    </div>
  );
}

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

export function CardTitle({ children, className = "", ...props }: CardTitleProps) {
  return (
    <h3 className={`text-lg font-semibold text-theme-text tracking-tight ${className}`} {...props}>
      {children}
    </h3>
  );
}

interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
}

export function CardDescription({ children, className = "", ...props }: CardDescriptionProps) {
  return (
    <p className={`text-sm text-theme-text-dim ${className}`} {...props}>
      {children}
    </p>
  );
}

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function CardContent({ children, className = "", ...props }: CardContentProps) {
  return (
    <div className={`p-5 ${className}`} {...props}>
      {children}
    </div>
  );
}

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function CardFooter({ children, className = "", ...props }: CardFooterProps) {
  return (
    <div className={`p-4 bg-theme-elevated border-t border-theme-border flex items-center justify-end gap-3 ${className}`} {...props}>
      {children}
    </div>
  );
}
