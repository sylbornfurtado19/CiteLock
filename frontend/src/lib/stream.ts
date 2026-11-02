import { auth } from "./firebase/client";
import { ApiError } from "./api";
import { consumeSSEStream, StreamInterruptedError } from "./sse";
import type { GraphEvent } from "@/types/execution";
import { PipelineEvent, PipelineCompletePayload } from "@/types/pipeline";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

/** The backend sends an SSE heartbeat every 30s; three missed beats means the connection is dead. */
export const STREAM_IDLE_TIMEOUT_MS = 90_000;

export interface StreamPipelineOptions {
  workspaceId: string;
  prompt: string;
  topK?: number;
  onEvent?: (event: PipelineEvent) => void;
  /** Real LangGraph node lifecycle and routing events (`graph_event` frames). */
  onGraphEvent?: (event: GraphEvent) => void;
  onComplete?: (data: PipelineCompletePayload) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

/**
 * Executes a pipeline query via Server-Sent Events (SSE), streaming real-time
 * backend stage and graph events and resolving with the final QueryResponse payload.
 */
export async function streamPipelineQuery({
  workspaceId,
  prompt,
  topK = 5,
  onEvent,
  onGraphEvent,
  onComplete,
  onError,
  signal,
}: StreamPipelineOptions): Promise<PipelineCompletePayload> {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "text/event-stream");

  // Ensure Firebase Auth session is restored
  if (typeof window !== "undefined" && typeof auth.authStateReady === "function") {
    try {
      await auth.authStateReady();
    } catch {
      // Continue even if auth ready check encounters an issue
    }
  }

  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken();
      headers.set("Authorization", `Bearer ${token}`);
    } catch (e) {
      console.warn("Failed to retrieve ID token for SSE query:", e);
    }
  }

  const endpoint = `${API_BASE_URL}/api/v1/workspaces/${encodeURIComponent(workspaceId)}/queries?stream=true`;

  // Internal controller so an idle watchdog can abort a silently dead connection.
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort);
  if (signal?.aborted) controller.abort();

  let idleTimedOut = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const armWatchdog = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimedOut = true;
      controller.abort();
    }, STREAM_IDLE_TIMEOUT_MS);
  };
  const cleanup = () => {
    if (idleTimer) clearTimeout(idleTimer);
    signal?.removeEventListener("abort", forwardAbort);
  };

  const fail = (err: Error): never => {
    onError?.(err);
    throw err;
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt, top_k: topK }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    cleanup();
    if (signal?.aborted) {
      throw new Error("Query was cancelled by user.");
    }
    return fail(err instanceof Error ? err : new Error(String(err)));
  }

  if (!response.ok) {
    cleanup();
    let errorDetail = response.statusText;
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || JSON.stringify(errorJson);
    } catch {
      // Ignore JSON parse failure
    }
    return fail(new ApiError(response.status, `Pipeline Error ${response.status}: ${errorDetail}`));
  }

  // Handle non-streaming fallback if backend responded with regular JSON
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    cleanup();
    const json = (await response.json()) as PipelineCompletePayload;
    onComplete?.(json);
    return json;
  }

  if (!response.body) {
    cleanup();
    return fail(new Error("Response body is not readable for SSE streaming."));
  }

  armWatchdog();
  try {
    return await consumeSSEStream(response.body.getReader(), {
      onPipelineEvent: onEvent,
      onGraphEvent,
      onComplete,
      onActivity: armWatchdog,
      onHeartbeat: armWatchdog,
    });
  } catch (err: unknown) {
    if (signal?.aborted) {
      throw new Error("Query was cancelled.");
    }
    if (idleTimedOut) {
      return fail(
        new StreamInterruptedError(`No data received from the pipeline for ${STREAM_IDLE_TIMEOUT_MS / 1000}s; connection closed.`)
      );
    }
    return fail(err instanceof Error ? err : new Error(String(err)));
  } finally {
    cleanup();
  }
}
