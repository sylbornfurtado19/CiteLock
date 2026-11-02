/**
 * Centralized, type-safe query key factory for TanStack Query.
 *
 * All workspace-scoped data structures are strictly namespaced under ['workspaces', workspaceId, ...].
 * This guarantees:
 * 1. Immediate cache partition isolation between tenants and workspaces.
 * 2. Fine-grained invalidation (e.g. invalidating all documents for workspace A without touching workspace B).
 */
export const queryKeys = {
  workspaces: {
    all: ["workspaces"] as const,
    list: () => [...queryKeys.workspaces.all, "list"] as const,
    detail: (id: string) => [...queryKeys.workspaces.all, "detail", id] as const,
    settings: (id: string) => [...queryKeys.workspaces.detail(id), "settings"] as const,
  },
  analytics: {
    all: (workspaceId: string) => ["workspaces", workspaceId, "analytics"] as const,
    summary: (workspaceId: string, range = "24h") =>
      [...queryKeys.analytics.all(workspaceId), "summary", range.toLowerCase()] as const,
  },
  documents: {
    all: (workspaceId: string) => ["workspaces", workspaceId, "documents"] as const,
    list: (workspaceId: string, status?: string) =>
      [...queryKeys.documents.all(workspaceId), "list", status || "all"] as const,
    detail: (workspaceId: string, docId: string) =>
      [...queryKeys.documents.all(workspaceId), "detail", docId] as const,
  },
  audits: {
    all: (workspaceId: string) => ["workspaces", workspaceId, "audits"] as const,
    list: (workspaceId: string, limit?: number, offset?: number) =>
      [...queryKeys.audits.all(workspaceId), "list", { limit, offset }] as const,
    detail: (workspaceId: string, answerId: string) =>
      [...queryKeys.audits.all(workspaceId), "detail", answerId] as const,
    events: (workspaceId: string, eventType?: string) =>
      [...queryKeys.audits.all(workspaceId), "events", eventType || "all"] as const,
  },
  evaluation: {
    all: (workspaceId: string) => ["workspaces", workspaceId, "evaluation"] as const,
    latest: (workspaceId: string) => [...queryKeys.evaluation.all(workspaceId), "latest"] as const,
    history: (workspaceId: string) => [...queryKeys.evaluation.all(workspaceId), "history"] as const,
  },
} as const;

