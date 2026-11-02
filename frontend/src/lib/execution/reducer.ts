import type {
  EdgeRuntime,
  ExecutionState,
  GraphEdgeDef,
  GraphEvent,
  GraphNodeId,
  NodeRun,
  NodeRuntime,
  RouteDecision,
  TraceRecord,
} from "@/types/execution";
import { NODE_IDS, STATIC_EDGE_BY_ID, ROUTE_TARGETS, dynamicErrorEdge, edgeId } from "./graphDefinition";

/**
 * State is only ever changed by an event the backend actually sent (or a persisted trace record).
 * Nothing is marked completed because a later node started, and nothing animates unless a transition happened.
 */

export type ExecutionAction =
  | { type: "reset" }
  | { type: "graph_event"; event: GraphEvent }
  | { type: "stream_complete" }
  | { type: "stream_failed"; message: string }
  | { type: "stream_interrupted"; message: string }
  | { type: "restore"; trace: TraceRecord[] };

const EMPTY_EDGE: EdgeRuntime = { decided: false, taken: false, active: false, count: 0 };

export function createInitialState(): ExecutionState {
  const nodes = Object.fromEntries(NODE_IDS.map((id) => [id, { status: "pending", runs: [] } as NodeRuntime])) as Record<
    GraphNodeId,
    NodeRuntime
  >;
  return {
    runStatus: "idle",
    source: "live",
    nodes,
    edges: {},
    dynamicEdges: [],
    correctionRound: 0,
    decisions: [],
  };
}

function edgeExists(state: ExecutionState, id: string): boolean {
  return id in STATIC_EDGE_BY_ID || state.dynamicEdges.some((e) => e.id === id);
}

function withEdge(state: ExecutionState, id: string, patch: (e: EdgeRuntime) => EdgeRuntime): ExecutionState {
  return { ...state, edges: { ...state.edges, [id]: patch(state.edges[id] ?? EMPTY_EDGE) } };
}

function setNode(state: ExecutionState, id: GraphNodeId, node: NodeRuntime): ExecutionState {
  return { ...state, nodes: { ...state.nodes, [id]: node } };
}

function deactivateEdgesInto(state: ExecutionState, target: GraphNodeId): ExecutionState {
  const edges = { ...state.edges };
  for (const [id, rt] of Object.entries(edges)) {
    if (rt.active && id.endsWith(`->${target}`)) edges[id] = { ...rt, active: false };
  }
  return { ...state, edges };
}

function deactivateAllEdges(state: ExecutionState): ExecutionState {
  const edges = Object.fromEntries(Object.entries(state.edges).map(([id, rt]) => [id, { ...rt, active: false }]));
  return { ...state, edges };
}

/** Pending nodes that the chosen route can no longer reach are skipped (derived from a real decision). */
const SKIPPED_BY_ROUTE: Partial<Record<RouteDecision, GraphNodeId[]>> = {
  finalize: ["self_correction", "re_verification", "abstention"],
  abstain: ["self_correction", "re_verification"],
};

function skipUnreachable(state: ExecutionState, route: RouteDecision): ExecutionState {
  let next = state;
  for (const id of SKIPPED_BY_ROUTE[route] ?? []) {
    if (next.nodes[id].status === "pending") next = setNode(next, id, { ...next.nodes[id], status: "skipped" });
  }
  return next;
}

function sweepPendingToSkipped(state: ExecutionState): ExecutionState {
  let next = state;
  for (const id of NODE_IDS) {
    if (next.nodes[id].status === "pending") next = setNode(next, id, { ...next.nodes[id], status: "skipped" });
  }
  return next;
}

function lastRun(node: NodeRuntime): NodeRun | undefined {
  return node.runs[node.runs.length - 1];
}

function replaceLastRun(node: NodeRuntime, run: NodeRun, status: NodeRuntime["status"]): NodeRuntime {
  return { status, runs: [...node.runs.slice(0, -1), run] };
}

