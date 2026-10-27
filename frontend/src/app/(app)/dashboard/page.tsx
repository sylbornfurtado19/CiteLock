"use client";

import React, { useEffect, useState } from "react";
import { StatCard } from "@/components/dashboard/StatCard";
import { VerdictDistributionChart } from "@/components/dashboard/VerdictDistributionChart";
import { PipelineNodeFlow } from "@/components/dashboard/PipelineNodeFlow";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import {
  ShieldCheck,
  Database,
  FileCheck,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
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

      {/* Refined Dashboard Header Banner with Interactive Luminance & Sweeping Radar Line */}
      <SpotlightCard
        className="relative p-5 sm:p-6 animate-fade-in-down overflow-hidden"
        spotlightColor="rgba(168, 85, 247, 0.12)"
        borderSpotlightColor="rgba(216, 180, 254, 0.35)"
      >
        {/* Sweeping Radar-Line Animation Active During Refresh */}
        {loading && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
            {/* Top scanning laser edge */}
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-purple-300 to-transparent shadow-[0_0_18px_rgba(216,180,254,0.95)] animate-radar-sweep" />
            {/* Ambient specular beam wash */}
            <div className="h-full w-56 bg-gradient-to-r from-transparent via-purple-500/12 to-transparent blur-md animate-radar-sweep" />
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative z-10">
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
                <div className="inline-flex items-center gap-2 rounded-full bg-purple-950/80 border border-purple-500/35 px-3 py-1 shadow-[0_0_12px_rgba(139,92,246,0.25)] backdrop-blur-md">
                  {/* Miniature 3-peak SVG oscilloscope wave */}
                  <svg
                    className={`h-3 w-6 overflow-visible transition-colors duration-200 ${
                      loading ? "text-purple-300 animate-oscilloscope-fast" : "text-emerald-400 animate-oscilloscope"
                    }`}
                    viewBox="0 0 24 10"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M1 5h3.5l2-3.5 3 7 3-6.5 2 4.5 2-1.5h6"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      loading ? "bg-purple-400 animate-ping" : "bg-emerald-400 animate-pulse"
                    } shadow-[0_0_8px_currentColor]`}
                  />
                  <span className="text-[10px] font-mono font-semibold tracking-wider text-purple-200">
                    {loading ? "AUDIT SWEEP..." : "LIVE AUDITING"}
                  </span>
                </div>
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
            <span>{loading ? "Sweeping Audit..." : "Refresh Metrics"}</span>
          </Button>
        </div>
      </SpotlightCard>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-sm text-rose-300 flex items-center gap-2.5 backdrop-blur-md animate-fade-in">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards Deck with Hero Grounding Arc and Micro-Trend Sparklines */}
      <div className="relative">
        {loading && (
          <div className="pointer-events-none absolute -inset-x-2 -top-2 h-[2px] bg-gradient-to-r from-transparent via-purple-400 to-transparent shadow-[0_0_14px_rgba(192,132,252,0.9)] animate-radar-sweep z-30" />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Overall Grounding Rate"
            value={loading ? "--" : groundingRate}
            icon={ShieldCheck}
            description="Claims verified by citation proof"
            className="animate-fade-in-up"
            isHero={true}
          />
          <StatCard
            title="Indexed Documents"
            value={loading ? "--" : (analytics?.total_documents ?? 0).toString()}
            icon={Database}
            description="Private storage objects"
            className="animate-fade-in-up animation-delay-75"
            sparklineType="documents"
          />
          <StatCard
            title="Total Claims Evaluated"
            value={loading ? "--" : totalClaims.toString()}
            icon={FileCheck}
            description="Atomic propositions extracted"
            className="animate-fade-in-up animation-delay-150"
            sparklineType="claims"
          />
          <StatCard
            title="Hallucination Interceptions"
            value={loading ? "--" : hallucinationCount.toString()}
            icon={AlertCircle}
            description="Contradicted or unsupported claims"
            className="animate-fade-in-up animation-delay-200"
            sparklineType="hallucinations"
          />
        </div>
      </div>

      {/* Charts & Interactive Operational Pipeline Node Flow (DAG) */}
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
    </div>
  );
}
