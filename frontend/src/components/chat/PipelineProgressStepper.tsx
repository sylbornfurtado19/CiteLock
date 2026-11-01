"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  Loader2,
  XCircle,
  Circle,
  ChevronDown,
  ChevronUp,
  Cpu,
  ShieldCheck,
  Search,
  FileCheck2,
  GitBranch,
  RefreshCw,
} from "lucide-react";
import { PipelineStage, PipelineEvent } from "@/types/pipeline";

interface StageConfig {
  id: PipelineStage;
  label: string;
  shortDesc: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STAGES: StageConfig[] = [
  {
    id: "retrieval",
    label: "Passages Retrieval",
    shortDesc: "Dense vector search across indexed document embeddings in pgvector",
    icon: Search,
  },
  {
    id: "generation",
    label: "Grounded Synthesis",
    shortDesc: "Context-conditioned draft answer generation from evidence chunks",
    icon: Cpu,
  },
  {
    id: "decomposition",
    label: "Claim Decomposition",
    shortDesc: "Semantic extraction into atomic, verifiable factual claims",
    icon: GitBranch,
  },
  {
    id: "verification",
    label: "Multi-Pass Verification",
    shortDesc: "Natural language inference checking each claim against source text",
    icon: FileCheck2,
  },
  {
    id: "correction",
    label: "Self-Correction",
    shortDesc: "Hallucination correction loop revising ungrounded or contradicted claims",
    icon: RefreshCw,
  },
  {
    id: "finalizing",
    label: "Audit Finalization",
    shortDesc: "Persisting citation anchors, verdicts, and immutable audit trail",
    icon: ShieldCheck,
  },
];

const STAGE_ORDER: PipelineStage[] = [
  "retrieval",
  "generation",
  "decomposition",
  "verification",
  "correction",
  "finalizing",
];

interface PipelineProgressStepperProps {
  events: Record<PipelineStage, PipelineEvent>;
  activeStage: PipelineStage | null;
  isComplete: boolean;
  isFailed?: boolean;
  errorMessage?: string | null;
}

export function PipelineProgressStepper({
  events,
  activeStage,
  isComplete,
  isFailed = false,
  errorMessage,
}: PipelineProgressStepperProps) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  // Derive status for each stage based strictly on real events and activeStage
  const getStageStatus = (stageId: PipelineStage) => {
    const event = events[stageId];
    if (isFailed && activeStage === stageId) {
      return "failed";
    }
    if (event?.status === "completed") {
      return "completed";
    }
    if (event?.status === "failed") {
      return "failed";
    }
    if (activeStage === stageId || event?.status === "running") {
      return "running";
    }
    if (isComplete) {
      return "completed";
    }
    const activeIndex = activeStage ? STAGE_ORDER.indexOf(activeStage) : -1;
    const stageIndex = STAGE_ORDER.indexOf(stageId);
    if (activeIndex > stageIndex) {
      return "completed";
    }
    return "pending";
  };

  const completedCount = STAGE_ORDER.filter((s) => getStageStatus(s) === "completed").length;
  const currentStageIndex = activeStage ? STAGE_ORDER.indexOf(activeStage) : -1;
  const activeStageConfig = STAGES.find((s) => s.id === activeStage);

  const progressPercent = isComplete
    ? 100
    : isFailed
    ? Math.max(10, Math.round((completedCount / STAGES.length) * 100))
    : Math.max(8, Math.round(((completedCount + (activeStage ? 0.5 : 0)) / STAGES.length) * 100));

