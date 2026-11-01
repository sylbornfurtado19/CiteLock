"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FlaskConical,
  Play,
  Award,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  Database,
  BarChart2,
  Shield,
  Layers,
  Sparkles,
  ArrowRight,
  TrendingDown,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SkeletonCard, Skeleton } from "@/components/ui/skeleton";
import { notify, sanitizeErrorMessage } from "@/components/ui/toast";
import { useWorkspace } from "@/lib/workspace/WorkspaceContext";
import { apiFetch, ApiError } from "@/lib/api";
import {
  BenchmarkRunResponse,
  BenchmarkHistoryItem,
  SystemBenchmarkMetrics,
} from "@/types";

export default function EvaluationPage() {
  const { currentWorkspace, isLoading: wsLoading } = useWorkspace();

  const [latestRun, setLatestRun] = useState<BenchmarkRunResponse | null>(null);
  const [history, setHistory] = useState<BenchmarkHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [sampleSize, setSampleSize] = useState<number>(5);

  // Fetch latest benchmark and history
  const fetchBenchmarkData = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);

    try {
      const [latestRes, historyRes] = await Promise.all([
        apiFetch<BenchmarkRunResponse | null>(
          `/api/v1/workspaces/${currentWorkspace.id}/evaluation/latest`
        ),
        apiFetch<BenchmarkHistoryItem[]>(
          `/api/v1/workspaces/${currentWorkspace.id}/evaluation/history`
        ),
      ]);

      setLatestRun(latestRes);
      setHistory(historyRes || []);
    } catch (err) {
      console.warn("Failed to fetch evaluation benchmark data:", err);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    if (currentWorkspace?.id) {
      fetchBenchmarkData();
    }
  }, [currentWorkspace?.id, fetchBenchmarkData]);

  // Execute benchmark run
  const handleRunBenchmarks = async () => {
    if (!currentWorkspace) return;

    setRunning(true);
    const toastId = "benchmark-run";
    notify.loading("Executing Multi-System Evaluation...", {
      id: toastId,
      description: `Evaluating Plain RAG, Single-Pass Verify, and CiteLock across ${sampleSize} benchmark cases...`,
    });

    try {
      const result = await apiFetch<BenchmarkRunResponse>(
        `/api/v1/workspaces/${currentWorkspace.id}/evaluation/run`,
        {
          method: "POST",
          body: JSON.stringify({ sample_size: sampleSize }),
        }
      );

      setLatestRun(result);

      // Refresh history
      try {
        const hist = await apiFetch<BenchmarkHistoryItem[]>(
          `/api/v1/workspaces/${currentWorkspace.id}/evaluation/history`
        );
        setHistory(hist || []);
      } catch {
        // history refresh soft fail
      }

      notify.success("Benchmark Evaluation Complete", {
        id: toastId,
        description: `CiteLock achieved ${(result.systems.citelock.hallucination_rate * 100).toFixed(
          1
        )}% hallucination rate (${result.hallucination_reduction_pct}% reduction over Baseline A).`,
      });
    } catch (err) {
      const msg = sanitizeErrorMessage(err);
      notify.error("Benchmark Execution Failed", msg, { id: toastId });
    } finally {
      setRunning(false);
    }
  };

  const systems = latestRun?.systems;
  const citelockSys = systems?.citelock;
  const plainSys = systems?.plain_rag;
  const singleSys = systems?.single_verify;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[#F5F0FF]">
              Factual Evaluation Benchmarks
            </h1>
            {currentWorkspace && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/30 text-purple-300 font-mono">
                {currentWorkspace.name}
              </span>
            )}
          </div>
          <p className="text-sm text-[#B0A4C3] mt-1">
            Empirical cross-system evaluation measuring hallucination reduction, claim faithfulness, and latency under identical ground-truth conditions.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Sample Size Selector */}
          <div className="flex items-center gap-1.5 bg-[#100A1C] border border-purple-900/30 p-1 rounded-xl text-xs">
            <span className="text-[11px] text-[#8D829F] px-2 font-medium">Cases:</span>
            {[3, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSampleSize(n)}
                disabled={running}
                className={`px-2.5 py-1 rounded-lg font-mono text-xs transition-all ${
                  sampleSize === n
                    ? "bg-purple-600 text-white font-bold"
                    : "text-[#B0A4C3] hover:text-white"
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <Button
            onClick={handleRunBenchmarks}
            disabled={running || wsLoading}
            className="gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-[0_0_20px_rgba(147,51,234,0.35)] text-xs"
          >
            {running ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            <span>{running ? "Auditing Systems..." : "Run Benchmark Suite"}</span>
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      {wsLoading || (loading && !latestRun) ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      ) : running ? (
        <div className="space-y-6 animate-fade-in" aria-busy="true">
          <Card className="p-8 text-center rounded-2xl border border-purple-500/40 bg-[#100A1C]/90 shadow-[0_0_32px_rgba(147,51,234,0.2)]">
            <div className="relative inline-flex items-center justify-center mb-4">
              <div className="h-14 w-14 rounded-2xl bg-purple-950/80 border border-purple-500/40 flex items-center justify-center text-purple-300">
                <RefreshCw className="h-6 w-6 animate-spin text-purple-400" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-[#F5F0FF] mb-1">
              Executing Grounded Truth Benchmark
            </h3>
            <p className="text-xs text-[#B0A4C3] max-w-md mx-auto mb-6">
              Synthesizing answers across {sampleSize} standardized cases, extracting atomic claims, and auditing evidence alignment across Plain RAG, Single-Pass Verify, and CiteLock...
            </p>
            <div className="max-w-md mx-auto space-y-2">
              <div className="h-1.5 w-full bg-purple-950 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full animate-pulse w-3/4" />
              </div>
              <span className="text-[11px] font-mono text-purple-300">
                Evaluating claim verification matrix & self-correction bounds...
              </span>
            </div>
          </Card>
        </div>
      ) : !latestRun ? (
        /* Empty State */
        <Card className="rounded-2xl border border-purple-900/30 bg-[#100A1C]/80 p-10 text-center shadow-lg">
          <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-purple-300 shadow-[0_0_24px_rgba(168,85,247,0.2)]">
            <FlaskConical className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-[#F5F0FF] mb-2">
            No Benchmark Runs Recorded Yet
          </h2>
          <p className="text-xs text-[#B0A4C3] max-w-xl mx-auto mb-6 leading-relaxed">
            Execute the CiteLock standardized evaluation suite to measure factual accuracy, claim verification precision, and hallucination reduction against industry RAG baselines. All test cases run against real evidence corpora.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto mb-8 text-left text-xs">
            <div className="p-3.5 rounded-xl bg-[#090414] border border-purple-900/30">
              <span className="font-semibold text-purple-200 block mb-1">1. Baseline A: Plain RAG</span>
              <span className="text-[11px] text-[#8D829F]">Standard draft synthesis without verification or correction.</span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#090414] border border-purple-900/30">
              <span className="font-semibold text-indigo-200 block mb-1">2. Baseline B: Single Verify</span>
              <span className="text-[11px] text-[#8D829F]">Single-pass claim audit without an iterative revision loop.</span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#090414] border border-purple-500/30">
              <span className="font-semibold text-emerald-300 block mb-1">3. CiteLock RAG</span>
              <span className="text-[11px] text-[#8D829F]">Decomposition + structured judge + bounded self-correction.</span>
            </div>
          </div>

          <Button
            onClick={handleRunBenchmarks}
            className="gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-[0_0_20px_rgba(147,51,234,0.35)]"
          >
            <Play className="h-4 w-4" />
            <span>Run Initial Benchmark Suite</span>
          </Button>
        </Card>
      ) : (
        /* Results Dashboard */
        <div className="space-y-8 animate-fade-in">
          {/* Metadata Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-[#0C0617] border border-purple-900/40 text-xs">
            <div className="flex items-center gap-3">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="font-medium text-[#F5F0FF]">
                Dataset: <strong className="text-purple-200 font-semibold">{latestRun.dataset_name}</strong>
              </span>
              <span className="text-[#8D829F]">({latestRun.total_test_cases} test cases evaluated)</span>
            </div>
            <div className="flex items-center gap-4 text-[#8D829F] mt-2 sm:mt-0 font-mono text-[11px]">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-purple-400" />
                {new Date(latestRun.created_at).toLocaleString()}
              </span>
              <span>Duration: {latestRun.execution_time_ms}ms</span>
            </div>
          </div>

          {/* KPI Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Hallucination Reduction */}
            <Card className="rounded-2xl border border-emerald-500/30 bg-[#0A1713]/80 p-5 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-emerald-300">Hallucination Reduction</span>
                <TrendingDown className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-extrabold tracking-tight text-emerald-200 font-mono">
                {latestRun.hallucination_reduction_pct.toFixed(1)}%
              </div>
              <span className="text-[11px] text-emerald-400/80 mt-1 block">
                vs Plain RAG Baseline
              </span>
            </Card>

            {/* CiteLock Hallucination Rate */}
            <Card className="rounded-2xl border border-purple-900/30 bg-[#100A1C]/80 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[#B0A4C3]">CiteLock Hallucination Rate</span>
                <Shield className="h-4 w-4 text-purple-400" />
              </div>
              <div className="text-3xl font-extrabold tracking-tight text-[#F5F0FF] font-mono">
                {((citelockSys?.hallucination_rate || 0) * 100).toFixed(1)}%
              </div>
              <span className="text-[11px] text-[#8D829F] mt-1 block">
                Plain RAG: {((plainSys?.hallucination_rate || 0) * 100).toFixed(1)}%
              </span>
            </Card>

            {/* Faithfulness Score */}
            <Card className="rounded-2xl border border-purple-900/30 bg-[#100A1C]/80 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[#B0A4C3]">CiteLock Faithfulness F1</span>
                <Sparkles className="h-4 w-4 text-indigo-400" />
              </div>
              <div className="text-3xl font-extrabold tracking-tight text-[#F5F0FF] font-mono">
                {(citelockSys?.faithfulness || 0).toFixed(2)}
              </div>
              <span className="text-[11px] text-[#8D829F] mt-1 block">
                Plain RAG: {(plainSys?.faithfulness || 0).toFixed(2)}
              </span>
            </Card>

            {/* Total Claims Audited */}
            <Card className="rounded-2xl border border-purple-900/30 bg-[#100A1C]/80 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[#B0A4C3]">Total Claims Audited</span>
                <Layers className="h-4 w-4 text-purple-400" />
              </div>
              <div className="text-3xl font-extrabold tracking-tight text-[#F5F0FF] font-mono">
                {citelockSys?.total_claims || 0}
              </div>
              <span className="text-[11px] text-[#8D829F] mt-1 block">
                {citelockSys?.supported_claims || 0} verified supported
              </span>
            </Card>
          </div>

          {/* 3 Comparative System Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* System A: Plain RAG */}
            {plainSys && (
              <Card className="flex flex-col justify-between rounded-2xl border border-purple-900/30 bg-[#100A1C]/75 p-6 shadow-sm hover:border-purple-500/40 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#8D829F]">
                      Baseline System A
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-[#F5F0FF] mb-1">{plainSys.name}</h3>
                  <p className="text-xs text-[#8D829F] mb-4">{plainSys.description}</p>

                  <div className="space-y-2.5 pt-1 text-xs">
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070311] border border-purple-900/30">
                      <span className="text-[#B0A4C3]">Hallucination Rate</span>
                      <span className="font-mono font-bold text-rose-400">
                        {(plainSys.hallucination_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070311] border border-purple-900/30">
                      <span className="text-[#B0A4C3]">Faithfulness Score</span>
                      <span className="font-mono text-[#F5F0FF]">{plainSys.faithfulness.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070311] border border-purple-900/30">
                      <span className="text-[#B0A4C3]">Avg Latency</span>
                      <span className="font-mono text-[#8D829F]">{plainSys.avg_latency_ms}ms</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070311] border border-purple-900/30">
                      <span className="text-[#B0A4C3]">Unsupported Claims</span>
                      <span className="font-mono text-rose-300 font-bold">{plainSys.unsupported_claims}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3.5 border-t border-purple-900/30 text-[11px] text-[#8D829F]">
                  Uncorrected prompt output
                </div>
              </Card>
            )}

            {/* System B: Single-Pass Verify */}
            {singleSys && (
              <Card className="flex flex-col justify-between rounded-2xl border border-purple-900/30 bg-[#100A1C]/75 p-6 shadow-sm hover:border-purple-500/40 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#8D829F]">
                      Baseline System B
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-[#F5F0FF] mb-1">{singleSys.name}</h3>
                  <p className="text-xs text-[#8D829F] mb-4">{singleSys.description}</p>

                  <div className="space-y-2.5 pt-1 text-xs">
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070311] border border-purple-900/30">
                      <span className="text-[#B0A4C3]">Hallucination Rate</span>
                      <span className="font-mono font-bold text-amber-400">
                        {(singleSys.hallucination_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070311] border border-purple-900/30">
                      <span className="text-[#B0A4C3]">Faithfulness Score</span>
                      <span className="font-mono text-[#F5F0FF]">{singleSys.faithfulness.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070311] border border-purple-900/30">
                      <span className="text-[#B0A4C3]">Avg Latency</span>
                      <span className="font-mono text-[#8D829F]">{singleSys.avg_latency_ms}ms</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070311] border border-purple-900/30">
                      <span className="text-[#B0A4C3]">Unsupported Claims</span>
                      <span className="font-mono text-amber-300 font-bold">{singleSys.unsupported_claims}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3.5 border-t border-purple-900/30 text-[11px] text-[#8D829F]">
                  Audited, but zero self-correction
                </div>
              </Card>
            )}

            {/* System C: CiteLock (Active Engine) */}
            {citelockSys && (
              <Card className="flex flex-col justify-between rounded-2xl border border-purple-500/50 bg-[#140D26]/90 p-6 shadow-[0_0_32px_rgba(139,92,246,0.2)] ring-1 ring-purple-400/30 hover:border-purple-400/70 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-purple-300 font-bold flex items-center gap-1.5">
                      <Award className="h-3.5 w-3.5 text-purple-400" />
                      Active Audited Engine
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-[#F5F0FF] mb-1">{citelockSys.name}</h3>
                  <p className="text-xs text-[#B0A4C3] mb-4">{citelockSys.description}</p>

                  <div className="space-y-2.5 pt-1 text-xs">
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070311] border border-purple-500/30">
                      <span className="text-[#B0A4C3]">Hallucination Rate</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {(citelockSys.hallucination_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070311] border border-purple-900/30">
                      <span className="text-[#B0A4C3]">Faithfulness Score</span>
                      <span className="font-mono text-emerald-300 font-bold">
                        {citelockSys.faithfulness.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070311] border border-purple-900/30">
                      <span className="text-[#B0A4C3]">Avg Latency</span>
                      <span className="font-mono text-[#8D829F]">{citelockSys.avg_latency_ms}ms</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070311] border border-purple-900/30">
                      <span className="text-[#B0A4C3]">Abstained / Cleaned</span>
                      <span className="font-mono text-purple-300 font-bold">
                        {citelockSys.abstained_count} cases
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3.5 border-t border-purple-500/30 flex items-center gap-2 text-xs text-emerald-300 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>
                    {latestRun.hallucination_reduction_pct.toFixed(1)}% Hallucination Reduction over Baseline A
                  </span>
                </div>
              </Card>
            )}
          </div>

          {/* Visual Benchmark Comparison Bar Charts */}
          <Card className="rounded-2xl border border-purple-900/30 bg-[#100A1C]/80 p-6 shadow-sm">
            <CardHeader className="px-0 pt-0">
              <div className="flex items-center gap-2.5">
                <BarChart2 className="h-4 w-4 text-purple-400" />
                <CardTitle className="text-base text-[#F5F0FF]">
                  Comparative Metric Visualizations
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-[#B0A4C3]">
                Empirical comparison across identical test cases and evaluation prompts.
              </CardDescription>
            </CardHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
              {/* Chart 1: Hallucination Rate (Lower is Better) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#F5F0FF]">
                    Hallucination Rate (Lower is better)
                  </span>
                  <span className="text-[11px] text-[#8D829F]">0% is optimal</span>
                </div>

                <div className="space-y-3">
                  {/* Plain RAG */}
                  <div>
                    <div className="flex justify-between text-xs text-[#B0A4C3] mb-1">
                      <span>Baseline A: Plain RAG</span>
                      <span className="font-mono text-rose-400">
                        {((plainSys?.hallucination_rate || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-[#070311] rounded-full overflow-hidden border border-purple-900/30">
                      <div
                        className="h-full bg-rose-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(4, (plainSys?.hallucination_rate || 0) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Single-Pass Verify */}
                  <div>
                    <div className="flex justify-between text-xs text-[#B0A4C3] mb-1">
                      <span>Baseline B: Single-Pass Verify</span>
                      <span className="font-mono text-amber-400">
                        {((singleSys?.hallucination_rate || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-[#070311] rounded-full overflow-hidden border border-purple-900/30">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(4, (singleSys?.hallucination_rate || 0) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* CiteLock */}
                  <div>
                    <div className="flex justify-between text-xs text-[#B0A4C3] mb-1 font-semibold">
                      <span className="text-emerald-300">CiteLock: Self-Correcting RAG</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {((citelockSys?.hallucination_rate || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-[#070311] rounded-full overflow-hidden border border-purple-500/30">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                        style={{
                          width: `${Math.max(2, (citelockSys?.hallucination_rate || 0) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Chart 2: Faithfulness Score (Higher is Better) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#F5F0FF]">
                    Faithfulness Score (Higher is better)
                  </span>
                  <span className="text-[11px] text-[#8D829F]">1.00 is optimal</span>
                </div>

                <div className="space-y-3">
                  {/* Plain RAG */}
                  <div>
                    <div className="flex justify-between text-xs text-[#B0A4C3] mb-1">
                      <span>Baseline A: Plain RAG</span>
                      <span className="font-mono text-[#8D829F]">
                        {(plainSys?.faithfulness || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-[#070311] rounded-full overflow-hidden border border-purple-900/30">
                      <div
                        className="h-full bg-slate-600 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(4, (plainSys?.faithfulness || 0) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Single-Pass Verify */}
                  <div>
                    <div className="flex justify-between text-xs text-[#B0A4C3] mb-1">
                      <span>Baseline B: Single-Pass Verify</span>
                      <span className="font-mono text-indigo-300">
                        {(singleSys?.faithfulness || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-[#070311] rounded-full overflow-hidden border border-purple-900/30">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(4, (singleSys?.faithfulness || 0) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* CiteLock */}
                  <div>
                    <div className="flex justify-between text-xs text-[#B0A4C3] mb-1 font-semibold">
                      <span className="text-emerald-300">CiteLock: Self-Correcting RAG</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {(citelockSys?.faithfulness || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-[#070311] rounded-full overflow-hidden border border-purple-500/30">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                        style={{
                          width: `${Math.max(4, (citelockSys?.faithfulness || 0) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Historical Runs Table */}
          {history.length > 0 && (
            <Card className="rounded-2xl border border-purple-900/30 bg-[#100A1C]/80 p-6 shadow-sm">
              <CardHeader className="px-0 pt-0">
                <div className="flex items-center gap-2.5">
                  <History className="h-4 w-4 text-purple-400" />
                  <CardTitle className="text-base text-[#F5F0FF]">
                    Historical Evaluation Runs
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-[#B0A4C3]">
                  Immutable audit records captured in this workspace environment.
                </CardDescription>
              </CardHeader>

              <div className="overflow-x-auto pt-2">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-purple-900/30 text-[#8D829F] font-mono">
                      <th className="pb-3 font-normal">Timestamp</th>
                      <th className="pb-3 font-normal">Test Cases</th>
                      <th className="pb-3 font-normal">Plain RAG Hallucination</th>
                      <th className="pb-3 font-normal">CiteLock Hallucination</th>
                      <th className="pb-3 font-normal">Reduction</th>
                      <th className="pb-3 font-normal text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-900/20">
                    {history.map((item) => (
                      <tr key={item.id} className="hover:bg-purple-950/20 transition-colors">
                        <td className="py-3 font-mono text-[#F5F0FF]">
                          {new Date(item.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 text-[#B0A4C3]">{item.total_test_cases} cases</td>
                        <td className="py-3 font-mono text-rose-400">
                          {(item.plain_rag_hallucination_rate * 100).toFixed(1)}%
                        </td>
                        <td className="py-3 font-mono text-emerald-400 font-bold">
                          {(item.citelock_hallucination_rate * 100).toFixed(1)}%
                        </td>
                        <td className="py-3 font-mono text-purple-300">
                          {item.hallucination_reduction_pct.toFixed(1)}%
                        </td>
                        <td className="py-3 font-mono text-[#8D829F] text-right">
                          {item.execution_time_ms}ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
