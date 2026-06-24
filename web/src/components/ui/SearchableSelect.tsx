import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder: string;
  className?: string;
  disabled?: boolean;
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  className = "",
  disabled = false
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) setSearch("");
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);

  const filteredOptions = options.filter(opt => {
    if (search && !opt.value) return false;
    const label = opt.label || "";
    return label.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-white border border-slate-200 px-3 py-1.5 rounded text-sm text-black hover:border-slate-300 focus:border-emerald-500 outline-none transition cursor-pointer font-medium flex items-center justify-between shadow-sm ${
          disabled ? "opacity-50 cursor-not-allowed bg-slate-50 text-slate-400" : ""
        }`}
      >
        <span className="truncate pr-2">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && !disabled && typeof window !== 'undefined' && createPortal(
        <div 
          className="fixed bg-white border border-slate-200 rounded-lg shadow-xl flex flex-col z-[999999] overflow-hidden pointer-events-auto"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            minWidth: '200px'
          }}
        >
          <div className="p-2 border-b border-slate-200 shrink-0 flex items-center gap-1.5 bg-slate-50">
            <span className="text-slate-400 text-xs pl-1">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full bg-transparent text-xs text-black outline-none placeholder:text-slate-400"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-slate-400 hover:text-slate-600 text-xs pr-1 focus:outline-none"
              >
                ✕
              </button>
            )}
          </div>

          <div className="overflow-y-auto max-h-[144px] custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => (
                <button
                  type="button"
                  key={`${opt.value}-${idx}`}
                  onMouseDown={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs cursor-pointer transition flex items-center justify-between ${
                    opt.value === value
                      ? 'bg-emerald-50 text-emerald-600 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.value === value && <span className="text-[10px] text-emerald-600">✓</span>}
                </button>
              ))
            ) : (
              <div className="px-3 py-2.5 text-xs text-slate-400 italic text-center">
                No results found
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
