"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClaimCard } from "@/components/claims/ClaimCard";
import { CorrectionTimeline } from "@/components/claims/CorrectionTimeline";
import { AnswerAudit } from "@/types";
import { apiFetch } from "@/lib/api";

export default function AuditDetailPage() {
  const params = useParams();
  const answerId = (params?.answerId as string) || "";
  const workspaceId = "default-workspace-001";

  const [auditData, setAuditData] = useState<AnswerAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!answerId) return;

    const fetchAudit = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await apiFetch<AnswerAudit>(
          `/api/v1/workspaces/${workspaceId}/audits/${answerId}`
        );
        setAuditData(data);
      } catch (err: unknown) {
        console.error("Failed to load audit:", err);
        setError("Audit record not found or inaccessible for this answer.");
      } finally {
        setLoading(false);
      }
    };

    fetchAudit();
  }, [answerId, workspaceId]);

  const handleExport = async () => {
    if (!answerId) return;
    try {
      setExporting(true);
      const data = await apiFetch<Record<string, unknown>>(
        `/api/v1/workspaces/${workspaceId}/audits/${answerId}/export`
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_${answerId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
        <p className="text-sm text-[#8D829F] font-mono">Loading audit trail & provenance links...</p>
      </div>
    );
  }

  if (error || !auditData) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1 text-purple-300" />
            Back to Dashboard
          </Button>
        </Link>
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-8 text-center space-y-3 backdrop-blur-md">
          <AlertCircle className="h-8 w-8 text-rose-400 mx-auto" />
          <h2 className="text-base font-semibold text-[#F5F0FF]">Audit Not Found</h2>
          <p className="text-sm text-[#B0A4C3]">{error || "No audit details available."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="text-purple-300 hover:text-white">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#F5F0FF]">
              Answer Audit #{answerId.slice(0, 12)}
            </h1>
            <p className="text-xs text-[#8D829F] font-mono mt-0.5">
              Query ID: {auditData.query_id} • Created:{" "}
              {new Date(auditData.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
          className="self-start sm:self-auto gap-2 text-xs active:scale-95 transition-all duration-150"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
          ) : (
            <Download className="h-4 w-4 text-purple-300" />
          )}
          Export Audit JSON
        </Button>
      </div>

      {/* Query Banner */}
      <div className="rounded-2xl border border-purple-900/30 bg-[#100A1C]/80 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.4)] backdrop-blur-md space-y-1.5 animate-fade-in-up hover-card-glow transition-all duration-200">
        <span className="text-xs font-mono font-medium uppercase tracking-wider text-purple-400 block">
          Audited Query Prompt
        </span>
        <p className="text-sm font-medium text-[#F5F0FF] leading-relaxed">{auditData.prompt}</p>
      </div>

      {/* Self-Correction Lifecycle Timeline */}
      <CorrectionTimeline
        draftText={auditData.draft_text}
        finalText={auditData.final_text}
        rounds={auditData.correction_rounds}
        isAbstained={auditData.is_abstained}
        correctionHistory={auditData.correction_history}
      />

      {/* Decomposed Atomic Claims */}
      <div className="space-y-4 pt-6 border-t border-purple-900/30">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#F5F0FF]">
            Decomposed Atomic Claims ({auditData.claims.length})
          </h3>
          <span className="text-xs font-mono px-2.5 py-0.5 rounded-full border border-purple-500/30 bg-purple-950/60 text-purple-300">
            Hallucination Rate: {Math.round(auditData.hallucination_rate * 100)}%
          </span>
        </div>

        {auditData.claims.length === 0 ? (
          <div className="rounded-2xl border border-purple-900/25 bg-[#100A1C]/50 p-8 text-center text-sm text-[#8D829F]">
            No atomic claims were decomposed for this answer.
          </div>
        ) : (
          <div className="space-y-4">
            {auditData.claims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
