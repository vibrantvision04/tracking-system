import React from 'react';
import Link from 'next/link';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className = ""
}: PageHeaderProps) {
  return (
    <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-100 ${className}`}>
      <div className="space-y-2">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-slate-300 font-normal">/</span>}
                {crumb.href ? (
                  <Link 
                    href={crumb.href} 
                    className="hover:text-emerald-600 px-2 py-0.5 bg-slate-50 border border-slate-200/50 rounded-full transition-colors duration-250 shadow-sm"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="px-2 py-0.5 bg-slate-100 border border-slate-200/20 text-slate-400 rounded-full">
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-800 tracking-tight font-sans select-none leading-none pt-1">
          {title}
        </h1>
        
        {description && (
          <p className="text-xs font-semibold text-slate-400 max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-3 self-stretch sm:self-start md:self-center shrink-0 *:w-full sm:*:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
