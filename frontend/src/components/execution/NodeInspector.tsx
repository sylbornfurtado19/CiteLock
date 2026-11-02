"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { X, ExternalLink } from "lucide-react";
import type { ExecutionState, GraphNodeId, NodeRun, NodeStatus } from "@/types/execution";
import { NODE_BY_ID } from "@/lib/execution/graphDefinition";
import { ROUTE_LABELS, VERDICT_STYLES, formatDuration } from "@/lib/execution/summary";

interface NodeInspectorProps {
  nodeId: GraphNodeId;
  state: ExecutionState;
  workspaceId?: string;
  onClose: () => void;
}

const STATUS_STYLE: Record<NodeStatus, string> = {
  pending: "border-purple-900/30 bg-[#130B24] text-[#8D829F]",
  running: "border-purple-400/40 bg-purple-950/70 text-purple-200",
  completed: "border-emerald-500/30 bg-emerald-950/40 text-emerald-300",
  failed: "border-rose-500/40 bg-rose-950/50 text-rose-300",
  skipped: "border-slate-500/30 bg-slate-800/40 text-slate-300",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-purple-300/80">{title}</h4>
      {children}
    </section>
  );
}

function TextBlock({ text }: { text?: string | null }) {
  if (!text) return <p className="text-[12px] italic text-[#7B708F]">Not provided.</p>;
  return (
    <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-purple-900/30 bg-[#090414] p-2.5 text-[12px] leading-relaxed text-[#E6E0F5]">
      {text}
    </p>
  );
}

function Pill({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-purple-900/40 bg-[#130B24] px-2 py-0.5 font-mono text-[10px] text-purple-200/90">
      <span className="text-[#8D829F]">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

function VerdictBadge({ verdict }: { verdict?: string }) {
  const style = VERDICT_STYLES[verdict ?? ""] ?? { label: verdict ?? "Unknown", className: "text-slate-300 bg-slate-800/60 border-slate-500/30" };
  return <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${style.className}`}>{style.label}</span>;
}

function MetricsRow({ title, metrics }: { title: string; metrics?: Record<string, any> }) {
  if (!metrics || Object.keys(metrics).length === 0) return null;
  const pct = (v: unknown) => (typeof v === "number" ? `${Math.round(v * 100)}%` : "–");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-14 font-mono text-[10px] text-[#8D829F]">{title}</span>
      <Pill label="hallucination" value={pct(metrics.hallucination_rate)} />
      <Pill label="grounding" value={pct(metrics.grounding_rate)} />
      {metrics.total_claims !== undefined && <Pill label="claims" value={metrics.total_claims} />}
    </div>
  );
}

function ClaimList({ claims }: { claims: any[] }) {
  if (!claims?.length) return <p className="text-[12px] italic text-[#7B708F]">No claims.</p>;
  return (
    <ul className="space-y-2">
      {claims.map((c, i) => (
        <li key={`${c.index ?? i}-${i}`} className="space-y-1.5 rounded-lg border border-purple-900/30 bg-[#090414] p-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] leading-snug text-[#F5F0FF]">{c.text}</p>
            {c.verdict && <VerdictBadge verdict={c.verdict} />}
          </div>
          {typeof c.confidence === "number" && (
            <div className="flex items-center gap-2" aria-label={`Confidence ${Math.round(c.confidence * 100)} percent`}>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#1A0F33]">
                <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-400" style={{ width: `${Math.round(c.confidence * 100)}%` }} />
              </div>
              <span className="font-mono text-[10px] text-[#C4B7DB]">{Math.round(c.confidence * 100)}%</span>
            </div>
          )}
          {c.rationale && <p className="text-[11px] leading-relaxed text-[#B0A4C3]">{c.rationale}</p>}
          {c.evidence?.length > 0 && (
            <ul className="space-y-1 border-t border-purple-900/25 pt-1.5">
              {c.evidence.map((ev: any, j: number) => (
                <li key={j} className="text-[11px] text-[#A89CB8]">
                  <span className="font-mono text-purple-300">{ev.document ?? "source"}</span>
                  {ev.chunk_id && <span className="font-mono text-[#7B708F]"> #{String(ev.chunk_id).slice(0, 8)}</span>}
                  {ev.quote && <span className="block italic">&ldquo;{ev.quote}&rdquo;</span>}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function RunDetails({ id, run, workspaceId }: { id: GraphNodeId; run: NodeRun; workspaceId?: string }) {
  const d = run.data ?? {};

  if (run.status === "failed") {
    return (
      <Section title="Error">
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/40 p-2.5 text-[12px] text-rose-200">
          <p className="font-mono text-[10px] uppercase text-rose-300/80">{run.error?.kind ?? "error"}</p>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed">{run.error?.message ?? "The node failed."}</p>
        </div>
      </Section>
    );
  }

  switch (id) {
    case "query_input":
      return (
        <>
          <Section title="Prompt">
            <TextBlock text={d.prompt} />
          </Section>
          <div className="flex flex-wrap gap-1.5">
            <Pill label="top-k" value={d.top_k ?? "–"} />
            <Pill label="max rounds" value={d.max_correction_rounds ?? "–"} />
            <Pill label="abstention" value={d.abstention_policy ?? "–"} />
          </div>
        </>
      );

    case "evidence_retrieval":
      return (
        <Section title={`Retrieved passages (${d.passages_count ?? 0})`}>
          {(d.passages ?? []).length === 0 ? (
            <p className="text-[12px] italic text-[#7B708F]">No passages were retrieved.</p>
          ) : (
            <ul className="space-y-2">
              {(d.passages as any[]).map((p, i) => (
                <li key={`${p.chunk_id}-${i}`} className="space-y-1 rounded-lg border border-purple-900/30 bg-[#090414] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] text-purple-200">{p.document ?? "document"}</span>
                    {typeof p.relevance === "number" && <Pill label="relevance" value={`${Math.round(p.relevance * 100)}%`} />}
                  </div>
                  <p className="text-[11px] leading-relaxed text-[#B0A4C3]">{p.snippet}</p>
                  <p className="font-mono text-[10px] text-[#6B5F80]">
                    chunk {p.chunk_index ?? "–"} &middot; #{String(p.chunk_id).slice(0, 8)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      );

    case "answer_generation":
      return (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Pill label="provider" value={d.provider ?? "–"} />
            <Pill label="model" value={d.model ?? "–"} />
            <Pill label="passages" value={d.passages_used ?? "–"} />
          </div>
          <Section title="Draft answer">
            <TextBlock text={d.draft_answer} />
          </Section>
        </>
      );

    case "claim_decomposition":
      return (
        <Section title={`Extracted claims (${d.claim_count ?? 0})`}>
          <ol className="space-y-1.5">
            {(d.claims ?? []).map((c: any, i: number) => (
              <li key={i} className="flex gap-2 rounded-lg border border-purple-900/30 bg-[#090414] p-2 text-[12px] text-[#E6E0F5]">
                <span className="font-mono text-[10px] text-purple-300">{(c.index ?? i) + 1}</span>
                <span className="flex-1">{c.text}</span>
                {c.category && <Pill label="" value={c.category} />}
              </li>
            ))}
          </ol>
        </Section>
      );

    case "claim_verification":
      return (
        <>
          <MetricsRow title="Metrics" metrics={d.metrics} />
          <Section title={`Verdicts (${(d.claims ?? []).length})`}>
            <ClaimList claims={d.claims ?? []} />
          </Section>
        </>
      );

    case "verification_router":
      return (
        <>
          <Section title="Routing decision">
            <div className="rounded-lg border border-purple-500/25 bg-purple-950/30 p-2.5">
              <p className="text-[13px] font-semibold text-[#F5F0FF]">{run.route ? ROUTE_LABELS[run.route] : "No decision recorded"}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#C4B7DB]">{d.reason ?? run.routeReason}</p>
            </div>
          </Section>
          <div className="flex flex-wrap gap-1.5">
            <Pill label="failing claims" value={d.failed_claims ?? "–"} />
            <Pill label="rounds used" value={d.round ?? 0} />
          </div>
        </>
      );

    case "self_correction":
      return (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Pill label="round" value={`${d.round ?? run.round} / ${d.max_rounds ?? "–"}`} />
            {d.stalled && <Pill label="status" value="no new revision" />}
          </div>
          <Section title={`Claims targeted (${(d.targeted_claims ?? []).length})`}>
            <ul className="list-inside list-disc space-y-1 text-[12px] text-[#E6E0F5]">
              {(d.targeted_claims ?? []).map((t: string, i: number) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </Section>
          <Section title="Previous answer">
            <TextBlock text={d.previous_answer} />
          </Section>
          <Section title="Revised answer">
            <TextBlock text={d.revised_answer} />
          </Section>
          {(d.new_evidence_chunks ?? []).length > 0 && (
            <p className="font-mono text-[10px] text-[#8D829F]">{d.new_evidence_chunks.length} new evidence chunk(s) retrieved</p>
          )}
        </>
      );

    case "re_verification":
      return (
        <>
          {d.skipped_reverification ? (
            <p className="rounded-lg border border-purple-900/30 bg-[#090414] p-2.5 text-[12px] text-[#C4B7DB]">
              The correction produced no new revision, so there was nothing to re-verify.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                <Pill label="round" value={d.round ?? run.round} />
                <Pill label="failing before" value={d.failed_before ?? "–"} />
                <Pill label="failing after" value={d.failed_after ?? "–"} />
              </div>
              <MetricsRow title="Before" metrics={d.metrics_before} />
              <MetricsRow title="After" metrics={d.metrics_after} />
              <Section title="Verdicts after revision">
                <ClaimList claims={d.claims ?? []} />
              </Section>
            </>
          )}
          <Section title="Routing decision">
            <p className="text-[12px] text-[#E6E0F5]">
              <span className="font-semibold">{d.route ? ROUTE_LABELS[d.route as keyof typeof ROUTE_LABELS] : "None"}</span>
              {d.reason ? ` — ${d.reason}` : ""}
            </p>
          </Section>
        </>
      );

    case "abstention":
      return (
        <Section title="Abstention">
          <TextBlock text={d.message} />
        </Section>
      );

    case "final_answer_generation":
      return (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Pill label="status" value={String(d.verification_status ?? "–").replace(/_/g, " ")} />
            <Pill label="abstained" value={d.is_abstained ? "yes" : "no"} />
            <Pill label="correction rounds" value={d.correction_rounds ?? 0} />
          </div>
          <Section title="Final answer">
            <TextBlock text={d.final_text} />
          </Section>
          {d.execution_metadata && (
            <Section title="Execution metadata">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                {Object.entries(d.execution_metadata)
                  .filter(([, v]) => v !== null && typeof v !== "object")
                  .map(([k, v]) => (
                    <React.Fragment key={k}>
                      <dt className="truncate font-mono text-[#8D829F]">{k}</dt>
                      <dd className="truncate font-mono text-[#E6E0F5]">{String(v)}</dd>
                    </React.Fragment>
                  ))}
              </dl>
            </Section>
          )}
        </>
      );

    case "database_persistence":
      return (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Pill label="persisted" value={d.persisted ? "yes" : "no"} />
            <Pill label="claims saved" value={d.claim_count ?? "–"} />
          </div>
          {d.answer_id && (
            <Section title="Answer">
              <p className="break-all font-mono text-[11px] text-purple-200">{d.answer_id}</p>
              {workspaceId && (
                <Link
                  href={`/audits/${d.answer_id}`}
                  className="inline-flex items-center gap-1 text-[12px] text-purple-300 underline-offset-2 hover:text-white hover:underline"
                >
                  Open full audit <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              )}
            </Section>
          )}
        </>
      );

    case "error_handler":
      return (
        <Section title="Error">
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/40 p-2.5 text-[12px] text-rose-200">
            {d.error?.message ?? "The pipeline stopped with an error."}
          </div>
        </Section>
      );
  }
}

export function NodeInspector({ nodeId, state, workspaceId, onClose }: NodeInspectorProps) {
  const def = NODE_BY_ID[nodeId];
  const runtime = state.nodes[nodeId];
  const [runIndex, setRunIndex] = useState(Math.max(0, runtime.runs.length - 1));

  // Follow the newest run as the correction loop adds iterations, unless the user picked an earlier one.
  const runCount = runtime.runs.length;
  useEffect(() => {
    setRunIndex(Math.max(0, runCount - 1));
  }, [nodeId, runCount]);

  const run = runtime.runs[Math.min(runIndex, runCount - 1)];
  const duration = formatDuration(run?.durationMs);

  return (
    <aside
      aria-label={`${def.label} details`}
      className="flex h-full w-full flex-col border-purple-500/25 bg-[#0B0517]/95 backdrop-blur-xl md:border-l"
    >
      <header className="flex items-start justify-between gap-3 border-b border-purple-900/30 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-[#F5F0FF]">{def.label}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${STATUS_STYLE[runtime.status]}`}>{runtime.status}</span>
            {duration && <span className="font-mono text-[10px] text-[#7B708F]">{duration}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="rounded-lg p-1.5 text-[#B0A4C3] transition-colors hover:bg-purple-950/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {runCount > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-purple-900/25 px-4 py-2" role="tablist" aria-label="Node executions">
          {runtime.runs.map((r, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === Math.min(runIndex, runCount - 1)}
              onClick={() => setRunIndex(i)}
              className={`rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                i === Math.min(runIndex, runCount - 1)
                  ? "border-purple-400/50 bg-purple-950/70 text-purple-100"
                  : "border-purple-900/30 text-[#8D829F] hover:text-purple-200"
              }`}
            >
              Run {i + 1}
              {r.round ? ` · round ${r.round}` : ""}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {!run ? (
          <p className="rounded-lg border border-purple-900/30 bg-[#090414] p-3 text-[12px] leading-relaxed text-[#C4B7DB]">
            {runtime.status === "skipped"
              ? "This node never ran. The routing decision for this execution did not require it."
              : "This node has not started yet. Details appear here as soon as the backend reports it."}
          </p>
        ) : run.status === "running" ? (
          <p className="rounded-lg border border-purple-500/25 bg-purple-950/30 p-3 text-[12px] text-purple-200">
            Running. Results appear when the backend reports completion.
          </p>
        ) : (
          <RunDetails id={nodeId} run={run} workspaceId={workspaceId} />
        )}
      </div>
    </aside>
  );
}
