import type { Answer, Claim } from "@/types";

/**
 * View-model for the final answer summary. Everything comes from the backend completion payload
 * (answer, verification_status, execution_metadata); claim counts are counted from the persisted claims.
 */

export type StatusTone = "success" | "warning" | "danger" | "neutral";

export interface AnswerMetricsView {
  verificationStatus: string;
  statusLabel: string;
  tone: StatusTone;
  /** Fraction 0..1, or null when it cannot be determined. */
  groundingRate: number | null;
  hallucinationRate: number | null;
  /** Where the two rates came from: the backend's own computation, or recounted from the claims. */
  ratesSource: "backend" | "claims" | "none";
  totalClaims: number;
  supported: number;
  partiallySupported: number;
  unsupported: number;
  contradicted: number;
  insufficientEvidence: number;
  verificationErrors: number;
  correctionRounds: number;
  latencyMs: number | null;
  isAbstained: boolean;
  citationCount: number;
}

export interface AnswerMetricsInput {
  verificationStatus?: string | null;
  executionMetadata?: Record<string, any> | null;
}

const STATUS_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  verified: { label: "Verified", tone: "success" },
  partially_verified: { label: "Partially verified", tone: "warning" },
  unresolved: { label: "Unresolved", tone: "danger" },
  abstained: { label: "Abstained", tone: "neutral" },
};

function countVerdict(claims: Claim[], verdict: string): number {
  return claims.filter((c) => (c.verdict as string) === verdict).length;
}

function asRate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

function deriveStatus(answer: Answer, claims: Claim[], hallucinationRate: number | null): string {
  if (answer.is_abstained) return "abstained";
  if (claims.length > 0 && hallucinationRate === 0) return "verified";
  if (claims.some((c) => c.verdict === "supported" || c.verdict === "partially_supported")) return "partially_verified";
  return "unresolved";
}

export function buildAnswerMetrics(answer: Answer, input: AnswerMetricsInput = {}): AnswerMetricsView {
  const claims = answer.claims ?? [];
  const meta = input.executionMetadata ?? answer.execution_metadata ?? {};

  const supported = countVerdict(claims, "supported");
  const partiallySupported = countVerdict(claims, "partially_supported");
  const unsupported = countVerdict(claims, "unsupported");
  const contradicted = countVerdict(claims, "contradicted");
  const insufficientEvidence = countVerdict(claims, "insufficient_evidence");
  const verificationErrors = countVerdict(claims, "verification_error");

  let groundingRate = asRate(meta.grounding_rate);
  let hallucinationRate = asRate(meta.hallucination_rate);
  let ratesSource: AnswerMetricsView["ratesSource"] = groundingRate !== null || hallucinationRate !== null ? "backend" : "none";

  if (groundingRate === null && hallucinationRate === null) {
    // Same formulas as backend scoring.py, used only when the payload carried no metadata.
    const evaluable = claims.length - verificationErrors;
    if (evaluable > 0) {
      hallucinationRate = (unsupported + contradicted) / evaluable;
      groundingRate = (supported + 0.5 * partiallySupported) / evaluable;
      ratesSource = "claims";
    }
  }

  const verificationStatus = input.verificationStatus ?? answer.verification_status ?? deriveStatus(answer, claims, hallucinationRate);
  const known = STATUS_LABELS[verificationStatus];
  const latency = typeof meta.latency_ms === "number" ? meta.latency_ms : null;
  const correctionRounds = typeof meta.correction_rounds === "number" ? meta.correction_rounds : answer.correction_rounds ?? 0;

  return {
    verificationStatus,
    statusLabel: known?.label ?? verificationStatus.replace(/_/g, " "),
    tone: known?.tone ?? "neutral",
    groundingRate,
    hallucinationRate,
    ratesSource,
    totalClaims: claims.length,
    supported,
    partiallySupported,
    unsupported,
    contradicted,
    insufficientEvidence,
    verificationErrors,
    correctionRounds,
    latencyMs: latency,
    isAbstained: answer.is_abstained,
    citationCount: claims.reduce((n, c) => n + Math.max(1, c.evidence_links?.length ?? 0), 0),
  };
}

export function formatPercent(rate: number | null): string {
  return rate === null ? "–" : `${Math.round(rate * 100)}%`;
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return "–";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

/** True when a successful run produced no visible answer text; the UI must say so instead of rendering nothing. */
export function isBlankAnswer(text: string | null | undefined): boolean {
  return !text || text.trim().length === 0;
}
