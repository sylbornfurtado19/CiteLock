"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { CardTitle } from "@/components/ui/card";
import {
  History,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  ArrowRight,
  MessageSquare,
  FileSearch,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { AuditListItem } from "@/types";

function formatTimeAgo(isoString: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return isoString;
  }
}

function getStatusDisplay(audit: AuditListItem) {
  if (audit.verification_status === "abstained") {
    return {
      label: "Abstained",
      badgeStyles: "bg-slate-900/80 border-slate-700 text-slate-300",
      Icon: ShieldAlert,
    };
  }
  if (audit.correction_rounds > 0) {
    return {
      label: `Self-Corrected (Round ${audit.correction_rounds})`,
      badgeStyles: "bg-purple-950/70 border-purple-500/35 text-purple-200",
      Icon: RotateCcw,
    };
  }
  if (audit.hallucination_rate > 0) {
    return {
      label: `${Math.round(audit.hallucination_rate * 100)}% Flagged`,
      badgeStyles: "bg-rose-950/70 border-rose-500/30 text-rose-300",
      Icon: AlertTriangle,
    };
  }
  return {
    label: "100% Grounded",
    badgeStyles: "bg-emerald-950/70 border-emerald-500/30 text-emerald-300",
    Icon: ShieldCheck,
  };
}

export function RecentAuditsFeed({
  workspaceId = "default-workspace-001",
  totalQueries = 0,
  className = "",
}: {
  workspaceId?: string;
  totalQueries?: number;
  className?: string;
}) {
  const [audits, setAudits] = useState<AuditListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    async function loadAudits() {
      try {
        setLoading(true);
        const data = await apiFetch<AuditListItem[]>(
          `/api/v1/workspaces/${workspaceId}/audits`
        );
        if (isMounted) {
          setAudits(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to load audits:", err);
        if (isMounted) {
          setAudits([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    loadAudits();
    return () => {
      isMounted = false;
    };
  }, [workspaceId]);

  const hasAudits = audits.length > 0;

  return (
    <SpotlightCard
      className={`p-6 cursor-default ${className}`}
      spotlightColor="rgba(168, 85, 247, 0.12)"
      borderSpotlightColor="rgba(216, 180, 254, 0.35)"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-purple-900/25 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-950/70 border border-purple-500/30 text-purple-300 shadow-[0_0_10px_rgba(139,92,246,0.2)]">
            <History className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-[#F5F0FF]">
              Recent Verification Audits
            </CardTitle>
            <p className="text-xs text-[#8D829F] mt-0.5">
              Live audit stream of claims evaluated, fact-checked, and grounded in this workspace
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs px-2.5 py-1 bg-purple-950/60 border border-purple-500/25 rounded-lg text-purple-300">
            {hasAudits ? `${audits.length} Recent Streams` : "0 Audits"}
          </span>
          <Link href="/chat">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1.5 border-purple-500/25 bg-[#140D24] hover:bg-[#1A1130] text-purple-200 hover:text-white"
            >
              <Sparkles className="h-3 w-3 text-amber-300" />
              <span>New Audit</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Feed Content */}
      {loading && audits.length === 0 ? (
        <div className="flex items-center justify-center p-8 text-purple-300 gap-2 text-xs font-mono">
          <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
          <span>Loading audit history...</span>
        </div>
      ) : hasAudits ? (
        <div className="space-y-2.5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-purple-900/25 text-[10px] font-mono uppercase tracking-wider text-[#8D829F]">
                  <th className="pb-2.5 font-medium">Query Prompt Snippet</th>
                  <th className="pb-2.5 font-medium px-3">Verdict Status</th>
                  <th className="pb-2.5 font-medium px-3">Correction Cycles</th>
                  <th className="pb-2.5 font-medium px-3">Timestamp</th>
                  <th className="pb-2.5 font-medium text-right">Inspection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-900/15">
                {audits.map((audit) => {
                  const { label, badgeStyles, Icon: BadgeIcon } = getStatusDisplay(audit);
                  const count = audit.claim_count ?? audit.claims_count ?? 0;

                  return (
                    <tr
                      key={audit.answer_id}
                      className="group transition-colors hover:bg-[#150D2A]/60"
                    >
                      {/* Query Prompt Snippet */}
                      <td className="py-3 pr-3 max-w-xs sm:max-w-md">
                        <div className="flex items-start gap-2.5">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-purple-950/60 border border-purple-500/20 text-purple-300 mt-0.5 group-hover:border-purple-400/40 transition-colors">
                            <MessageSquare className="h-3 w-3" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-medium text-[#F5F0FF] group-hover:text-purple-100 transition-colors line-clamp-1">
                              {audit.prompt}
                            </span>
                            <span className="font-mono text-[10px] text-[#8D829F] mt-0.5 block">
                              {count} claims evaluated • {audit.answer_id.slice(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Verdict Status Badge */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium border ${badgeStyles} shadow-sm`}
                        >
                          <BadgeIcon className="h-3 w-3 shrink-0" />
                          <span>{label}</span>
                        </span>
                      </td>

                      {/* Correction Cycles */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono text-xs text-purple-200">
                          <span>{audit.correction_rounds} cycle{audit.correction_rounds === 1 ? "" : "s"}</span>
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px] text-[#8D829F]">
                        {formatTimeAgo(audit.created_at)}
                      </td>

                      {/* Direct Action Link */}
                      <td className="py-3 pl-3 text-right whitespace-nowrap">
                        <Link href={`/audits/${audit.answer_id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-purple-300 hover:text-white hover:bg-purple-950/60 border border-transparent hover:border-purple-500/30 gap-1.5 px-2.5 group/btn"
                          >
                            <span>Inspect Audit</span>
                            <ArrowRight className="h-3 w-3 group-hover/btn:translate-x-1 transition-transform duration-150" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Zero-Data Deliberate Empty State */
        <div className="rounded-xl border border-dashed border-purple-900/40 bg-[#070311]/60 p-8 text-center my-2">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-purple-950/70 border border-purple-500/30 text-purple-300 shadow-[0_0_12px_rgba(139,92,246,0.2)]">
            <FileSearch className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-purple-200">No verification audits recorded yet</p>
          <p className="text-xs text-[#8D829F] mt-1.5 max-w-md mx-auto leading-relaxed">
            Audits and claim verification provenance will appear in this live stream automatically as questions are answered and fact-checked in Grounded Chat.
          </p>
          <div className="mt-4">
            <Link href="/chat">
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 border-purple-500/35 bg-purple-950/60 hover:bg-purple-900/70 text-purple-200 hover:text-white shadow-sm"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span>Run First Grounded Query</span>
              </Button>
            </Link>
          </div>
        </div>
      )}
    </SpotlightCard>
  );
}
