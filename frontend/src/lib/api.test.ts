import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./firebase/client", () => ({ auth: { authStateReady: async () => {}, currentUser: { getIdToken: async () => "token" } } }));

import { apiFetch, ApiError, retryDelayMs } from "./api";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const empty = (status: number, headers: Record<string, string> = {}) => new Response("", { status, headers });

describe("apiFetch rate limiting", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a rate-limited read and returns the data once the limit clears", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(empty(429)).mockResolvedValueOnce(empty(429)).mockResolvedValueOnce(json([{ id: "w1" }]));
    vi.stubGlobal("fetch", fetchMock);

    const pending = apiFetch<unknown[]>("/api/v1/workspaces");
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(pending).resolves.toEqual([{ id: "w1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after the retry budget with a readable message instead of a bare status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => empty(429)));

    const pending = apiFetch("/api/v1/workspaces").catch((e: unknown) => e as ApiError);
    await vi.advanceTimersByTimeAsync(20_000);
    const error = (await pending) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect(error.message).toBe("Too many requests. Please wait a moment and try again.");
    expect(error.message).not.toBe("API Error 429:");
  });

  it("never repeats a write automatically, since that could create duplicates", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => empty(429));
    vi.stubGlobal("fetch", fetchMock);

    const pending = apiFetch("/api/v1/workspaces", { method: "POST", body: "{}" }).catch((e: unknown) => e as ApiError);
    await vi.advanceTimersByTimeAsync(20_000);
    const error = (await pending) as ApiError;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error.message).toMatch(/too many requests/i);
  });

  it("keeps the backend's own message when a 429 carries one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => json({ detail: "Too many queries. Please wait 12 seconds before asking again." }, 429)));

    const pending = apiFetch("/api/v1/workspaces").catch((e: unknown) => e as ApiError);
    await vi.advanceTimersByTimeAsync(20_000);

    expect(((await pending) as ApiError).message).toBe("Too many queries. Please wait 12 seconds before asking again.");
  });

  it("does not retry other errors", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ detail: "Workspace not found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/v1/workspaces/x")).rejects.toThrow(/Workspace not found/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("retryDelayMs", () => {
  it("honours Retry-After but never waits longer than 5 seconds", () => {
    expect(retryDelayMs("2", 0)).toBe(2000);
    expect(retryDelayMs("60", 0)).toBe(5000);
  });

  it("backs off 1s, 2s, 4s without a header and ignores garbage", () => {
    expect([0, 1, 2].map((a) => retryDelayMs(null, a))).toEqual([1000, 2000, 4000]);
    expect(retryDelayMs("soon", 1)).toBe(2000);
  });
});
