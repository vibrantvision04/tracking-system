"use client";
import React, { createContext, useContext, useState, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "primary";
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setOptions(opts);
      setIsOpen(true);
      resolveRef.current = resolve;
    });
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
  };

  const handleConfirm = () => {
    setIsOpen(false);
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {isOpen && options && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in select-none">
          <div 
            className="w-full max-w-md bg-white/95 border border-slate-200 rounded-[20px] shadow-2xl p-6 flex flex-col space-y-4 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${
                  options.variant === "danger" 
                    ? "bg-rose-50 text-rose-500 border border-rose-100" 
                    : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                }`}>
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <h3 className="text-base font-black text-slate-800 tracking-tight leading-none pt-0.5">
                  {options.title || "Confirm Action"}
                </h3>
              </div>
              <button 
                onClick={handleCancel}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <p className="text-xs font-semibold text-slate-500 leading-relaxed">
              {options.message}
            </p>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 min-h-[38px] bg-slate-100 hover:bg-slate-200 text-slate-650 font-bold text-xs px-4 rounded-[12px] transition cursor-pointer"
              >
                {options.cancelText || "Cancel"}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className={`flex-1 min-h-[38px] text-white font-bold text-xs px-4 rounded-[12px] transition cursor-pointer ${
                  options.variant === "danger" 
                    ? "bg-red-600 hover:bg-red-750 shadow-md shadow-red-600/10" 
                    : "bg-theme-accent hover:bg-theme-accent-hover shadow-md shadow-emerald-600/10"
                }`}
              >
                {options.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context.confirm;
}
