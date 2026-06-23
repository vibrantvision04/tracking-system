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
  dense?: boolean;
  nested?: boolean;
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
  itemsPerPage = 10,
  paginate = true,
  dense = false,
  nested = false,
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
    <div className={nested 
      ? `w-full overflow-hidden flex flex-col ${className}`
      : `w-full overflow-hidden flex flex-col rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white/95 to-slate-50/50 shadow-sm ${className}`
    }>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse [&>tbody>tr:nth-child(odd)]:bg-[#FAF9F5] [&>tbody>tr:nth-child(even)]:bg-white">
          <thead className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-md">
            <tr className="border-b border-slate-200/60 select-none">
              {headers.map((header, idx) => (
                <th
                  key={idx}
                  className={`${
                    dense ? "px-2 py-2.5 text-[9px] font-black" : "px-5 py-3.5 text-[10px] font-black"
                  } uppercase tracking-widest text-slate-400`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-750">
            {isLoading ? (
              <tr>
                <td colSpan={headers.length} className="px-5 py-12 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-7 h-7 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-xs font-semibold text-slate-400">Loading records...</p>
                  </div>
                </td>
              </tr>
            ) : totalItems === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-5 py-12 text-center">
                  {emptyState || (
                    <div className="flex flex-col items-center justify-center py-6">
                      <Inbox className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                      <p className="text-xs font-black text-slate-700 uppercase tracking-wider">No records found</p>
                      <p className="text-[10px] text-slate-400 mt-1">Try adjusting your filters or adding new records</p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              React.Children.map(currentData, (child) => {
                if (!React.isValidElement(child)) return child;
                const existingClass: string = (child.props as { className?: string }).className ?? '';
                return React.cloneElement(child as React.ReactElement<{ className?: string }>, {
                  className: `${existingClass} ${dense ? "text-[11px]" : "text-xs"} hover:bg-slate-50 transition-colors duration-150`.trim(),
                });
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {paginate && totalPages > 1 && (
        <div className="border-t border-slate-100 px-5 py-3.5 flex items-center justify-between bg-slate-50/50">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {paginationSummary(totalItems, itemsPerPage, currentPage)}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 text-[10px] font-black uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
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
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black transition-colors cursor-pointer ${
                      currentPage === pageNum
                        ? "bg-[#10B981] text-white shadow-sm shadow-emerald-500/20"
                        : "text-slate-500 hover:bg-slate-200/50"
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
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 text-[10px] font-black uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
