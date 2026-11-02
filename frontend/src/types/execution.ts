/**
 * Types for the real-time LangGraph execution visualization.
 *
 * These mirror the `graph_event` SSE payloads and the persisted `execution_trace` emitted by the backend
 * (see backend/app/pipeline/nodes.py). Nothing here is derived or simulated on the client.
 */

export type GraphNodeId =
  | "query_input"
  | "evidence_retrieval"
  | "answer_generation"
  | "claim_decomposition"
  | "claim_verification"
  | "verification_router"
  | "self_correction"
  | "re_verification"
  | "abstention"
  | "final_answer_generation"
  | "database_persistence"
  | "error_handler";

export type NodeStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type RouteDecision = "finalize" | "correct" | "abstain" | "error";

export type RunStatus = "idle" | "running" | "completed" | "failed" | "interrupted";

export interface NodeErrorInfo {
  stage?: string;
  kind?: string;
  message: string;
}

export interface GraphEventBase {
  kind: "graph";
  node: GraphNodeId;
  timestamp: string;
  round?: number;
}

export interface NodeStartEvent extends GraphEventBase {
  event: "node_start";
  from_node: GraphNodeId | null;
}

export interface NodeCompleteEvent extends GraphEventBase {
  event: "node_complete";
  from_node?: GraphNodeId | null;
  duration_ms?: number;
  data?: Record<string, any>;
  route?: RouteDecision;
  to_node?: GraphNodeId | null;
}

export interface NodeErrorEvent extends GraphEventBase {
  event: "node_error";
  from_node?: GraphNodeId | null;
  duration_ms?: number;
  data?: Record<string, any>;
  error?: NodeErrorInfo;
}

export interface RouteDecisionEvent extends GraphEventBase {
  event: "route_decision";
  route: RouteDecision;
  to_node: GraphNodeId | null;
  reason?: string;
}

export type GraphEvent = NodeStartEvent | NodeCompleteEvent | NodeErrorEvent | RouteDecisionEvent;

/** One persisted node execution, as stored in `Answer.model_config.execution_trace`. */
export interface TraceRecord {
  node: GraphNodeId;
  status: "completed" | "failed";
  from_node?: GraphNodeId | null;
  round?: number;
  started_at?: string;
  ended_at?: string;
  duration_ms?: number;
  data?: Record<string, any>;
  route?: RouteDecision;
  to_node?: GraphNodeId | null;
  error?: NodeErrorInfo;
}

/** A single execution of a node. Nodes in the correction loop run once per round. */
export interface NodeRun {
  status: NodeStatus;
  round: number;
  fromNode: GraphNodeId | null;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  data?: Record<string, any>;
  error?: NodeErrorInfo;
  route?: RouteDecision;
  toNode?: GraphNodeId | null;
  routeReason?: string;
}

export interface NodeRuntime {
  status: NodeStatus;
  runs: NodeRun[];
}

export interface EdgeRuntime {
  /** The router (or a failing node) chose this transition. */
  decided: boolean;
  /** The target node actually started via this edge. */
  taken: boolean;
  /** Animated: the transition happened and its target has not finished yet. */
  active: boolean;
  /** How many times the transition occurred (the correction loop repeats). */
  count: number;
}

export interface GraphEdgeDef {
  id: string;
  source: GraphNodeId;
  target: GraphNodeId;
  sourceHandle: string;
  targetHandle: string;
  label?: string;
  /** Routing branch this edge represents (static edges from routers). */
  route?: RouteDecision;
  /** Drawn from the self-correction loop back toward verification. */
  feedback?: boolean;
  /** Created at runtime because a node really failed; not part of the static layout. */
  dynamic?: boolean;
}

export interface ExecutionState {
  runStatus: RunStatus;
  source: "live" | "restored";
  nodes: Record<GraphNodeId, NodeRuntime>;
  edges: Record<string, EdgeRuntime>;
  dynamicEdges: GraphEdgeDef[];
  correctionRound: number;
  decisions: RouteDecisionEvent[];
  startedAt?: string;
  endedAt?: string;
  error?: { message: string; nodeId?: GraphNodeId };
}
