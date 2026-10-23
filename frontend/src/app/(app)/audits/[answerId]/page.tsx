import React from "react";
import Link from "next/link";
import { ArrowLeft, Download, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClaimCard } from "@/components/claims/ClaimCard";
import { CorrectionTimeline } from "@/components/claims/CorrectionTimeline";
import { Claim, AnswerAudit } from "@/types";

export default function AuditDetailPage({
  params,
}: {
  params: { answerId: string };
}) {
  const auditData: AnswerAudit = {
    answer_id: params.answerId,
    query_id: "query-42",
    prompt: "What were the total R&D expenditures in Q3 2024 and which division led capital allocation?",
    draft_text:
      "In Q3 2024, total R&D expenditures reached $45.2M, driven primarily by the Robotics and Quantum divisions with a 20% increase over the previous quarter.",
    final_text:
      "In Q3 2024, total R&D expenditures reached $42.5M, driven primarily by the Autonomous Systems division as stated in Section 4.2 of the financial report.",
    correction_rounds: 1,
    is_abstained: false,
    hallucination_rate: 0.25,
    created_at: "2026-10-23T11:45:00Z",
    claims: [
      {
        id: "claim-1",
        answer_id: params.answerId,
        claim_index: 0,
        claim_text: "Total R&D expenditures reached $42.5M in Q3 2024.",
        verdict: "supported",
        confidence_score: 0.98,
        rationale: "Exact numeric match verified in financial table 4.",
        evidence_links: [
          {
            id: "ev-1",
            claim_id: "claim-1",
            chunk_id: "chunk-99a",
            relevance_score: 0.96,
            exact_quote: "Research and development outlays for Q3 2024 amounted to $42.5 million.",
            start_char_offset: 120,
            end_char_offset: 198,
          },
        ],
      },
      {
        id: "claim-2",
        answer_id: params.answerId,
        claim_index: 1,
        claim_text: "Expenditure was led by the Autonomous Systems division.",
        verdict: "supported",
        confidence_score: 0.94,
        rationale: "Directly corroborated in divisional breakdown section.",
        evidence_links: [
          {
            id: "ev-2",
            claim_id: "claim-2",
            chunk_id: "chunk-99b",
            relevance_score: 0.91,
            exact_quote: "The Autonomous Systems unit commanded the highest divisional allocation at 52%.",
            start_char_offset: 45,
            end_char_offset: 125,
          },
        ],
      },
      {
        id: "claim-3",
        answer_id: params.answerId,
        claim_index: 2,
        claim_text: "Quantum division was an allocation leader in Q3.",
        verdict: "contradicted",
        confidence_score: 0.92,
        rationale: "Draft claimed Quantum led allocations, but report notes Quantum R&D began in Q4.",
        evidence_links: [
          {
            id: "ev-3",
            claim_id: "claim-3",
            chunk_id: "chunk-99c",
            relevance_score: 0.88,
            exact_quote: "Quantum compute pilot investments are slated to commence in Q4.",
            start_char_offset: 10,
            end_char_offset: 74,
          },
        ],
      },
    ],
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Answer Audit #{params.answerId.slice(0, 12)}
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Query ID: {auditData.query_id} • Created: {new Date(auditData.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export Audit JSON
        </Button>
      </div>

      {/* Query Banner */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
          Audited Query Prompt
        </span>
        <p className="text-sm font-medium text-white">{auditData.prompt}</p>
      </div>

      {/* Self-Correction Lifecycle Timeline */}
      <CorrectionTimeline
        draftText={auditData.draft_text}
        finalText={auditData.final_text}
        rounds={auditData.correction_rounds}
        isAbstained={auditData.is_abstained}
      />

      {/* Decomposed Atomic Claims */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            Decomposed Atomic Claims ({auditData.claims.length})
          </h3>
          <span className="text-xs text-slate-400">
            Hallucination Rate: {Math.round(auditData.hallucination_rate * 100)}%
          </span>
        </div>

        <div className="space-y-4">
          {auditData.claims.map((claim) => (
            <ClaimCard key={claim.id} claim={claim} />
          ))}
        </div>
      </div>
    </div>
  );
}
