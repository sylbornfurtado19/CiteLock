"use client";

import React, { useEffect, useState } from "react";
import { StatCard } from "@/components/dashboard/StatCard";
import { VerdictDistributionChart } from "@/components/dashboard/VerdictDistributionChart";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import {
  ShieldCheck,
  Database,
  FileCheck,
  AlertCircle,
  RefreshCw,
  Activity,
  Layers,
  Lock,
  Cpu,
  Gauge,
} from "lucide-react";
import { CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { AnalyticsSummary } from "@/types";

export default function DashboardPage() {
  const workspaceId = "default-workspace-001";
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<AnalyticsSummary>(
        `/api/v1/workspaces/${workspaceId}/analytics`
      );
      setAnalytics(data);
    } catch (err: unknown) {
      console.error("Failed to load analytics:", err);
      setError("Unable to load real-time analytics. Verify backend connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [workspaceId]);

  const totalClaims = analytics?.verdict_distribution
    ? Object.values(analytics.verdict_distribution).reduce((a, b) => a + b, 0)
    : 0;

  const hallucinationCount = analytics?.verdict_distribution
    ? (analytics.verdict_distribution.contradicted || 0) +
      (analytics.verdict_distribution.unsupported || 0)
    : 0;

  const groundingRate =
    analytics && analytics.total_queries > 0
      ? `${((1 - analytics.overall_hallucination_rate) * 100).toFixed(1)}%`
      : "100.0%";

  return (
    <div className="relative space-y-8 max-w-7xl mx-auto">
      {/* Background ambient depth glow */}
      <div
        className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 h-80 w-[720px] bg-purple-600/8 blur-[120px] -z-10"
        aria-hidden="true"
      />

      {/* Refined Dashboard Header Banner with Interactive Luminance */}
      <SpotlightCard
        className="p-5 sm:p-6 animate-fade-in-down"
        spotlightColor="rgba(168, 85, 247, 0.1)"
        borderSpotlightColor="rgba(216, 180, 254, 0.3)"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-950/80 border border-purple-500/35 text-purple-300 shadow-[0_0_14px_rgba(139,92,246,0.3)] group-hover:scale-105 group-hover:border-purple-400/50 transition-all duration-200">
              <ShieldCheck className="h-6 w-6 text-purple-300" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F0FF]">
                  Auditor Dashboard
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-950/70 border border-purple-500/30 px-2.5 py-0.5 text-[10px] font-mono font-medium text-purple-300 shadow-[0_0_8px_rgba(139,92,246,0.2)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE AUDITING
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#B0A4C3] mt-1">
                Real-time hallucination tracking, claim distribution, and citation fidelity metrics.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchAnalytics}
            disabled={loading}
            className="text-xs self-start sm:self-auto gap-2 border-purple-500/30 bg-[#140D24] hover:bg-[#1A1130] hover:border-purple-400/50 hover:text-white transition-all duration-150 active:scale-95 shadow-sm group"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-purple-300 ${
                loading
                  ? "animate-spin text-purple-400"
                  : "group-hover:rotate-45 transition-transform duration-200"
              }`}
            />
            <span>{loading ? "Refreshing..." : "Refresh Metrics"}</span>
          </Button>
        </div>
      </SpotlightCard>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-sm text-rose-300 flex items-center gap-2.5 backdrop-blur-md animate-fade-in">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards with Staggered Entrance and Interactive Luminance */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Overall Grounding Rate"
          value={loading ? "--" : groundingRate}
          icon={ShieldCheck}
          description="Claims verified by citation proof"
          className="animate-fade-in-up"
        />
        <StatCard
          title="Indexed Documents"
          value={loading ? "--" : (analytics?.total_documents ?? 0).toString()}
          icon={Database}
          description="Private storage objects"
          className="animate-fade-in-up animation-delay-75"
        />
        <StatCard
          title="Total Claims Evaluated"
          value={loading ? "--" : totalClaims.toString()}
          icon={FileCheck}
          description="Atomic propositions extracted"
          className="animate-fade-in-up animation-delay-150"
        />
        <StatCard
          title="Hallucination Interceptions"
          value={loading ? "--" : hallucinationCount.toString()}
          icon={AlertCircle}
          description="Contradicted or unsupported claims"
          className="animate-fade-in-up animation-delay-200"
        />
      </div>

      {/* Charts & Operational Pipeline State */}
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

        {/* Operational Pipeline Status Panel with Interactive Luminance */}
        <SpotlightCard
          className="p-6 cursor-default"
          spotlightColor="rgba(168, 85, 247, 0.12)"
          borderSpotlightColor="rgba(216, 180, 254, 0.35)"
        >
          <div>
            <div className="flex items-center justify-between border-b border-purple-900/25 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-950/70 border border-purple-500/30 text-purple-300 shadow-[0_0_10px_rgba(139,92,246,0.2)]">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-[#F5F0FF]">
                    Operational Pipeline Status
                  </CardTitle>
                  <p className="text-xs text-[#8D829F] mt-0.5">
                    Core verification engines & runtime environment
                  </p>
                </div>
              </div>
              <span className="font-mono text-xs px-2.5 py-1 bg-purple-950/60 border border-purple-500/25 rounded-lg text-purple-300">
                CONFIG
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0B0616]/70 border border-purple-900/25 hover:border-purple-500/40 hover:bg-[#140D24] hover:shadow-[0_0_14px_rgba(139,92,246,0.12)] transition-all duration-200">
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-purple-400" />
                  <span className="text-[#B0A4C3] font-medium shrink-0">Database Engine</span>
                </div>
                <span className="font-mono text-xs text-purple-200 text-right">
                  Neon Postgres + pgvector
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0B0616]/70 border border-purple-900/25 hover:border-purple-500/40 hover:bg-[#140D24] hover:shadow-[0_0_14px_rgba(139,92,246,0.12)] transition-all duration-200">
                <div className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-purple-400" />
                  <span className="text-[#B0A4C3] font-medium shrink-0">Storage Provider</span>
                </div>
                <span className="font-mono text-xs text-purple-200 text-right">
                  Firebase Storage (Private)
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0B0616]/70 border border-purple-900/25 hover:border-purple-500/40 hover:bg-[#140D24] hover:shadow-[0_0_14px_rgba(139,92,246,0.12)] transition-all duration-200">
                <div className="flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5 text-purple-400" />
                  <span className="text-[#B0A4C3] font-medium shrink-0">Judge Provider</span>
                </div>
                <span className="font-mono text-xs text-purple-200 text-right">
                  Remote API (RAM Safe)
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0B0616]/70 border border-purple-900/25 hover:border-purple-500/40 hover:bg-[#140D24] hover:shadow-[0_0_14px_rgba(139,92,246,0.12)] transition-all duration-200">
                <div className="flex items-center gap-2">
                  <Gauge className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-[#B0A4C3] font-medium">Average Latency</span>
                </div>
                <span className="font-mono text-xs font-semibold text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-2.5 py-1 rounded-lg shadow-sm">
                  {analytics?.avg_latency_ms ? `${Math.round(analytics.avg_latency_ms)} ms` : "0 ms"}
                </span>
              </div>
            </div>
          </div>
        </SpotlightCard>
      </div>
    </div>
  );
}