  return (
    <div className="w-full rounded-2xl border border-purple-500/20 bg-[#0E071D]/90 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl p-4 sm:p-5 transition-all duration-300">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-purple-900/30">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-3 w-3 items-center justify-center">
            {!isComplete && !isFailed && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                isComplete
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                  : isFailed
                  ? "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]"
                  : "bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]"
              }`}
            />
          </div>

          <div>
            <h4 className="text-xs font-semibold tracking-wide text-[#F5F0FF] uppercase flex items-center gap-1.5">
              <span>Grounded Verification Pipeline</span>
              {isComplete && (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.2 rounded-md">
                  Verified
                </span>
              )}
              {isFailed && (
                <span className="text-[10px] font-mono text-rose-400 bg-rose-950/60 border border-rose-500/30 px-1.5 py-0.2 rounded-md">
                  Interrupted
                </span>
              )}
            </h4>
            <p className="text-[11px] text-[#A89CB8]">
              {isComplete
                ? "All 6 verification stages completed and audit trail committed."
                : isFailed
                ? (errorMessage || "Execution halted due to pipeline error.")
                : activeStageConfig
                ? `Stage ${currentStageIndex + 1} of 6: ${activeStageConfig.label}`
                : "Initializing multi-pass audit pipeline..."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDetailsExpanded(!detailsExpanded)}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono text-purple-300 hover:text-white bg-purple-950/40 hover:bg-purple-900/40 border border-purple-500/25 rounded-lg transition-colors"
        >
          <span>{detailsExpanded ? "Hide Details" : "Inspect Stages"}</span>
          {detailsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Progress line */}
      <div className="w-full bg-[#1A0F33] h-1.5 rounded-full my-3 overflow-hidden">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            isComplete
              ? "bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400"
              : isFailed
              ? "bg-gradient-to-r from-purple-500 to-rose-500"
              : "bg-gradient-to-r from-purple-600 via-violet-500 to-indigo-400"
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Compact active status banner when collapsed */}
      {!detailsExpanded && activeStageConfig && !isComplete && !isFailed && (
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-purple-950/30 border border-purple-500/20 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400 shrink-0" />
          <span className="text-purple-200 truncate">
            {events[activeStageConfig.id]?.message || activeStageConfig.shortDesc}
          </span>
        </div>
      )}

      {/* Stepper stages view (always shown or expandable) */}
      <div className={`space-y-2.5 pt-2 ${detailsExpanded ? "block" : "sm:block hidden"}`}>
        {STAGES.map((stage, idx) => {
          const status = getStageStatus(stage.id);
          const event = events[stage.id];
          const isCurrent = activeStage === stage.id;
          const isLast = idx === STAGES.length - 1;

          return (
            <div key={stage.id} className="relative flex items-start gap-3 group">
              {/* Connecting vertical line */}
              {!isLast && (
                <div
                  className={`absolute left-[13px] top-[26px] w-[2px] h-[calc(100%-8px)] transition-colors duration-300 ${
                    status === "completed"
                      ? "bg-gradient-to-b from-purple-500/60 to-purple-700/40"
                      : "bg-purple-950/60"
                  }`}
                />
              )}

              {/* Status icon badge */}
              <div className="relative z-10 shrink-0 pt-0.5">
                {status === "completed" && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.25)]">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                )}
                {status === "running" && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-purple-950/80 border border-purple-400/60 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.4)] animate-pulse">
                    <Loader2 className="h-4 w-4 animate-spin text-purple-300" />
                  </div>
                )}
                {status === "failed" && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.3)]">
                    <XCircle className="h-4 w-4" />
                  </div>
                )}
                {status === "pending" && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#090414] border border-purple-900/40 text-[#6B5F80]">
                    <Circle className="h-3 w-3 fill-transparent" />
                  </div>
                )}
              </div>

              {/* Stage content */}
              <div
                className={`flex-1 min-w-0 rounded-xl p-2.5 transition-colors ${
                  isCurrent
                    ? "bg-purple-950/40 border border-purple-500/30"
                    : status === "completed"
                    ? "bg-[#090414]/50 border border-purple-900/20"
                    : "border border-transparent"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-medium ${
                        status === "completed"
                          ? "text-[#E6E0F5]"
                          : status === "running"
                          ? "text-purple-200 font-semibold"
                          : status === "failed"
                          ? "text-rose-300"
                          : "text-[#8D829F]"
                      }`}
                    >
                      {stage.label}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${
                      status === "completed"
                        ? "bg-emerald-950/50 text-emerald-400 border border-emerald-500/30"
                        : status === "running"
                        ? "bg-purple-950/80 text-purple-300 border border-purple-400/40"
                        : status === "failed"
                        ? "bg-rose-950/50 text-rose-400 border border-rose-500/30"
                        : "text-[#6B5F80] bg-purple-950/20"
                    }`}
                  >
                    {status === "completed"
                      ? "Complete"
                      : status === "running"
                      ? "In Progress"
                      : status === "failed"
                      ? "Failed"
                      : "Pending"}
                  </span>
                </div>

                {/* Event message / description */}
                <p
                  className={`text-[11px] mt-1 leading-relaxed ${
                    status === "running"
                      ? "text-purple-300 font-mono"
                      : status === "completed"
                      ? "text-[#A89CB8]"
                      : "text-[#6B5F80]"
                  }`}
                >
                  {event?.message || stage.shortDesc}
                </p>

                {/* Structured event metadata pills */}
                {event?.data && Object.keys(event.data).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pt-1.5 border-t border-purple-900/20">
                    {Object.entries(event.data).map(([key, val]) => (
                      <span
                        key={key}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#130B24] border border-purple-900/40 text-purple-300/80"
                      >
                        <span className="text-[#8D829F]">{key}: </span>
                        <span className="font-semibold">{String(val)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

