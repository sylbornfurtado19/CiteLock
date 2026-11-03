/**
 * Dependency-free Server-Sent Events parsing used by the pipeline stream client.
 *
 * Handles: partial chunks split anywhere (including inside a frame or a multi-byte character),
 * several events in one chunk, CRLF / LF / CR line endings, heartbeat comments, multi-line data,
 * server-side pipeline errors, and connections that close or fail before the final completion event.
 */

import type { GraphEvent } from "@/types/execution";
import type { PipelineCompletePayload, PipelineErrorPayload, PipelineEvent } from "@/types/pipeline";

export type SSEFrame =
  | { type: "event"; event: string; data: string; id?: string }
  | { type: "comment"; text: string };

export class SSEParser {
  private buffer = "";

  /** Feed a decoded text chunk; returns every frame completed by it. */
  feed(chunk: string): SSEFrame[] {
    this.buffer += chunk;
    // Normalize CRLF and lone CR so frame boundaries are always "\n\n".
    this.buffer = this.buffer.replace(/\r\n/g, "\n").replace(/\r(?!$)/g, "\n");

    const frames: SSEFrame[] = [];
    let boundary = this.buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const raw = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const frame = parseFrame(raw);
      if (frame) frames.push(frame);
      boundary = this.buffer.indexOf("\n\n");
    }
    return frames;
  }

  /** Unterminated bytes left in the buffer when the connection closed. */
  get pending(): string {
    return this.buffer;
  }
}

function parseFrame(raw: string): SSEFrame | null {
  if (!raw.trim()) return null;

  let event = "message";
  let id: string | undefined;
  const data: string[] = [];
  const comments: string[] = [];

  for (const line of raw.split("\n")) {
    if (line.startsWith(":")) {
      comments.push(line.slice(1).trim());
    } else if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).replace(/^ /, ""));
    } else if (line.startsWith("id:")) {
      id = line.slice(3).trim();
    }
  }

  if (data.length === 0) {
    return comments.length > 0 ? { type: "comment", text: comments.join(" ") } : null;
  }
  return { type: "event", event, data: data.join("\n"), id };
}

/** Raised when the stream ends or breaks before the backend's `pipeline_complete` event. */
export class StreamInterruptedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "StreamInterruptedError";
  }
}

/** Raised for a `pipeline_error` event sent by the backend (the pipeline itself failed). */
export class PipelineFailedError extends Error {
  constructor(message: string, public readonly payload?: PipelineErrorPayload) {
    super(message);
    this.name = "PipelineFailedError";
  }
}

/** Raised when the backend's completion event is not a usable answer (never rendered as an empty response). */
export class InvalidResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidResponseError";
  }
}

export function validateCompletePayload(payload: unknown): PipelineCompletePayload {
  const p = payload as Partial<PipelineCompletePayload> | null;
  const answer = p?.answer as Partial<PipelineCompletePayload["answer"]> | undefined;
  if (
    !p ||
    typeof p !== "object" ||
    !answer ||
    typeof answer !== "object" ||
    typeof answer.id !== "string" ||
    typeof answer.final_text !== "string" ||
    !Array.isArray(answer.claims)
  ) {
    throw new InvalidResponseError("The server returned an incomplete answer. Please try again.");
  }
  return p as PipelineCompletePayload;
}

export interface SSEHandlers {
  onPipelineEvent?: (event: PipelineEvent) => void;
  onGraphEvent?: (event: GraphEvent) => void;
  onComplete?: (payload: PipelineCompletePayload) => void;
  onHeartbeat?: () => void;
  /** Called for every chunk or heartbeat so callers can run an idle watchdog. */
  onActivity?: () => void;
}

/**
 * Read an SSE byte stream to the end, dispatching typed events. Resolves with the final payload, or throws
 * PipelineFailedError (backend reported failure) / StreamInterruptedError (connection closed or broke).
 */
export async function consumeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: SSEHandlers = {}
): Promise<PipelineCompletePayload> {
  const decoder = new TextDecoder("utf-8");
  const parser = new SSEParser();
  let finalPayload: PipelineCompletePayload | null = null;

  const dispatch = (frame: SSEFrame) => {
    if (frame.type === "comment") {
      handlers.onHeartbeat?.();
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(frame.data);
    } catch (err) {
      console.warn("Ignoring SSE frame with invalid JSON payload:", frame.event, err);
      return;
    }

    switch (frame.event) {
      case "pipeline_event":
        handlers.onPipelineEvent?.(parsed as PipelineEvent);
        break;
      case "graph_event":
        handlers.onGraphEvent?.(parsed as GraphEvent);
        break;
      case "pipeline_complete":
        finalPayload = validateCompletePayload(parsed);
        handlers.onComplete?.(finalPayload);
        break;
      case "pipeline_error": {
        const payload = parsed as PipelineErrorPayload;
        throw new PipelineFailedError(payload.message || "Pipeline execution failed.", payload);
      }
      default:
        break;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      handlers.onActivity?.();
      for (const frame of parser.feed(decoder.decode(value, { stream: true }))) {
        dispatch(frame);
      }
    }
    // Flush any multi-byte tail and a final frame the server did not terminate with a blank line.
    const tail = decoder.decode();
    if (tail) parser.feed(tail);
    if (parser.pending.trim()) {
      for (const frame of parser.feed("\n\n")) dispatch(frame);
    }
  } catch (err) {
    if (err instanceof PipelineFailedError || err instanceof InvalidResponseError) throw err;
    throw new StreamInterruptedError(
      err instanceof Error && err.message ? `Pipeline stream interrupted: ${err.message}` : "Pipeline stream interrupted.",
      err
    );
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Lock already released by a cancelled reader.
    }
  }

  if (!finalPayload) {
    throw new StreamInterruptedError("Pipeline connection closed before receiving completion payload.");
  }
  return finalPayload;
}
