import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Answer } from "@/types";
import type { ExecutionState, GraphEvent, GraphNodeId } from "@/types/execution";
import { AnswerMetricsPanel, EmptyAnswerNotice } from "@/components/chat/AnswerMetricsPanel";
import { buildAnswerMetrics, formatLatency, isBlankAnswer } from "./answerMetrics";
import { createInitialState, executionReducer } from "./execution/reducer";
import { planRestore } from "./execution/history";
import { GRAPH_NODES, STATIC_EDGES } from "./execution/graphDefinition";
import {
  RUNS,
  RUN_NAMES,
  chunkBytes,
  completePayload,
  eventNames,
  graphEvents,
  persistedTrace,
  readerOf,
} from "./execution/testFixtures";
import { consumeSSEStream, InvalidResponseError, PipelineFailedError, StreamInterruptedError, validateCompletePayload } from "./sse";

/**
 * Drives the real client pipeline with a recorded backend stream: bytes -> SSE parser -> typed events ->
 * execution reducer -> completion payload. Mirrors what ChatPanel does, minus React.
 */
async function runClient(name: string, opts: { seed?: number; body?: string } = {}) {
  let state: ExecutionState = executionReducer(createInitialState(), { type: "stream_started" });
  const log: string[] = [];
  const body = opts.body ?? RUNS[name].sse;
  let payload: Awaited<ReturnType<typeof consumeSSEStream>> | null = null;
  let error: Error | null = null;

  try {
    payload = await consumeSSEStream(readerOf(chunkBytes(body, opts.seed ?? 3)), {
      onGraphEvent: (event) => {
        state = executionReducer(state, { type: "graph_event", event });
        log.push(`${event.event}:${event.node}`);
      },
      onComplete: () => {
        state = executionReducer(state, { type: "stream_complete" });
        log.push("complete");
      },
    });
  } catch (err) {
    error = err as Error;
    if (err instanceof PipelineFailedError || err instanceof InvalidResponseError) {
      state = executionReducer(state, { type: "stream_failed", message: err.message });
    } else {
      state = executionReducer(state, { type: "stream_interrupted", message: (err as Error).message });
    }
  }
  return { state, payload, error, log };
}

const LOOP_EDGES = new Set(STATIC_EDGES.filter((e) => e.feedback).map((e) => e.id));
const statuses = (s: ExecutionState) => Object.fromEntries(GRAPH_NODES.map((n) => [n.id, s.nodes[n.id].status]));
const runCounts = (s: ExecutionState) => Object.fromEntries(GRAPH_NODES.map((n) => [n.id, s.nodes[n.id].runs.length]));

describe("A. normal execution, query to final answer", () => {
  it("delivers a complete final answer from the backend completion payload", async () => {
    const { state, payload, error } = await runClient("verified");

    expect(error).toBeNull();
    expect(payload).not.toBeNull();
    const answer = payload!.answer;
    expect(isBlankAnswer(answer.final_text)).toBe(false);
    expect(answer.final_text).toBe(RUNS.verified.detail.answer!.final_text);
    expect(answer.claims.length).toBeGreaterThan(0);
    expect(state.runStatus).toBe("completed");
    expect(state.nodes.database_persistence.status).toBe("completed");
  });

  it("renders every required metric from the payload", async () => {
    const { payload } = await runClient("verified");
    const metrics = buildAnswerMetrics(payload!.answer, {
      verificationStatus: payload!.verification_status,
      executionMetadata: payload!.execution_metadata,
    });
    const html = renderToStaticMarkup(React.createElement(AnswerMetricsPanel, { metrics }));

    expect(metrics.verificationStatus).toBe(payload!.verification_status);
    expect(metrics.totalClaims).toBe(payload!.answer.claims.length);
    expect(metrics.supported).toBe(payload!.answer.claims.filter((c) => c.verdict === "supported").length);
    expect(metrics.groundingRate).toBe(payload!.execution_metadata!.grounding_rate);
    expect(metrics.hallucinationRate).toBe(payload!.execution_metadata!.hallucination_rate);
    expect(metrics.latencyMs).toBe(payload!.execution_metadata!.latency_ms);
    expect(metrics.ratesSource).toBe("backend");
    for (const testId of [
      "metric-status", "metric-grounding", "metric-hallucination", "metric-total", "metric-supported",
      "metric-partial", "metric-unsupported", "metric-contradicted", "metric-rounds", "metric-latency",
    ]) {
      expect(html).toContain(`data-testid="${testId}"`);
    }
    expect(html).toContain("Verified");
    expect(html).toContain(formatLatency(metrics.latencyMs));
  });

  it("never reports completion before the backend confirms it", async () => {
    // Everything except the pipeline_complete frame: the graph must not claim the run finished.
    const truncated = RUNS.verified.sse.slice(0, RUNS.verified.sse.indexOf("event: pipeline_complete"));
    const { state, payload, error } = await runClient("verified", { body: truncated });

    expect(payload).toBeNull();
    expect(error).toBeInstanceOf(StreamInterruptedError);
    expect(state.runStatus).toBe("interrupted");
    expect(state.runStatus).not.toBe("completed");
  });

  it("only streams events the backend produced, in order, ending with pipeline_complete", () => {
    const names = eventNames("verified");
    expect(names[names.length - 1]).toBe("pipeline_complete");
    expect(names).not.toContain("pipeline_error");
    const seqs = graphEvents("verified").map((e) => e.seq);
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));
  });
});

