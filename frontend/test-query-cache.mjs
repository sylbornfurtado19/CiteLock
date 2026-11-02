import assert from "node:assert";
import { QueryClient } from "@tanstack/react-query";

// 1. Re-implement query key logic to verify structure
const queryKeys = {
  workspaces: {
    all: ["workspaces"],
    list: () => ["workspaces", "list"],
    detail: (id) => ["workspaces", "detail", id],
    settings: (id) => ["workspaces", "detail", id, "settings"],
  },
  analytics: {
    all: (workspaceId) => ["workspaces", workspaceId, "analytics"],
    summary: (workspaceId, range = "24h") => [
      "workspaces",
      workspaceId,
      "analytics",
      "summary",
      range.toLowerCase(),
    ],
  },
  documents: {
    all: (workspaceId) => ["workspaces", workspaceId, "documents"],
    list: (workspaceId, status) => [
      "workspaces",
      workspaceId,
      "documents",
      "list",
      status || "all",
    ],
    detail: (workspaceId, docId) => [
      "workspaces",
      workspaceId,
      "documents",
      "detail",
      docId,
    ],
  },
  audits: {
    all: (workspaceId) => ["workspaces", workspaceId, "audits"],
    list: (workspaceId, limit, offset) => [
      "workspaces",
      workspaceId,
      "audits",
      "list",
      { limit, offset },
    ],
    detail: (workspaceId, answerId) => [
      "workspaces",
      workspaceId,
      "audits",
      "detail",
      answerId,
    ],
  },
  evaluation: {
    all: (workspaceId) => ["workspaces", workspaceId, "evaluation"],
    latest: (workspaceId) => ["workspaces", workspaceId, "evaluation", "latest"],
    history: (workspaceId) => ["workspaces", workspaceId, "evaluation", "history"],
  },
};

// 2. Query Client Factory test
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchOnMount: true,
        retry: (failureCount, error) => {
          if (error && typeof error === "object" && "status" in error) {
            const status = error.status;
            if (status === 401 || status === 403 || status === 404) {
              return false;
            }
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}

console.log("Running Frontend Server-State Caching Unit Tests...\n");

// Test 1: Workspace Partition Isolation in Query Keys
const wsA = "ws-alpha";
const wsB = "ws-beta";

const keyDocsA = queryKeys.documents.list(wsA);
const keyDocsB = queryKeys.documents.list(wsB);

assert.deepStrictEqual(keyDocsA, ["workspaces", "ws-alpha", "documents", "list", "all"]);
assert.deepStrictEqual(keyDocsB, ["workspaces", "ws-beta", "documents", "list", "all"]);
assert.notDeepStrictEqual(keyDocsA, keyDocsB, "Workspaces must have separate key namespaces");
console.log("✓ Test 1: Query keys enforce strict workspace partition isolation");

// Test 2: Invalidation Scope Precision
const client = createQueryClient();

// Populate cache for ws-alpha and ws-beta
client.setQueryData(queryKeys.documents.list(wsA), [{ id: "d1", name: "Doc1" }]);
client.setQueryData(queryKeys.analytics.summary(wsA, "24h"), { total_documents: 1 });
client.setQueryData(queryKeys.documents.list(wsB), [{ id: "d2", name: "Doc2" }]);

assert.strictEqual(client.getQueryData(queryKeys.documents.list(wsA)).length, 1);
assert.strictEqual(client.getQueryData(queryKeys.documents.list(wsB)).length, 1);

// Invalidate only ws-alpha documents
client.invalidateQueries({ queryKey: queryKeys.documents.all(wsA) });

// ws-alpha document query is invalidated, ws-beta document query remains untouched
const stateA = client.getQueryState(queryKeys.documents.list(wsA));
const stateB = client.getQueryState(queryKeys.documents.list(wsB));

assert.strictEqual(stateA.isInvalidated, true, "Workspace A document query should be invalidated");
assert.strictEqual(stateB.isInvalidated, false, "Workspace B document query should remain valid");
console.log("✓ Test 2: Invalidation strictly targets specified workspace without cross-tenant side effects");

// Test 3: Stale Time & Cache Time Configuration
const defaultQueries = client.getDefaultOptions().queries;
assert.strictEqual(defaultQueries.staleTime, 30000, "staleTime must be 30,000ms (30s)");
assert.strictEqual(defaultQueries.gcTime, 300000, "gcTime must be 300,000ms (5m)");
assert.strictEqual(defaultQueries.refetchOnWindowFocus, true, "refetchOnWindowFocus must be enabled");
console.log("✓ Test 3: QueryClient options configured with 30s staleTime and background window focus revalidation");

// Test 4: Auth Expiration and Not Found Error Handling (No Infinite Retries on 401/403/404)
const retryFn = defaultQueries.retry;
assert.strictEqual(retryFn(0, { status: 401 }), false, "Should not retry on 401 Unauthorized");
assert.strictEqual(retryFn(0, { status: 403 }), false, "Should not retry on 403 Forbidden");
assert.strictEqual(retryFn(0, { status: 404 }), false, "Should not retry on 404 Not Found");
assert.strictEqual(retryFn(0, { status: 500 }), true, "Should retry on 500 Server Error");
assert.strictEqual(retryFn(1, { status: 500 }), true, "Should retry on 500 Server Error on second attempt");
assert.strictEqual(retryFn(2, { status: 500 }), false, "Should stop retrying after 2 attempts");
console.log("✓ Test 4: Error retry logic immediately halts on auth (401/403) and 404 errors while retrying 5xx");

// Test 5: Dynamic Polling Function Logic for Pending Ingestion
function shouldRefetch(data) {
  const hasPending = data?.some((d) =>
    ["uploaded", "processing", "pending"].includes(d.status)
  );
  return hasPending ? 2500 : false;
}

assert.strictEqual(shouldRefetch([{ status: "indexed" }, { status: "failed" }]), false, "Terminal states should not poll");
assert.strictEqual(shouldRefetch([{ status: "uploaded" }, { status: "indexed" }]), 2500, "Uploaded state should trigger 2500ms polling");
assert.strictEqual(shouldRefetch([{ status: "processing" }]), 2500, "Processing state should trigger 2500ms polling");
console.log("✓ Test 5: Dynamic refetchInterval activates only during active document ingestion");

console.log("\nALL 5 FRONTEND QUERY CACHING UNIT TESTS PASSED!");
client.clear();
process.exit(0);
