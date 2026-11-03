"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Workspace } from "@/types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";

const STORAGE_KEY = "citelock_selected_workspace_id";

/** Waits before each automatic retry of a failed workspace load (rate limits, a waking backend, network blips). */
export const WORKSPACE_RETRY_DELAYS_MS = [1000, 2000, 4000];

export interface WorkspaceContextValue {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  isLoading: boolean;
  error: string | null;
  switchWorkspace: (workspaceId: string) => void;
  createWorkspace: (name: string, description?: string) => Promise<Workspace>;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

/**
 * Pick the active workspace: the one named in the URL, else the one remembered from last time, else the first.
 * Exported for testing.
 */
export function chooseWorkspace(list: Workspace[], urlId: string | null, storedId: string | null): Workspace | null {
  return (
    (urlId && list.find((w) => w.id === urlId)) ||
    (storedId && list.find((w) => w.id === storedId)) ||
    list[0] ||
    null
  );
}

function WorkspaceProviderInner({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // The latest router, path and user live in refs so the fetch callback below can keep a stable identity.
  // A callback that is rebuilt whenever the URL changes would refetch every time the URL is updated, and
  // selecting a workspace updates the URL, which is exactly how an endless refetch loop starts.
  const routerRef = useRef(router);
  const pathnameRef = useRef(pathname);
  const userRef = useRef(user);
  routerRef.current = router;
  pathnameRef.current = pathname;
  userRef.current = user;

  const generationRef = useRef(0); // bumped whenever the signed-in user changes, so stale responses are ignored
  const inFlightRef = useRef<{ generation: number; promise: Promise<void> } | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);
  const lastUidRef = useRef<string | null | undefined>(undefined);

  // Sync the current workspace ID into the URL query parameters
  const updateUrlWorkspace = useCallback((workspaceId: string) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("workspaceId") !== workspaceId) {
      params.set("workspaceId", workspaceId);
      routerRef.current.replace(`${pathnameRef.current}?${params.toString()}`, { scroll: false });
    }
  }, []);

  const clearRetryTimer = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const fetchWorkspaces = useCallback(
    (attempt = 0): Promise<void> => {
      const generation = generationRef.current;
      // Concurrent callers share one request instead of each sending their own.
      if (inFlightRef.current && inFlightRef.current.generation === generation) {
        return inFlightRef.current.promise;
      }

      const run = (async () => {
        let retryScheduled = false;
        // Only the very first load shows a loading state; refreshes keep the current list on screen.
        if (!hasLoadedRef.current) setIsLoading(true);

        try {
          const data = await apiFetch<Workspace[]>("/api/v1/workspaces");
          if (generation !== generationRef.current) return;

          const list = Array.isArray(data) ? data : [];
          setWorkspaces(list);
          setError(null);
          hasLoadedRef.current = true;

          const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
          const urlWorkspaceId = params?.get("workspaceId") || params?.get("workspace") || null;
          const storedWorkspaceId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
          const matched = chooseWorkspace(list, urlWorkspaceId, storedWorkspaceId);

          if (matched) {
            setCurrentWorkspace(matched);
            if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, matched.id);
            updateUrlWorkspace(matched.id);
          } else {
            // The account genuinely has no workspaces yet
            setCurrentWorkspace(null);
          }
        } catch (err: unknown) {
          if (generation !== generationRef.current) return;
          console.error("Failed to fetch workspaces:", err);

          if (err instanceof ApiError && err.status === 401) {
            // The session is not valid, so the list really is unavailable.
            setError(userRef.current ? "Session expired. Please log in again." : null);
            setWorkspaces([]);
            setCurrentWorkspace(null);
            hasLoadedRef.current = true;
          } else {
            // A temporary failure (rate limit, backend waking up, network) must NOT erase workspaces that were
            // already loaded: keep them, report the problem, and try again a few times.
            const delay = WORKSPACE_RETRY_DELAYS_MS[attempt];
            const message =
              err instanceof ApiError && err.status === 429
                ? "Too many requests right now."
                : "Unable to load workspaces. Please check connection.";
            if (delay !== undefined) {
              retryScheduled = true;
              setError(`${message} Retrying…`);
              clearRetryTimer();
              retryTimerRef.current = setTimeout(() => {
                retryTimerRef.current = null;
                void fetchWorkspaces(attempt + 1);
              }, delay);
            } else {
              setError(message);
              hasLoadedRef.current = true;
            }
          }
        } finally {
          if (!retryScheduled && generation === generationRef.current) setIsLoading(false);
        }
      })();

      const tracked = run.finally(() => {
        if (inFlightRef.current?.promise === tracked) inFlightRef.current = null;
      });
      inFlightRef.current = { generation, promise: tracked };
      return tracked;
    },
    [updateUrlWorkspace]
  );

  // Load when authentication settles and whenever a different user signs in (never because the URL changed).
  useEffect(() => {
    if (authLoading) return;

    const uid = user?.uid ?? null;
    generationRef.current += 1;
    clearRetryTimer();
    hasLoadedRef.current = false;
    if (lastUidRef.current !== undefined && lastUidRef.current !== uid) {
      // A different account: never show the previous account's workspaces
      setWorkspaces([]);
      setCurrentWorkspace(null);
    }
    lastUidRef.current = uid;

    void fetchWorkspaces();
    return () => {
      clearRetryTimer();
    };
  }, [authLoading, user?.uid, fetchWorkspaces]);

  // Handle URL change externally (e.g. user manually altered URL query param)
  useEffect(() => {
    const urlWorkspaceId = searchParams.get("workspaceId") || searchParams.get("workspace");
    if (urlWorkspaceId && workspaces.length > 0) {
      if (currentWorkspace?.id !== urlWorkspaceId) {
        const found = workspaces.find((w) => w.id === urlWorkspaceId);
        if (found) {
          setCurrentWorkspace(found);
          if (typeof window !== "undefined") {
            localStorage.setItem(STORAGE_KEY, found.id);
          }
        }
      }
    }
  }, [searchParams, workspaces, currentWorkspace?.id]);

  const switchWorkspace = useCallback(
    (workspaceId: string) => {
      const target = workspaces.find((w) => w.id === workspaceId);
      if (!target) {
        console.warn(`Workspace with ID "${workspaceId}" not found in accessible list.`);
        return;
      }
      setCurrentWorkspace(target);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, target.id);
      }
      updateUrlWorkspace(target.id);
    },
    [workspaces, updateUrlWorkspace]
  );

  const createWorkspace = useCallback(
    async (name: string, description?: string): Promise<Workspace> => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error("Workspace name is required.");
      }

      const payload: { name: string; description?: string } = { name: trimmedName };
      if (description && description.trim()) {
        payload.description = description.trim();
      }

      const created = await apiFetch<Workspace>("/api/v1/workspaces", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setWorkspaces((prev) => [created, ...prev]);
      setCurrentWorkspace(created);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, created.id);
      }
      updateUrlWorkspace(created.id);
      return created;
    },
    [updateUrlWorkspace]
  );

  const refreshWorkspaces = useCallback(async () => {
    await fetchWorkspaces();
  }, [fetchWorkspaces]);

  const value = useMemo(
    () => ({
      workspaces,
      currentWorkspace,
      isLoading,
      error,
      switchWorkspace,
      createWorkspace,
      refreshWorkspaces,
    }),
    [workspaces, currentWorkspace, isLoading, error, switchWorkspace, createWorkspace, refreshWorkspaces]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  return (
    <React.Suspense fallback={null}>
      <WorkspaceProviderInner>{children}</WorkspaceProviderInner>
    </React.Suspense>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
