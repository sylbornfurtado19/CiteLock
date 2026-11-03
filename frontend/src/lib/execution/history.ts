import type { Answer, QueryDetail } from "@/types";
import type { ExecutionState } from "@/types/execution";
import { restoreFromTrace } from "./reducer";

/**
 * What reopening a previous query restores. Everything comes from what the backend stored for that query:
 * the final answer, its verification results and correction history (inside `answer`), and the recorded
 * node trace. A query with no recorded trace gets no graph; nothing is reconstructed from assumptions.
 */
export interface RestoredQuery {
  recordId: string;
  prompt: string;
  /** Present for completed queries. */
  answer: Answer | null;
  verificationStatus: string | null;
  executionMetadata: Record<string, any> | null;
  /** Present for failed queries: the stored failure reason. */
  errorText: string | null;
  /** The execution graph, or null when no trace was persisted. */
  execution: ExecutionState | null;
}

export function planRestore(detail: QueryDetail): RestoredQuery {
  const answer = detail.answer ?? null;
  const hasTrace = Array.isArray(detail.execution_trace) && detail.execution_trace.length > 0;

  return {
    recordId: answer?.id ?? `failed-${detail.query_id}`,
    prompt: detail.prompt,
    answer,
    verificationStatus: detail.verification_status ?? answer?.verification_status ?? null,
    executionMetadata: detail.execution_metadata ?? answer?.execution_metadata ?? null,
    errorText: answer ? null : detail.error_message ?? "This query did not complete.",
    execution: hasTrace ? restoreFromTrace(detail.execution_trace) : null,
  };
}