describe("B. correction execution", () => {
  it("shows the correction loop and delivers the corrected answer with its history", async () => {
    const { state, payload } = await runClient("corrected");

    expect(state.runStatus).toBe("completed");
    expect(state.nodes.self_correction.runs.map((r) => r.round)).toEqual([1, 2]);
    expect(state.nodes.re_verification.runs).toHaveLength(2);
    expect(state.decisions.map((d) => d.route)).toEqual(["correct", "correct", "finalize"]);
    expect(state.edges["re_verification->self_correction"].count).toBe(1);
    expect(payload!.answer.final_text).toBe("Titan uses mTLS.");
    expect(payload!.answer.correction_rounds).toBe(2);
    expect(payload!.answer.correction_history).toHaveLength(2);
    expect(buildAnswerMetrics(payload!.answer, { executionMetadata: payload!.execution_metadata }).correctionRounds).toBe(2);
  });
});

describe("C. abstention", () => {
  it("routes through abstention and displays an appropriate response", async () => {
    const { state, payload } = await runClient("abstained");

    expect(state.nodes.abstention.status).toBe("completed");
    expect(state.decisions[state.decisions.length - 1].route).toBe("abstain");
    expect(payload!.answer.is_abstained).toBe(true);
    expect(payload!.answer.final_text.toLowerCase()).toContain("sufficient evidence");
    const metrics = buildAnswerMetrics(payload!.answer, { verificationStatus: payload!.verification_status });
    expect(metrics.statusLabel).toBe("Abstained");
    expect(renderToStaticMarkup(React.createElement(AnswerMetricsPanel, { metrics }))).toContain("Abstained");
  });
});

describe("D. error handling", () => {
  it("surfaces a backend pipeline_error clearly and shows the failed nodes, with no answer", async () => {
    const { state, payload, error } = await runClient("failed");

    expect(error).toBeInstanceOf(PipelineFailedError);
    expect(error!.message).toMatch(/temporarily unavailable/i);
    expect(payload).toBeNull();
    expect(state.runStatus).toBe("failed");
    expect(state.nodes.claim_verification.status).toBe("failed");
    expect(state.nodes.error_handler.status).toBe("failed");
    expect(state.nodes.database_persistence.status).toBe("skipped");
  });

  it("treats a connection that breaks mid-stream as an interruption, not a completion", async () => {
    const body = RUNS.corrected.sse;
    const cut = body.slice(0, Math.floor(body.length / 2));
    const { state, error, payload } = await runClient("corrected", { body: cut });

    expect(error).toBeInstanceOf(StreamInterruptedError);
    expect(payload).toBeNull();
    expect(state.runStatus).toBe("interrupted");
    expect(Object.values(state.edges).every((e) => !e.active)).toBe(true);
    expect(Object.values(state.nodes).filter((n) => n.status === "running")).toHaveLength(0);
  });

  it.each([
    ["no answer object", { query_id: "q", workspace_id: "w", prompt: "p" }],
    ["answer without text", { answer: { id: "a", claims: [] } }],
    ["answer without claims array", { answer: { id: "a", final_text: "x" } }],
    ["not an object", "nope"],
  ])("rejects an invalid completion payload (%s) instead of rendering an empty answer", (_, payload) => {
    expect(() => validateCompletePayload(payload)).toThrow(InvalidResponseError);
  });

  it("fails the run when the completion frame is invalid", async () => {
    const body = `event: pipeline_complete\ndata: ${JSON.stringify({ query_id: "q", answer: {} })}\n\n`;
    const { error, state } = await runClient("verified", { body });
    expect(error).toBeInstanceOf(InvalidResponseError);
    expect(state.runStatus).toBe("failed");
  });

  it("an empty answer text is flagged rather than rendered as a blank card", () => {
    expect(isBlankAnswer("   \n")).toBe(true);
    expect(renderToStaticMarkup(React.createElement(EmptyAnswerNotice))).toContain("no answer text");
    // ...while a payload with an empty string is still structurally valid, so the UI shows the notice
    expect(() => validateCompletePayload({ answer: { id: "a", final_text: "", claims: [] } })).not.toThrow();
  });
});

