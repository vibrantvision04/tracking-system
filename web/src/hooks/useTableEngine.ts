"use client";

import React, { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  type Table as TanStackTable,
  type PaginationState,
  type RowData,
} from '@tanstack/react-table';

// ── Internal row type ──────────────────────────────────────────────────────────
// Each pre-rendered <tr> child is wrapped into a RowItem so TanStack can manage
// ordering and pagination without us giving up the children-as-rows API.
export interface RowItem {
  _rowId: string;
  element: React.ReactNode;
}

// Augment TanStack's RowData registry to silence TS module-augmentation warnings
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TableMeta<TData extends RowData> {}
}

// ── Column definition ──────────────────────────────────────────────────────────
// A single column that holds the entire RowItem.
// The actual rendering is handled by the consuming component — TanStack only
// manages row slicing, ordering, and state here.
const COLUMNS = [
  {
    id: '__row__',
    accessorFn: (row: RowItem) => row,
  },
] as const;

// ── Hook options ───────────────────────────────────────────────────────────────
export interface UseTableEngineOptions {
  /** Pre-rendered <tr> children converted to RowItem[] */
  rows: RowItem[];
  /** Items per page — passed from Table's itemsPerPage prop */
  itemsPerPage: number;

  // ── Server-side pagination ─────────────────────────────────────────────────
  /** Enable server-side pagination. Requires pageCount + onPageChange */
  manualPagination?: boolean;
  /** Total page count when manualPagination=true */
  pageCount?: number;
  /** Controlled current page (1-based) when manualPagination=true */
  currentPage?: number;
  /** Callback when page changes (1-based) when manualPagination=true */
  onPageChange?: (page: number) => void;
}

// ── Hook return type ──────────────────────────────────────────────────────────
export interface UseTableEngineReturn {
  table: TanStackTable<RowItem>;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageRows: RowItem[];
  goToPage: (page: number) => void;
  goToPreviousPage: () => void;
  goToNextPage: () => void;
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export function useTableEngine({
  rows,
  itemsPerPage,
  manualPagination = false,
  pageCount: externalPageCount,
  currentPage: externalCurrentPage,
  onPageChange,
}: UseTableEngineOptions): UseTableEngineReturn {

  // Internal pagination state (0-indexed as TanStack expects)
  const [internalPagination, setInternalPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: itemsPerPage,
  });

  // When controlled externally (server-side), derive pageIndex from prop (1-based to 0-based)
  const pagination: PaginationState = manualPagination && externalCurrentPage != null
    ? { pageIndex: externalCurrentPage - 1, pageSize: itemsPerPage }
    : internalPagination;

  // Sync pageSize if itemsPerPage changes
  const effectivePagination: PaginationState = useMemo(() => ({
    pageIndex: pagination.pageIndex,
    pageSize: itemsPerPage,
  }), [pagination.pageIndex, itemsPerPage]);

  // Memoize the column definitions — they never change
  const columns = useMemo(() => [...COLUMNS], []);

  const table = useReactTable<RowItem>({
    data: rows,
    columns,
    state: {
      pagination: effectivePagination,
    },
    // Pagination
    manualPagination,
    pageCount: manualPagination ? (externalPageCount ?? -1) : undefined,
    onPaginationChange: (updaterOrValue) => {
      const next =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(effectivePagination)
          : updaterOrValue;

      if (manualPagination && onPageChange) {
        onPageChange(next.pageIndex + 1); // convert to 1-based
      } else {
        setInternalPagination(next);
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
    autoResetPageIndex: false, // prevents page jumping on filter changes
  });

  const currentPageIndex = table.getState().pagination.pageIndex;
  const totalItems = rows.length;
  const totalPages = manualPagination
    ? (externalPageCount ?? 0)
    : table.getPageCount();

  // The rows to render for the current page
  const pageRows = manualPagination
    ? rows  // server already sliced
    : table.getRowModel().rows.map(r => r.original);

  const goToPage = (page: number) => table.setPageIndex(page - 1);
  const goToPreviousPage = () => table.previousPage();
  const goToNextPage = () => table.nextPage();

  return {
    table,
    currentPage: currentPageIndex + 1,
    totalPages,
    totalItems,
    pageRows,
    goToPage,
    goToPreviousPage,
    goToNextPage,
  };
}
