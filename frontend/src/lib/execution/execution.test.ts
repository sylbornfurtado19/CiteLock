import { describe, expect, it } from "vitest";
import type { ExecutionState, GraphEvent, GraphNodeId, TraceRecord } from "@/types/execution";
import { createInitialState, executionProgress, executionReducer, restoreFromTrace } from "./reducer";
import { GRAPH_NODES, NODE_BY_ID, ROUTE_TARGETS, SOURCE_HANDLES, STATIC_EDGES, TARGET_HANDLES, NODE_HEIGHT, NODE_WIDTH } from "./graphDefinition";
import { formatDuration, nodeMeta } from "./summary";
import verified from "./__fixtures__/verified.json";
import corrected from "./__fixtures__/corrected.json";
import abstained from "./__fixtures__/abstained.json";
import failed from "./__fixtures__/failed.json";

type Fixture = { scenario: string; events: GraphEvent[]; trace: TraceRecord[] };
const FIXTURES = { verified, corrected, abstained, failed } as unknown as Record<string, Fixture>;

function replay(events: GraphEvent[], upTo = events.length): ExecutionState {
  let state = createInitialState();
  for (const event of events.slice(0, upTo)) state = executionReducer(state, { type: "graph_event", event });
  return state;
}

const status = (s: ExecutionState, id: GraphNodeId) => s.nodes[id].status;
const MAIN: GraphNodeId[] = [
  "query_input", "evidence_retrieval", "answer_generation", "claim_decomposition",
  "claim_verification", "verification_router", "final_answer_generation", "database_persistence",
];

describe("live replay of a verified run", () => {
  const events = FIXTURES.verified.events;

  it("starts with every node pending and nothing animated", () => {
    const s = createInitialState();
    expect(Object.values(s.nodes).every((n) => n.status === "pending")).toBe(true);
    expect(Object.keys(s.edges)).toHaveLength(0);
    expect(s.runStatus).toBe("idle");
  });

  it("marks a node running only after its node_start event and completed only after node_complete", () => {
    const startIdx = events.findIndex((e) => e.event === "node_start" && e.node === "claim_verification");
    const running = replay(events, startIdx + 1);
    expect(status(running, "claim_verification")).toBe("running");
    expect(status(running, "claim_decomposition")).toBe("completed");
    // nothing downstream is assumed
    for (const id of ["verification_router", "final_answer_generation", "database_persistence"] as GraphNodeId[]) {
      expect(status(running, id)).toBe("pending");
    }

    const done = replay(events, startIdx + 2);
    expect(done.nodes.claim_verification.status).toBe("completed");
    expect(done.nodes.claim_verification.runs[0].data?.claims).toBeDefined();
  });

  it("animates an edge only while its transition is in flight", () => {
    const startIdx = events.findIndex((e) => e.event === "node_start" && e.node === "evidence_retrieval");
    const inFlight = replay(events, startIdx + 1);
    expect(inFlight.edges["query_input->evidence_retrieval"]).toMatchObject({ taken: true, active: true });

    const finished = replay(events, startIdx + 2);
    expect(finished.edges["query_input->evidence_retrieval"]).toMatchObject({ taken: true, active: false });
    // transitions that never happened stay untouched
    expect(finished.edges["evidence_retrieval->answer_generation"]).toBeUndefined();
  });

  it("does not invent predecessors: a lone node_start leaves earlier nodes pending", () => {
    const lone = events.find((e) => e.event === "node_start" && e.node === "claim_verification")!;
    const s = executionReducer(createInitialState(), { type: "graph_event", event: lone });
    expect(status(s, "claim_verification")).toBe("running");
    for (const id of ["query_input", "evidence_retrieval", "answer_generation", "claim_decomposition"] as GraphNodeId[]) {
      expect(status(s, id)).toBe("pending");
    }
  });

  it("skips the correction branch only after the router decided to finalize", () => {
    const decisionIdx = events.findIndex((e) => e.event === "route_decision");
    const before = replay(events, decisionIdx);
    expect(status(before, "self_correction")).toBe("pending");

    const after = replay(events, decisionIdx + 1);
    expect(after.decisions[0].route).toBe("finalize");
    expect(status(after, "self_correction")).toBe("skipped");
    expect(status(after, "abstention")).toBe("skipped");
    expect(after.edges["verification_router->final_answer_generation"]).toMatchObject({ decided: true });
    expect(after.edges["verification_router->self_correction"]).toBeUndefined();
  });

  it("completes the run on pipeline_complete and leaves the correction nodes skipped", () => {
    let s = replay(events);
    expect(s.runStatus).toBe("running");
    s = executionReducer(s, { type: "stream_complete" });

    expect(s.runStatus).toBe("completed");
    for (const id of MAIN) expect(status(s, id)).toBe("completed");
    for (const id of ["self_correction", "re_verification", "abstention", "error_handler"] as GraphNodeId[]) {
      expect(status(s, id)).toBe("skipped");
    }
    expect(Object.values(s.edges).every((e) => !e.active)).toBe(true);
    expect(executionProgress(s).percent).toBe(100);
  });

  it("keeps progress between 0 and 99 while running", () => {
    for (let i = 0; i <= events.length; i++) {
      const p = executionProgress(replay(events, i)).percent;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(99);
    }
  });
});

