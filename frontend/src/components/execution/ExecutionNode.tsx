"use client";

import React, { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { motion, useReducedMotion, type TargetAndTransition } from "framer-motion";
import {
  AlertTriangle,
  Ban,
  BadgeCheck,
  CheckCircle2,
  Circle,
  Cpu,
  FileCheck2,
  Flag,
  GitBranch,
  Loader2,
  MessageSquare,
  MinusCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Split,
  XCircle,
} from "lucide-react";
import type { GraphNodeId, NodeRuntime, NodeStatus } from "@/types/execution";
import { NODE_HEIGHT, NODE_WIDTH, SOURCE_HANDLES, TARGET_HANDLES, type GraphNodeDef } from "@/lib/execution/graphDefinition";
import { formatDuration, nodeMeta } from "@/lib/execution/summary";

export interface ExecutionNodeData extends Record<string, unknown> {
  def: GraphNodeDef;
  runtime: NodeRuntime;
  selected: boolean;
  onInspect: (id: GraphNodeId) => void;
}

export type ExecutionFlowNode = Node<ExecutionNodeData, "exec">;

const NODE_ICONS: Record<GraphNodeId, React.ComponentType<{ className?: string }>> = {
  query_input: MessageSquare,
  evidence_retrieval: Search,
  answer_generation: Cpu,
  claim_decomposition: GitBranch,
  claim_verification: FileCheck2,
  verification_router: Split,
  self_correction: RefreshCw,
  re_verification: ShieldCheck,
  abstention: Ban,
  error_handler: AlertTriangle,
  final_answer_generation: Flag,
  database_persistence: BadgeCheck,
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
};

const BORDER: Record<NodeStatus, string> = {
  pending: "rgba(88, 60, 130, 0.45)",
  running: "rgba(192, 132, 252, 0.95)",
  completed: "rgba(52, 211, 153, 0.65)",
  failed: "rgba(251, 113, 133, 0.85)",
  skipped: "rgba(120, 113, 140, 0.35)",
};

const GLOW: Record<NodeStatus, string> = {
  pending: "0 0 0 rgba(0,0,0,0)",
  running: "0 0 22px rgba(168, 85, 247, 0.45)",
  completed: "0 0 14px rgba(52, 211, 153, 0.12)",
  failed: "0 0 18px rgba(244, 63, 94, 0.30)",
  skipped: "0 0 0 rgba(0,0,0,0)",
};

function StatusIcon({ status }: { status: NodeStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-300" aria-hidden />;
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-rose-400" aria-hidden />;
    case "skipped":
      return <MinusCircle className="h-3.5 w-3.5 text-[#7B708F]" aria-hidden />;
    default:
      return <Circle className="h-3.5 w-3.5 text-[#6B5F80]" aria-hidden />;
  }
}

function ExecutionNodeInner({ data }: NodeProps<ExecutionFlowNode>) {
  const { def, runtime, selected, onInspect } = data;
  const reduceMotion = useReducedMotion();
  const status = runtime.status;
  const run = runtime.runs[runtime.runs.length - 1];
  const Icon = NODE_ICONS[def.id];
  const meta = nodeMeta(def.id, run);
  const duration = formatDuration(run?.durationMs);
  const runCount = runtime.runs.length;
  const muted = status === "pending" || status === "skipped";

  const animate: TargetAndTransition = {
    borderColor: BORDER[status],
    opacity: status === "skipped" ? 0.5 : status === "pending" ? 0.72 : 1,
    boxShadow:
      status === "running" && !reduceMotion
        ? [GLOW.running, "0 0 34px rgba(168, 85, 247, 0.7)", GLOW.running]
        : GLOW[status],
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`${def.label}: ${STATUS_LABEL[status]}. Click to inspect.`}
      aria-pressed={selected}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onInspect(def.id);
        }
      }}
      initial={false}
      animate={animate}
      transition={
        status === "running" && !reduceMotion
          ? { boxShadow: { duration: 1.6, repeat: Infinity, ease: "easeInOut" }, borderColor: { duration: 0.25 } }
          : { duration: 0.3 }
      }
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT, borderWidth: 1.5, borderStyle: status === "skipped" ? "dashed" : "solid" }}
      className={`relative cursor-pointer rounded-2xl bg-[#0E071D]/95 px-3.5 py-3 backdrop-blur-md outline-none transition-[background-color] focus-visible:ring-2 focus-visible:ring-purple-400/70 ${
        selected ? "ring-2 ring-purple-400/60 ring-offset-0" : ""
      } ${def.kind === "router" ? "bg-[#130B26]" : ""}`}
    >
      {/* Invisible connection handles so edges can attach to any side without visual clutter */}
      {TARGET_HANDLES.map((id) => (
        <Handle key={id} id={id} type="target" {...handleProps(id)} />
      ))}
      {SOURCE_HANDLES.map((id) => (
        <Handle key={id} id={id} type="source" {...handleProps(id)} />
      ))}

      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
            status === "running"
              ? "border-purple-400/50 bg-purple-950/70 text-purple-200"
              : status === "completed"
              ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-300"
              : status === "failed"
              ? "border-rose-500/40 bg-rose-950/50 text-rose-300"
              : "border-purple-900/40 bg-[#090414] text-[#8D829F]"
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`truncate text-[13px] font-semibold ${muted ? "text-[#9E93B3]" : "text-[#F5F0FF]"}`}>{def.label}</span>
            <StatusIcon status={status} />
          </div>
          <p className="truncate text-[11px] text-[#8D829F]">{def.subtitle}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${
            status === "running"
              ? "border-purple-400/40 bg-purple-950/70 text-purple-200"
              : status === "completed"
              ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-300"
              : status === "failed"
              ? "border-rose-500/40 bg-rose-950/50 text-rose-300"
              : "border-purple-900/30 bg-[#130B24] text-[#8D829F]"
          }`}
        >
          {STATUS_LABEL[status]}
        </span>
        {runCount > 1 && (
          <span className="rounded-md border border-purple-500/30 bg-purple-950/50 px-1.5 py-0.5 font-mono text-[10px] text-purple-200">
            {runCount} runs
          </span>
        )}
        {duration && <span className="font-mono text-[10px] text-[#7B708F]">{duration}</span>}
      </div>

      {meta.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {meta.map((line) => (
            <span key={line} className={`text-[11px] ${status === "failed" ? "text-rose-300" : "text-[#C4B7DB]"}`}>
              {line}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function handleProps(id: string): { position: Position; style: React.CSSProperties } {
  const hidden: React.CSSProperties = { opacity: 0, pointerEvents: "none", width: 6, height: 6 };
  if (id.endsWith("-l")) return { position: Position.Left, style: hidden };
  if (id.endsWith("-r")) return { position: Position.Right, style: hidden };
  const pct = id.match(/(\d+)$/)?.[1] ?? "50";
  return {
    position: id.startsWith("s-b") ? Position.Bottom : Position.Top,
    style: { ...hidden, left: `${pct}%` },
  };
}

export const ExecutionNode = memo(ExecutionNodeInner);