function applyGraphEvent(state: ExecutionState, event: GraphEvent): ExecutionState {
  const nodeId = event.node;
  if (!(nodeId in state.nodes)) return state; // unknown node from a newer backend: ignore, never guess
  const node = state.nodes[nodeId];

  switch (event.event) {
    case "node_start": {
      const run: NodeRun = {
        status: "running",
        round: event.round ?? 0,
        fromNode: event.from_node ?? null,
        startedAt: event.timestamp,
      };
      let next = setNode(state, nodeId, { status: "running", runs: [...node.runs, run] });
      next = {
        ...next,
        runStatus: "running",
        startedAt: next.startedAt ?? event.timestamp,
        correctionRound: Math.max(next.correctionRound, event.round ?? 0),
      };

      const from = event.from_node;
      if (from) {
        const id = edgeId(from, nodeId);
        if (!edgeExists(next, id) && nodeId === "error_handler") {
          next = { ...next, dynamicEdges: [...next.dynamicEdges, dynamicErrorEdge(from, nodeId)] };
        }
        if (edgeExists(next, id)) {
          next = withEdge(next, id, (e) => ({ decided: true, taken: true, active: true, count: e.count + 1 }));
        }
      }
      return next;
    }

    case "node_complete":
    case "node_error": {
      const failed = event.event === "node_error";
      const open = lastRun(node);
      const base: NodeRun =
        open && open.status === "running"
          ? open
          : { status: "running", round: event.round ?? 0, fromNode: event.from_node ?? null };
      const run: NodeRun = {
        ...base,
        status: failed ? "failed" : "completed",
        round: event.round ?? base.round,
        endedAt: event.timestamp,
        durationMs: event.duration_ms,
        data: event.data,
        error: failed ? (event as { error?: NodeRun["error"] }).error : undefined,
        route: event.event === "node_complete" ? event.route : undefined,
        toNode: event.event === "node_complete" ? event.to_node : undefined,
      };
      const nodeRt: NodeRuntime =
        open && open.status === "running"
          ? replaceLastRun(node, run, run.status)
          : { status: run.status, runs: [...node.runs, run] };

      let next = deactivateEdgesInto(setNode(state, nodeId, nodeRt), nodeId);
      next = { ...next, correctionRound: Math.max(next.correctionRound, event.round ?? 0) };

      if (failed) {
        const message = run.error?.message ?? "Node failed.";
        next = { ...next, error: next.error ?? { message, nodeId } };
        if (nodeId === "error_handler") {
          // The backend graph ends at the error handler: the run is over and untouched nodes were never reached.
          next = sweepPendingToSkipped({ ...next, runStatus: "failed", endedAt: event.timestamp });
          next = deactivateAllEdges(next);
        }
      }
      return next;
    }

    case "route_decision": {
      let next: ExecutionState = { ...state, decisions: [...state.decisions, event] };
      const target = event.to_node ?? ROUTE_TARGETS[event.route];
      const id = edgeId(nodeId, target);
      if (edgeExists(next, id)) {
        next = withEdge(next, id, (e) => ({ ...e, decided: true, active: true }));
      }
      const open = lastRun(next.nodes[nodeId]);
      if (open) {
        next = setNode(next, nodeId, {
          ...next.nodes[nodeId],
          runs: [...next.nodes[nodeId].runs.slice(0, -1), { ...open, route: event.route, toNode: target, routeReason: event.reason }],
        });
      }
      return skipUnreachable(next, event.route);
    }
  }
}

export function executionReducer(state: ExecutionState, action: ExecutionAction): ExecutionState {
  switch (action.type) {
    case "reset":
      return createInitialState();

    case "graph_event":
      return applyGraphEvent(state, action.event);

    case "stream_complete": {
      const next = sweepPendingToSkipped(state);
      return deactivateAllEdges({ ...next, runStatus: "completed", endedAt: next.endedAt ?? new Date().toISOString() });
    }

    case "stream_failed": {
      let next = failRunningNodes(state, action.message, "pipeline");
      next = { ...next, runStatus: "failed", error: next.error ?? { message: action.message } };
      return deactivateAllEdges(next);
    }

    case "stream_interrupted": {
      // The outcome of a node that was mid-flight is unknown; it is shown as failed with the stream error.
      let next = failRunningNodes(state, action.message, "stream");
      next = { ...next, runStatus: "interrupted", error: next.error ?? { message: action.message } };
      return deactivateAllEdges(next);
    }

    case "restore":
      return restoreFromTrace(action.trace);
  }
}

