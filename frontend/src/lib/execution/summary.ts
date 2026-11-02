import type { GraphNodeId, NodeRun, RouteDecision } from "@/types/execution";

export const ROUTE_LABELS: Record<RouteDecision, string> = {
  finalize: "Verified",
  correct: "Needs correction",
  abstain: "Insufficient evidence",
  error: "Failed",
};

export function formatDuration(ms?: number): string | null {
  if (ms === undefined || ms === null) return null;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Short, real metadata lines shown on a node card. Only values present in backend data are used. */
export function nodeMeta(id: GraphNodeId, run?: NodeRun): string[] {
  if (!run) return [];
  const data = run.data ?? {};

  if (run.status === "failed") {
    return run.error?.message ? [truncate(run.error.message, 70)] : [];
  }

  switch (id) {
    case "query_input":
      return data.top_k !== undefined ? [`top-k ${data.top_k}`, `max ${pluralize(data.max_correction_rounds ?? 0, "round")}`] : [];
    case "evidence_retrieval":
      return data.passages_count !== undefined ? [pluralize(data.passages_count, "passage")] : [];
    case "answer_generation":
      return data.provider ? [[data.provider, data.model].filter(Boolean).join(" · ")] : [];
    case "claim_decomposition":
      return data.claim_count !== undefined ? [pluralize(data.claim_count, "claim")] : [];
    case "claim_verification": {
      const claims: Array<{ verdict?: string }> = data.claims ?? [];
      if (!claims.length && data.claims === undefined) return [];
      const supported = claims.filter((c) => c.verdict === "supported").length;
      return [`${supported}/${claims.length} supported`];
    }
    case "verification_router":
      return run.route ? [ROUTE_LABELS[run.route]] : [];
    case "self_correction":
      return data.round !== undefined
        ? [`Round ${data.round}`, pluralize((data.targeted_claims ?? []).length, "claim") + " targeted"]
        : [];
    case "re_verification":
      if (data.failed_after === undefined) return [];
      return [
        `Round ${data.round ?? run.round}`,
        data.skipped_reverification ? "No new revision" : `${data.failed_before ?? "?"} → ${data.failed_after} failing`,
      ];
    case "abstention":
      return ["Answer withheld"];
    case "final_answer_generation":
      return data.verification_status ? [String(data.verification_status).replace(/_/g, " ")] : [];
    case "database_persistence":
      return data.answer_id ? [`Answer #${String(data.answer_id).slice(0, 8)}`] : [];
    default:
      return [];
  }
}

export const VERDICT_STYLES: Record<string, { label: string; className: string }> = {
  supported: { label: "Supported", className: "text-emerald-300 bg-emerald-950/60 border-emerald-500/30" },
  partially_supported: { label: "Partially supported", className: "text-amber-300 bg-amber-950/50 border-amber-500/30" },
  contradicted: { label: "Contradicted", className: "text-rose-300 bg-rose-950/60 border-rose-500/30" },
  unsupported: { label: "Unsupported", className: "text-orange-300 bg-orange-950/50 border-orange-500/30" },
  insufficient_evidence: { label: "Insufficient evidence", className: "text-slate-300 bg-slate-800/60 border-slate-500/30" },
  verification_error: { label: "Verification error", className: "text-rose-300 bg-rose-950/60 border-rose-500/30" },
};