describe("E. graph integrity", () => {
  it.each(RUN_NAMES)("never shows missing, stale or inconsistent statuses at any point of the %s run", (name) => {
    const events = graphEvents(name);
    let state = createInitialState();
    const started = new Set<string>();
    const completed = new Set<string>();

    for (const event of events) {
      state = executionReducer(state, { type: "graph_event", event });
      if (event.event === "node_start") started.add(event.node);
      if (event.event === "node_complete") completed.add(event.node);

      // every node always exists and has exactly one of the five states
      expect(Object.keys(state.nodes).sort()).toEqual(GRAPH_NODES.map((n) => n.id).sort());
      for (const n of GRAPH_NODES) {
        expect(["pending", "running", "completed", "failed", "skipped"]).toContain(state.nodes[n.id].status);
      }
      // at most one node runs at a time
      expect(GRAPH_NODES.filter((n) => state.nodes[n.id].status === "running").length).toBeLessThanOrEqual(1);
      // nothing is completed or running unless the backend said so
      for (const n of GRAPH_NODES) {
        const status = state.nodes[n.id].status;
        if (status === "completed") expect(completed.has(n.id)).toBe(true);
        if (status === "running") expect(started.has(n.id) && state.nodes[n.id].runs.at(-1)?.status === "running").toBe(true);
      }
      // an animated edge leads to a node that has not finished yet; the only exception is the declared
      // feedback loop, where the target's *previous* round is genuinely completed while the next round is routed
      for (const [id, rt] of Object.entries(state.edges)) {
        if (!rt.active) continue;
        const target = id.split("->")[1] as GraphNodeId;
        const status = state.nodes[target].status;
        if (status === "completed") {
          expect(LOOP_EDGES.has(id), `${id} animates into a completed node`).toBe(true);
          expect(state.nodes[target].runs.length).toBeGreaterThan(0);
        } else {
          expect(["pending", "running"]).toContain(status);
        }
      }
    }
  });

  it.each(RUN_NAMES)("ignores duplicated and replayed events (%s)", (name) => {
    const events = graphEvents(name);
    const once = events.reduce((s, e) => executionReducer(s, { type: "graph_event", event: e }), createInitialState());

    let doubled = createInitialState();
    for (const e of events) {
      doubled = executionReducer(doubled, { type: "graph_event", event: e });
      doubled = executionReducer(doubled, { type: "graph_event", event: e }); // immediate duplicate
    }
    // a reconnect replaying the whole run from the start
    for (const e of events) doubled = executionReducer(doubled, { type: "graph_event", event: e });

    expect(statuses(doubled)).toEqual(statuses(once));
    expect(runCounts(doubled)).toEqual(runCounts(once));
    expect(doubled.decisions).toHaveLength(once.decisions.length);
    expect(doubled.duplicatesDropped).toBe(events.length * 2);
    for (const [id, rt] of Object.entries(once.edges)) expect(doubled.edges[id].count).toBe(rt.count);
  });

  it("handles a large number of claims without slowing the graph state", () => {
    const claims = Array.from({ length: 500 }, (_, i) => ({
      index: i, text: `Claim ${i}`, verdict: "supported", confidence: 0.9, rationale: "r".repeat(400), evidence: [],
    }));
    const events: GraphEvent[] = [
      { kind: "graph", seq: 1, event: "node_start", node: "claim_verification", from_node: null, timestamp: "t" },
      { kind: "graph", seq: 2, event: "node_complete", node: "claim_verification", timestamp: "t", data: { claims, claims_total: 500 } },
    ];
    const started = performance.now();
    let state = createInitialState();
    for (let i = 0; i < 200; i++) {
      state = executionReducer(state, { type: "reset" });
      for (const e of events) state = executionReducer(state, { type: "graph_event", event: e });
    }
    expect(performance.now() - started).toBeLessThan(1000);
    expect(state.nodes.claim_verification.runs[0].data!.claims).toHaveLength(500);
  });

  it("summarizes very large claim sets quickly", () => {
    const claims = Array.from({ length: 2000 }, (_, i) => ({
      id: String(i), answer_id: "a", claim_index: i, claim_text: `c${i}`,
      verdict: (["supported", "unsupported", "contradicted", "partially_supported"] as const)[i % 4], evidence_links: [],
    }));
    const started = performance.now();
    const metrics = buildAnswerMetrics({ id: "a", query_id: "q", draft_text: "d", final_text: "f", correction_rounds: 0, is_abstained: false, claims, created_at: "t" } as unknown as Answer);
    renderToStaticMarkup(React.createElement(AnswerMetricsPanel, { metrics }));
    expect(performance.now() - started).toBeLessThan(500);
    expect(metrics.totalClaims).toBe(2000);
    expect(metrics.supported + metrics.unsupported + metrics.contradicted + metrics.partiallySupported).toBe(2000);
    expect(metrics.ratesSource).toBe("claims");
  });
});