describe("correction loop", () => {
  const events = FIXTURES.corrected.events;
  const final = executionReducer(replay(events), { type: "stream_complete" });

  it("records one run per correction round with the real round numbers", () => {
    expect(final.nodes.self_correction.runs.map((r) => r.round)).toEqual([1, 2]);
    expect(final.nodes.re_verification.runs.map((r) => r.round)).toEqual([1, 2]);
    expect(final.correctionRound).toBe(2);
  });

  it("takes the feedback edge exactly once between the two rounds", () => {
    expect(final.edges["re_verification->self_correction"]).toMatchObject({ taken: true, count: 1 });
    expect(final.edges["verification_router->self_correction"]).toMatchObject({ taken: true, count: 1 });
  });

  it("ends by finalizing, so abstention stays skipped", () => {
    expect(final.decisions.map((d) => d.route)).toEqual(["correct", "correct", "finalize"]);
    expect(status(final, "abstention")).toBe("skipped");
    expect(status(final, "final_answer_generation")).toBe("completed");
  });

  it("exposes previous and revised answers and before/after metrics for inspection", () => {
    const second = final.nodes.self_correction.runs[1].data!;
    expect(second.previous_answer).toBe("Titan uses TLS.");
    expect(second.revised_answer).toBe("Titan uses mTLS.");
    const reverify = final.nodes.re_verification.runs[1].data!;
    expect(reverify.metrics_before).toBeDefined();
    expect(reverify.metrics_after).toBeDefined();
    expect(reverify.failed_after).toBe(0);
  });

  it("animates the loop edge while the second correction round runs", () => {
    const startIdx = events.findIndex((e, i) => e.event === "node_start" && e.node === "self_correction" && events.slice(0, i).some((x) => x.node === "re_verification"));
    const s = replay(events, startIdx + 1);
    expect(s.edges["re_verification->self_correction"]).toMatchObject({ active: true });
    expect(status(s, "self_correction")).toBe("running");
  });
});

describe("abstention", () => {
  const final = executionReducer(replay(FIXTURES.abstained.events), { type: "stream_complete" });

  it("routes through the abstention branch after the retry limit", () => {
    expect(final.decisions[final.decisions.length - 1].route).toBe("abstain");
    expect(status(final, "abstention")).toBe("completed");
    expect(status(final, "final_answer_generation")).toBe("completed");
    expect(final.edges["abstention->final_answer_generation"]).toMatchObject({ taken: true });
    expect(final.edges["re_verification->abstention"]).toMatchObject({ taken: true });
    expect(final.nodes.self_correction.runs).toHaveLength(2);
  });
});

