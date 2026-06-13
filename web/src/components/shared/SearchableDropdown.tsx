import React, { useState, useRef, useEffect } from "react";

interface SearchableDropdownProps {
  label: string;
  selectedName: string;
  isSelected: boolean;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  search: string;
  setSearch: (search: string) => void;
  items: any[];
  onSelect: (id: any) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  keyField?: string;
  displayField?: string;
  searchPlaceholder?: string;
}

export default function SearchableDropdown({
  label,
  selectedName,
  isSelected,
  isOpen,
  setOpen,
  search,
  setSearch,
  items,
  onSelect,
  dropdownRef,
  keyField,
  displayField,
  searchPlaceholder
}: SearchableDropdownProps) {
  return (
    <div className="flex flex-col relative" ref={dropdownRef}>
      <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">{label}</span>
      <div
        className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2 text-xs cursor-pointer flex justify-between items-center hover:border-theme-accent/40 transition min-h-[38px]"
        onClick={() => setOpen(!isOpen)}
      >
        <span className={isSelected ? "text-theme-text font-medium truncate" : "text-theme-text-dim truncate"}>
          {selectedName}
        </span>
        <span className="text-theme-text-dim text-[10px] flex-shrink-0 ml-2">{isOpen ? "▲" : "▼"}</span>
      </div>
      {isOpen && (
        <div className="absolute top-[64px] left-0 w-full bg-theme-surface border border-theme-border rounded-lg shadow-xl overflow-hidden z-50">
          <div className="p-2 border-b border-theme-border">
            <input
              type="text"
              placeholder={searchPlaceholder || `Search ${label}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-theme-text outline-none placeholder:text-theme-text-dim"
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {items.length === 0 ? (
              <div className="px-4 py-2 text-xs text-theme-text-dim italic">No options found</div>
            ) : (
              items.map((item: any) => {
                const id = keyField ? item[keyField] : item;
                const text = displayField ? item[displayField] : item;
                return (
                  <div
                    key={id}
                    className="px-4 py-2 text-xs text-theme-text hover:bg-theme-accent/20 hover:text-emerald-400 cursor-pointer transition"
                    onClick={() => onSelect(id)}
                  >
                    {text}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
