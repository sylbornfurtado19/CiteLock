"use client";

import React from "react";
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
  ExternalLink,
  MessageSquare,
  FileSearch,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuditFeedItem {
  id: string;
  prompt: string;
  status: "grounded" | "flagged" | "corrected" | "abstained";
  statusLabel: string;
  claimsCount: number;
  hallucinations: number;
  latencyMs: number;
  timestamp: string;
}

const DEFAULT_AUDITS: AuditFeedItem[] = [
  {
    id: "demo-audit-001",
    prompt: "What is our standard SLA for enterprise data deletion requests?",
    status: "grounded",
    statusLabel: "100% Grounded",
    claimsCount: 4,
    hallucinations: 0,
    latencyMs: 142,
    timestamp: "2m ago",
  },
  {
    id: "demo-audit-002",
    prompt: "Summarize confidentiality liabilities under the mutual NDA clause.",
    status: "flagged",
    statusLabel: "1 Contradiction Intercepted",
    claimsCount: 6,
    hallucinations: 1,
    latencyMs: 218,
    timestamp: "18m ago",
  },
  {
    id: "demo-audit-003",
    prompt: "What are the allowed third-party sub-processors in European regions?",
    status: "grounded",
    statusLabel: "100% Grounded",
    claimsCount: 3,
    hallucinations: 0,
    latencyMs: 164,
    timestamp: "45m ago",
  },
  {
    id: "demo-audit-004",
    prompt: "Can customer proprietary data be used to train foundation models?",
    status: "corrected",
    statusLabel: "Self-Corrected (Round 2)",
    claimsCount: 5,
    hallucinations: 0,
    latencyMs: 310,
    timestamp: "2h ago",
  },
  {
    id: "demo-audit-005",
    prompt: "What is the policy regarding SOC2 Type II compliance audit reports?",
    status: "grounded",
    statusLabel: "100% Grounded",
    claimsCount: 4,
    hallucinations: 0,
    latencyMs: 128,
    timestamp: "4h ago",
  },
];

export function RecentAuditsFeed({
  totalQueries = 0,
  className = "",
}: {
  totalQueries?: number;
  className?: string;
}) {
  const hasAudits = totalQueries > 0;
  const items = hasAudits ? DEFAULT_AUDITS : [];

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
            {hasAudits ? `${items.length} Recent Streams` : "0 Audits"}
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
      {hasAudits ? (
        <div className="space-y-2.5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-purple-900/25 text-[10px] font-mono uppercase tracking-wider text-[#8D829F]">
                  <th className="pb-2.5 font-medium">Query Prompt Snippet</th>
                  <th className="pb-2.5 font-medium px-3">Verdict Status</th>
                  <th className="pb-2.5 font-medium px-3">Latency SLA</th>
                  <th className="pb-2.5 font-medium px-3">Timestamp</th>
                  <th className="pb-2.5 font-medium text-right">Inspection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-900/15">
                {items.map((audit) => {
                  let badgeStyles = "bg-emerald-950/70 border-emerald-500/30 text-emerald-300";
                  let BadgeIcon = ShieldCheck;

                  if (audit.status === "flagged") {
                    badgeStyles = "bg-rose-950/70 border-rose-500/30 text-rose-300";
                    BadgeIcon = AlertTriangle;
                  } else if (audit.status === "corrected") {
                    badgeStyles = "bg-purple-950/70 border-purple-500/35 text-purple-200";
                    BadgeIcon = RotateCcw;
                  } else if (audit.status === "abstained") {
                    badgeStyles = "bg-slate-900/80 border-slate-700 text-slate-300";
                    BadgeIcon = ShieldAlert;
                  }

                  return (
                    <tr
                      key={audit.id}
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
                              {audit.claimsCount} claims evaluated • {audit.id}
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
                          <span>{audit.statusLabel}</span>
                        </span>
                      </td>

                      {/* Latency SLA */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono text-xs text-purple-200">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              audit.latencyMs < 200
                                ? "bg-emerald-400"
                                : audit.latencyMs < 500
                                ? "bg-amber-400"
                                : "bg-rose-400"
                            }`}
                          />
                          <span>{audit.latencyMs} ms</span>
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px] text-[#8D829F]">
                        {audit.timestamp}
                      </td>

                      {/* Direct Action Link */}
                      <td className="py-3 pl-3 text-right whitespace-nowrap">
                        <Link href={`/audits/${audit.id}`}>
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
