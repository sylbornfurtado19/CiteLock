import { describe, expect, it, vi } from "vitest";
import { consumeSSEStream, PipelineFailedError, SSEParser, StreamInterruptedError } from "./sse";
import { chunkBytes, graphEvents, RUNS, completePayload } from "./execution/testFixtures";

const encoder = new TextEncoder();

function frame(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function readerOf(chunks: Array<string | Uint8Array>, opts: { failWith?: Error } = {}) {
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        const c = chunks[i++];
        controller.enqueue(typeof c === "string" ? encoder.encode(c) : c);
      } else if (opts.failWith) {
        controller.error(opts.failWith);
      } else {
        controller.close();
      }
    },
  });
  return stream.getReader();
}

const COMPLETE = { query_id: "q1", workspace_id: "w1", prompt: "p", answer: { id: "a1", final_text: "An answer.", claims: [] } };

describe("SSEParser", () => {
  it("returns nothing until a blank line terminates the frame", () => {
    const p = new SSEParser();
    expect(p.feed("event: pipeline_event\ndata: {\"a\":1}")).toEqual([]);
    expect(p.feed("\n\n")).toEqual([{ type: "event", event: "pipeline_event", data: '{"a":1}', id: undefined }]);
  });

  it("parses several events delivered in one chunk", () => {
    const frames = new SSEParser().feed(frame("graph_event", { n: 1 }) + frame("graph_event", { n: 2 }) + frame("pipeline_event", { n: 3 }));
    expect(frames.map((f) => (f.type === "event" ? f.event : "comment"))).toEqual(["graph_event", "graph_event", "pipeline_event"]);
  });

  it("handles CRLF and lone-CR line endings", () => {
    const frames = new SSEParser().feed('event: graph_event\r\ndata: {"n":1}\r\n\r\nevent: graph_event\rdata: {"n":2}\r\r\n');
    expect(frames).toHaveLength(2);
  });

  it("holds a trailing CR until the next chunk because it may be half of a CRLF", () => {
    const parser = new SSEParser();
    expect(parser.feed('event: graph_event\r\ndata: {"n":1}\r\n\r')).toEqual([]);
    expect(parser.feed("\n")).toHaveLength(1);
  });

  it("joins multi-line data fields", () => {
    const [f] = new SSEParser().feed("event: x\ndata: line one\ndata: line two\n\n");
    expect(f).toMatchObject({ type: "event", data: "line one\nline two" });
  });

  it("reports heartbeat comments separately from events", () => {
    const frames = new SSEParser().feed(": ping\n\n");
    expect(frames).toEqual([{ type: "comment", text: "ping" }]);
  });

  it("defaults the event name to message", () => {
    const [f] = new SSEParser().feed("data: hello\n\n");
    expect(f).toMatchObject({ event: "message" });
  });
});

