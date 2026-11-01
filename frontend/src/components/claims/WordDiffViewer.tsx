"use client";

import React, { useMemo, useState } from "react";
import { diffWordsWithSpace, Change } from "diff";
import { Columns, SplitSquareVertical, Plus, Minus, Equal, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DiffViewMode = "unified" | "split";

export interface WordDiffViewerProps {
  beforeText: string;
  afterText: string;
  defaultMode?: DiffViewMode;
  mode?: DiffViewMode;
  onModeChange?: (mode: DiffViewMode) => void;
  showModeToggle?: boolean;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}

export function WordDiffViewer({
  beforeText,
  afterText,
  defaultMode = "unified",
  mode: controlledMode,
  onModeChange,
  showModeToggle = true,
  beforeLabel = "Original Draft",
  afterLabel = "Revised Output",
  className = "",
}: WordDiffViewerProps) {
  const [internalMode, setInternalMode] = useState<DiffViewMode>(defaultMode);
  const currentMode = controlledMode !== undefined ? controlledMode : internalMode;

  const handleModeToggle = (nextMode: DiffViewMode) => {
    if (controlledMode === undefined) {
      setInternalMode(nextMode);
    }
    if (onModeChange) {
      onModeChange(nextMode);
    }
  };

  // Compute word-level diff and statistics
  const { changes, stats, isIdentical } = useMemo(() => {
    const rawChanges: Change[] = diffWordsWithSpace(beforeText || "", afterText || "");

    let addedWords = 0;
    let removedWords = 0;
    let unchangedWords = 0;

    rawChanges.forEach((part) => {
      // Split non-whitespace words for accurate word metrics
      const wordCount = (part.value.match(/\S+/g) || []).length;
      if (part.added) {
        addedWords += wordCount;
      } else if (part.removed) {
        removedWords += wordCount;
      } else {
        unchangedWords += wordCount;
      }
    });

    const identical = beforeText.trim() === afterText.trim();

    return {
      changes: rawChanges,
      stats: {
        addedWords,
        removedWords,
        unchangedWords,
      },
      isIdentical: identical,
    };
  }, [beforeText, afterText]);

  if (isIdentical) {
    return (
      <div className={`rounded-xl border border-purple-900/30 bg-[#0A0516]/80 p-4 text-xs text-[#8D829F] ${className}`}>
        <div className="flex items-center gap-2 text-purple-300 mb-2 font-mono">
          <Check className="h-3.5 w-3.5 text-emerald-400" />
          <span>No textual modifications between versions</span>
        </div>
        <div className="p-3 rounded-lg bg-[#06020E] border border-purple-900/20 text-[#B0A4C3] leading-relaxed whitespace-pre-wrap break-words">
          {afterText || beforeText}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Diff Controls Header & Statistics Capsule */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-1">
        {/* Statistics Capsule */}
        <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
          <span className="text-[#8D829F]">Delta:</span>
          {stats.addedWords > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-500/35 text-emerald-300 font-semibold shadow-[0_0_8px_rgba(16,185,129,0.15)]">
              <Plus className="h-3 w-3" />
              {stats.addedWords} word{stats.addedWords === 1 ? "" : "s"} added
            </span>
          )}
          {stats.removedWords > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/70 border border-rose-500/35 text-rose-300 font-semibold shadow-[0_0_8px_rgba(244,63,94,0.15)]">
              <Minus className="h-3 w-3" />
              {stats.removedWords} word{stats.removedWords === 1 ? "" : "s"} removed
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#130B22] border border-purple-900/35 text-[#8D829F]">
            <Equal className="h-3 w-3" />
            {stats.unchangedWords} unchanged
          </span>
        </div>

        {/* View Mode Toggle */}
        {showModeToggle && (
          <div className="flex items-center rounded-xl bg-[#080312] border border-purple-900/40 p-0.5 shadow-inner self-start sm:self-auto">
            <button
              type="button"
              onClick={() => handleModeToggle("unified")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg font-mono transition-all duration-150 ${
                currentMode === "unified"
                  ? "bg-purple-900/80 text-purple-200 border border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.3)] font-semibold"
                  : "text-[#8D829F] hover:text-white hover:bg-purple-950/30"
              }`}
            >
              <SplitSquareVertical className="h-3 w-3" />
              Unified
            </button>
            <button
              type="button"
              onClick={() => handleModeToggle("split")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg font-mono transition-all duration-150 ${
                currentMode === "split"
                  ? "bg-purple-900/80 text-purple-200 border border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.3)] font-semibold"
                  : "text-[#8D829F] hover:text-white hover:bg-purple-950/30"
              }`}
            >
              <Columns className="h-3 w-3" />
              Side-by-Side
            </button>
          </div>
        )}
      </div>

      {/* Render Mode 1: Unified Inline Diff */}
      {currentMode === "unified" && (
        <div className="rounded-xl border border-purple-900/40 bg-[#080312]/90 p-4 text-xs leading-relaxed font-sans shadow-inner backdrop-blur-md whitespace-pre-wrap break-words">
          {changes.map((part, index) => {
            if (part.added) {
              return (
                <span
                  key={index}
                  className="bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 rounded px-1 py-0.5 mx-0.5 font-medium shadow-[0_0_8px_rgba(16,185,129,0.2)] selection:bg-emerald-700 selection:text-white"
                  title="Added in revision"
                >
                  {part.value}
                </span>
              );
            }
            if (part.removed) {
              return (
                <span
                  key={index}
                  className="bg-rose-950/80 text-rose-300 border border-rose-500/40 rounded px-1 py-0.5 mx-0.5 line-through decoration-rose-400 decoration-2 selection:bg-rose-900 selection:text-white opacity-85 hover:opacity-100 transition-opacity"
                  title="Removed in revision"
                >
                  {part.value}
                </span>
              );
            }
            return (
              <span key={index} className="text-[#E2D9F3]">
                {part.value}
              </span>
            );
          })}
        </div>
      )}

      {/* Render Mode 2: Side-by-Side Comparison Panes */}
      {currentMode === "split" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left Pane: Original Draft with Removals Highlighted */}
          <div className="rounded-xl border border-rose-900/30 bg-[#0A0414]/90 p-3.5 space-y-2 shadow-inner">
            <div className="flex items-center justify-between border-b border-rose-900/30 pb-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-rose-300 font-semibold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]" />
                {beforeLabel}
              </span>
              <span className="text-[10px] font-mono text-rose-400/90 bg-rose-950/50 px-2 py-0.5 rounded border border-rose-500/25">
                -{stats.removedWords} words excised
              </span>
            </div>
            <div className="text-xs leading-relaxed whitespace-pre-wrap break-words min-h-[90px] pt-1">
              {changes.map((part, index) => {
                if (part.added) {
                  // Omit additions from original draft pane
                  return null;
                }
                if (part.removed) {
                  return (
                    <span
                      key={index}
                      className="bg-rose-950/80 text-rose-300 border border-rose-500/40 rounded px-1 py-0.5 mx-0.5 line-through decoration-rose-400 decoration-2"
                      title="Removed statement"
                    >
                      {part.value}
                    </span>
                  );
                }
                return (
                  <span key={index} className="text-[#C4B7DB]">
                    {part.value}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Right Pane: Revised Output with Additions Highlighted */}
          <div className="rounded-xl border border-emerald-900/30 bg-[#050D12]/90 p-3.5 space-y-2 shadow-inner">
            <div className="flex items-center justify-between border-b border-emerald-900/30 pb-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-300 font-semibold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                {afterLabel}
              </span>
              <span className="text-[10px] font-mono text-emerald-400/90 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/25">
                +{stats.addedWords} words inserted
              </span>
            </div>
            <div className="text-xs leading-relaxed whitespace-pre-wrap break-words min-h-[90px] pt-1">
              {changes.map((part, index) => {
                if (part.removed) {
                  // Omit removals from revised pane
                  return null;
                }
                if (part.added) {
                  return (
                    <span
                      key={index}
                      className="bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 rounded px-1 py-0.5 mx-0.5 font-medium shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                      title="Added grounded assertion"
                    >
                      {part.value}
                    </span>
                  );
                }
                return (
                  <span key={index} className="text-[#C4B7DB]">
                    {part.value}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

