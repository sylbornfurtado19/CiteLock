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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Auditor Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time hallucination tracking, claim distribution, and citation fidelity metrics.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchAnalytics}
          disabled={loading}
          className="text-xs"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-4 text-sm text-red-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Overall Grounding Rate"
          value={loading ? "--" : groundingRate}
          icon={ShieldCheck}
          description="Claims verified by citation proof"
        />
        <StatCard
          title="Indexed Documents"
          value={loading ? "--" : (analytics?.total_documents ?? 0).toString()}
          icon={Database}
          description="Private storage objects"
        />
        <StatCard
          title="Total Claims Evaluated"
          value={loading ? "--" : totalClaims.toString()}
          icon={FileCheck}
          description="Atomic propositions extracted"
        />
        <StatCard
          title="Hallucination Interceptions"
          value={loading ? "--" : hallucinationCount.toString()}
          icon={AlertCircle}
          description="Contradicted or unsupported claims"
        />
      </div>

      {/* Charts & System State */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
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

        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-base">Operational Pipeline Status</CardTitle>
          </CardHeader>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-400">Database Engine</span>
              <span className="font-mono text-emerald-400">Neon Postgres + pgvector</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-400">Storage Provider</span>
              <span className="font-mono text-emerald-400">Firebase Storage (Private)</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-400">Judge Provider</span>
              <span className="font-mono text-emerald-400">Remote API (RAM Safe)</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-400">Average Latency</span>
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
