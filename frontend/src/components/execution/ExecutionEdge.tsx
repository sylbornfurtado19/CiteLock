"use client";

import React, { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";
import type { EdgeRuntime, RouteDecision } from "@/types/execution";

export interface ExecutionEdgeData extends Record<string, unknown> {
  label?: string;
  route?: RouteDecision;
  feedback?: boolean;
  runtime: EdgeRuntime;
}

export type ExecutionFlowEdge = Edge<ExecutionEdgeData, "exec">;

export const EDGE_COLORS = {
  idle: "#3B2A5C",
  taken: "#8B5CF6",
  active: "#C084FC",
  error: "#FB7185",
};

export function edgeColor(runtime: EdgeRuntime, route?: RouteDecision): string {
  if (!runtime.decided && !runtime.taken) return EDGE_COLORS.idle;
  if (route === "error") return EDGE_COLORS.error;
  return runtime.active ? EDGE_COLORS.active : EDGE_COLORS.taken;
}

function ExecutionEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<ExecutionFlowEdge>) {
  const runtime = data?.runtime ?? { decided: false, taken: false, active: false, count: 0 };
  const route = data?.route;
  const feedback = data?.feedback;
  const used = runtime.decided || runtime.taken;
  const color = edgeColor(runtime, route);

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
    offset: feedback ? 36 : 24,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={runtime.active ? "exec-edge-active" : undefined}
        style={{
          stroke: color,
          strokeWidth: runtime.active ? 2.5 : used ? 2 : 1.25,
          strokeDasharray: used ? undefined : "4 5",
          opacity: used ? 1 : 0.55,
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className={`nodrag nopan pointer-events-none absolute rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-none ${
              used
                ? route === "error"
                  ? "border-rose-500/40 bg-rose-950/80 text-rose-200"
                  : "border-purple-400/40 bg-purple-950/85 text-purple-100"
                : "border-purple-900/30 bg-[#0B0517]/90 text-[#6B5F80]"
            }`}
          >
            {data.label}
            {runtime.count > 1 ? ` ×${runtime.count}` : ""}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const ExecutionEdge = memo(ExecutionEdgeInner);
