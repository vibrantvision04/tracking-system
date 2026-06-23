"use client";

import React, { useState, useEffect } from 'react';
import { Inbox } from 'lucide-react';

interface TableProps {
  headers: React.ReactNode[];
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  itemsPerPage?: number;
  paginate?: boolean;
}

export function paginationSummary(n: number, itemsPerPage: number, currentPage: number): string {
  if (n === 0) return 'No entries';
  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, n);
  return `Showing ${start} to ${end} of ${n} entries`;
}

export default function Table({
  headers,
  isLoading = false,
  emptyState,
  children,
  className = "",
  itemsPerPage = 20,
  paginate = true,
}: TableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const childrenArray = React.Children.toArray(children);
  const totalItems = childrenArray.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // Reset if items shrink below current page
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalItems, totalPages, currentPage]);

  const currentData = paginate
    ? childrenArray.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    : childrenArray;

  return (
    <div className={`w-full overflow-hidden flex flex-col rounded-xl border border-theme-border bg-theme-surface shadow-sm ${className}`}>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse [&>tbody>tr:nth-child(odd)]:bg-theme-card [&>tbody>tr:nth-child(even)]:bg-theme-surface">
          <thead className="sticky top-0 z-10 bg-theme-card">
            <tr className="border-b border-theme-border select-none">
              {headers.map((header, idx) => (
                <th key={idx} className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-theme-text-dim">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-theme-border/50 text-theme-text">
            {isLoading ? (
              <tr>
                <td colSpan={headers.length} className="px-5 py-12 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-8 h-8 border-2 border-theme-border border-t-theme-accent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-theme-text-dim">Loading records...</p>
                  </div>
                </td>
              </tr>
            ) : totalItems === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-5 py-12 text-center">
                  {emptyState || (
                    <div className="flex flex-col items-center justify-center">
                      <Inbox className="h-10 w-10 text-theme-text-dim mx-auto mb-3" />
                      <p className="text-sm font-semibold text-theme-text">No records found</p>
                      <p className="text-xs text-theme-text-dim mt-1">Try adjusting your filters or adding new records</p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              React.Children.map(currentData, (child) => {
                if (!React.isValidElement(child)) return child;
                const existingClass: string = (child.props as { className?: string }).className ?? '';
                return React.cloneElement(child as React.ReactElement<{ className?: string }>, {
                  className: `${existingClass} text-sm hover:bg-theme-elevated transition-colors duration-150`.trim(),
                });
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {paginate && totalPages > 1 && (
        <div className="border-t border-theme-border px-5 py-3 flex items-center justify-between bg-theme-base/30">
          <span className="text-xs text-theme-text-dim">
            {paginationSummary(totalItems, itemsPerPage, currentPage)}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1.5 rounded-md border border-theme-border bg-theme-surface text-theme-text text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-theme-base transition-colors"
            >
              Prev
            </button>
            <div className="flex items-center gap-1 px-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = i + 1;
                if (totalPages > 5) {
                  if (currentPage > 3) {
                    pageNum = currentPage - 2 + i;
                    if (currentPage + 2 > totalPages) {
                      pageNum = totalPages - (4 - i);
                    }
                  }
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-medium transition-colors ${
                      currentPage === pageNum
                        ? "bg-theme-accent text-white"
                        : "text-theme-text hover:bg-theme-border/50"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1.5 rounded-md border border-theme-border bg-theme-surface text-theme-text text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-theme-base transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
