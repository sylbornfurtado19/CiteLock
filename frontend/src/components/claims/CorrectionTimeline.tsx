import React from "react";
import { RefreshCw, CheckCircle, ShieldAlert, Sparkles } from "lucide-react";
import { CorrectionRound } from "@/types";

export function CorrectionTimeline({
  draftText,
  finalText,
  rounds,
  isAbstained,
  correctionHistory = [],
}: {
  draftText: string;
  finalText: string;
  rounds: number;
  isAbstained: boolean;
  correctionHistory?: CorrectionRound[];
}) {
  const hasHistory = correctionHistory && correctionHistory.length > 0;

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

      <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-purple-500/60 before:via-violet-500/60 before:to-emerald-500/60 before:transition-all before:duration-500">
        {/* Stage 1: Raw Draft Stage */}
        <div className="relative animate-fade-in-up animation-delay-75">
          <div className="absolute -left-6 top-1 h-3 w-3 rounded-full bg-purple-900 border-2 border-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.5)] transition-transform duration-200 hover:scale-125" />
          <span className="text-xs font-mono text-purple-300">Stage 1: Raw Draft Generation</span>
          <div className="mt-1.5 p-3.5 rounded-xl border border-purple-900/35 bg-[#070311] text-xs text-[#B0A4C3] leading-relaxed hover:border-purple-500/30 transition-colors">
            {draftText}
          </div>
        </div>

        {/* Stage 2: Dynamic Correction Rounds */}
        {hasHistory ? (
          correctionHistory.map((roundItem, idx) => (
            <div
              key={roundItem.round || idx}
              className="relative animate-fade-in-up animation-delay-150"
            >
              <div className="absolute -left-6 top-1 h-3 w-3 rounded-full bg-amber-500 border-2 border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)] transition-transform duration-200 hover:scale-125" />
              <div className="flex items-center gap-1.5 text-xs font-mono text-amber-300">
                <RefreshCw className="h-3 w-3 animate-spin-reverse" />
                <span>
                  Stage 2.{roundItem.round}: Self-Correction Revision (Round {roundItem.round})
                </span>
              </div>
              <div className="mt-1 text-xs text-[#8D829F] space-y-1">
                <p>
                  Targeted {roundItem.targeted_claims?.length ?? roundItem.failed_count_before ?? 0} problematic
                  claim(s). Unresolved failures: {roundItem.failed_count_before ?? 0} &rarr;{" "}
                  {roundItem.failed_count_after ?? 0}.
                </p>
                {roundItem.revised_text && (
                  <div className="mt-1.5 p-3 rounded-lg border border-amber-500/25 bg-amber-950/20 text-[#E2D9F3] text-xs leading-relaxed">
                    {roundItem.revised_text}
                  </div>
                )}
              </div>
            </div>
          ))
        ) : rounds > 0 ? (
          <div className="relative animate-fade-in-up animation-delay-150">
            <div className="absolute -left-6 top-1 h-3 w-3 rounded-full bg-amber-500 border-2 border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)] transition-transform duration-200 hover:scale-125" />
            <div className="flex items-center gap-1.5 text-xs font-mono text-amber-300">
              <RefreshCw className="h-3 w-3" />
              <span>Stage 2: Claim Auditing & Bounded Correction</span>
            </div>
            <p className="mt-1 text-xs text-[#8D829F]">
              Executed {rounds} correction cycle{rounds === 1 ? "" : "s"} to excise hallucinations and align assertions with evidence.
            </p>
          </div>
        ) : (
          <div className="relative animate-fade-in-up animation-delay-150">
            <div className="absolute -left-6 top-1 h-3 w-3 rounded-full bg-emerald-500 border-2 border-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-transform duration-200 hover:scale-125" />
            <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-300">
              <Sparkles className="h-3 w-3" />
              <span>Stage 2: Single-Pass Verification Passed</span>
            </div>
            <p className="mt-1 text-xs text-[#8D829F]">
              No correction cycles required. All decomposed claims verified against evidence on initial pass.
            </p>
          </div>
        )}

        {/* Stage 3: Final Verified Answer */}
        <div className="relative animate-fade-in-up animation-delay-250">
          <div
            className={`absolute -left-6 top-1 h-3 w-3 rounded-full border-2 border-[#05020D] transition-transform duration-200 hover:scale-125 ${
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
            className={`mt-1.5 p-4 rounded-xl text-xs leading-relaxed transition-all duration-200 ${
              isAbstained
                ? "border border-rose-500/30 bg-rose-950/25 text-rose-200"
                : "border border-purple-500/30 bg-[#120B22] text-[#F5F0FF] shadow-[0_0_20px_rgba(139,92,246,0.15)] hover:border-purple-500/50"
            }`}
          >
            {finalText}
          </div>
        </div>
      </div>
    </div>
  );
}
