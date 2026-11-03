/**
 * Test helpers over fixtures recorded from the real backend (see CITELOCK_DUMP_FIXTURES in
 * backend/tests/unit/test_langgraph_pipeline.py). Each fixture holds the raw SSE body exactly as the browser
 * receives it, plus the stored history detail for the same query.
 */
import { SSEParser } from "@/lib/sse";
import type { PipelineCompletePayload } from "@/types/pipeline";
import type { QueryDetail, QueryHistoryItem } from "@/types";
import type { GraphEvent, TraceRecord } from "@/types/execution";
import verified from "./__fixtures__/verified.json";
import corrected from "./__fixtures__/corrected.json";
import abstained from "./__fixtures__/abstained.json";
import failed from "./__fixtures__/failed.json";

export interface RecordedRun {
  scenario: string;
  sse: string;
  detail: QueryDetail;
  history_item: QueryHistoryItem;
}

export const RUNS = { verified, corrected, abstained, failed } as unknown as Record<string, RecordedRun>;
export const RUN_NAMES = Object.keys(RUNS);

export function frames(name: string) {
  return new SSEParser().feed(RUNS[name].sse);
}

export function graphEvents(name: string): GraphEvent[] {
  return frames(name).flatMap((f) => (f.type === "event" && f.event === "graph_event" ? [JSON.parse(f.data) as GraphEvent] : []));
}

export function completePayload(name: string): PipelineCompletePayload {
  const f = frames(name).find((x) => x.type === "event" && x.event === "pipeline_complete");
  if (!f || f.type !== "event") throw new Error(`${name} has no pipeline_complete frame`);
  return JSON.parse(f.data);
}

export function persistedTrace(name: string): TraceRecord[] {
  return RUNS[name].detail.execution_trace;
}

export function eventNames(name: string): string[] {
  return frames(name).map((f) => (f.type === "event" ? f.event : "heartbeat"));
}

/** Deterministic pseudo-random chunk sizes so network fragmentation is reproducible in tests. */
export function chunkBytes(text: string, seed = 7): Uint8Array[] {
  const bytes = new TextEncoder().encode(text);
  const chunks: Uint8Array[] = [];
  let state = seed;
  let i = 0;
  while (i < bytes.length) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const size = 1 + (state % 97);
    chunks.push(bytes.slice(i, i + size));
    i += size;
  }
  return chunks;
}

export function readerOf(chunks: Array<string | Uint8Array>, opts: { failWith?: Error; hangAfter?: boolean } = {}) {
  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        const c = chunks[i++];
        controller.enqueue(typeof c === "string" ? encoder.encode(c) : c);
      } else if (opts.failWith) {
        controller.error(opts.failWith);
      } else if (!opts.hangAfter) {
        controller.close();
      }
    },
  });
  return stream.getReader();
}
