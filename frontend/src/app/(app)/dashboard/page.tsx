"use client";

import React, { useState } from "react";
import Link from "next/link";
import { StatCard } from "@/components/dashboard/StatCard";
import { VerdictDistributionChart } from "@/components/dashboard/VerdictDistributionChart";
import { PipelineNodeFlow } from "@/components/dashboard/PipelineNodeFlow";
import { RecentAuditsFeed } from "@/components/dashboard/RecentAuditsFeed";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import {
  ShieldCheck,
  Database,
  FileCheck,
  AlertCircle,
  RefreshCw,
  Terminal,
  FileUp,
  Zap,
  Download,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkeletonKpi, SkeletonChart, SkeletonCard } from "@/components/ui/skeleton";
import { useWorkspace } from "@/lib/workspace";
import { notify } from "@/components/ui/toast";
import { useWorkspaceAnalytics } from "@/lib/query";

export default function DashboardPage() {
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  // Time-range filter state
  const [selectedRange, setSelectedRange] = useState<string>("24h");

  // Server-state caching via TanStack Query (30s stale time, background revalidation)
  const {
    data: analytics,
    isLoading: analyticsLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useWorkspaceAnalytics(workspaceId, selectedRange);

  // Initial loading only when no cached data is present
  const isInitialLoading = (workspaceLoading || analyticsLoading) && !analytics;
  const isSyncing = isFetching;
  const error = queryError ? "Unable to load real-time analytics. Verify backend connection." : null;

  // Export report states
  const [exportingReport, setExportingReport] = useState(false);
  const [exportedSuccess, setExportedSuccess] = useState(false);

  const handleRefresh = async () => {
    try {
      await refetch();
      notify.info("Telemetry Metrics Synchronized", {
        description: `Updated metrics across active ${selectedRange.toUpperCase()} window.`,
        duration: 3000,
      });
    } catch (err: unknown) {
      console.error("Failed to load analytics:", err);
      notify.error("Telemetry Sync Failed", err);
    }
  };

  const totalClaims = analytics?.verdict_distribution
    ? Object.values(analytics.verdict_distribution).reduce((a, b) => a + b, 0)
    : 0;

  const hallucinationCount = analytics?.verdict_distribution
    ? (analytics.verdict_distribution.contradicted || 0) +
      (analytics.verdict_distribution.unsupported || 0)
    : 0;

  const groundingRate =
    analytics && typeof analytics.grounding_rate === "number"
      ? `${(analytics.grounding_rate * 100).toFixed(1)}%`
      : analytics && analytics.total_queries > 0
      ? `${((1 - analytics.overall_hallucination_rate) * 100).toFixed(1)}%`
      : "100.0%";

  const handleExportComplianceReport = () => {
    const toastId = `compliance-export-${Date.now()}`;
    try {
      setExportingReport(true);
      notify.loading("Compiling Compliance Audit Report...", {
        id: toastId,
        description: `Assembling telemetry for range ${selectedRange.toUpperCase()}...`,
      });

      const reportPayload = {
        title: "CiteLock Hallucination & Citation Verification Compliance Audit",
        workspace_id: workspaceId,
        generated_at: new Date().toISOString(),
        time_range: selectedRange,
        auditor_version: "v0.1.0",
        summary: {
          overall_grounding_rate: groundingRate,
          total_documents_indexed: analytics?.total_documents ?? 0,
          total_claims_evaluated: totalClaims,
          hallucination_interceptions: hallucinationCount,
          average_latency_ms: analytics?.avg_latency_ms ?? 0,
          verdict_distribution: analytics?.verdict_distribution ?? {},
        },
        pipeline_status: {
          database_engine: "Neon Postgres + pgvector (HNSW Index)",
          storage_provider: "Firebase Storage (Private Encrypted AES-256)",
          judge_engine: "Remote API (Stateless RAM Safe)",
          sla_compliance: "OPTIMAL",
        },
        compliance_token: `CITELOCK-AUDIT-${Date.now().toString(36).toUpperCase()}`,
      };

      const blob = new Blob([JSON.stringify(reportPayload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `citelock_compliance_audit_${workspaceId}_${selectedRange}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportedSuccess(true);
      setTimeout(() => setExportedSuccess(false), 3000);

      notify.success("Compliance Audit Report Exported", {
        id: toastId,
        description: `Exported JSON compliance report for ${selectedRange.toUpperCase()} window.`,
      });
    } catch (err) {
      console.error("Export failed:", err);
      notify.error("Report Export Failed", err, {
        id: toastId,
        action: {
          label: "Retry",
          onClick: () => handleExportComplianceReport(),
        },
      });
    } finally {
      setExportingReport(false);
    }
  };

  return (
    <div className="relative space-y-8 max-w-7xl mx-auto pb-12">
      {/* Background ambient depth glow */}
      <div
        className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 h-80 w-[720px] bg-purple-600/8 blur-[120px] -z-10"
        aria-hidden="true"
      />

      {/* Refined Dashboard Header Banner with Interactive Luminance & Sweeping Radar Line */}
      <SpotlightCard
        className="relative p-5 sm:p-6 animate-fade-in-down overflow-hidden"
        spotlightColor="rgba(168, 85, 247, 0.12)"
        borderSpotlightColor="rgba(216, 180, 254, 0.35)"
      >
        {/* Sweeping Radar-Line Animation Active During Background Sync */}
        {isSyncing && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
            {/* Top scanning laser edge */}
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-purple-300 to-transparent shadow-[0_0_18px_rgba(216,180,254,0.95)] animate-radar-sweep" />
            {/* Ambient specular beam wash */}
            <div className="h-full w-56 bg-gradient-to-r from-transparent via-purple-500/12 to-transparent blur-md animate-radar-sweep" />
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-950/80 border border-purple-500/35 text-purple-300 shadow-[0_0_14px_rgba(139,92,246,0.3)] group-hover:scale-105 group-hover:border-purple-400/50 transition-all duration-200">
              <ShieldCheck className="h-6 w-6 text-purple-300" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F0FF]">
                  Auditor Dashboard
                </h1>

                {/* Cybernetic Telemetry Pill with 3-Peak Oscilloscope Wave */}
                <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/35 bg-purple-950/60 px-2.5 py-0.5 text-xs text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.2)]">
                  <svg
                    className={`h-3 w-7 ${
                      isSyncing
                        ? "text-purple-300 animate-oscilloscope-fast"
                        : "text-purple-400/80 animate-oscilloscope"
                    }`}
                    viewBox="0 0 28 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M1 6 Q 4 1, 7 6 T 13 6 T 19 6 T 25 6 L 27 6"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="font-mono text-[11px] font-medium tracking-tight">
                    {isSyncing ? "Sweeping Audit..." : "Grounding Active"}
                  </span>
                </div>
              </div>
              <p className="text-xs text-[#B0A4C3] mt-1">
                Real-time hallucination tracking, claim distribution, and citation fidelity metrics.
              </p>
            </div>
          </div>

          {/* Right Header Actions: Time-Range Capsule + Refresh Button */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Dynamic Time-Range Filter Capsule */}
            <div className="flex items-center rounded-xl bg-[#0B0616]/90 border border-purple-900/35 p-1 shadow-inner backdrop-blur-md">
              {["1h", "24h", "7d", "30d", "All"].map((range) => (
                <button
                  key={range}
                  onClick={() => setSelectedRange(range)}
                  className={`px-2.5 py-1 text-xs rounded-lg font-mono transition-all duration-150 ${
                    selectedRange === range
                      ? "bg-purple-950/90 text-purple-200 border border-purple-500/40 shadow-[0_0_10px_rgba(139,92,246,0.25)] font-semibold"
                      : "text-[#8D829F] hover:text-white hover:bg-purple-950/30"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            {/* Refresh Metrics Action */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isSyncing}
              className="text-xs self-start sm:self-auto gap-2 border-purple-500/30 bg-[#140D24] hover:bg-[#1A1130] hover:border-purple-400/50 hover:text-white transition-all duration-150 active:scale-95 shadow-sm group"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-purple-300 ${
                  isSyncing
                    ? "animate-spin text-purple-400"
                    : "group-hover:rotate-45 transition-transform duration-200"
                }`}
              />
              <span>{isSyncing ? "Sweeping Audit..." : "Refresh Metrics"}</span>
            </Button>
          </div>
        </div>
      </SpotlightCard>

      {/* Quick Audit Command Bar (Action Launchers) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-purple-900/30 bg-[#0E081F]/70 shadow-[0_4px_20px_rgba(0,0,0,0.35)] backdrop-blur-md animate-fade-in-up">
        <div className="flex items-center gap-2 px-1">
          <Terminal className="h-4 w-4 text-purple-400" />
          <span className="text-xs font-mono font-medium text-[#B0A4C3]">
            QUICK AUDIT COMMANDS:
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Action 1: Ingest New Documents */}
          <Link href="/documents">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-2 border-purple-500/25 bg-[#140D24] hover:bg-[#1C1233] hover:border-purple-400/45 text-purple-200 hover:text-white shadow-sm"
            >
              <FileUp className="h-3.5 w-3.5 text-purple-400" />
              <span>+ Ingest New Documents</span>
            </Button>
          </Link>

          {/* Action 2: Run Grounded Query */}
          <Link href="/chat">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-2 border-purple-500/35 bg-purple-950/50 hover:bg-purple-900/60 hover:border-purple-400/60 text-purple-100 shadow-[0_0_12px_rgba(139,92,246,0.2)]"
            >
              <Zap className="h-3.5 w-3.5 text-amber-300 fill-amber-300" />
              <span>⚡ Run Grounded Query</span>
            </Button>
          </Link>

          {/* Action 3: Export Audit Compliance Report */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportComplianceReport}
            disabled={exportingReport}
            className="text-xs gap-2 border-purple-500/25 bg-[#140D24] hover:bg-[#1C1233] hover:border-purple-400/45 text-[#B0A4C3] hover:text-white shadow-sm"
          >
            {exportingReport ? (
              <Loader2 className="h-3.5 w-3.5 text-purple-400 animate-spin" />
            ) : exportedSuccess ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Download className="h-3.5 w-3.5 text-purple-400" />
            )}
            <span>
              {exportingReport
                ? "Generating Report..."
                : exportedSuccess
                ? "Report Exported!"
                : "Export Compliance Audit"}
            </span>
          </Button>
        </div>
      </div>

      {/* KPI Stat Cards Deck */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[#F5F0FF]">Verification Telemetry</h3>
            <span className="font-mono text-xs px-2 py-0.5 rounded-full border border-purple-500/30 bg-purple-950/60 text-purple-300">
              Window: {selectedRange}
            </span>
          </div>
          {error && (
            <span className="text-xs text-rose-400 font-medium">Telemetry service offline</span>
          )}
        </div>

        {isInitialLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SkeletonKpi isHero={true} />
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Overall Grounding Rate"
              value={groundingRate}
              icon={ShieldCheck}
              description="Claims verified by citation proof"
              className="animate-fade-in-up"
              isHero={true}
            />
            <StatCard
              title="Indexed Documents"
              value={(analytics?.total_documents ?? 0).toString()}
              icon={Database}
              description="Private storage objects"
              className="animate-fade-in-up animation-delay-75"
              sparklineType="documents"
            />
            <StatCard
              title="Total Claims Evaluated"
              value={totalClaims.toString()}
              icon={FileCheck}
              description="Atomic propositions extracted"
              className="animate-fade-in-up animation-delay-150"
              sparklineType="claims"
            />
            <StatCard
              title="Hallucination Interceptions"
              value={hallucinationCount.toString()}
              icon={AlertCircle}
              description="Contradicted or unsupported claims"
              className="animate-fade-in-up animation-delay-200"
              sparklineType="hallucinations"
            />
          </div>
        )}
      </div>

      {/* Charts & Interactive Operational Pipeline Node Flow (DAG) */}
      {isInitialLoading ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 animate-fade-in-up">
          <div className="lg:col-span-2">
            <SkeletonChart />
          </div>
          <div className="lg:col-span-1">
            <SkeletonCard className="h-full min-h-[320px]" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 animate-fade-in-up animation-delay-300">
          <div className="lg:col-span-2">
            <VerdictDistributionChart
              distribution={
                analytics?.verdict_distribution || {
                  supported: 0,
                  partially_supported: 0,
                  contradicted: 0,
                  unsupported: 0,
                  insufficient_evidence: 0,
                }
              }
            />
          </div>

          {/* Operational Pipeline Status: Visual DAG Node Flow */}
          <PipelineNodeFlow
            latencyMs={analytics?.avg_latency_ms || 0}
            className="lg:col-span-1"
          />
        </div>
      )}

      {/* Module A: Recent Verification Audits Live Feed */}
      <div className="animate-fade-in-up animation-delay-400">
        <RecentAuditsFeed workspaceId={workspaceId} totalQueries={analytics?.total_queries ?? 0} />
      </div>
    </div>
  );
}
