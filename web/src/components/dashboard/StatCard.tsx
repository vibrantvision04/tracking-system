import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  secondaryText?: string;
  icon?: React.ReactNode;
  accentColor?: 'blue' | 'emerald' | 'amber' | 'slate';
  onClick?: () => void;
}

export default function StatCard({ 
  title, 
  value, 
  secondaryText, 
  icon, 
  accentColor = 'blue', 
  onClick 
}: StatCardProps) {
  
  // Custom color theme mapping for premium gradients and glows
  const theme = {
    blue: {
      bg: 'bg-gradient-to-br from-blue-50/70 via-indigo-50/30 to-white',
      border: 'hover:border-blue-300 border-slate-200/60',
      iconBg: 'bg-blue-100/70 text-blue-600 border-blue-200/40',
      glow: 'group-hover:shadow-blue-500/10'
    },
    emerald: {
      bg: 'bg-gradient-to-br from-emerald-50/70 via-teal-50/30 to-white',
      border: 'hover:border-emerald-300 border-slate-200/60',
      iconBg: 'bg-emerald-100/70 text-emerald-600 border-emerald-200/40',
      glow: 'group-hover:shadow-emerald-500/10'
    },
    amber: {
      bg: 'bg-gradient-to-br from-amber-50/70 via-orange-50/30 to-white',
      border: 'hover:border-amber-300 border-slate-200/60',
      iconBg: 'bg-amber-100/70 text-amber-600 border-amber-200/40',
      glow: 'group-hover:shadow-amber-500/10'
    },
    slate: {
      bg: 'bg-gradient-to-br from-slate-50/70 via-slate-100/30 to-white',
      border: 'hover:border-slate-300 border-slate-200/60',
      iconBg: 'bg-slate-100/70 text-slate-600 border-slate-200/40',
      glow: 'group-hover:shadow-slate-500/10'
    }
  }[accentColor];

  return (
    <div 
      onClick={onClick}
      className={`p-5 rounded-2xl border ${theme.border} ${theme.bg} flex flex-col justify-between h-full min-h-[140px] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${theme.glow} group relative overflow-hidden ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between gap-3 mb-3.5 z-10">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{title}</h3>
        {icon && (
          <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${theme.iconBg} transition-transform duration-300 group-hover:scale-110 shadow-sm`}>
            {icon}
          </div>
        )}
      </div>
      
      <div className="z-10 mt-auto">
        <div className="text-3xl font-black text-slate-800 tracking-tight leading-none font-sans">{value}</div>
        {secondaryText && (
          <div className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-wider leading-none">{secondaryText}</div>
        )}
      </div>

      {/* Decorative gradient overlay */}
      <div className={`absolute -bottom-10 -right-10 w-24 h-24 rounded-full filter blur-xl opacity-10 transition-opacity duration-300 group-hover:opacity-20 pointer-events-none ${
        accentColor === 'blue' ? 'bg-blue-500' :
        accentColor === 'emerald' ? 'bg-emerald-500' :
        accentColor === 'amber' ? 'bg-amber-500' : 'bg-slate-500'
      }`} />
    </div>
  );
}
