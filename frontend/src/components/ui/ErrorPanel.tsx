"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorPanelProps {
  title?: string;
  description?: string;
  /** Opaque Next.js error id; safe to show so a failure can be matched to server logs. */
  digest?: string;
  onRetry?: () => void;
  /** Fill the whole viewport (used by the root-level boundaries). */
  fullScreen?: boolean;
}

/** Shared failure screen for route error boundaries. Never renders the raw error message or stack. */
export function ErrorPanel({
  title = "Something went wrong",
  description = "This page hit an unexpected error. Your data is safe. Try again, or head back to the dashboard.",
  digest,
  onRetry,
  fullScreen = false,
}: ErrorPanelProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-4 p-8 text-center ${fullScreen ? "min-h-screen bg-[#05020D]" : "min-h-[50vh]"}`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-950/40 text-rose-300 shadow-[0_0_24px_rgba(244,63,94,0.2)]">
        <AlertTriangle className="h-7 w-7" aria-hidden />
      </div>
      <div className="max-w-md space-y-1.5">
        <h2 className="text-lg font-bold text-[#F5F0FF]">{title}</h2>
        <p className="text-sm leading-relaxed text-[#B0A4C3]">{description}</p>
        {digest && <p className="font-mono text-[11px] text-[#7B708F]">Reference: {digest}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-[0_0_16px_rgba(147,51,234,0.35)] transition-all hover:from-purple-500 hover:to-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 active:scale-95"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Try again
          </button>
        )}
        <Link
          href="/dashboard"
          className="rounded-xl border border-purple-500/30 bg-purple-950/40 px-4 py-2 text-sm text-purple-200 transition-colors hover:bg-purple-900/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
