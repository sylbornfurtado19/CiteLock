"use client";

import React, { useEffect, useState } from "react";
import { StatCard } from "@/components/dashboard/StatCard";
import { VerdictDistributionChart } from "@/components/dashboard/VerdictDistributionChart";
import { ShieldCheck, Database, FileCheck, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F5F0FF]">Auditor Dashboard</h1>
          <p className="text-sm text-[#B0A4C3] mt-1">
            Real-time hallucination tracking, claim distribution, and citation fidelity metrics.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchAnalytics}
          disabled={loading}
          className="text-xs self-start sm:self-auto group active:scale-95 transition-all duration-150"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5 text-purple-400" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 text-purple-300 group-hover:rotate-45 transition-transform duration-200" />
          )}
          Refresh Metrics
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-sm text-rose-300 flex items-center gap-2.5 backdrop-blur-md animate-fade-in">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards with Staggered Entrance */}
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

      {/* Charts & System State */}
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

        <Card className="rounded-xl border border-purple-900/30 bg-[#100A1C]/80 shadow-[0_4px_24px_rgba(0,0,0,0.4)] backdrop-blur-md p-6">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-[#F5F0FF]">
              Operational Pipeline Status
            </CardTitle>
          </CardHeader>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#070311] border border-purple-900/30">
              <span className="text-[#B0A4C3]">Database Engine</span>
              <span className="font-mono text-purple-300">Neon Postgres + pgvector</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#070311] border border-purple-900/30">
              <span className="text-[#B0A4C3]">Storage Provider</span>
              <span className="font-mono text-purple-300">Firebase Storage (Private)</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#070311] border border-purple-900/30">
              <span className="text-[#B0A4C3]">Judge Provider</span>
              <span className="font-mono text-purple-300">Remote API (RAM Safe)</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#070311] border border-purple-900/30">
              <span className="text-[#B0A4C3]">Average Latency</span>
              <span className="font-mono text-white">
                {analytics?.avg_latency_ms ? `${Math.round(analytics.avg_latency_ms)} ms` : "0 ms"}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
