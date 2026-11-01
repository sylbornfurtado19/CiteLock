"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Workspace } from "@/types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";

const STORAGE_KEY = "citelock_selected_workspace_id";

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

function WorkspaceProviderInner({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sync the current workspace ID into the URL query parameters
  const updateUrlWorkspace = useCallback(
    (workspaceId: string) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (params.get("workspaceId") !== workspaceId) {
        params.set("workspaceId", workspaceId);
        const newUrl = `${pathname}?${params.toString()}`;
        router.replace(newUrl, { scroll: false });
      }
    },
    [pathname, router]
  );

  const fetchWorkspaces = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await apiFetch<Workspace[]>("/api/v1/workspaces");
      const list = Array.isArray(data) ? data : [];
      setWorkspaces(list);

      // Determine active workspace from URL or localStorage
      const urlWorkspaceId = searchParams.get("workspaceId") || searchParams.get("workspace");
      const storedWorkspaceId =
        typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;

      let matched: Workspace | undefined;

      if (urlWorkspaceId) {
        matched = list.find((w) => w.id === urlWorkspaceId);
      }
      if (!matched && storedWorkspaceId) {
        matched = list.find((w) => w.id === storedWorkspaceId);
      }
      if (!matched && list.length > 0) {
        matched = list[0];
      }

      if (matched) {
        setCurrentWorkspace(matched);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, matched.id);
        }
        updateUrlWorkspace(matched.id);
      } else {
        // No workspaces exist for user yet or inaccessible
        setCurrentWorkspace(null);
      }
    } catch (err: unknown) {
      console.error("Failed to fetch workspaces:", err);
      if (err instanceof ApiError && err.status === 401) {
        setError("Session expired. Please log in again.");
      } else {
        setError("Unable to load workspaces. Please check connection.");
      }
      setWorkspaces([]);
      setCurrentWorkspace(null);
    } finally {
      setIsLoading(false);
    }
  }, [user, searchParams, updateUrlWorkspace]);

  useEffect(() => {
    if (!authLoading) {
      fetchWorkspaces();
    }
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