describe("consumeSSEStream", () => {
  it("delivers pipeline, graph and completion events and resolves with the final payload", async () => {
    const onPipelineEvent = vi.fn();
    const onGraphEvent = vi.fn();
    const onComplete = vi.fn();
    const reader = readerOf([
      frame("pipeline_event", { stage: "retrieval", status: "running" }),
      frame("graph_event", { kind: "graph", event: "node_start", node: "query_input" }),
      frame("pipeline_complete", COMPLETE),
    ]);

    const result = await consumeSSEStream(reader, { onPipelineEvent, onGraphEvent, onComplete });

    expect(result).toEqual(COMPLETE);
    expect(onPipelineEvent).toHaveBeenCalledTimes(1);
    expect(onGraphEvent).toHaveBeenCalledWith(expect.objectContaining({ node: "query_input" }));
    expect(onComplete).toHaveBeenCalledWith(COMPLETE);
  });

  it("reassembles the real recorded stream, fragmented at arbitrary byte boundaries, into the same events", async () => {
    const expected = graphEvents("corrected");
    for (const seed of [1, 7, 42]) {
      const received: unknown[] = [];
      const result = await consumeSSEStream(readerOf(chunkBytes(RUNS.corrected.sse, seed)), { onGraphEvent: (e) => received.push(e) });
      expect(received).toEqual(expected);
      expect(result).toEqual(completePayload("corrected"));
    }
  });

  it("does not corrupt multi-byte characters split across chunks", async () => {
    const text = frame("graph_event", { note: "résumé — \u{1F512}" }) + frame("pipeline_complete", COMPLETE);
    const bytes = encoder.encode(text);
    const emoji = bytes.indexOf(0xf0); // first byte of the 4-byte emoji
    const chunks = [bytes.slice(0, emoji + 2), bytes.slice(emoji + 2)];

    const received: any[] = [];
    await consumeSSEStream(readerOf(chunks), { onGraphEvent: (e) => received.push(e) });

    expect(received[0].note).toBe("résumé — \u{1F512}");
  });

  it("counts heartbeats and does not treat them as events", async () => {
    const onHeartbeat = vi.fn();
    const onGraphEvent = vi.fn();
    await consumeSSEStream(readerOf([": ping\n\n", ": ping\n\n", frame("pipeline_complete", COMPLETE)]), { onHeartbeat, onGraphEvent });
    expect(onHeartbeat).toHaveBeenCalledTimes(2);
    expect(onGraphEvent).not.toHaveBeenCalled();
  });

  it("reports activity for every chunk so an idle watchdog can be re-armed", async () => {
    const onActivity = vi.fn();
    await consumeSSEStream(readerOf([": ping\n\n", frame("pipeline_complete", COMPLETE)]), { onActivity });
    expect(onActivity).toHaveBeenCalledTimes(2);
  });

  it("surfaces a backend pipeline_error as PipelineFailedError", async () => {
    const reader = readerOf([frame("pipeline_error", { status: "failed", message: "Verification service is temporarily unavailable." })]);
    await expect(consumeSSEStream(reader)).rejects.toMatchObject({
      name: "PipelineFailedError",
      message: "Verification service is temporarily unavailable.",
    });
    await expect(consumeSSEStream(readerOf([frame("pipeline_error", { status: "failed", message: "x" })]))).rejects.toBeInstanceOf(PipelineFailedError);
  });

  it("raises StreamInterruptedError when the connection closes before completion", async () => {
    const reader = readerOf([frame("graph_event", { kind: "graph", event: "node_start", node: "query_input" })]);
    await expect(consumeSSEStream(reader)).rejects.toMatchObject({
      name: "StreamInterruptedError",
      message: "Pipeline connection closed before receiving completion payload.",
    });
  });

  it("wraps a mid-stream network failure as StreamInterruptedError after delivering earlier events", async () => {
    const onGraphEvent = vi.fn();
    const reader = readerOf([frame("graph_event", { kind: "graph", event: "node_start", node: "query_input" })], {
      failWith: new Error("network reset"),
    });

    const error = await consumeSSEStream(reader, { onGraphEvent }).catch((e) => e);

    expect(error).toBeInstanceOf(StreamInterruptedError);
    expect(error.message).toContain("network reset");
    expect(onGraphEvent).toHaveBeenCalledTimes(1);
  });

  it("ignores frames with invalid JSON without losing later events", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onGraphEvent = vi.fn();
    await consumeSSEStream(
      readerOf(["event: graph_event\ndata: {not json\n\n", frame("graph_event", { ok: true }), frame("pipeline_complete", COMPLETE)]),
      { onGraphEvent }
    );
    expect(onGraphEvent).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("flushes a final frame the server did not terminate with a blank line", async () => {
    const reader = readerOf([`event: pipeline_complete\ndata: ${JSON.stringify(COMPLETE)}`]);
    await expect(consumeSSEStream(reader)).resolves.toEqual(COMPLETE);
  });

  it("ignores unknown event types from newer backends", async () => {
    const onGraphEvent = vi.fn();
    await consumeSSEStream(readerOf([frame("future_event", { x: 1 }), frame("pipeline_complete", COMPLETE)]), { onGraphEvent });
    expect(onGraphEvent).not.toHaveBeenCalled();
  });
});