describe("failure handling", () => {
  const events = FIXTURES.failed.events;
  const final = replay(events);

  it("marks the failing node and the failed terminal, with error details", () => {
    expect(status(final, "claim_verification")).toBe("failed");
    expect(final.nodes.claim_verification.runs[0].error?.kind).toBe("verification");
    expect(status(final, "error_handler")).toBe("failed");
    expect(final.runStatus).toBe("failed");
    expect(final.error?.nodeId).toBe("claim_verification");
  });

  it("draws the error edge only because the failure really happened", () => {
    expect(final.dynamicEdges.map((e) => e.id)).toEqual(["claim_verification->error_handler"]);
    expect(final.edges["claim_verification->error_handler"]).toMatchObject({ taken: true });
    expect(replay(FIXTURES.verified.events).dynamicEdges).toHaveLength(0);
  });

  it("skips nodes the failed run never reached", () => {
    expect(status(final, "verification_router")).toBe("skipped");
    expect(status(final, "database_persistence")).toBe("skipped");
    expect(status(final, "claim_decomposition")).toBe("completed");
  });
});

describe("interruptions", () => {
  it("marks the in-flight node failed and the run interrupted, without sweeping pending nodes", () => {
    const events = FIXTURES.corrected.events;
    const startIdx = events.findIndex((e) => e.event === "node_start" && e.node === "claim_verification");
    let s = replay(events, startIdx + 1);
    s = executionReducer(s, { type: "stream_interrupted", message: "network reset" });

    expect(s.runStatus).toBe("interrupted");
    expect(status(s, "claim_verification")).toBe("failed");
    expect(s.nodes.claim_verification.runs[0].error).toMatchObject({ kind: "stream", message: "network reset" });
    expect(status(s, "verification_router")).toBe("pending"); // outcome unknown, not skipped
    expect(Object.values(s.edges).every((e) => !e.active)).toBe(true);
  });

  it("marks a backend pipeline failure as failed", () => {
    const s = executionReducer(replay(FIXTURES.verified.events, 4), { type: "stream_failed", message: "boom" });
    expect(s.runStatus).toBe("failed");
    expect(s.error?.message).toBe("boom");
  });

  it("ignores events for nodes it does not know", () => {
    const s = executionReducer(createInitialState(), {
      type: "graph_event",
      event: { kind: "graph", event: "node_start", node: "future_node" as GraphNodeId, from_node: null, timestamp: "t" },
    });
    expect(s).toEqual(createInitialState());
  });
});

describe("restoring a persisted trace", () => {
  it.each(["verified", "corrected", "abstained"])("rebuilds the same final node states as the live run (%s)", (name) => {
    const fx = FIXTURES[name];
    const live = executionReducer(replay(fx.events), { type: "stream_complete" });
    const restored = restoreFromTrace(fx.trace);

    expect(restored.source).toBe("restored");
    expect(restored.runStatus).toBe("completed");
    for (const node of GRAPH_NODES) {
      expect(restored.nodes[node.id].status).toBe(live.nodes[node.id].status);
      expect(restored.nodes[node.id].runs.length).toBe(live.nodes[node.id].runs.length);
    }
    expect(restored.decisions.map((d) => d.route)).toEqual(live.decisions.map((d) => d.route));
    expect(restored.correctionRound).toBe(live.correctionRound);
  });

  it("preserves inspection data from the persisted trace", () => {
    const restored = restoreFromTrace(FIXTURES.corrected.trace);
    expect(restored.nodes.evidence_retrieval.runs[0].data?.passages_count).toBe(1);
    expect(restored.nodes.self_correction.runs[0].data?.revised_answer).toBe("Titan uses TLS.");
  });

  it("restores through the reducer's restore action", () => {
    const s = executionReducer(createInitialState(), { type: "restore", trace: FIXTURES.verified.trace });
    expect(s.source).toBe("restored");
    expect(status(s, "database_persistence")).toBe("completed");
  });

  it("marks a truncated trace as interrupted instead of pretending it finished", () => {
    const s = restoreFromTrace(FIXTURES.verified.trace.slice(0, 4));
    expect(s.runStatus).toBe("interrupted");
    expect(status(s, "claim_verification")).toBe("pending");
  });
});

