// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://localhost:3000/dashboard"}
import React, { act, useSyncExternalStore } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Renders the REAL WorkspaceProvider with a router that behaves like Next.js: router.replace changes the URL,
 * and useSearchParams hands back a new object whenever the URL changes. That feedback is what used to turn
 * "select a workspace" into an endless refetch loop.
 */

// ---- minimal Next.js navigation stand-in -------------------------------------------------------------
let search = "";
let pathname = "/dashboard";
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const stableRouter = {
  replace: (url: string) => {
    const q = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    window.history.replaceState({}, "", url);
    search = q;
    notify();
  },
  push: vi.fn(),
};
const paramsCache = new Map<string, URLSearchParams>();

vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
  usePathname: () => useSyncExternalStore(subscribe, () => pathname, () => pathname),
  useSearchParams: () => {
    const s = useSyncExternalStore(subscribe, () => search, () => search);
    if (!paramsCache.has(s)) paramsCache.set(s, new URLSearchParams(s));
    return paramsCache.get(s)!; // new identity per distinct URL, like Next.js
  },
}));

const auth = vi.hoisted(() => ({ state: { user: { uid: "user-1" } as { uid: string } | null, loading: false } }));
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => ({ ...auth.state, logout: async () => {} }) }));

const { FakeApiError, apiFetch } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = "ApiError";
    }
  }
  return { FakeApiError, apiFetch: vi.fn() };
});
vi.mock("@/lib/api", () => ({ apiFetch, ApiError: FakeApiError }));

import { WorkspaceProvider, useWorkspace, type WorkspaceContextValue } from "./WorkspaceContext";

// Node 26 ships its own experimental localStorage that shadows jsdom's; use a plain in-memory one for the test.
const memory = new Map<string, string>();
const memoryStorage = {
  getItem: (k: string) => (memory.has(k) ? memory.get(k)! : null),
  setItem: (k: string, v: string) => void memory.set(k, String(v)),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
  key: (i: number) => Array.from(memory.keys())[i] ?? null,
  get length() {
    return memory.size;
  },
};
Object.defineProperty(globalThis, "localStorage", { value: memoryStorage, configurable: true });
Object.defineProperty(window, "localStorage", { value: memoryStorage, configurable: true });

const OLD = { id: "7e1b3233-7331-4c17-880f-d00e81a91ddf", name: "Project Titan", owner_id: "u", created_at: "2026-01-01" };
const NEW = { id: "4f7edc9b-6abd-4010-b527-bd876a9b5690", name: "Second", owner_id: "u", created_at: "2026-01-02" };

let ctx: WorkspaceContextValue;
function Probe() {
  ctx = useWorkspace();
  return null;
}
const mount = () => render(React.createElement(WorkspaceProvider, null, React.createElement(Probe)));
const listCalls = () => apiFetch.mock.calls.filter((c) => c[0] === "/api/v1/workspaces" && !c[1]).length;
const settle = (ms = 150) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

beforeEach(() => {
  search = "";
  pathname = "/dashboard";
  paramsCache.clear();
  window.history.replaceState({}, "", "/dashboard");
  localStorage.clear();
  auth.state = { user: { uid: "user-1" }, loading: false };
  apiFetch.mockReset();
  apiFetch.mockImplementation(async () => [OLD, NEW]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("WorkspaceProvider", () => {
  it("loads the workspace list once and settles, instead of refetching in a loop", async () => {
    mount();
    await waitFor(() => expect(ctx.workspaces).toHaveLength(2));
    await settle(400);

    expect(listCalls()).toBe(1);
    expect(ctx.isLoading).toBe(false);
    expect(window.location.search).toContain(`workspaceId=${OLD.id}`); // the URL was synced, which must not refetch
  });

  it("keeps showing the old workspaces and selects the remembered one", async () => {
    localStorage.setItem("citelock_selected_workspace_id", OLD.id);
    mount();
    await waitFor(() => expect(ctx.currentWorkspace?.id).toBe(OLD.id));
    await settle(300);

    expect(ctx.workspaces.map((w) => w.name)).toEqual(["Project Titan", "Second"]);
    expect(listCalls()).toBe(1);
  });

  it("does not refetch when navigating between pages", async () => {
    mount();
    await waitFor(() => expect(ctx.workspaces).toHaveLength(2));
    await settle(200);

    await act(async () => {
      pathname = "/documents";
      notify();
    });
    await settle(300);

    expect(listCalls()).toBe(1);
  });

  it("does not wipe the workspaces when a later refresh is rate limited", async () => {
    mount();
    await waitFor(() => expect(ctx.workspaces).toHaveLength(2));

    apiFetch.mockImplementation(async () => {
      throw new FakeApiError(429, "Too many requests. Please wait a moment and try again.");
    });
    await act(async () => {
      await ctx.refreshWorkspaces();
    });

    expect(ctx.workspaces).toHaveLength(2);
    expect(ctx.currentWorkspace).not.toBeNull();
    expect(ctx.error).toMatch(/too many requests|unable to load/i);
  });

  it("retries a rate-limited first load instead of showing an empty workspace list", async () => {
    vi.useFakeTimers();
    let n = 0;
    apiFetch.mockImplementation(async () => {
      n += 1;
      if (n <= 2) throw new FakeApiError(429, "Too many requests");
      return [OLD, NEW];
    });
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(ctx.workspaces).toHaveLength(0);

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });

    expect(ctx.workspaces).toHaveLength(2);
    expect(ctx.error).toBeNull();
    expect(n).toBe(3);
  });

  it("gives up after a few retries and reports the problem", async () => {
    vi.useFakeTimers();
    apiFetch.mockImplementation(async () => {
      throw new FakeApiError(429, "Too many requests");
    });
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

    expect(ctx.error).toBeTruthy();
    expect(apiFetch.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it("loads again when a different user signs in", async () => {
    const view = mount();
    await waitFor(() => expect(ctx.workspaces).toHaveLength(2));
    await settle(200);

    auth.state = { user: { uid: "user-2" }, loading: false };
    apiFetch.mockImplementation(async () => [NEW]);
    view.rerender(React.createElement(WorkspaceProvider, null, React.createElement(Probe)));
    await waitFor(() => expect(ctx.workspaces).toHaveLength(1));
  });

  it("waits for authentication before asking for workspaces", async () => {
    auth.state = { user: null, loading: true };
    mount();
    await settle(200);
    expect(listCalls()).toBe(0);
  });
});
