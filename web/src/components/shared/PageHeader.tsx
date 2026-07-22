import React from 'react';
import ReportHeader from './ReportHeader';

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
    <ReportHeader
      title={title}
      subtitle={description}
      variant="detailed"
      actions={actions}
      className={className}
    />
  );
}
