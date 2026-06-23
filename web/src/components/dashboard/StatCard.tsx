import React from 'react';
import { Card } from '@/components/ui/Card';

interface StatCardProps {
  title: string;
  value: string | number;
  secondaryText?: string;
  icon?: React.ReactNode;
  accentColor?: 'blue' | 'emerald' | 'amber' | 'slate';
  onClick?: () => void;
}

export default function StatCard({ title, value, secondaryText, icon, accentColor = 'blue', onClick }: StatCardProps) {
  return (
    <Card 
      hoverable 
      className={`p-6 flex flex-col justify-between h-full group relative overflow-hidden ${onClick ? 'cursor-pointer hover:border-[#10B981]/60' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3.5 mb-4 z-10">
        {icon && (
          <div className="p-3 bg-[#10B981]/10 text-[#10B981] rounded-full border border-[#10B981]/20 transition-transform duration-300 group-hover:scale-110 flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
        <h3 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider leading-none">{title}</h3>
      </div>
      
      <div className="z-10 mt-auto">
        <div className="text-4xl font-extrabold text-theme-text tracking-tight leading-none">{value}</div>
        {secondaryText && (
          <div className="text-[11px] font-bold text-theme-text-dim mt-2.5 uppercase tracking-wider">{secondaryText}</div>
        )}
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
