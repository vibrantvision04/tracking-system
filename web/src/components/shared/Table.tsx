"use client";

import React, { useState, useEffect } from 'react';

interface TableProps {
  headers: React.ReactNode[];
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  itemsPerPage?: number;
  paginate?: boolean;
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
      <div className="w-full overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-theme-border bg-theme-base/50 text-[10px] font-bold text-theme-text-dim uppercase tracking-wider select-none">
              {headers.map((header, idx) => (
                <th key={idx} className="px-5 py-3.5 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-theme-border/50 text-theme-text">
            {isLoading ? (
              <tr>
                <td colSpan={headers.length} className="px-5 py-12 text-center text-theme-text-dim">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <span className="w-6 h-6 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
                    <span className="text-[11px] font-medium tracking-wide uppercase">Loading records...</span>
                  </div>
                </td>
              </tr>
            ) : totalItems === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-5 py-12 text-center text-theme-text-dim">
                  {emptyState || (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-4">
                      <span className="text-xl">📭</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider">No records found</span>
                      <span className="text-[10px] text-theme-text-dim/80">Try adjusting your filters or adding a new record.</span>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              currentData
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {paginate && totalPages > 1 && (
        <div className="border-t border-theme-border px-5 py-3 flex items-center justify-between bg-theme-base/30">
          <span className="text-xs text-theme-text-dim">
            Showing <span className="font-semibold text-theme-text">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-semibold text-theme-text">{Math.min(currentPage * itemsPerPage, totalItems)}</span> of <span className="font-semibold text-theme-text">{totalItems}</span> entries
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
