"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTableEngine, type RowItem } from '@/hooks/useTableEngine';

// ── Public API ─────────────────────────────────────────────────────────────────
// IMPORTANT: Do NOT change existing props — 50+ pages depend on this interface.
export interface TableProps {
  // ── Existing props (unchanged) ──────────────────────────────────────────────
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

  // ── New additive props (optional, existing pages unaffected) ────────────────
  /** Enable server-side pagination. Pair with pageCount + onPageChange */
  manualPagination?: boolean;
  /** Total number of pages when using manualPagination */
  pageCount?: number;
  /** Controlled current page (1-based) when using manualPagination */
  currentPage?: number;
  /** Called with the new 1-based page number when the user changes page */
  onPageChange?: (page: number) => void;
  /**
   * Future: enable TanStack Virtual for very large datasets.
   * Currently accepted but not yet active — reserved for Phase 2.
   */
  virtualized?: boolean;
}

// ── paginationSummary — kept as a named export for backward compatibility ──────
export function paginationSummary(
  n: number,
  itemsPerPage: number,
  currentPage: number,
): string {
  if (n === 0) return 'No entries';
  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, n);
  return `Showing ${start} to ${end} of ${n} entries`;
}

// ── Table Component ────────────────────────────────────────────────────────────
export default function Table({
  headers,
  isLoading = false,
  emptyState,
  children,
  className = '',
  itemsPerPage = 10,
  paginate = true,
  dense = false,
  nested = false,
  scrollHint = true,
  // New optional props
  manualPagination = false,
  pageCount: externalPageCount,
  currentPage: externalCurrentPage,
  onPageChange,
  // virtualized is accepted but not yet activated
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  virtualized = false,
}: TableProps) {

  // ── Scroll hint state ──────────────────────────────────────────────────────
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !scrollHint) return;
    const check = () =>
      setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
    check();
    el.addEventListener('scroll', check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', check);
      ro.disconnect();
    };
  }, [children, headers, scrollHint]);

  // ── Convert children → RowItem[] for TanStack ──────────────────────────────
  // Each React child (<tr>) is wrapped into a RowItem with a stable identity.
  // This is the adapter layer that bridges the existing children-as-rows API
  // with TanStack's data-array row model.
  const rows = useMemo<RowItem[]>(() => {
    return React.Children.toArray(children).map((child, index) => ({
      _rowId: `row-${index}`,
      element: child,
    }));
  }, [children]);

  // ── TanStack engine ────────────────────────────────────────────────────────
  const {
    currentPage,
    totalPages,
    totalItems,
    pageRows,
    goToPage,
    goToPreviousPage,
    goToNextPage,
  } = useTableEngine({
    rows,
    itemsPerPage,
    manualPagination,
    pageCount: externalPageCount,
    currentPage: externalCurrentPage,
    onPageChange,
  });

  // ── Page number buttons (same smart ellipsis logic as before) ─────────────
  const pageNumbers: (number | 'dots')[] = useMemo(() => {
    const nums: (number | 'dots')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) nums.push(i);
    } else {
      nums.push(1);
      if (currentPage > 3) nums.push('dots');
      for (
        let i = Math.max(2, currentPage - 1);
        i <= Math.min(totalPages - 1, currentPage + 1);
        i++
      ) {
        nums.push(i);
      }
      if (currentPage < totalPages - 2) nums.push('dots');
      nums.push(totalPages);
    }
    return nums;
  }, [currentPage, totalPages]);

  // ── Decide which rows to render ───────────────────────────────────────────
  // When pagination is disabled, show all rows. When enabled, show the page
  // slice returned by the TanStack engine.
  const visibleRows = paginate ? pageRows : rows;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className={
        nested
          ? `w-full overflow-hidden flex flex-col ${className}`
          : `w-full overflow-hidden flex flex-col rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white/95 to-slate-50/50 shadow-sm ${className}`
      }
    >
      <div className="relative">
        <div ref={scrollRef} className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse [&>tbody>tr:nth-child(odd)]:bg-[#FAF9F5] [&>tbody>tr:nth-child(even)]:bg-white">
            <thead className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-md">
              <tr className="border-b border-slate-200/60 select-none">
                {headers.map((header, idx) => (
                  <th
                    key={idx}
                    className={`${
                      dense
                        ? 'px-2 py-2.5 text-[9px] font-black'
                        : 'px-2 py-2.5 sm:px-3 sm:py-3.5 text-[9px] sm:text-[10px] font-black'
                    } uppercase tracking-widest text-slate-400 whitespace-nowrap`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-slate-750">
              {isLoading ? (
                // ── Loading state ──────────────────────────────────────────
                <tr>
                  <td colSpan={headers.length} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-7 h-7 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-xs font-semibold text-slate-400">
                        Loading records...
                      </p>
                    </div>
                  </td>
                </tr>
              ) : totalItems === 0 ? (
                // ── Empty state ────────────────────────────────────────────
                <tr>
                  <td colSpan={headers.length} className="px-5 py-12 text-center">
                    {emptyState || (
                      <div className="flex flex-col items-center justify-center py-6">
                        <Inbox className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                        <p className="text-xs font-black text-slate-700 uppercase tracking-wider">
                          No records found
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Try adjusting your filters or adding new records
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                // ── Rows ───────────────────────────────────────────────────
                visibleRows.map((rowItem) => {
                  const child = rowItem.element;
                  if (!React.isValidElement(child)) return child;
                  const existingClass: string =
                    (child.props as { className?: string }).className ?? '';
                  return React.cloneElement(
                    child as React.ReactElement<{ className?: string }>,
                    {
                      className: `${existingClass} ${
                        dense ? 'text-[11px]' : 'text-[11px] sm:text-xs'
                      } hover:bg-slate-50 transition-colors duration-150`.trim(),
                    },
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Scroll hint gradient */}
        {scrollHint && canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white/80 to-transparent pointer-events-none" />
        )}
      </div>

      {/* Pagination bar */}
      {paginate && totalPages > 1 && (
        <div className="border-t border-slate-100 px-3 sm:px-5 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 bg-slate-50/50">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
            {paginationSummary(totalItems, itemsPerPage, currentPage)}
          </span>

          <div className="flex items-center gap-1">
            {/* Previous */}
            <button
              onClick={goToPreviousPage}
              disabled={currentPage === 1}
              className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page numbers */}
            <div className="flex items-center gap-1 px-1">
              {pageNumbers.map((p, i) =>
                p === 'dots' ? (
                  <span
                    key={`dots-${i}`}
                    className="w-7 h-7 flex items-center justify-center text-[10px] font-black text-slate-300 select-none"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black transition-colors cursor-pointer ${
                      currentPage === p
                        ? 'bg-[#10B981] text-white shadow-sm shadow-emerald-500/20'
                        : 'text-slate-500 hover:bg-slate-200/50 hidden sm:flex'
                    }`}
                    aria-label={`Page ${p}`}
                  >
                    {p}
                  </button>
                ),
              )}
            </div>

            {/* Next */}
            <button
              onClick={goToNextPage}
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
