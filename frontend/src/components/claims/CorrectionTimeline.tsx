import React from "react";
import { RefreshCw, CheckCircle, ShieldAlert } from "lucide-react";

export function CorrectionTimeline({
  draftText,
  finalText,
  rounds,
  isAbstained,
}: {
  draftText: string;
  finalText: string;
  rounds: number;
  isAbstained: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Self-Correction Lifecycle
        </h4>
        <span className="text-xs font-mono text-emerald-400">
          {rounds} revision cycle{rounds === 1 ? "" : "s"}
        </span>
      </div>

      <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
        {/* Draft Stage */}
        <div className="relative">
          <div className="absolute -left-6 top-1 h-3 w-3 rounded-full bg-slate-600 border-2 border-slate-900" />
          <span className="text-xs font-mono text-slate-400">Stage 1: Raw Draft Generation</span>
          <div className="mt-1.5 p-3 rounded-lg border border-slate-800 bg-slate-950/40 text-xs text-slate-300">
            {draftText}
          </div>
        </div>

        {/* Correction Stage */}
        <div className="relative">
          <div className="absolute -left-6 top-1 h-3 w-3 rounded-full bg-amber-500 border-2 border-slate-900" />
          <div className="flex items-center gap-1.5 text-xs font-mono text-amber-400">
            <RefreshCw className="h-3 w-3" />
            <span>Stage 2: Claim Auditing & Bounded Correction</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Auditor verified atomic propositions against retrieved chunks and filtered hallucinated statements.
          </p>
        </div>

        {/* Final Verified Answer */}
        <div className="relative">
          <div
            className={`absolute -left-6 top-1 h-3 w-3 rounded-full border-2 border-slate-900 ${
              isAbstained ? "bg-red-500" : "bg-emerald-500"
            }`}
          />
          <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
            {isAbstained ? (
              <>
                <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                <span className="text-red-400">Stage 3: Abstention Fallback Applied</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                <span>Stage 3: Grounded Verified Final Output</span>
              </>
            )}
          </div>
          <div className="mt-1.5 p-3 rounded-lg border border-emerald-900/50 bg-emerald-950/20 text-xs text-emerald-100">
            {finalText}
          </div>
        </div>
      </div>
    </div>
  );
}
