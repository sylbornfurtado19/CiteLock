import type { GraphEdgeDef, GraphNodeId, RouteDecision } from "@/types/execution";

/**
 * Static layout of the CiteLock LangGraph. Node ids equal the backend graph node names
 * (backend/app/pipeline/graph.py), and every edge corresponds to a real edge or conditional-edge target there.
 */

export type GraphNodeKind = "step" | "router" | "branch" | "terminal";

export interface GraphNodeDef {
  id: GraphNodeId;
  label: string;
  subtitle: string;
  kind: GraphNodeKind;
  position: { x: number; y: number };
}

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 88;

const COL_BRANCH = 0;
const COL_SPINE = 320;
const COL_CORRECTION = 700;

export const GRAPH_NODES: GraphNodeDef[] = [
  { id: "query_input", label: "Query Input", subtitle: "Validate request and policy", kind: "step", position: { x: COL_SPINE, y: 0 } },
  { id: "evidence_retrieval", label: "Evidence Retrieval", subtitle: "Hybrid vector and keyword search", kind: "step", position: { x: COL_SPINE, y: 130 } },
  { id: "answer_generation", label: "Answer Generation", subtitle: "Grounded draft answer", kind: "step", position: { x: COL_SPINE, y: 260 } },
  { id: "claim_decomposition", label: "Claim Decomposition", subtitle: "Atomic factual claims", kind: "step", position: { x: COL_SPINE, y: 390 } },
  { id: "claim_verification", label: "Claim Verification", subtitle: "Judge, numeric, provenance", kind: "step", position: { x: COL_SPINE, y: 520 } },
  { id: "verification_router", label: "Conditional Router", subtitle: "Route by verdicts and policy", kind: "router", position: { x: COL_SPINE, y: 660 } },
  { id: "self_correction", label: "Self-Correction", subtitle: "Revise failed claims", kind: "step", position: { x: COL_CORRECTION, y: 660 } },
  { id: "re_verification", label: "Re-verification", subtitle: "Audit the revised answer", kind: "step", position: { x: COL_CORRECTION, y: 820 } },
  { id: "abstention", label: "Insufficient Evidence", subtitle: "Abstain per workspace policy", kind: "branch", position: { x: COL_BRANCH, y: 820 } },
  { id: "error_handler", label: "Failed", subtitle: "Provider or verification error", kind: "terminal", position: { x: COL_BRANCH, y: 660 } },
  { id: "final_answer_generation", label: "Final Answer", subtitle: "Assemble answer and status", kind: "step", position: { x: COL_SPINE, y: 980 } },
  // Completes only after the database commit succeeds, so "Finalization" is never shown before persistence.
  { id: "database_persistence", label: "Finalization", subtitle: "Persist and commit audit trail", kind: "terminal", position: { x: COL_SPINE, y: 1110 } },
];

export const NODE_BY_ID: Record<GraphNodeId, GraphNodeDef> = Object.fromEntries(
  GRAPH_NODES.map((n) => [n.id, n])
) as Record<GraphNodeId, GraphNodeDef>;

/** Backend node ids in canonical execution order (used for stable iteration). */
export const NODE_IDS: GraphNodeId[] = GRAPH_NODES.map((n) => n.id);

/** Handle ids exposed by ExecutionNode (3 per top/bottom side, 1 per left/right side). */
export const SOURCE_HANDLES = ["s-b25", "s-b50", "s-b75", "s-l", "s-r"] as const;
export const TARGET_HANDLES = ["t-t25", "t-t50", "t-t75", "t-l", "t-r"] as const;

const linear = (source: GraphNodeId, target: GraphNodeId): GraphEdgeDef => ({
  id: `${source}->${target}`,
  source,
  target,
  sourceHandle: "s-b50",
  targetHandle: "t-t50",
});

export const STATIC_EDGES: GraphEdgeDef[] = [
  linear("query_input", "evidence_retrieval"),
  linear("evidence_retrieval", "answer_generation"),
  linear("answer_generation", "claim_decomposition"),
  linear("claim_decomposition", "claim_verification"),
  linear("claim_verification", "verification_router"),

  // Conditional router branches (route decisions made by backend decide_route)
  { id: "verification_router->final_answer_generation", source: "verification_router", target: "final_answer_generation", sourceHandle: "s-b50", targetHandle: "t-t50", label: "Verified", route: "finalize" },
  { id: "verification_router->self_correction", source: "verification_router", target: "self_correction", sourceHandle: "s-r", targetHandle: "t-l", label: "Needs correction", route: "correct" },
  { id: "verification_router->abstention", source: "verification_router", target: "abstention", sourceHandle: "s-b25", targetHandle: "t-t50", label: "Insufficient evidence", route: "abstain" },
  { id: "verification_router->error_handler", source: "verification_router", target: "error_handler", sourceHandle: "s-l", targetHandle: "t-r", label: "Failed", route: "error" },

  // Correction loop: revise, re-verify, then loop back or exit (re_verification makes its own routing decision)
  linear("self_correction", "re_verification"),
  { id: "re_verification->self_correction", source: "re_verification", target: "self_correction", sourceHandle: "s-r", targetHandle: "t-r", label: "Retry", route: "correct", feedback: true },
  { id: "re_verification->final_answer_generation", source: "re_verification", target: "final_answer_generation", sourceHandle: "s-b50", targetHandle: "t-t75", label: "Resolved", route: "finalize" },
  { id: "re_verification->abstention", source: "re_verification", target: "abstention", sourceHandle: "s-l", targetHandle: "t-r", route: "abstain" },

  { id: "abstention->final_answer_generation", source: "abstention", target: "final_answer_generation", sourceHandle: "s-b50", targetHandle: "t-t25" },
  linear("final_answer_generation", "database_persistence"),
];

export const STATIC_EDGE_BY_ID: Record<string, GraphEdgeDef> = Object.fromEntries(
  STATIC_EDGES.map((e) => [e.id, e])
);

export function edgeId(source: GraphNodeId, target: GraphNodeId): string {
  return `${source}->${target}`;
}

/** Build the edge drawn at runtime when a node genuinely fails and hands off to the error handler. */
export function dynamicErrorEdge(source: GraphNodeId, target: GraphNodeId): GraphEdgeDef {
  return {
    id: edgeId(source, target),
    source,
    target,
    sourceHandle: "s-l",
    targetHandle: "t-t50",
    label: "Error",
    route: "error",
    dynamic: true,
  };
}

/** Target node for each route decision, mirroring backend ROUTE_TARGETS. */
export const ROUTE_TARGETS: Record<RouteDecision, GraphNodeId> = {
  finalize: "final_answer_generation",
  correct: "self_correction",
  abstain: "abstention",
  error: "error_handler",
};

/** Nodes that make routing decisions; their outgoing static edges are the real conditional-edge targets. */
export const ROUTER_NODES: GraphNodeId[] = ["verification_router", "re_verification"];
