import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/Card';

interface CoverageChartProps {
  title: string;
  percentage: number;
  color?: string;
  subtitle?: string;
  onClick?: () => void;
}

export default function CoverageChart({ title, percentage, color = '#3b82f6', subtitle, onClick }: CoverageChartProps) {
  const data = [
    { name: 'Covered', value: percentage },
    { name: 'Remaining', value: Math.max(0, 100 - percentage) },
  ];

  return (
    <Card
      hoverable
      onClick={onClick}
      className={`p-6 flex flex-col h-full ${onClick ? 'cursor-pointer active:scale-[0.99]' : ''}`}
    >
      <h3 className="text-sm font-semibold text-theme-text-dim uppercase tracking-wider mb-2">{title}</h3>
      <div className="flex-1 relative min-h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="65%"
              outerRadius="85%"
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              stroke="none"
            >
              <Cell key="cell-0" fill={color} />
              <Cell key="cell-1" fill="var(--color-theme-elevated, #f1f5f9)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-3xl font-extrabold text-theme-text">{percentage}%</span>
          {subtitle && <span className="text-[10px] font-semibold text-theme-text-dim uppercase mt-1 tracking-wider">{subtitle}</span>}
        </div>
      </div>
    </Card>
  );
}