describe("graph definition matches the backend contract", () => {
  const backendNodes = new Set<string>();
  const transitions = new Set<string>();
  for (const fx of Object.values(FIXTURES)) {
    for (const e of fx.events) {
      backendNodes.add(e.node);
      if (e.event === "node_start" && e.from_node) transitions.add(`${e.from_node}->${e.node}`);
      if (e.event === "route_decision") transitions.add(`${e.node}->${e.to_node}`);
    }
  }
  const staticIds = new Set(STATIC_EDGES.map((e) => e.id));

  it("has a node for every backend node that emitted events, and no extras", () => {
    expect(Array.from(backendNodes).every((n) => n in NODE_BY_ID)).toBe(true);
    expect(GRAPH_NODES).toHaveLength(12);
  });

  it("has an edge for every real transition (error edges are created at runtime)", () => {
    for (const t of Array.from(transitions)) {
      if (t.endsWith("->error_handler")) continue;
      expect(staticIds.has(t), `missing edge for ${t}`).toBe(true);
    }
  });

  it("only offers the four routing branches that exist in backend logic", () => {
    const fromRouter = STATIC_EDGES.filter((e) => e.source === "verification_router" && e.route);
    expect(fromRouter.map((e) => e.label).sort()).toEqual(["Failed", "Insufficient evidence", "Needs correction", "Verified"]);
    for (const e of fromRouter) expect(ROUTE_TARGETS[e.route!]).toBe(e.target);
  });

  it("references valid nodes and handles, with unique ids", () => {
    expect(new Set(STATIC_EDGES.map((e) => e.id)).size).toBe(STATIC_EDGES.length);
    for (const e of STATIC_EDGES) {
      expect(NODE_BY_ID[e.source]).toBeDefined();
      expect(NODE_BY_ID[e.target]).toBeDefined();
      expect(SOURCE_HANDLES).toContain(e.sourceHandle);
      expect(TARGET_HANDLES).toContain(e.targetHandle);
    }
  });

  it("includes the visible correction feedback loop", () => {
    const loop = STATIC_EDGES.find((e) => e.feedback);
    expect(loop).toMatchObject({ source: "re_verification", target: "self_correction" });
  });

  it("lays nodes out without overlap", () => {
    for (const a of GRAPH_NODES) {
      for (const b of GRAPH_NODES) {
        if (a.id >= b.id) continue;
        const overlap =
          a.position.x < b.position.x + NODE_WIDTH &&
          b.position.x < a.position.x + NODE_WIDTH &&
          a.position.y < b.position.y + NODE_HEIGHT &&
          b.position.y < a.position.y + NODE_HEIGHT;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });
});

describe("node summaries", () => {
  const live = executionReducer(replay(FIXTURES.corrected.events), { type: "stream_complete" });

  it("derives card metadata only from backend data", () => {
    expect(nodeMeta("evidence_retrieval", live.nodes.evidence_retrieval.runs[0])).toEqual(["1 passage"]);
    expect(nodeMeta("claim_decomposition", live.nodes.claim_decomposition.runs[0])).toEqual(["1 claim"]);
    expect(nodeMeta("self_correction", live.nodes.self_correction.runs[1])).toEqual(["Round 2", "1 claim targeted"]);
    expect(nodeMeta("verification_router", live.nodes.verification_router.runs[0])).toEqual(["Needs correction"]);
    expect(nodeMeta("query_input", undefined)).toEqual([]);
  });

  it("shows the error message for failed nodes", () => {
    const f = replay(FIXTURES.failed.events);
    expect(nodeMeta("claim_verification", f.nodes.claim_verification.runs[0])[0]).toContain("verification_error");
  });

  it("formats durations", () => {
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(240)).toBe("240 ms");
    expect(formatDuration(1500)).toBe("1.5 s");
    expect(formatDuration(42000)).toBe("42 s");
  });
});