describe("history: reopening a previous query restores what actually ran", () => {
  it.each(RUN_NAMES)("restores the stored answer, verification, correction history and graph (%s)", async (name) => {
    const plan = planRestore(RUNS[name].detail);
    const live = await runClient(name);

    expect(plan.execution).not.toBeNull();
    expect(statuses(plan.execution!)).toEqual(statuses(live.state));
    expect(runCounts(plan.execution!)).toEqual(runCounts(live.state));
    expect(plan.execution!.source).toBe("restored");

    if (name === "failed") {
      expect(plan.answer).toBeNull();
      expect(plan.errorText).toMatch(/verification_error/);
      expect(plan.execution!.runStatus).toBe("failed");
      // failed and skipped nodes are preserved, not dropped
      expect(plan.execution!.nodes.claim_verification.status).toBe("failed");
      expect(plan.execution!.nodes.database_persistence.status).toBe("skipped");
    } else {
      const final = live.payload!;
      expect(plan.answer!.final_text).toBe(final.answer.final_text);
      expect(plan.answer!.claims.map((c) => c.verdict)).toEqual(final.answer.claims.map((c) => c.verdict));
      expect(plan.answer!.correction_history).toEqual(final.answer.correction_history);
      expect(plan.verificationStatus).toBe(final.verification_status);
      expect(plan.execution!.runStatus).toBe("completed");
    }
  });

  it.each(RUN_NAMES)("restores the actual sequence of executed nodes, not an assumed path (%s)", (name) => {
    const liveOrder = graphEvents(name).filter((e) => e.event === "node_start").map((e) => e.node);
    const traceOrder = persistedTrace(name).map((t) => t.node);
    expect(traceOrder).toEqual(liveOrder);
  });

  it("reports no graph when a query has no recorded trace instead of inventing one", () => {
    const plan = planRestore({ ...RUNS.verified.detail, execution_trace: [] });
    expect(plan.execution).toBeNull();
    expect(plan.answer).not.toBeNull();
  });

  it("lists failed runs in history without an answer", () => {
    expect(RUNS.failed.history_item).toMatchObject({ status: "failed", answer_id: null, has_trace: true });
    expect(RUNS.verified.history_item).toMatchObject({ status: "completed", has_trace: true });
  });
});
