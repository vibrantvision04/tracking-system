"use client";
import { useParams } from "next/navigation";

export default function IswmPlaceholderPage() {
  const params = useParams();
  const slug = params.slug;
  const path = Array.isArray(slug) ? slug.join("/") : slug;

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-indigo-500/[.1] flex items-center justify-center text-indigo-400 text-3xl mb-6">
        🚧
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">Feature Under Construction</h1>
      <p className="text-slate-400 mb-6 max-w-md">
        The page for <span className="text-indigo-400 font-mono">/iswm/{path}</span> is currently being developed as part of the system conversion.
      </p>
      <div className="text-xs text-slate-600 uppercase tracking-wider">
        ISWM Jaipur Heritage
      </div>
    </div>
  );
}
