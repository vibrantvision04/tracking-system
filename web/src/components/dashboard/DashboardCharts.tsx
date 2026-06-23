"use client";

import React from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Legend
} from 'recharts';

const weeklyTonnageData = [
  { day: 'Mon', Tonnage: 12.4, Trips: 14 },
  { day: 'Tue', Tonnage: 15.8, Trips: 18 },
  { day: 'Wed', Tonnage: 14.2, Trips: 16 },
  { day: 'Thu', Tonnage: 18.5, Trips: 21 },
  { day: 'Fri', Tonnage: 16.9, Trips: 19 },
  { day: 'Sat', Tonnage: 19.1, Trips: 22 },
  { day: 'Sun', Tonnage: 8.5, Trips: 10 },
];

const fleetActivityData = [
  { time: '06:00', Active: 3, Offline: 4, Idle: 0 },
  { time: '09:00', Active: 7, Offline: 0, Idle: 0 },
  { time: '12:00', Active: 6, Offline: 0, Idle: 1 },
  { time: '15:00', Active: 5, Offline: 1, Idle: 1 },
  { time: '18:00', Active: 4, Offline: 2, Idle: 1 },
  { time: '21:00', Active: 2, Offline: 5, Idle: 0 },
];

export default function DashboardCharts() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
      {/* Fleet Activity Trend (Area Chart) */}
      <div className="p-5 rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white/95 to-slate-50/50 flex flex-col h-[280px] shadow-sm hover:shadow-lg transition-all duration-300">
        <div className="flex flex-col gap-1 mb-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Fleet Activity Profile</h3>
          <span className="text-[9px] font-bold text-[#10B981] uppercase tracking-wider mt-0.5 leading-none">
            Real-time status over last 24h
          </span>
        </div>
        
        <div className="flex-1 w-full text-[10px] font-semibold">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={fleetActivityData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="activeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="idleGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="time" stroke="#94A3B8" fontSize={9} />
              <YAxis stroke="#94A3B8" fontSize={9} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                  border: '1px solid #E2E8F0', 
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                  fontFamily: 'sans-serif'
                }}
              />
              <Legend verticalAlign="top" height={24} iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 'bold' }} />
              <Area type="monotone" dataKey="Active" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#activeGrad)" />
              <Area type="monotone" dataKey="Idle" stroke="#F59E0B" strokeWidth={2} fillOpacity={1} fill="url(#idleGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weekly Garbage Tonnage (Bar Chart) */}
      <div className="p-5 rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white/95 to-slate-50/50 flex flex-col h-[280px] shadow-sm hover:shadow-lg transition-all duration-300">
        <div className="flex flex-col gap-1 mb-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Weekly Garbage Collection</h3>
          <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider mt-0.5 leading-none">
            Tonnage & completed trips breakdown
          </span>
        </div>
        
        <div className="flex-1 w-full text-[10px] font-semibold">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyTonnageData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="day" stroke="#94A3B8" fontSize={9} />
              <YAxis stroke="#94A3B8" fontSize={9} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                  border: '1px solid #E2E8F0', 
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                  fontFamily: 'sans-serif'
                }}
              />
              <Legend verticalAlign="top" height={24} iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 'bold' }} />
              <Bar dataKey="Tonnage" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={20} name="Tons" />
              <Bar dataKey="Trips" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={20} name="Trips" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
