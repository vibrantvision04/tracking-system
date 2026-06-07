import React from 'react';
import { Nfc } from 'lucide-react';

export default function RFIDCoverageCard({ percentage = 85 }: { percentage?: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col h-full justify-center">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
          <Nfc size={20} />
        </div>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">RFID Tag Coverage</h3>
      </div>
      
      <div className="flex items-end gap-2 mb-3">
        <span className="text-4xl font-extrabold text-slate-900 leading-none">{percentage}%</span>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Scanned Today</span>
      </div>

      <div className="w-full bg-slate-100 rounded-full h-2.5 mb-1 overflow-hidden">
        <div 
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-1000 ease-out" 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
