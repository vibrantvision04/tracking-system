import React from 'react';
import { Nfc } from 'lucide-react';

export default function RFIDCoverageCard({ percentage = 85 }: { percentage?: number }) {
  return (
    <div className="p-5 rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white/95 to-slate-50/50 flex flex-col h-full justify-between shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 group relative overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-3.5 z-10">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
          RFID Tag Coverage
        </h3>
        <div className="w-9 h-9 rounded-xl border border-emerald-200/40 bg-emerald-100/70 text-emerald-600 flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 shadow-sm">
          <Nfc size={16} />
        </div>
      </div>
      
      <div className="z-10 mt-auto flex flex-col">
        <div className="flex items-baseline gap-2 mb-3.5">
          <span className="text-3xl font-black text-slate-800 tracking-tight leading-none font-sans">
            {percentage}%
          </span>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">
            Bins Monitored
          </span>
        </div>

        <div className="w-full bg-slate-100/80 rounded-full h-3 overflow-hidden border border-slate-200/20 p-[2px]">
          <div 
            className="bg-gradient-to-r from-emerald-400 to-[#10B981] h-full rounded-full transition-all duration-1000 ease-out shadow-sm" 
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Decorative gradient overlay */}
      <div className="absolute -bottom-10 -right-10 w-24 h-24 rounded-full filter blur-xl opacity-10 transition-opacity duration-300 group-hover:opacity-20 pointer-events-none bg-emerald-500" />
    </div>
  );
}

