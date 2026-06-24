"use client";

export function CardSkeleton({ height = "h-32" }: { height?: string }) {
  return (
    <div className={`${height} rounded-2xl border border-slate-200/60 bg-white p-5 flex flex-col gap-3 animate-pulse`}>
      <div className="h-3 w-24 bg-slate-200 rounded-full" />
      <div className="h-7 w-16 bg-slate-200 rounded-lg mt-1" />
      <div className="h-2.5 w-32 bg-slate-100 rounded-full mt-auto" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="h-[280px] rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white/95 to-slate-50/50 p-5 flex flex-col gap-4 animate-pulse">
      <div className="space-y-2">
        <div className="h-2.5 w-36 bg-slate-200 rounded-full" />
        <div className="h-2 w-24 bg-slate-100 rounded-full" />
      </div>
      <div className="flex-1 flex items-end gap-2 px-2 pb-2">
        <div className="flex-1 h-3/4 bg-slate-200 rounded-t-lg" />
        <div className="flex-1 h-1/2 bg-slate-100 rounded-t-lg" />
        <div className="flex-1 h-2/3 bg-slate-200 rounded-t-lg" />
        <div className="flex-1 h-full bg-slate-100 rounded-t-lg" />
        <div className="flex-1 h-3/5 bg-slate-200 rounded-t-lg" />
        <div className="flex-1 h-4/5 bg-slate-100 rounded-t-lg" />
        <div className="flex-1 h-1/3 bg-slate-200 rounded-t-lg" />
      </div>
    </div>
  );
}

export function MapSkeleton() {
  return (
    <div className="flex-1 rounded-3xl border border-slate-200/80 bg-white flex flex-col items-center justify-center gap-3 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-slate-200" />
      <div className="h-3 w-44 bg-slate-200 rounded-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-10 bg-slate-200 rounded-xl" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-slate-100 rounded-xl" />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-6 animate-pulse">
      <div className="h-7 w-48 bg-slate-200 rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <ChartSkeleton />
    </div>
  );
}