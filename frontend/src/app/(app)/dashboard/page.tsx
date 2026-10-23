import React from "react";
import { StatCard } from "@/components/dashboard/StatCard";
import { VerdictDistributionChart } from "@/components/dashboard/VerdictDistributionChart";
import { ShieldCheck, Database, FileCheck, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Auditor Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          Real-time hallucination tracking, claim distribution, and citation fidelity metrics.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Overall Grounding Rate"
          value="96.2%"
          trend="+4.1%"
          icon={ShieldCheck}
          description="Claims verified by citation proof"
        />
        <StatCard
          title="Indexed Documents"
          value="18"
          icon={Database}
          description="Private storage objects"
        />
        <StatCard
          title="Total Claims Evaluated"
          value="1,420"
          icon={FileCheck}
          description="Atomic propositions extracted"
        />
        <StatCard
          title="Hallucination Interceptions"
          value="54"
          icon={AlertCircle}
          description="Corrected before user response"
        />
      </div>

      {/* Charts & System State */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <VerdictDistributionChart
            distribution={{
              supported: 1240,
              partially_supported: 110,
              contradicted: 16,
              unsupported: 38,
              insufficient_evidence: 16,
            }}
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
              <span className="text-slate-400">Max Correction Retries</span>
              <span className="font-mono text-white">3 Passes</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
