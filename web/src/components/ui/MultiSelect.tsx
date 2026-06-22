import React, { useState, useRef, useEffect } from "react";

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: Option[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  className?: string;
  disabled?: boolean;
}

export default function MultiSelect({
  options,
  selectedValues,
  onChange,
  placeholder,
  className = "",
  disabled = false,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

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

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectNoneAll = () => {
    const filteredOptionValues = filteredOptions.map((o) => o.value);
    const areAllFilteredSelected = filteredOptionValues.every((val) =>
      selectedValues.includes(val)
    );

    if (areAllFilteredSelected) {
      // Unselect all currently filtered options
      onChange(selectedValues.filter((val) => !filteredOptionValues.includes(val)));
    } else {
      // Select all currently filtered options (union)
      const newSelection = Array.from(new Set([...selectedValues, ...filteredOptionValues]));
      onChange(newSelection);
    }
  };

  const handleToggleOption = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter((v) => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const handleRemoveValue = (e: React.MouseEvent, val: string) => {
    e.stopPropagation();
    onChange(selectedValues.filter((v) => v !== val));
  };

  // Determine label/tags to show
  const renderValueText = () => {
    if (selectedValues.length === 0) {
      return <span className="text-theme-text-dim">{placeholder}</span>;
    }

    // Map values back to their labels
    const selectedLabels = selectedValues
      .map((val) => options.find((opt) => opt.value === val)?.label)
      .filter(Boolean) as string[];

    if (selectedLabels.length <= 2) {
      return (
        <div className="flex flex-wrap gap-1.5 max-w-[320px] overflow-hidden">
          {selectedLabels.map((lbl, idx) => {
            const val = selectedValues[idx];
            return (
              <span
                key={val}
                className="bg-theme-accent text-white font-bold text-xs px-2 py-0.5 rounded flex items-center gap-1 shrink-0"
              >
                {lbl}
                <button
                  type="button"
                  onClick={(e) => handleRemoveValue(e, val)}
                  className="hover:text-slate-200 font-extrabold focus:outline-none text-[10px]"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      );
    } else {
      const shownLabels = selectedLabels.slice(0, 2);
      const remainingCount = selectedLabels.length - 2;
      return (
        <div className="flex items-center gap-1.5 overflow-hidden">
          {shownLabels.map((lbl, idx) => {
            const val = selectedValues[idx];
            return (
              <span
                key={val}
                className="bg-theme-accent text-white font-bold text-xs px-2 py-0.5 rounded flex items-center gap-1 shrink-0"
              >
                {lbl}
                <button
                  type="button"
                  onClick={(e) => handleRemoveValue(e, val)}
                  className="hover:text-slate-200 font-extrabold focus:outline-none text-[10px]"
                >
                  ✕
                </button>
              </span>
            );
          })}
          <span className="text-theme-text font-bold text-xs shrink-0">
            +{remainingCount}
          </span>
        </div>
      );
    }
  };

  const filteredOptionValues = filteredOptions.map((o) => o.value);
  const areAllFilteredSelected =
    filteredOptionValues.length > 0 &&
    filteredOptionValues.every((val) => selectedValues.includes(val));

  return (
    <div ref={containerRef} className={`relative select-none ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-theme-surface border border-theme-border px-3 py-1 rounded text-sm text-theme-text hover:border-theme-border/80 focus:border-theme-accent outline-none transition cursor-pointer font-medium flex items-center justify-between shadow-sm min-h-[38px] ${
          disabled ? "opacity-50 cursor-not-allowed bg-theme-base" : ""
        }`}
      >
        <div className="flex-1 overflow-hidden flex items-center">{renderValueText()}</div>
        <svg
          className={`h-4 w-4 text-theme-text-dim transition-transform duration-200 shrink-0 ml-2 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 mt-1 w-full bg-theme-surface border border-theme-border rounded-lg shadow-xl flex flex-col z-[1050] overflow-hidden min-w-[240px]">
          {/* Select/Unselect All */}
          <div className="px-3 py-2 border-b border-theme-border flex items-center bg-theme-base hover:bg-theme-surface-hover transition">
            <label className="flex items-center gap-2 text-xs font-semibold text-theme-text cursor-pointer w-full select-none">
              <input
                type="checkbox"
                checked={areAllFilteredSelected}
                onChange={handleSelectNoneAll}
                className="w-3.5 h-3.5 text-theme-accent border-slate-300 rounded focus:ring-theme-accent cursor-pointer"
              />
              <span>{areAllFilteredSelected ? "UnSelect All" : "Select All"}</span>
            </label>
          </div>

          {/* Search box */}
          <div className="p-2 border-b border-theme-border shrink-0 flex items-center gap-1.5 bg-theme-base">
            <span className="text-theme-text-dim text-xs pl-1">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Vehicle"
              className="w-full bg-transparent text-xs text-theme-text outline-none placeholder:text-theme-text-dim"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-theme-text-dim hover:text-theme-text text-xs pr-1 focus:outline-none"
              >
                ✕
              </button>
            )}
          </div>

          {/* Options list */}
          <div className="overflow-y-auto max-h-[200px] custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isChecked = selectedValues.includes(opt.value);
                return (
                  <div
                    key={opt.value}
                    onClick={() => handleToggleOption(opt.value)}
                    className="w-full text-left px-3 py-2 text-xs cursor-pointer transition hover:bg-theme-surface-hover flex items-center gap-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // handled by click on parent div
                      className="w-3.5 h-3.5 text-theme-accent border-slate-300 rounded focus:ring-theme-accent cursor-pointer"
                    />
                    <span className={`truncate text-theme-text-dim ${isChecked ? "font-semibold text-theme-text" : ""}`}>
                      {opt.label}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-2.5 text-xs text-theme-text-dim italic text-center">
                No results found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
