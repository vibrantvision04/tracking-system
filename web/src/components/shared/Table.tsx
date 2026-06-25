"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Inbox, ChevronLeft, ChevronRight } from 'lucide-react';

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
  scrollHint?: boolean;
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
  scrollHint = true,
}: TableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const childrenArray = React.Children.toArray(children);
  const totalItems = childrenArray.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalItems, totalPages, currentPage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !scrollHint) return;
    const check = () => setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
    check();
    el.addEventListener('scroll', check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }, [children, headers, scrollHint]);

  const currentData = paginate
    ? childrenArray.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    : childrenArray;

  const pageNumbers: (number | 'dots')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (currentPage > 3) pageNumbers.push('dots');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pageNumbers.push(i);
    }
    if (currentPage < totalPages - 2) pageNumbers.push('dots');
    pageNumbers.push(totalPages);
  }

  return (
    <div className={nested
      ? `w-full overflow-hidden flex flex-col ${className}`
      : `w-full overflow-hidden flex flex-col rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white/95 to-slate-50/50 shadow-sm ${className}`
    }>
      <div className="relative">
        <div ref={scrollRef} className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse [&>tbody>tr:nth-child(odd)]:bg-[#FAF9F5] [&>tbody>tr:nth-child(even)]:bg-white">
            <thead className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-md">
              <tr className="border-b border-slate-200/60 select-none">
                {headers.map((header, idx) => (
                  <th
                    key={idx}
                    className={`${
                      dense ? "px-2 py-2.5 text-[9px] font-black" : "px-2 py-2.5 sm:px-3 sm:py-3.5 text-[9px] sm:text-[10px] font-black"
                    } uppercase tracking-widest text-slate-400 whitespace-nowrap`}
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
                    className: `${existingClass} ${dense ? "text-[11px]" : "text-[11px] sm:text-xs"} hover:bg-slate-50 transition-colors duration-150`.trim(),
                  });
                })
              )}
            </tbody>
          </table>
        </div>
        {scrollHint && canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white/80 to-transparent pointer-events-none" />
        )}
      </div>

      {paginate && totalPages > 1 && (
        <div className="border-t border-slate-100 px-3 sm:px-5 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 bg-slate-50/50">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
            {paginationSummary(totalItems, itemsPerPage, currentPage)}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1 px-1">
              {pageNumbers.map((p, i) =>
                p === 'dots' ? (
                  <span key={`dots-${i}`} className="w-7 h-7 flex items-center justify-center text-[10px] font-black text-slate-300 select-none">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black transition-colors cursor-pointer ${
                      currentPage === p
                        ? "bg-[#10B981] text-white shadow-sm shadow-emerald-500/20"
                        : "text-slate-500 hover:bg-slate-200/50 hidden sm:flex"
                    }`}
                    aria-label={`Page ${p}`}
                  >
                    {p}
                  </button>
                )
              )}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