function failRunningNodes(state: ExecutionState, message: string, kind: string): ExecutionState {
  let next = state;
  for (const id of NODE_IDS) {
    const node = next.nodes[id];
    const open = lastRun(node);
    if (node.status === "running" && open) {
      next = setNode(next, id, replaceLastRun(node, { ...open, status: "failed", error: { kind, message } }, "failed"));
      next = { ...next, error: next.error ?? { message, nodeId: id } };
    }
  }
  return next;
}

/** Rebuild a finished execution from a persisted trace by replaying it as the events it was recorded from. */
export function restoreFromTrace(trace: TraceRecord[]): ExecutionState {
  let state: ExecutionState = { ...createInitialState(), source: "restored" };
  for (const record of trace) {
    const base = { kind: "graph" as const, node: record.node, round: record.round };
    state = applyGraphEvent(state, {
      ...base,
      event: "node_start",
      from_node: record.from_node ?? null,
      timestamp: record.started_at ?? "",
    });
    if (record.status === "failed") {
      state = applyGraphEvent(state, {
        ...base,
        event: "node_error",
        duration_ms: record.duration_ms,
        data: record.data,
        error: record.error,
        timestamp: record.ended_at ?? "",
      });
    } else {
      state = applyGraphEvent(state, {
        ...base,
        event: "node_complete",
        duration_ms: record.duration_ms,
        data: record.data,
        route: record.route,
        to_node: record.to_node,
        timestamp: record.ended_at ?? "",
      });
    }
    if (record.route) {
      state = applyGraphEvent(state, {
        ...base,
        event: "route_decision",
        route: record.route,
        to_node: record.to_node ?? ROUTE_TARGETS[record.route],
        reason: record.data?.reason,
        timestamp: record.ended_at ?? "",
      });
    }
  }

  const last = trace[trace.length - 1];
  if (last?.node === "database_persistence" && last.status === "completed") {
    state = executionReducer(state, { type: "stream_complete" });
  } else if (state.runStatus === "running") {
    state = executionReducer(state, { type: "stream_interrupted", message: "Persisted trace ends before completion." });
  }
  return { ...state, source: "restored" };
}

/** Edges to draw: the static layout plus any error edges created by real failures. */
export function visibleEdges(state: ExecutionState): GraphEdgeDef[] {
  return [...Object.values(STATIC_EDGE_BY_ID), ...state.dynamicEdges];
}

const MAIN_PATH: GraphNodeId[] = [
  "query_input",
  "evidence_retrieval",
  "answer_generation",
  "claim_decomposition",
  "claim_verification",
  "verification_router",
  "final_answer_generation",
  "database_persistence",
];
const LOOP_NODES: GraphNodeId[] = ["self_correction", "re_verification"];

/** Progress over the nodes the run really involves: the main path plus one step per correction node execution. */
export function executionProgress(state: ExecutionState): { done: number; total: number; percent: number } {
  if (state.runStatus === "completed") return { done: 1, total: 1, percent: 100 };

  let done = 0;
  let running = 0;
  for (const id of MAIN_PATH) {
    const s = state.nodes[id].status;
    if (s === "completed") done += 1;
    else if (s === "running") running += 1;
  }
  let extra = 0;
  for (const id of LOOP_NODES) {
    for (const run of state.nodes[id].runs) {
      extra += 1;
      if (run.status === "completed") done += 1;
      else if (run.status === "running") running += 1;
    }
  }
  const total = MAIN_PATH.length + extra;
  const percent = Math.round(((done + running * 0.5) / total) * 100);
  return { done, total, percent: Math.max(0, Math.min(99, percent)) };
}

export function latestRun(state: ExecutionState, id: GraphNodeId): NodeRun | undefined {
  return lastRun(state.nodes[id]);
}

export function activeNode(state: ExecutionState): GraphNodeId | null {
  return NODE_IDS.find((id) => state.nodes[id].status === "running") ?? null;
}
