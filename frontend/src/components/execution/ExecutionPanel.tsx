"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp, History, Network } from "lucide-react";
import type { ExecutionState, GraphNodeId, RunStatus } from "@/types/execution";
import { activeNode, executionProgress } from "@/lib/execution/reducer";
import { NODE_BY_ID } from "@/lib/execution/graphDefinition";
import { ExecutionGraph } from "./ExecutionGraph";
import { NodeInspector } from "./NodeInspector";

interface ExecutionPanelProps {
  state: ExecutionState;
  workspaceId?: string;
  /** Allow the panel body to be collapsed (used inline on the audit page). */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
  /** Height classes for the graph area. */
  heightClassName?: string;
  idleMessage?: string;
}

const RUN_BADGE: Record<RunStatus, { label: string; className: string }> = {
  idle: { label: "Idle", className: "border-purple-900/40 bg-[#130B24] text-[#8D829F]" },
  running: { label: "Executing", className: "border-purple-400/40 bg-purple-950/70 text-purple-200" },
  completed: { label: "Completed", className: "border-emerald-500/30 bg-emerald-950/50 text-emerald-300" },
  failed: { label: "Failed", className: "border-rose-500/40 bg-rose-950/50 text-rose-300" },
  interrupted: { label: "Interrupted", className: "border-amber-500/40 bg-amber-950/40 text-amber-300" },
};

const LEGEND: Array<{ label: string; color: string }> = [
  { label: "Pending", color: "#3B2A5C" },
  { label: "Running", color: "#C084FC" },
  { label: "Completed", color: "#34D399" },
  { label: "Failed", color: "#FB7185" },
  { label: "Skipped", color: "#6B6580" },
];

export function ExecutionPanel({
  state,
  workspaceId,
  collapsible = false,
  defaultCollapsed = false,
  className = "",
  heightClassName = "h-full min-h-[360px]",
  idleMessage = "Ask a question to watch the LangGraph pipeline execute node by node.",
}: ExecutionPanelProps) {
  const reduceMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [selected, setSelected] = useState<GraphNodeId | null>(null);

  const progress = executionProgress(state);
  const running = activeNode(state);
  const badge = RUN_BADGE[state.runStatus];
  const isIdle = state.runStatus === "idle";

  // A new execution starts with nothing selected.
  useEffect(() => {
    if (state.runStatus === "idle") setSelected(null);
  }, [state.runStatus]);

  return (
    <section
      aria-label="LangGraph execution"
      className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-purple-500/20 bg-[#0A0514]/90 ${className}`}
    >
      <header className="space-y-2 border-b border-purple-900/30 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Network className="h-4 w-4 shrink-0 text-purple-300" aria-hidden />
            <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-[#F5F0FF]">LangGraph execution</h3>
            <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${badge.className}`} role="status">
              {badge.label}
            </span>
            {state.source === "restored" && (
              <span className="inline-flex items-center gap-1 rounded-md border border-purple-500/25 bg-purple-950/40 px-1.5 py-0.5 font-mono text-[10px] text-purple-200">
                <History className="h-3 w-3" aria-hidden /> Restored trace
              </span>
            )}
            {state.correctionRound > 0 && (
              <span className="rounded-md border border-purple-500/30 bg-purple-950/50 px-1.5 py-0.5 font-mono text-[10px] text-purple-200">
                Correction round {state.correctionRound}
              </span>
            )}
          </div>

          {collapsible && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              className="flex items-center gap-1 rounded-lg border border-purple-500/25 bg-purple-950/40 px-2.5 py-1 font-mono text-[11px] text-purple-300 transition-colors hover:bg-purple-900/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
            >
              {collapsed ? "Show graph" : "Hide graph"}
              {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            </button>
          )}
        </div>

        {!isIdle && (
          <div className="space-y-1">
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-[#1A0F33]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              aria-label="Execution progress"
            >
              <motion.div
                className={`h-full rounded-full ${
                  state.runStatus === "failed"
                    ? "bg-gradient-to-r from-purple-500 to-rose-500"
                    : state.runStatus === "completed"
                    ? "bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400"
                    : "bg-gradient-to-r from-purple-600 via-violet-500 to-indigo-400"
                }`}
                initial={false}
                animate={{ width: `${progress.percent}%` }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }}
              />
            </div>
            <p className="truncate text-[11px] text-[#A89CB8]">
              {state.runStatus === "running"
                ? running
                  ? `Running: ${NODE_BY_ID[running].label}`
                  : "Waiting for the next node to start…"
                : state.runStatus === "completed"
                ? "All executed nodes completed and the audit trail was committed."
                : state.error?.message ?? "Execution stopped."}
            </p>
          </div>
        )}
      </header>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="body"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className={`relative flex-1 ${heightClassName}`}>
              <ExecutionGraph state={state} selectedNode={selected} onSelectNode={setSelected} />

              {isIdle && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                  <p className="max-w-xs rounded-xl border border-purple-500/20 bg-[#0B0517]/85 px-4 py-3 text-center text-[12px] leading-relaxed text-[#C4B7DB] backdrop-blur-md">
                    {idleMessage}
                  </p>
                </div>
              )}

              <AnimatePresence>
                {selected && (
                  <motion.div
                    key={selected}
                    initial={reduceMotion ? false : { opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-x-0 bottom-0 top-1/3 z-20 md:inset-y-0 md:left-auto md:right-0 md:w-[400px]"
                  >
                    <NodeInspector nodeId={selected} state={state} workspaceId={workspaceId} onClose={() => setSelected(null)} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-purple-900/30 px-4 py-2" aria-label="Legend">
              {LEGEND.map((item) => (
                <li key={item.label} className="flex items-center gap-1.5 font-mono text-[10px] text-[#8D829F]">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
                  {item.label}
                </li>
              ))}
              <li className="ml-auto hidden font-mono text-[10px] text-[#6B5F80] sm:block">Click a node to inspect</li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
