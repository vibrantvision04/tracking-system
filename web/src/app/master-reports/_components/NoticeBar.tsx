"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";

// ─── Component ──────────────────────────────────────────────────────────────
//
// Task 19.8: `<NoticeBar>` is the desktop-only-in-v1 viewport notice
// (Req 13.2). It renders a small banner above the four primary regions
// whenever the viewport width drops below the desktop threshold so the
// user understands that horizontal scrolling may be needed to reach every
// control. Above the threshold the banner is invisible (Req 13.1 — no
// rearranging, no clipping).
//
// The breakpoint mirrors the spec's 1280-pixel cutoff. We detect changes
// with `window.matchMedia` so the banner toggles live during window
// resizes without needing a debounced resize handler.
//
// SSR safety: `window` is undefined during server render, so the
// component returns `null` until it mounts on the client (`mounted`
// flag). This matches Next.js best practice for media-query-driven UI
// and prevents hydration mismatches.

// Req 13.1 / 13.2: viewport widths < 1280px are treated as "narrow".
const NARROW_QUERY = "(max-width: 1279px)";

export default function NoticeBar() {
  const [mounted, setMounted] = useState<boolean>(false);
  const [isNarrow, setIsNarrow] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);

    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mql = window.matchMedia(NARROW_QUERY);
    setIsNarrow(mql.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsNarrow(e.matches);
    };

    // Older Safari (<14) only exposes `addListener`/`removeListener`; modern
    // browsers expose `addEventListener`. Prefer the modern API when present.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handleChange);
      return () => mql.removeEventListener("change", handleChange);
    }

    // Fallback for older browsers.
    mql.addListener(handleChange);
    return () => mql.removeListener(handleChange);
  }, []);

  // Hidden during SSR and on wide viewports.
  if (!mounted || !isNarrow) {
    return null;
  }

  return (
    <div
      id="master-reports-notice"
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-amber-200 bg-amber-50 shadow-sm px-4 py-3 flex items-start gap-3"
    >
      <div className="shrink-0 mt-0.5">
        <Info size={16} className="text-amber-600" />
      </div>
      <p className="text-xs font-semibold text-amber-800 leading-relaxed">
        This page is optimized for desktop. Some columns may scroll horizontally on smaller screens.
      </p>
    </div>
  );
}
