"use client";
import { useParams } from "next/navigation";

export default function SwiftPlaceholderPage() {
  const params = useParams();
  const slug = params.slug;
  const path = Array.isArray(slug) ? slug.join("/") : slug;

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-theme-surface-hover flex items-center justify-center text-theme-accent text-3xl mb-6">
        🚧
      </div>
      <h1 className="text-2xl font-bold text-theme-text mb-2">Feature Under Construction</h1>
      <p className="text-theme-text-dim mb-6 max-w-md">
        The page for <span className="text-theme-accent font-mono">/swift/{path}</span> is currently being developed as part of the system conversion.
      </p>
      <div className="text-xs text-theme-text-dim uppercase tracking-wider">
        SWIFT Jaipur
      </div>
    </div>
  );
}
