import { auth } from "./firebase/client";
import { ApiError } from "./api";
import { PipelineEvent, PipelineCompletePayload, PipelineErrorPayload } from "@/types/pipeline";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

export interface StreamPipelineOptions {
  workspaceId: string;
  prompt: string;
  topK?: number;
  onEvent?: (event: PipelineEvent) => void;
  onComplete?: (data: PipelineCompletePayload) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

/**
 * Executes a pipeline query via Server-Sent Events (SSE), streaming real-time
 * backend stage events and resolving with the final QueryResponse payload.
 */
export async function streamPipelineQuery({
  workspaceId,
  prompt,
  topK = 5,
  onEvent,
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

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt, top_k: topK }),
      signal,
    });
  } catch (err: unknown) {
    if (signal?.aborted) {
      throw new Error("Query was cancelled by user.");
    }
    const error = err instanceof Error ? err : new Error(String(err));
    onError?.(error);
    throw error;
  }

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || JSON.stringify(errorJson);
    } catch {
      // Ignore JSON parse failure
    }
    const err = new ApiError(response.status, `Pipeline Error ${response.status}: ${errorDetail}`);
    onError?.(err);
    throw err;
  }

  // Handle non-streaming fallback if backend responded with regular JSON
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = (await response.json()) as PipelineCompletePayload;
    onComplete?.(json);
    return json;
  }

  if (!response.body) {
    const err = new Error("Response body is not readable for SSE streaming.");
    onError?.(err);
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finalPayload: PipelineCompletePayload | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by double newlines (\n\n or \r\n\r\n)
      const frames = buffer.split(/\r?\n\r?\n/);
      // Retain last incomplete chunk in buffer
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        if (!frame.trim() || frame.startsWith(":")) {
          // SSE heartbeat comment or empty frame
          continue;
        }

        let eventType = "message";
        const dataLines: string[] = [];

        const lines = frame.split(/\r?\n/);
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        }

        const dataStr = dataLines.join("\n");
        if (!dataStr) continue;

        try {
          const parsed = JSON.parse(dataStr);

          if (eventType === "pipeline_event") {
            const eventPayload = parsed as PipelineEvent;
            onEvent?.(eventPayload);
          } else if (eventType === "pipeline_complete") {
            finalPayload = parsed as PipelineCompletePayload;
            onComplete?.(finalPayload);
          } else if (eventType === "pipeline_error") {
            const errorPayload = parsed as PipelineErrorPayload;
            const err = new Error(errorPayload.message || "Pipeline execution failed.");
            onError?.(err);
            throw err;
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message.includes("Pipeline")) {
            throw parseErr;
          }
          console.warn("Failed to parse SSE payload:", dataStr, parseErr);
        }
      }
    }
  } catch (err: unknown) {
    if (signal?.aborted) {
      throw new Error("Query was cancelled.");
    }
    const error = err instanceof Error ? err : new Error(String(err));
    onError?.(error);
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (!finalPayload) {
    const err = new Error("Pipeline connection closed before receiving completion payload.");
    onError?.(err);
    throw err;
  }

  return finalPayload;
}

