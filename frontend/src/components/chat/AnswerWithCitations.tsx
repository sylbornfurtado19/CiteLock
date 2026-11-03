"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Answer } from "@/types";
import { ShieldCheck, ArrowRight, Bookmark, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvidenceDrawer, CitationItem } from "./EvidenceDrawer";
import { AnswerMetricsPanel, EmptyAnswerNotice } from "./AnswerMetricsPanel";
import { buildAnswerMetrics, isBlankAnswer } from "@/lib/answerMetrics";

interface AnswerWithCitationsProps {
  workspaceId: string;
  answer: Answer;
  /** From the pipeline_complete payload (or the stored query); falls back to values stored on the answer. */
  verificationStatus?: string | null;
  executionMetadata?: Record<string, any> | null;
}

export function AnswerWithCitations({ workspaceId, answer, verificationStatus, executionMetadata }: AnswerWithCitationsProps) {
  const metrics = useMemo(
    () => buildAnswerMetrics(answer, { verificationStatus, executionMetadata }),
    [answer, verificationStatus, executionMetadata]
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeCitationIndex, setActiveCitationIndex] = useState(0);

  // Build unified citation index mapping answer claims & evidence links
  const citations = useMemo<CitationItem[]>(() => {
    const list: CitationItem[] = [];
    let counter = 1;

    (answer.claims || []).forEach((claim) => {
      if (claim.evidence_links && claim.evidence_links.length > 0) {
        claim.evidence_links.forEach((link) => {
          list.push({
            id: link.id,
            citationNumber: counter,
            label: `[${counter}]`,
            claimIndex: claim.claim_index,
            claimText: claim.claim_text,
            verdict: claim.verdict,
            confidenceScore: claim.confidence_score,
            rationale: claim.rationale,
            chunkId: link.chunk_id,
            documentFilename: link.document_filename,
            documentId: link.document_id,
            pageNumber: link.page_number,
            exactQuote: link.exact_quote,
            startCharOffset: link.start_char_offset,
            endCharOffset: link.end_char_offset,
            chunkContent: link.chunk_content,
          });
          counter++;
        });
      } else {
        list.push({
          id: claim.id,
          citationNumber: counter,
          label: `[${counter}]`,
          claimIndex: claim.claim_index,
          claimText: claim.claim_text,
          verdict: claim.verdict,
          confidenceScore: claim.confidence_score,
          rationale: claim.rationale,
        });
        counter++;
      }
    });

    return list;
  }, [answer.claims]);

  const handleOpenCitation = (index: number) => {
    if (index >= 0 && index < citations.length) {
      setActiveCitationIndex(index);
      setDrawerOpen(true);
    }
  };

  // Render text with clickable inline citation badges
  const renderFormattedTextWithCitations = () => {
    const text = answer.final_text || "";
    // Match [Passage 1], [Passage 1, 2], [1], [Chunk ID: ...]
    const citationRegex = /(\[(?:Passage\s+\d+(?:\s*,\s*\d+)*|\d+(?:\s*,\s*\d+)*|Chunk ID:\s*[a-f0-9-]+)\])/gi;
    const parts = text.split(citationRegex);

    return parts.map((part, idx) => {
      const isCitation = citationRegex.test(part);
      if (!isCitation) {
        return <span key={idx}>{part}</span>;
      }

      // Extract numbers from citation marker
      const numbers = (part.match(/\d+/g) || []).map(Number);
      if (numbers.length === 0) {
        return <span key={idx}>{part}</span>;
      }

      return (
        <span key={idx} className="inline-flex items-center align-baseline mx-0.5">
          {numbers.map((num) => {
            // Find corresponding citation (1-indexed)
            let citIdx = citations.findIndex((c) => c.citationNumber === num);
            if (citIdx === -1 && num <= citations.length) {
              citIdx = num - 1;
            }

            return (
              <button
                key={num}
                type="button"
                onClick={() => handleOpenCitation(citIdx !== -1 ? citIdx : 0)}
                className="inline-flex items-center px-1.5 py-0.2 mx-0.5 text-[11px] font-mono font-medium rounded-md bg-purple-950/80 text-purple-300 border border-purple-500/40 hover:bg-purple-800 hover:text-white hover:border-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.25)] hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer"
                title={`Inspect Source Evidence for Citation [${num}]`}
              >
                [{num}]
              </button>
            );
          })}
        </span>
      );
    });
  };

  return (
    <>
      <div className="rounded-2xl border border-purple-500/30 bg-[#120B22]/90 p-5 space-y-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md hover:border-purple-500/50 hover:shadow-[0_8px_32px_rgba(139,92,246,0.2)] transition-all duration-200 animate-fade-in-up">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-mono font-medium tracking-wide text-purple-300">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-purple-950 border border-purple-500/40">
              <ShieldCheck className="h-3.5 w-3.5 text-purple-300" />
            </div>
            <span>Audited & Self-Corrected Answer</span>
          </div>
          <Link href={`/audits/${answer.id}`}>
            <Button
              variant="ghost"
              size="sm"
              className="text-purple-300 hover:text-white text-xs bg-purple-950/40 border border-purple-500/20 hover:border-purple-400/40 hover:-translate-y-0.5 transition-all duration-150 group"
            >
              Inspect Claims & Evidence
              <ArrowRight className="h-3.5 w-3.5 ml-1 transition-transform duration-200 group-hover:translate-x-1" />
            </Button>
          </Link>
        </div>

        {/* Answer text with inline clickable citations */}
        {isBlankAnswer(answer.final_text) ? (
          <EmptyAnswerNotice />
        ) : (
          <div className="text-sm leading-relaxed text-[#F5F0FF] whitespace-pre-wrap" data-testid="final-answer-text">
            {renderFormattedTextWithCitations()}
          </div>
        )}

        {/* Interactive Source Citations Bar */}
        {citations.length > 0 && (
          <div className="pt-3 border-t border-purple-900/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-[#8D829F] uppercase tracking-wider flex items-center gap-1.5">
                <Bookmark className="h-3 w-3 text-purple-400" />
                <span>Verified Citations ({citations.length})</span>
              </span>
              <span className="text-[10px] text-purple-400/80 font-mono">
                Click any citation to inspect source passage
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {citations.map((cit, idx) => {
                const docName = cit.documentFilename || "Document";
                const isSupported = cit.verdict === "supported";
                const isContradicted = cit.verdict === "contradicted" || cit.verdict === "unsupported";

                return (
                  <button
                    key={cit.id}
                    type="button"
                    onClick={() => handleOpenCitation(idx)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-[#090314] hover:bg-purple-950/60 border border-purple-900/40 hover:border-purple-500/50 text-[#E6E0F5] hover:text-white shadow-sm transition-all duration-150 group"
                  >
                    <span className="text-purple-400 font-semibold group-hover:text-purple-300">
                      [{cit.citationNumber}]
                    </span>
                    <span className="truncate max-w-[140px] text-[11px] text-[#A89CB8]">
                      {docName}
                    </span>
                    {cit.pageNumber !== undefined && (
                      <span className="text-[10px] text-purple-400/60">p.{cit.pageNumber}</span>
                    )}
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        isSupported
                          ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                          : isContradicted
                          ? "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.8)]"
                          : "bg-amber-400"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Verification summary: status, rates, claim breakdown, correction rounds and latency */}
        <AnswerMetricsPanel metrics={metrics} />
      </div>

      {/* Right-Side Split-Pane / Slide-Over Evidence Drawer */}
      <EvidenceDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        workspaceId={workspaceId}
        citations={citations}
        activeCitationIndex={activeCitationIndex}
        onSelectCitation={setActiveCitationIndex}
      />
    </>
  );
}
