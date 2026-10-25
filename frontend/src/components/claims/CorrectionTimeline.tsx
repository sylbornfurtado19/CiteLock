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
        <h4 className="text-sm font-semibold uppercase tracking-wider text-[#B0A4C3] font-mono">
          Self-Correction Lifecycle
        </h4>
        <span className="text-xs font-mono text-purple-300 bg-purple-950/60 border border-purple-500/30 px-3 py-0.5 rounded-full shadow-[0_0_10px_rgba(139,92,246,0.2)]">
          {rounds} revision cycle{rounds === 1 ? "" : "s"}
        </span>
      </div>

      <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-purple-500/60 before:via-violet-500/60 before:to-emerald-500/60">
        {/* Draft Stage */}
        <div className="relative">
          <div className="absolute -left-6 top-1 h-3 w-3 rounded-full bg-purple-900 border-2 border-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
          <span className="text-xs font-mono text-purple-300">Stage 1: Raw Draft Generation</span>
          <div className="mt-1.5 p-3.5 rounded-xl border border-purple-900/35 bg-[#070311] text-xs text-[#B0A4C3] leading-relaxed">
            {draftText}
          </div>
        </div>

        {/* Correction Stage */}
        <div className="relative">
          <div className="absolute -left-6 top-1 h-3 w-3 rounded-full bg-amber-500 border-2 border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
          <div className="flex items-center gap-1.5 text-xs font-mono text-amber-300">
            <RefreshCw className="h-3 w-3" />
            <span>Stage 2: Claim Auditing & Bounded Correction</span>
          </div>
          <p className="mt-1 text-xs text-[#8D829F]">
            Auditor verified atomic propositions against retrieved chunks and filtered hallucinated statements.
          </p>
        </div>

        {/* Final Verified Answer */}
        <div className="relative">
          <div
            className={`absolute -left-6 top-1 h-3 w-3 rounded-full border-2 border-[#05020D] ${
              isAbstained
                ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"
                : "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
            }`}
          />
          <div className="flex items-center gap-1.5 text-xs font-mono text-purple-300">
            {isAbstained ? (
              <>
                <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
                <span className="text-rose-400 font-semibold">Stage 3: Abstention Fallback Applied</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-300 font-semibold">Stage 3: Grounded Verified Final Output</span>
              </>
            )}
          </div>
          <div
            className={`mt-1.5 p-4 rounded-xl text-xs leading-relaxed ${
              isAbstained
                ? "border border-rose-500/30 bg-rose-950/25 text-rose-200"
                : "border border-purple-500/30 bg-[#120B22] text-[#F5F0FF] shadow-[0_0_20px_rgba(139,92,246,0.15)]"
            }`}
          >
            {finalText}
          </div>
        </div>
      </div>
    </div>
  );
}
