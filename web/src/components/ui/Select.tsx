import React, { useId, useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';

interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: SelectOption[];
  placeholder?: string;
}

export default function Select({
  label,
  error,
  options,
  className = "",
  children,
  id,
  value,
  onChange,
  placeholder = "Select option...",
  disabled = false,
  ...props
}: SelectProps) {
  const reactId = useId();
  const generatedId = id || `select-${reactId}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number; openUp: boolean }>({
    top: 0, left: 0, width: 0, openUp: false,
  });

  useEffect(() => setMounted(true), []);

  // Position the portal menu relative to the trigger (escapes ancestor overflow)
  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const el = buttonRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const menuHeight = 300;
      const openUp = r.bottom + menuHeight > window.innerHeight && r.top > menuHeight;
      setMenuPos({
        top: openUp ? r.top - 6 : r.bottom + 6,
        left: r.left,
        width: r.width,
        openUp,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [isOpen]);

  // Convert children to options if options prop is not passed
  const parsedOptions = useMemo(() => {
    if (options) return options.map(opt => ({ value: String(opt.value), label: opt.label }));
    const opts: { value: string; label: string }[] = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        if (child.type === 'option') {
          const p = child.props as { value?: string | number; children?: React.ReactNode };
          opts.push({
            value: String(p.value ?? ''),
            label: typeof p.children === 'string' ? p.children : String(p.children ?? ''),
          });
        } else if (child.props && (child.props as any).children) {
          // Recursively find option children if wrapped in React Fragment or groups
          React.Children.forEach((child.props as any).children, (nestedChild) => {
            if (React.isValidElement(nestedChild) && nestedChild.type === 'option') {
              const np = nestedChild.props as { value?: string | number; children?: React.ReactNode };
              opts.push({
                value: String(np.value ?? ''),
                label: typeof np.children === 'string' ? np.children : String(np.children ?? ''),
              });
            }
          });
        }
      }
    });
    return opts;
  }, [options, children]);

  // Handle click outside to close the dropdown (menu lives in a portal, so
  // check both the trigger container and the menu itself).
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const t = event.target as Node;
      if (containerRef.current && containerRef.current.contains(t)) return;
      if (menuRef.current && menuRef.current.contains(t)) return;
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset search when opening/closing
  useEffect(() => {
    if (!isOpen) setSearch("");
  }, [isOpen]);

  const selectedValueStr = value !== undefined && value !== null ? String(value) : "";
  const selectedOption = parsedOptions.find(opt => opt.value === selectedValueStr);

  const filteredOptions = useMemo(() => {
    return parsedOptions.filter(opt => {
      // Don't search placeholder-like empty option (e.g. value="")
      if (search && !opt.value) return false;
      return opt.label.toLowerCase().includes(search.toLowerCase());
    });
  }, [parsedOptions, search]);

  const handleChange = (val: string) => {
    if (onChange) {
      const mockEvent = {
        target: {
          value: val,
          name: props.name || '',
          id: generatedId,
        },
        currentTarget: {
          value: val,
          name: props.name || '',
          id: generatedId,
        },
      } as unknown as React.ChangeEvent<HTMLSelectElement>;
      onChange(mockEvent);
    }
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="space-y-1.5 w-full relative select-none">
      {label && (
        <label
          htmlFor={generatedId}
          className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1 leading-none select-none"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <button
          id={generatedId}
          ref={buttonRef}
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full min-h-[38px] bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm text-theme-text hover:border-slate-350 focus:border-emerald-500 outline-none transition-all flex items-center justify-between cursor-pointer shadow-sm ${
            disabled ? "opacity-50 cursor-not-allowed bg-slate-50 text-slate-400" : ""
          } ${error ? "border-red-500 focus:ring-red-500/20" : ""} ${className}`}
        >
          <span className="truncate pr-2 font-medium">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-250 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && !disabled && mounted && createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              zIndex: 10050,
              transform: menuPos.openUp ? "translateY(-100%)" : undefined,
            }}
            className="bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col overflow-hidden min-w-[200px] animate-fade-in"
          >
            {/* Search Input Area */}
            <div className="p-2 border-b border-slate-100 shrink-0 flex items-center gap-2 bg-slate-50">
              <Search className="h-3.5 w-3.5 text-slate-400 ml-1" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full bg-transparent text-xs text-theme-text outline-none placeholder:text-slate-400 py-1"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-slate-400 hover:text-slate-600 text-xs pr-1 focus:outline-none"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Options List */}
            <div className="overflow-y-auto max-h-[200px] custom-scrollbar py-1">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt, idx) => (
                  <button
                    type="button"
                    key={`${opt.value}-${idx}`}
                    onClick={() => handleChange(opt.value)}
                    className={`w-full text-left px-3 py-2 text-xs cursor-pointer transition flex items-center justify-between ${
                      opt.value === selectedValueStr
                        ? 'bg-emerald-50 text-emerald-600 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.value === selectedValueStr && <span className="text-[10px] text-emerald-600">✓</span>}
                  </button>
                ))
              ) : (
                <div className="px-3 py-3.5 text-xs text-slate-400 italic text-center">
                  No results found
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}
