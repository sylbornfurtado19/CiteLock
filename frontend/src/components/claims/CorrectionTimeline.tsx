"use client";

import React, { useState } from "react";
import {
  RefreshCw,
  CheckCircle,
  ShieldAlert,
  Sparkles,
  GitCompare,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  FileWarning,
} from "lucide-react";
import { CorrectionRound, Claim } from "@/types";
import { WordDiffViewer, DiffViewMode } from "./WordDiffViewer";

export interface CorrectionTimelineProps {
  draftText: string;
  finalText: string;
  rounds: number;
  isAbstained: boolean;
  correctionHistory?: CorrectionRound[];
  createdAt?: string;
  claims?: Claim[];
}

export function CorrectionTimeline({
  draftText,
  finalText,
  rounds,
  isAbstained,
  correctionHistory = [],
  createdAt,
  claims = [],
}: CorrectionTimelineProps) {
  const hasHistory = Boolean(correctionHistory && correctionHistory.length > 0);
  const hasTextDelta = (draftText || "").trim() !== (finalText || "").trim();

  // Shared diff mode preference across all diff viewports in the timeline
  const [globalDiffMode, setGlobalDiffMode] = useState<DiffViewMode>("unified");

  // Accordion state for cumulative master delta
  const [showMasterDiff, setShowMasterDiff] = useState(hasTextDelta && rounds > 0);

  // Expanded rounds map (default: all rounds expanded)
  const [expandedRounds, setExpandedRounds] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    correctionHistory.forEach((r, idx) => {
      initial[r.round || idx + 1] = true;
    });
    return initial;
  });

  const toggleRound = (roundNum: number) => {
    setExpandedRounds((prev) => ({
      ...prev,
      [roundNum]: !prev[roundNum],
    }));
  };

  const formattedTimestamp = createdAt
    ? new Date(createdAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <div className="space-y-6">
      {/* Timeline Header with Global Diff Controls & Version Telemetry */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-2xl border border-purple-900/35 bg-[#0E071D]/80 shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2.5">
            <Layers className="h-4 w-4 text-purple-400" />
            <h4 className="text-sm font-semibold tracking-tight text-[#F5F0FF]">
              Self-Correction Lifecycle & Provenance Diff
            </h4>
          </div>
          <p className="text-xs text-[#B0A4C3] mt-0.5">
            Audit iterative revision stages, claim-level targeted excisions, and word-level text transformations.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {formattedTimestamp && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#8D829F] bg-purple-950/40 border border-purple-900/40 px-2.5 py-1 rounded-lg">
              <Clock className="h-3 w-3 text-purple-400" />
              {formattedTimestamp}
            </span>
          )}
          <span className="text-xs font-mono text-purple-300 bg-purple-950/80 border border-purple-500/35 px-3 py-1 rounded-lg shadow-[0_0_12px_rgba(139,92,246,0.2)]">
            {rounds} revision cycle{rounds === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* Cumulative Master Delta Card (Initial Draft v1.0 vs Final Output v2.0) */}
      {hasTextDelta && (
        <div className="rounded-2xl border border-purple-900/40 bg-[#0B0517]/90 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md overflow-hidden transition-all duration-200">
          <button
            type="button"
            onClick={() => setShowMasterDiff((prev) => !prev)}
            className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-purple-950/50 via-[#120924]/60 to-purple-950/50 hover:bg-purple-900/30 transition-colors text-left"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-950/80 border border-purple-500/30 text-purple-300">
                <GitCompare className="h-3.5 w-3.5" />
              </div>
              <div>
                <span className="text-xs font-semibold text-[#F5F0FF] block">
                  Cumulative Delta: Initial Draft (v1.0) &rarr; Final Verified Output (v2.0)
                </span>
                <span className="text-[11px] text-[#8D829F]">
                  Full text difference across all self-correction cycles
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-purple-300/80 hidden sm:inline">
                {showMasterDiff ? "Collapse Diff" : "Inspect Diff"}
              </span>
              {showMasterDiff ? (
                <ChevronUp className="h-4 w-4 text-purple-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-purple-400" />
              )}
            </div>
          </button>

          {showMasterDiff && (
            <div className="p-4 pt-2 border-t border-purple-900/30 bg-[#070210]/60 animate-fade-in">
              <WordDiffViewer
                beforeText={draftText}
                afterText={finalText}
                mode={globalDiffMode}
                onModeChange={setGlobalDiffMode}
                beforeLabel="v1.0 Initial Draft"
                afterLabel={isAbstained ? "v2.0 Abstention Fallback" : "v2.0 Verified Output"}
              />
            </div>
          )}
        </div>
      )}

      {/* Chronological Lifecycle Timeline Rail */}
      <div className="relative pl-7 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-purple-500/60 before:via-amber-500/60 before:to-emerald-500/60 before:transition-all before:duration-500">
        {/* Stage 1: Initial Draft Stage (v1.0) */}
        <div className="relative animate-fade-in-up animation-delay-75">
          <div className="absolute -left-7 top-1 h-3.5 w-3.5 rounded-full bg-purple-900 border-2 border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.6)] transition-transform duration-200 hover:scale-125" />
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-xs font-semibold text-purple-300">
              Stage 1: Raw Draft Generation
            </span>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-purple-950/80 border border-purple-500/30 text-purple-300 font-bold">
              v1.0
            </span>
          </div>
          <div className="p-3.5 rounded-xl border border-purple-900/40 bg-[#070311] text-xs text-[#B0A4C3] leading-relaxed hover:border-purple-500/30 transition-colors shadow-inner whitespace-pre-wrap break-words">
            {draftText}
          </div>
        </div>

        {/* Stage 2: Dynamic Self-Correction Rounds with Word-Level Diffs */}
        {hasHistory ? (
          correctionHistory.map((roundItem, idx) => {
            const roundNum = roundItem.round || idx + 1;
            const isExpanded = expandedRounds[roundNum] ?? true;
            const roundBefore = roundItem.draft_before || draftText;
            const roundAfter = roundItem.revised_text || finalText;

            return (
              <div
                key={roundNum}
                className="relative animate-fade-in-up animation-delay-150"
              >
                <div className="absolute -left-7 top-1 h-3.5 w-3.5 rounded-full bg-amber-500 border-2 border-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.6)] transition-transform duration-200 hover:scale-125" />
                
                {/* Round Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-amber-300">
                      <RefreshCw className="h-3 w-3" />
                      <span>Stage 2.{roundNum}: Self-Correction Revision</span>
                    </div>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 font-bold">
                      v1.{roundNum}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-[#8D829F]">
                      Failed Claims: {roundItem.failed_count_before ?? 0} &rarr;{" "}
                      <span className={roundItem.failed_count_after === 0 ? "text-emerald-400 font-bold" : "text-amber-300 font-bold"}>
                        {roundItem.failed_count_after ?? 0}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleRound(roundNum)}
                      className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="space-y-3 mt-2">
                    {/* Targeted Problematic Claims in this Round */}
                    {roundItem.targeted_claims && roundItem.targeted_claims.length > 0 && (
                      <div className="p-3 rounded-xl border border-amber-500/25 bg-amber-950/15 space-y-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-amber-300 font-semibold uppercase tracking-wider">
                          <FileWarning className="h-3.5 w-3.5 text-amber-400" />
                          <span>Targeted Claims Audited for Revision ({roundItem.targeted_claims.length}):</span>
                        </div>
                        <div className="space-y-1.5">
                          {roundItem.targeted_claims.map((claimText, cIdx) => (
                            <div
                              key={cIdx}
                              className="text-xs text-[#E2D9F3] bg-[#0A0414] border border-purple-900/35 p-2 rounded-lg flex items-start gap-2"
                            >
                              <span className="font-mono text-amber-400 shrink-0 text-[11px]">
                                [Claim {cIdx + 1}]:
                              </span>
                              <span className="italic leading-relaxed">
                                &ldquo;{claimText}&rdquo;
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Word-Level Diff View for this Round */}
                    <div className="p-3.5 rounded-xl border border-purple-900/40 bg-[#080312]/90 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#B0A4C3]">
                        <span>Round {roundNum} Text Transformation Diff:</span>
                        <span className="text-[#8D829F]">
                          Comparing Draft &rarr; Round {roundNum} Revision
                        </span>
                      </div>
                      <WordDiffViewer
                        beforeText={roundBefore}
                        afterText={roundAfter}
                        mode={globalDiffMode}
                        onModeChange={setGlobalDiffMode}
                        beforeLabel={`v1.${roundNum - 1} Draft`}
                        afterLabel={`v1.${roundNum} Revision`}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : rounds > 0 ? (
          /* Single Round summary fallback when detailed history records are sparse */
          <div className="relative animate-fade-in-up animation-delay-150">
            <div className="absolute -left-7 top-1 h-3.5 w-3.5 rounded-full bg-amber-500 border-2 border-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.6)]" />
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-amber-300">
                <RefreshCw className="h-3 w-3" />
                <span>Stage 2: Claim Auditing & Bounded Correction</span>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 font-bold">
                {rounds} Round{rounds === 1 ? "" : "s"}
              </span>
            </div>
            <p className="text-xs text-[#8D829F] mb-3">
              Executed {rounds} correction cycle{rounds === 1 ? "" : "s"} to excise ungrounded statements and align assertions strictly with retrieved passages.
            </p>
            <WordDiffViewer
              beforeText={draftText}
              afterText={finalText}
              mode={globalDiffMode}
              onModeChange={setGlobalDiffMode}
              beforeLabel="v1.0 Raw Draft"
              afterLabel="v2.0 Corrected Output"
            />
          </div>
        ) : (
          /* Single-Pass Verification Passed */
          <div className="relative animate-fade-in-up animation-delay-150">
            <div className="absolute -left-7 top-1 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.6)]" />
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Stage 2: Single-Pass Verification Confirmed</span>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-bold">
                Zero Revisions
              </span>
            </div>
            <p className="text-xs text-[#8D829F] p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/25">
              No correction cycles required. All decomposed atomic propositions were independently confirmed against retrieved reference passages on initial pass.
            </p>
          </div>
        )}

        {/* Stage 3: Grounded Verified Final Output (v2.0) */}
        <div className="relative animate-fade-in-up animation-delay-250">
          <div
            className={`absolute -left-7 top-1 h-3.5 w-3.5 rounded-full border-2 border-[#05020D] transition-transform duration-200 hover:scale-125 ${
              isAbstained
                ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.7)]"
                : "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.7)]"
            }`}
          />
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-mono">
              {isAbstained ? (
                <>
                  <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
                  <span className="text-rose-400 font-semibold">Stage 3: Honest Abstention Fallback</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-300 font-semibold">Stage 3: Grounded Verified Final Output</span>
                </>
              )}
            </div>
            <span
              className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold ${
                isAbstained
                  ? "bg-rose-950/80 border border-rose-500/40 text-rose-300"
                  : "bg-emerald-950/80 border border-emerald-500/40 text-emerald-300"
              }`}
            >
              {rounds > 0 ? "v2.0" : "v1.0"}
            </span>
          </div>

          <div
            className={`p-4 rounded-xl text-xs leading-relaxed transition-all duration-200 whitespace-pre-wrap break-words ${
              isAbstained
                ? "border border-rose-500/35 bg-rose-950/25 text-rose-200 shadow-[0_0_16px_rgba(244,63,94,0.15)]"
                : "border border-emerald-500/35 bg-[#0C1518]/80 text-[#F5F0FF] shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:border-emerald-500/55"
            }`}
          >
            {finalText}
          </div>
        </div>
      </div>
    </div>
  );
}
