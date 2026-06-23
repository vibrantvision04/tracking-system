"use client";

import React, { useEffect } from "react";
import PageHeader from "./PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Table from "./Table";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface CrudDirectoryProps {
  title: string;
  description: string;
  breadcrumbs: Breadcrumb[];
  addBtnLabel: string;
  
  // Data State
  loading?: boolean;
  emptyState?: string;
  
  // Search
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  
  // Form State
  formOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
  isEditing: boolean;
  submitting?: boolean;
  onSubmit: (e: React.FormEvent) => void;
  formTitle?: string;
  formDescription?: string;
  
  // Child Elements
  formFields: React.ReactNode;
  tableHeaders: React.ReactNode[];
  children: React.ReactNode; // Table rows
  
  // Stats Footer
  totalCount: number;
  footerWatermark?: string;
}

export default function CrudDirectory({
  title,
  description,
  breadcrumbs,
  addBtnLabel,
  loading = false,
  emptyState = "No records found.",
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search...",
  formOpen,
  onFormOpenChange,
  isEditing,
  submitting = false,
  onSubmit,
  formTitle,
  formDescription,
  formFields,
  tableHeaders,
  children,
  totalCount,
  footerWatermark = "VSWM JAIPUR",
}: CrudDirectoryProps) {
  // Listen for Escape key to close form
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && formOpen) {
        onFormOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [formOpen, onFormOpenChange]);

  const entityName = title.replace("Management", "").trim();
  const defaultFormTitle = isEditing ? `✏️ Edit ${entityName}` : `🏢 Add ${entityName}`;
  const defaultFormDesc = isEditing ? "Modify the fields below. Press Escape to close." : "Enter the details below. Press Escape to close.";

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none font-sans space-y-6 p-6 lg:p-8">
      
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        actions={
          <Button onClick={() => onFormOpenChange(!formOpen)} variant={formOpen ? "secondary" : "primary"}>
            {formOpen ? "✕ Close" : `+ ${addBtnLabel}`}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        
        {/* Conditional Form Card */}
        {formOpen && (
          <Card className="animate-fade-in relative z-20">
            <CardHeader>
              <CardTitle>{formTitle || defaultFormTitle}</CardTitle>
              <CardDescription>{formDescription || defaultFormDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                {formFields}
                <div className="flex items-center gap-3 pt-2 border-t border-theme-border">
                  <Button type="submit" variant="success" loading={submitting} loadingText="Submitting...">
                    Submit
                  </Button>
                  <Button type="button" variant="outline" onClick={() => onFormOpenChange(false)}>
                    Close
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Directory List Card */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle>{title.includes("Management") ? title.replace("Management", "Directory") : `${title} Directory`}</CardTitle>
              <CardDescription>All registered {title.replace("Management", "").toLowerCase().trim()} records in the system.</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              {onSearchChange && (
                <Input
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={e => onSearchChange(e.target.value)}
                  className="w-full sm:w-72"
                />
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table
              headers={tableHeaders}
              isLoading={loading}
              emptyState={searchQuery ? "No matching records found" : emptyState}
            >
              {children}
            </Table>
            <div className="p-4 border-t border-theme-border bg-theme-surface text-xs font-semibold text-theme-text-dim flex items-center justify-between">
              <span>{totalCount} total</span>
              <span className="text-[10px] text-theme-text-dim uppercase tracking-widest">{footerWatermark}</span>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
