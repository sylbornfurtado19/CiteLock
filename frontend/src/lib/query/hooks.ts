"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  AnalyticsSummary,
  Document,
  AuditListItem,
  AnswerAuditResponse,
  WorkspaceSettings,
  BenchmarkRunResponse,
  BenchmarkHistoryItem,
} from "@/types";
import { queryKeys } from "./keys";

/**
 * Hook to fetch workspace analytics with background revalidation and 30s stale time.
 */
export function useWorkspaceAnalytics(workspaceId?: string, range = "24h") {
  return useQuery({
    queryKey: queryKeys.analytics.summary(workspaceId || "", range),
    queryFn: async () => {
      if (!workspaceId) return null;
      const endpoint = `/api/v1/workspaces/${workspaceId}/analytics${
        range.toLowerCase() !== "all" ? `?range=${range.toLowerCase()}` : ""
      }`;
      return apiFetch<AnalyticsSummary>(endpoint);
    },
    enabled: Boolean(workspaceId),
  });
}

/**
 * Hook to fetch indexed documents list for a workspace.
 * Automatically polls every 2.5s if any documents are pending/processing,
 * and pauses when page visibility is lost (handled by TanStack Query).
 */
export function useWorkspaceDocuments(workspaceId?: string, status?: string) {
  return useQuery({
    queryKey: queryKeys.documents.list(workspaceId || "", status),
    queryFn: async () => {
      if (!workspaceId) return [];
      const endpoint = `/api/v1/workspaces/${workspaceId}/documents${
        status ? `?status=${status}` : ""
      }`;
      return apiFetch<Document[]>(endpoint);
    },
    enabled: Boolean(workspaceId),
    refetchInterval: (query) => {
      const docs = query.state.data as Document[] | undefined;
      const hasPending = docs?.some((d) =>
        ["uploaded", "processing", "pending"].includes(d.status)
      );
      return hasPending ? 2500 : false;
    },
  });
}

/**
 * Hook to fetch recent audits list for a workspace.
 */
export function useWorkspaceAudits(
  workspaceId?: string,
  limit?: number,
  offset?: number
) {
  return useQuery({
    queryKey: queryKeys.audits.list(workspaceId || "", limit, offset),
    queryFn: async () => {
      if (!workspaceId) return [];
      const params = new URLSearchParams();
      if (limit !== undefined) params.set("limit", String(limit));
      if (offset !== undefined) params.set("offset", String(offset));
      const qs = params.toString();
      const endpoint = `/api/v1/workspaces/${workspaceId}/audits${qs ? `?${qs}` : ""}`;
      const data = await apiFetch<AuditListItem[]>(endpoint);
      return Array.isArray(data) ? data : [];
    },
    enabled: Boolean(workspaceId),
  });
}

/**
 * Hook to fetch single answer audit details.
 */
export function useWorkspaceAuditDetail(workspaceId?: string, answerId?: string) {
  return useQuery({
    queryKey: queryKeys.audits.detail(workspaceId || "", answerId || ""),
    queryFn: async () => {
      if (!workspaceId || !answerId) return null;
      return apiFetch<AnswerAuditResponse>(
        `/api/v1/workspaces/${workspaceId}/audits/${answerId}`
      );
    },
    enabled: Boolean(workspaceId && answerId),
  });
}

/**
 * Hook to fetch workspace deployment and governance settings.
 */
export function useWorkspaceSettings(workspaceId?: string) {
  return useQuery({
    queryKey: queryKeys.workspaces.settings(workspaceId || ""),
    queryFn: async () => {
      if (!workspaceId) return null;
      return apiFetch<WorkspaceSettings>(
        `/api/v1/workspaces/${workspaceId}/settings`
      );
    },
    enabled: Boolean(workspaceId),
  });
}

/**
 * Hook for document deletion mutation with automatic cache invalidation for documents & analytics.
 */
export function useDeleteDocumentMutation(workspaceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      if (!workspaceId) throw new Error("No active workspace");
      return apiFetch<void>(
        `/api/v1/workspaces/${workspaceId}/documents/${documentId}`,
        { method: "DELETE" }
      );
    },
    onSuccess: () => {
      if (workspaceId) {
        // Invalidate documents list and analytics counts
        queryClient.invalidateQueries({
          queryKey: queryKeys.documents.all(workspaceId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.analytics.all(workspaceId),
        });
      }
    },
  });
}

/**
 * Hook for document reprocess mutation with cache invalidation.
 */
export function useReprocessDocumentMutation(workspaceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      documentId,
      sync = false,
    }: {
      documentId: string;
      sync?: boolean;
    }) => {
      if (!workspaceId) throw new Error("No active workspace");
      return apiFetch<Document>(
        `/api/v1/workspaces/${workspaceId}/documents/${documentId}/reprocess?sync=${sync}`,
        { method: "POST" }
      );
    },
    onSuccess: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.documents.all(workspaceId),
        });
      }
    },
  });
}

/**
 * Hook for workspace settings update mutation with cache invalidation.
 */
export function useUpdateSettingsMutation(workspaceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Partial<WorkspaceSettings>) => {
      if (!workspaceId) throw new Error("No active workspace");
      return apiFetch<WorkspaceSettings>(
        `/api/v1/workspaces/${workspaceId}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      );
    },
    onSuccess: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.workspaces.settings(workspaceId),
        });
      }
    },
  });
}

/**
 * Hook for workspace settings reset mutation with cache invalidation.
 */
export function useResetSettingsMutation(workspaceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("No active workspace");
      return apiFetch<WorkspaceSettings>(
        `/api/v1/workspaces/${workspaceId}/settings/reset`,
        { method: "POST" }
      );
    },
    onSuccess: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.workspaces.settings(workspaceId),
        });
      }
    },
  });
}

/**
 * Hook to fetch latest evaluation benchmark run.
 */
export function useWorkspaceEvaluationLatest(workspaceId?: string) {
  return useQuery({
    queryKey: queryKeys.evaluation.latest(workspaceId || ""),
    queryFn: async () => {
      if (!workspaceId) return null;
      return apiFetch<BenchmarkRunResponse | null>(
        `/api/v1/workspaces/${workspaceId}/evaluation/latest`
      );
    },
    enabled: Boolean(workspaceId),
  });
}

/**
 * Hook to fetch evaluation benchmark history.
 */
export function useWorkspaceEvaluationHistory(workspaceId?: string) {
  return useQuery({
    queryKey: queryKeys.evaluation.history(workspaceId || ""),
    queryFn: async () => {
      if (!workspaceId) return [];
      const res = await apiFetch<BenchmarkHistoryItem[]>(
        `/api/v1/workspaces/${workspaceId}/evaluation/history`
      );
      return Array.isArray(res) ? res : [];
    },
    enabled: Boolean(workspaceId),
  });
}

/**
 * Hook to execute evaluation benchmark run with automatic cache invalidation.
 */
export function useRunEvaluationMutation(workspaceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sampleSize = 5 }: { sampleSize?: number }) => {
      if (!workspaceId) throw new Error("No active workspace");
      return apiFetch<BenchmarkRunResponse>(
        `/api/v1/workspaces/${workspaceId}/evaluation/run`,
        {
          method: "POST",
          body: JSON.stringify({ sample_size: sampleSize }),
        }
      );
    },
    onSuccess: (newRun) => {
      if (workspaceId) {
        // Set latest run directly in cache and invalidate history
        queryClient.setQueryData(
          queryKeys.evaluation.latest(workspaceId),
          newRun
        );
        queryClient.invalidateQueries({
          queryKey: queryKeys.evaluation.history(workspaceId),
        });
      }
    },
  });
}
