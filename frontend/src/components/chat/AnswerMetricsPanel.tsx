import React from "react";
import { formatLatency, formatPercent, type AnswerMetricsView, type StatusTone } from "@/lib/answerMetrics";

const TONE_STYLES: Record<StatusTone, string> = {
  success: "border-emerald-500/40 bg-emerald-950/50 text-emerald-300",
  warning: "border-amber-500/40 bg-amber-950/40 text-amber-300",
  danger: "border-rose-500/40 bg-rose-950/50 text-rose-300",
  neutral: "border-slate-500/40 bg-slate-800/50 text-slate-200",
};

function Tile({ label, value, testId, emphasis }: { label: string; value: React.ReactNode; testId: string; emphasis?: string }) {
  return (
    <div className="rounded-xl border border-purple-900/30 bg-[#090314]/80 px-3 py-2" data-testid={testId}>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-[#8D829F]">{label}</dt>
      <dd className={`mt-0.5 font-mono text-sm font-semibold ${emphasis ?? "text-[#F5F0FF]"}`}>{value}</dd>
    </div>
  );
}

/** Verification summary shown with every final answer. Pure presentation: no hooks, safe to render anywhere. */
export function AnswerMetricsPanel({ metrics }: { metrics: AnswerMetricsView }) {
  return (
    <section aria-label="Verification summary" className="space-y-2.5 border-t border-purple-900/30 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="metric-status"
          className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold ${TONE_STYLES[metrics.tone]}`}
        >
          {metrics.statusLabel}
        </span>
        {metrics.ratesSource === "claims" && (
          <span className="font-mono text-[10px] text-[#7B708F]">rates recounted from claims</span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Grounding" value={formatPercent(metrics.groundingRate)} testId="metric-grounding" emphasis="text-emerald-300" />
        <Tile label="Hallucination" value={formatPercent(metrics.hallucinationRate)} testId="metric-hallucination" emphasis={metrics.hallucinationRate ? "text-rose-300" : undefined} />
        <Tile label="Total claims" value={metrics.totalClaims} testId="metric-total" />
        <Tile label="Supported" value={metrics.supported} testId="metric-supported" emphasis="text-emerald-300" />
        <Tile label="Partially supported" value={metrics.partiallySupported} testId="metric-partial" emphasis="text-amber-300" />
        <Tile label="Unsupported" value={metrics.unsupported} testId="metric-unsupported" emphasis="text-orange-300" />
        <Tile label="Contradicted" value={metrics.contradicted} testId="metric-contradicted" emphasis="text-rose-300" />
        <Tile label="Correction rounds" value={metrics.correctionRounds} testId="metric-rounds" />
        <Tile label="Latency" value={formatLatency(metrics.latencyMs)} testId="metric-latency" />
      </dl>

      {(metrics.insufficientEvidence > 0 || metrics.verificationErrors > 0) && (
        <p className="font-mono text-[10px] text-[#8D829F]">
          {metrics.insufficientEvidence > 0 && `${metrics.insufficientEvidence} claim(s) had insufficient evidence. `}
          {metrics.verificationErrors > 0 && `${metrics.verificationErrors} claim(s) could not be verified.`}
        </p>
      )}
    </section>
  );
}

/** Shown instead of a blank card when a run completes but no answer text came back. */
export function EmptyAnswerNotice() {
  return (
    <div role="alert" data-testid="empty-answer" className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 text-sm text-amber-200">
      The pipeline completed, but the server returned no answer text. The audit trail below is still available; try asking again.
    </div>
  );
}
