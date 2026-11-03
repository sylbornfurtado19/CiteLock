import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveApiBaseUrl, ApiConfigError } from "./config";

vi.mock("./firebase/client", () => ({ auth: { authStateReady: async () => {}, currentUser: null } }));
vi.mock("./api", () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

import { streamPipelineQuery, STREAM_IDLE_TIMEOUT_MS } from "./stream";
import { StreamInterruptedError } from "./sse";
import { RUNS } from "./execution/testFixtures";

/** A fetch whose body never produces data and rejects once its request is aborted (a silently dead connection). */
function silentFetch() {
  return vi.fn((_url: string, init: RequestInit) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        init.signal?.addEventListener("abort", () => controller.error(new DOMException("The operation was aborted.", "AbortError")));
      },
    });
    return Promise.resolve(new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }));
  });
}

describe("streamPipelineQuery against a real recorded stream", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://citelock-backend.onrender.com");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("posts to the configured backend, streams graph events and resolves with the final payload", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(RUNS.corrected.sse, { status: 200, headers: { "content-type": "text/event-stream" } }))
    );
    vi.stubGlobal("fetch", fetchMock);
    const nodes: string[] = [];

    const result = await streamPipelineQuery({
      workspaceId: "ws-1",
      prompt: "q",
      onGraphEvent: (e) => nodes.push(e.node),
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://citelock-backend.onrender.com/api/v1/workspaces/ws-1/queries?stream=true");
    expect((init.headers as Headers).get("Accept")).toBe("text/event-stream");
    expect(nodes).toContain("self_correction");
    expect(result.answer.final_text).toBe("Titan uses mTLS.");
  });

  it("closes a silent connection after the idle timeout and reports an interruption", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", silentFetch());
    const onError = vi.fn();

    const pending = streamPipelineQuery({ workspaceId: "ws-1", prompt: "q", onError }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS - 1000);
    expect(onError).not.toHaveBeenCalled(); // still within the allowed silence
    await vi.advanceTimersByTimeAsync(2000);

    const error = await pending;
    expect(error).toBeInstanceOf(StreamInterruptedError);
    expect(error.message).toMatch(/No data received/);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("heartbeats keep a quiet but healthy connection open past the idle timeout", async () => {
    vi.useFakeTimers();
    let push!: (s: string) => void;
    let close!: () => void;
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        push = (s) => c.enqueue(enc.encode(s));
        close = () => c.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }))));

    const pending = streamPipelineQuery({ workspaceId: "ws-1", prompt: "q" });
    const settled = vi.fn();
    pending.then(settled, settled);

    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS - 5000);
      push(": ping\n\n");
    }
    await vi.advanceTimersByTimeAsync(10);
    expect(settled).not.toHaveBeenCalled(); // 4 x ~85s of silence between beats, never 90s without data

    const complete = RUNS.verified.sse.slice(RUNS.verified.sse.indexOf("event: pipeline_complete"));
    push(complete);
    close();
    await expect(pending).resolves.toMatchObject({ answer: { final_text: expect.any(String) } });
  });

  it("a user abort is reported as a cancellation, not as a failure to retry", async () => {
    vi.stubGlobal("fetch", silentFetch());
    const controller = new AbortController();
    const pending = streamPipelineQuery({ workspaceId: "ws-1", prompt: "q", signal: controller.signal }).catch((e) => e);
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    expect((await pending).message).toMatch(/cancelled/i);
  });

  it("surfaces HTTP errors with the backend's detail message", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ detail: "Query rejected by Prompt Injection Guard" }), { status: 400 }))));
    await expect(streamPipelineQuery({ workspaceId: "ws-1", prompt: "q" })).rejects.toThrow(/Prompt Injection Guard/);
  });

  it("refuses to call localhost from a deployed site when the backend URL is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("window", { location: { hostname: "cite-lock.vercel.app" } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(streamPipelineQuery({ workspaceId: "ws-1", prompt: "q" })).rejects.toBeInstanceOf(ApiConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resolveApiBaseUrl", () => {
  it("allows the localhost default during development", () => {
    expect(resolveApiBaseUrl({ nodeEnv: "development", hostname: "localhost" })).toBe("http://localhost:8000");
    expect(resolveApiBaseUrl({ nodeEnv: "production", hostname: "localhost" })).toBe("http://localhost:8000");
  });

  it("uses the configured URL and strips trailing slashes", () => {
    expect(resolveApiBaseUrl({ env: "https://api.example.com//", nodeEnv: "production", hostname: "app.vercel.app" })).toBe("https://api.example.com");
  });

  it("fails loudly in a deployment when the URL is missing or points at localhost", () => {
    expect(() => resolveApiBaseUrl({ nodeEnv: "production", hostname: "app.vercel.app" })).toThrow(ApiConfigError);
    expect(() => resolveApiBaseUrl({ env: "http://localhost:8000", nodeEnv: "production", hostname: "app.vercel.app" })).toThrow(/not reachable/);
    expect(() => resolveApiBaseUrl({ env: "http://127.0.0.1:8000", nodeEnv: "production", hostname: "app.vercel.app" })).toThrow(ApiConfigError);
  });

  it("does not treat server-side rendering (no hostname) as a deployment error", () => {
    expect(resolveApiBaseUrl({ nodeEnv: "production" })).toBe("http://localhost:8000");
  });
});
