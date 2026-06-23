import React from 'react';
import { Nfc } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export default function RFIDCoverageCard({ percentage = 85 }: { percentage?: number }) {
  return (
    <Card hoverable className="p-6 flex flex-col h-full justify-center relative overflow-hidden">
      <div className="flex items-center gap-3.5 mb-5 z-10">
        <div className="p-2.5 bg-[#10B981]/10 text-[#10B981] rounded-full border border-[#10B981]/20 flex items-center justify-center shrink-0">
          <Nfc size={18} />
        </div>
        <h3 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider leading-none">RFID Tag Coverage</h3>
      </div>
      
      <div className="flex items-end gap-2 mb-3 z-10">
        <span className="text-4xl font-extrabold text-theme-text leading-none">{percentage}%</span>
        <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1">Scanned Today</span>
      </div>

      <div className="w-full bg-theme-elevated rounded-full h-2.5 mb-1 overflow-hidden z-10">
        <div 
          className="bg-[#10B981] h-2.5 rounded-full transition-all duration-1000 ease-out" 
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Subtle red wave decoration at the bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-6 pointer-events-none opacity-20 select-none overflow-hidden">
        <svg viewBox="0 0 120 28" className="w-full h-full text-[#10B981]" fill="none" preserveAspectRatio="none">
          <path 
            d="M0 18 C 30 18, 40 4, 70 4 C 100 4, 110 22, 120 22" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round"
          />
        </svg>
      </div>
    </Card>
  );
}
