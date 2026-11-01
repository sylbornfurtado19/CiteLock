"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Shield,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Save,
  Wifi,
  RotateCcw,
  Sliders,
  Cpu,
  Server,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { notify, sanitizeErrorMessage } from "@/components/ui/toast";
import { useWorkspace } from "@/lib/workspace/WorkspaceContext";
import { apiFetch, ApiError } from "@/lib/api";
import {
  WorkspaceSettings,
  ConnectivityTestResponse,
} from "@/types";

export default function SettingsPage() {
  const { currentWorkspace, isLoading: wsLoading } = useWorkspace();

  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form state
  const [topK, setTopK] = useState<number>(5);
  const [maxRetries, setMaxRetries] = useState<number>(2);
  const [abstentionPolicy, setAbstentionPolicy] = useState<"strict" | "soft">("strict");
  const [preferredProvider, setPreferredProvider] = useState<string>("");

  // Action states
  const [testingConnection, setTestingConnection] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [resettingSettings, setResettingSettings] = useState(false);
  const [connectivityResult, setConnectivityResult] = useState<ConnectivityTestResponse | null>(null);

  // Fetch settings for current workspace
  const fetchSettings = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    setFetchError(null);

    try {
      const data = await apiFetch<WorkspaceSettings>(
        `/api/v1/workspaces/${currentWorkspace.id}/settings`
      );
      setSettings(data);
      setTopK(data.retrieval_top_k);
      setMaxRetries(data.max_correction_retries);
      setAbstentionPolicy(data.abstention_policy);
      setPreferredProvider(data.preferred_llm_provider || "");
    } catch (err) {
      const message = sanitizeErrorMessage(err);
      setFetchError(message);
      notify.error("Failed to load settings", message);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    if (currentWorkspace?.id) {
      fetchSettings();
    }
  }, [currentWorkspace?.id, fetchSettings]);

  // Check if form has unsaved modifications
  const hasChanges = useMemo(() => {
    if (!settings) return false;
    return (
      topK !== settings.retrieval_top_k ||
      maxRetries !== settings.max_correction_retries ||
      abstentionPolicy !== settings.abstention_policy ||
      (preferredProvider || null) !== (settings.preferred_llm_provider || null)
    );
  }, [settings, topK, maxRetries, abstentionPolicy, preferredProvider]);

  // Handle Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace) return;

    const toastId = "save-workspace-settings";
    setSavingSettings(true);
    notify.loading("Saving Workspace Settings...", {
      id: toastId,
      description: `Persisting parameters for ${currentWorkspace.name}...`,
    });

    try {
      const updated = await apiFetch<WorkspaceSettings>(
        `/api/v1/workspaces/${currentWorkspace.id}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify({
            retrieval_top_k: topK,
            max_correction_retries: maxRetries,
            abstention_policy: abstentionPolicy,
            preferred_llm_provider: preferredProvider ? preferredProvider : null,
          }),
        }
      );

      setSettings(updated);
      setTopK(updated.retrieval_top_k);
      setMaxRetries(updated.max_correction_retries);
      setAbstentionPolicy(updated.abstention_policy);
      setPreferredProvider(updated.preferred_llm_provider || "");

      notify.success("Configuration Saved", {
        id: toastId,
        description: `Auditor policy updated: Top-K=${topK}, Retries=${maxRetries}, Policy=${
          abstentionPolicy === "strict" ? "Strict Abstain" : "Soft Warning"
        }.`,
      });
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err);
      notify.error("Failed to Save Settings", errorMsg, { id: toastId });
    } finally {
      setSavingSettings(false);
    }
  };

  // Handle Reset to Defaults
  const handleResetSettings = async () => {
    if (!currentWorkspace) return;

    const toastId = "reset-workspace-settings";
    setResettingSettings(true);
    notify.loading("Resetting Workspace Parameters...", {
      id: toastId,
      description: "Restoring system architectural defaults...",
    });

    try {
      const resetData = await apiFetch<WorkspaceSettings>(
        `/api/v1/workspaces/${currentWorkspace.id}/settings/reset`,
        {
          method: "POST",
        }
      );

      setSettings(resetData);
      setTopK(resetData.retrieval_top_k);
      setMaxRetries(resetData.max_correction_retries);
      setAbstentionPolicy(resetData.abstention_policy);
      setPreferredProvider(resetData.preferred_llm_provider || "");

      notify.success("Settings Restored", {
        id: toastId,
        description: "Auditor parameters restored to system default benchmarks.",
      });
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err);
      notify.error("Failed to Reset Settings", errorMsg, { id: toastId });
    } finally {
      setResettingSettings(false);
    }
  };

  // Handle Test Connectivity
  const handleTestConnection = async () => {
    if (!currentWorkspace) return;

    const toastId = "test-connections";
    setTestingConnection(true);
    notify.loading("Pinging Infrastructure Probes...", {
      id: toastId,
      description: "Verifying relational pgvector engine, storage vault, and LLM provider...",
    });

    try {
      const result = await apiFetch<ConnectivityTestResponse>(
        `/api/v1/workspaces/${currentWorkspace.id}/settings/test-connection`,
        {
          method: "POST",
        }
      );

      setConnectivityResult(result);

      if (result.status === "healthy") {
        notify.success("Infrastructure Verified", {
          id: toastId,
          description: `All backend probes responded healthy (${result.total_latency_ms}ms total roundtrip).`,
        });
      } else {
        notify.warning("Infrastructure Warning", {
          id: toastId,
          description: "One or more subsystem probes reported degraded status.",
        });
      }
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err);
      notify.error("Connection Probe Failed", errorMsg, { id: toastId });
    } finally {
      setTestingConnection(false);
    }
  };

  if (wsLoading || (loading && !settings)) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-purple-950/40 rounded-lg animate-pulse" />
            <div className="h-4 w-96 bg-purple-950/30 rounded-lg animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-32 bg-purple-950/40 rounded-lg animate-pulse" />
            <div className="h-9 w-28 bg-purple-950/40 rounded-lg animate-pulse" />
          </div>
        </div>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (fetchError && !settings) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center">
        <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/30 inline-block text-rose-300 mb-4">
          <AlertCircle className="h-8 w-8 mx-auto" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Unable to Load Settings</h2>
        <p className="text-sm text-[#B0A4C3] max-w-md mx-auto mb-6">{fetchError}</p>
        <Button
          onClick={fetchSettings}
          className="bg-purple-600 hover:bg-purple-500 text-white gap-2 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry Connection
        </Button>
      </div>
    );
  }

  const availableProviders = settings?.available_llm_providers || ["openai"];
  const deploymentInfo = settings?.deployment_info;

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[#F5F0FF]">Workspace Settings</h1>
            {currentWorkspace && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/30 text-purple-300 font-mono">
                {currentWorkspace.name}
              </span>
            )}
          </div>
          <p className="text-sm text-[#B0A4C3] mt-1">
            Configure tenant-isolated retrieval bounds, self-correction strictness, and model providers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={testingConnection || savingSettings || resettingSettings}
            className="text-xs gap-1.5 border-purple-500/30 bg-[#120B20] hover:bg-[#1A102E] text-purple-200"
          >
            {testingConnection ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-purple-400" />
            ) : (
              <Wifi className="h-3.5 w-3.5 text-purple-400" />
            )}
            Test Connectivity
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetSettings}
            disabled={resettingSettings || savingSettings || testingConnection}
            className="text-xs gap-1.5 border-purple-900/40 bg-[#100A1C] hover:bg-[#1A102E] text-[#B0A4C3] hover:text-[#F5F0FF]"
          >
            {resettingSettings ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Reset Defaults
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSaveSettings}
            disabled={!hasChanges || savingSettings || testingConnection || resettingSettings}
            className={`text-xs gap-1.5 text-white transition-all duration-200 ${
              hasChanges
                ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-[0_0_16px_rgba(147,51,234,0.35)]"
                : "bg-purple-950/50 text-[#8D829F] border border-purple-900/30 cursor-not-allowed"
            }`}
          >
            {savingSettings ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Live Connectivity Results Card (when active or recently checked) */}
      {connectivityResult && (
        <Card className="rounded-2xl border border-purple-500/40 bg-[#0F081D]/90 shadow-[0_0_24px_rgba(147,51,234,0.15)] p-5 animate-fade-in-up">
          <div className="flex items-center justify-between pb-3 border-b border-purple-900/30 mb-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    connectivityResult.status === "healthy" ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    connectivityResult.status === "healthy" ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-200">
                Live Subsystem Probes
              </span>
            </div>
            <span className="text-xs font-mono text-[#B0A4C3]">
              Roundtrip:{" "}
              <strong className="text-emerald-300">{connectivityResult.total_latency_ms}ms</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Database Probe */}
            <div className="p-3.5 rounded-xl bg-[#080312] border border-purple-900/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#F5F0FF] flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-purple-400" />
                  Database
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    connectivityResult.services.database?.status === "operational"
                      ? "bg-emerald-950/70 text-emerald-300 border border-emerald-500/30"
                      : "bg-rose-950/70 text-rose-300 border border-rose-500/30"
                  }`}
                >
                  {connectivityResult.services.database?.status === "operational"
                    ? `${connectivityResult.services.database.latency_ms}ms`
                    : "Error"}
                </span>
              </div>
              <p className="text-[11px] text-[#8D829F] line-clamp-2">
                {connectivityResult.services.database?.details || "Relational store responsive"}
              </p>
            </div>

            {/* Storage Vault Probe */}
            <div className="p-3.5 rounded-xl bg-[#080312] border border-purple-900/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#F5F0FF] flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5 text-indigo-400" />
                  Storage Vault
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    connectivityResult.services.storage?.status === "operational"
                      ? "bg-emerald-950/70 text-emerald-300 border border-emerald-500/30"
                      : "bg-rose-950/70 text-rose-300 border border-rose-500/30"
                  }`}
                >
                  {connectivityResult.services.storage?.status === "operational"
                    ? `${connectivityResult.services.storage.latency_ms}ms`
                    : "Error"}
                </span>
              </div>
              <p className="text-[11px] text-[#8D829F] line-clamp-2">
                {connectivityResult.services.storage?.details || "Private object storage ready"}
              </p>
            </div>

            {/* Model Provider Probe */}
            <div className="p-3.5 rounded-xl bg-[#080312] border border-purple-900/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#F5F0FF] flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-purple-400" />
                  Model Provider
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    connectivityResult.services.llm?.status === "operational"
                      ? "bg-emerald-950/70 text-emerald-300 border border-emerald-500/30"
                      : "bg-rose-950/70 text-rose-300 border border-rose-500/30"
                  }`}
                >
                  {connectivityResult.services.llm?.status === "operational"
                    ? `${connectivityResult.services.llm.latency_ms}ms`
                    : "Error"}
                </span>
              </div>
              <p className="text-[11px] text-[#8D829F] line-clamp-2">
                {connectivityResult.services.llm?.details || "Inference provider operational"}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-6">
        {/* Tier 1: Workspace Auditor & Self-Correction Policy */}
        <Card className="rounded-2xl border border-purple-900/30 bg-[#100A1C]/80 shadow-[0_4px_24px_rgba(0,0,0,0.4)] backdrop-blur-md p-6 hover-card-glow transition-all duration-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-950/80 border border-purple-500/30 text-purple-300">
                  <Shield className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base text-[#F5F0FF]">
                    Auditor & Self-Correction Policy
                  </CardTitle>
                  <CardDescription className="text-xs text-[#B0A4C3] mt-0.5">
                    Tenant-isolated verification bounds and fallback behavior when ungrounded assertions are detected.
                  </CardDescription>
                </div>
              </div>
              <span className="text-[11px] font-mono bg-purple-950/50 border border-purple-500/20 text-purple-300 px-2.5 py-1 rounded-md">
                Workspace Scoped
              </span>
            </div>
          </CardHeader>

          <div className="space-y-5 pt-3">
            {/* Retrieval Top-K */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-900/30 pb-4">
              <div className="max-w-md">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#F5F0FF]">Retrieval Top-K</span>
                  <span className="text-xs font-mono text-purple-300 bg-purple-950/70 border border-purple-500/30 px-2 py-0.5 rounded-full">
                    {topK} Passages
                  </span>
                </div>
                <span className="text-xs text-[#8D829F] block mt-0.5">
                  Number of candidate passages retrieved from dense vector and keyword indices per query.
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[3, 5, 8, 10, 15, 20].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTopK(k)}
                    className={`font-mono text-xs px-2.5 py-1 rounded-lg transition-all duration-150 ${
                      topK === k
                        ? "bg-purple-600 text-white font-bold shadow-[0_0_12px_rgba(168,85,247,0.4)]"
                        : "bg-purple-950/50 border border-purple-500/20 text-purple-300 hover:bg-purple-900/40"
                    }`}
                  >
                    k={k}
                  </button>
                ))}
              </div>
            </div>

            {/* Maximum Correction Retries */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-900/30 pb-4">
              <div className="max-w-md">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#F5F0FF]">Maximum Correction Retries</span>
                  <span className="text-xs font-mono text-purple-300 bg-purple-950/70 border border-purple-500/30 px-2 py-0.5 rounded-full">
                    {maxRetries} Rounds
                  </span>
                </div>
                <span className="text-xs text-[#8D829F] block mt-0.5">
                  Limit recursive generation and verification passes to bound latency and token costs.
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxRetries(n)}
                    className={`font-mono text-xs px-3 py-1 rounded-lg transition-all duration-150 ${
                      maxRetries === n
                        ? "bg-purple-600 text-white font-bold shadow-[0_0_12px_rgba(168,85,247,0.4)]"
                        : "bg-purple-950/50 border border-purple-500/20 text-purple-300 hover:bg-purple-900/40"
                    }`}
                  >
                    {n} {n === 1 ? "Retry" : "Retries"}
                  </button>
                ))}
              </div>
            </div>

            {/* Abstention Policy */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="max-w-md">
                <span className="text-sm font-medium text-[#F5F0FF] block">Abstention Policy</span>
                <span className="text-xs text-[#8D829F] block mt-0.5">
                  Determine whether to refuse the answer or deliver with persistent warning tags when evidence remains inconclusive.
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAbstentionPolicy("strict")}
                  className={`font-mono text-xs px-3.5 py-1.5 rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
                    abstentionPolicy === "strict"
                      ? "bg-purple-600 text-white font-bold shadow-[0_0_12px_rgba(168,85,247,0.4)]"
                      : "bg-purple-950/50 border border-purple-500/20 text-purple-300 hover:bg-purple-900/40"
                  }`}
                >
                  <Shield className="h-3 w-3" />
                  Strict Abstain
                </button>
                <button
                  type="button"
                  onClick={() => setAbstentionPolicy("soft")}
                  className={`font-mono text-xs px-3.5 py-1.5 rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
                    abstentionPolicy === "soft"
                      ? "bg-purple-600 text-white font-bold shadow-[0_0_12px_rgba(168,85,247,0.4)]"
                      : "bg-purple-950/50 border border-purple-500/20 text-purple-300 hover:bg-purple-900/40"
                  }`}
                >
                  <AlertCircle className="h-3 w-3" />
                  Soft Warning
                </button>
              </div>
            </div>
          </div>
        </Card>

        {/* Tier 2: Model Provider Configuration */}
        <Card className="rounded-2xl border border-purple-900/30 bg-[#100A1C]/80 shadow-[0_4px_24px_rgba(0,0,0,0.4)] backdrop-blur-md p-6 hover-card-glow transition-all duration-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-950/80 border border-indigo-500/30 text-indigo-300">
                  <Cpu className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base text-[#F5F0FF]">
                    Model Provider Configuration
                  </CardTitle>
                  <CardDescription className="text-xs text-[#B0A4C3] mt-0.5">
                    Select the preferred LLM provider adapter for this workspace among server-configured options.
                  </CardDescription>
                </div>
              </div>
              <span className="text-[11px] font-mono bg-indigo-950/50 border border-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-md">
                Provider Governance
              </span>
            </div>
          </CardHeader>

          <div className="pt-3 space-y-3">
            <p className="text-xs text-[#8D829F]">
              CiteLock enforces strict provider verification. Providers missing valid API keys on the server are excluded to prevent execution faults.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* System Default Option */}
              <div
                onClick={() => setPreferredProvider("")}
                className={`cursor-pointer rounded-xl p-3.5 border transition-all duration-150 flex flex-col justify-between ${
                  preferredProvider === ""
                    ? "bg-purple-950/60 border-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.25)]"
                    : "bg-[#090414] border-purple-900/30 hover:border-purple-500/40"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-[#F5F0FF] flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-purple-400" />
                      Deployment Default
                    </span>
                    {preferredProvider === "" && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-purple-400" />
                    )}
                  </div>
                  <span className="text-[11px] text-[#8D829F] block">
                    Inherit host default provider
                  </span>
                </div>
                <span className="text-[10px] font-mono mt-3 text-purple-300">
                  System Standard
                </span>
              </div>

              {/* Dynamic Available Providers */}
              {availableProviders.map((prov) => {
                const isSelected = preferredProvider.toLowerCase() === prov.toLowerCase();
                const displayName =
                  prov.toLowerCase() === "openai"
                    ? "OpenAI Adapter"
                    : prov.toLowerCase() === "gemini"
                    ? "Google Gemini Adapter"
                    : "Deterministic Mock";
                const subtext =
                  prov.toLowerCase() === "openai"
                    ? "Structured judge & GPT engine"
                    : prov.toLowerCase() === "gemini"
                    ? "Multimodal gemini verification"
                    : "Deterministic offline testing";

                return (
                  <div
                    key={prov}
                    onClick={() => setPreferredProvider(prov)}
                    className={`cursor-pointer rounded-xl p-3.5 border transition-all duration-150 flex flex-col justify-between ${
                      isSelected
                        ? "bg-purple-950/60 border-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.25)]"
                        : "bg-[#090414] border-purple-900/30 hover:border-purple-500/40"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-[#F5F0FF] flex items-center gap-1.5 capitalize">
                          <Cpu className="h-3 w-3 text-indigo-400" />
                          {displayName}
                        </span>
                        {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-purple-400" />}
                      </div>
                      <span className="text-[11px] text-[#8D829F] block">{subtext}</span>
                    </div>
                    <span className="text-[10px] font-mono mt-3 text-emerald-300 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Verified on Host
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Tier 3: Deployment & Infrastructure Architecture (Read-Only) */}
        <Card className="rounded-2xl border border-purple-900/30 bg-[#100A1C]/80 shadow-[0_4px_24px_rgba(0,0,0,0.4)] backdrop-blur-md p-6 hover-card-glow transition-all duration-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-950/80 border border-purple-500/30 text-purple-300">
                  <Database className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base text-[#F5F0FF]">
                    Deployment & Architecture Status
                  </CardTitle>
                  <CardDescription className="text-xs text-[#B0A4C3] mt-0.5">
                    Immutable backend infrastructure parameters and security enforcement state.
                  </CardDescription>
                </div>
              </div>
              <span className="text-[11px] font-mono bg-purple-950/50 border border-purple-500/20 text-[#8D829F] px-2.5 py-1 rounded-md">
                Deployment Level (Read-Only)
              </span>
            </div>
          </CardHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#070311] border border-purple-900/30">
              <div>
                <span className="font-medium text-xs text-[#F5F0FF] block">Relational & Vector Store</span>
                <span className="text-[11px] text-[#8D829F]">
                  {deploymentInfo?.database_engine || "Neon PostgreSQL (pgvector extension enabled)"}
                </span>
              </div>
              <span className="text-emerald-300 font-mono text-[10px] bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                Connected
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#070311] border border-purple-900/30">
              <div>
                <span className="font-medium text-xs text-[#F5F0FF] block">Private Object Storage</span>
                <span className="text-[11px] text-[#8D829F]">
                  {deploymentInfo?.storage_provider || "Firebase Cloud Storage Vault"}
                </span>
              </div>
              <span className="text-purple-300 font-mono text-[10px] bg-purple-950/60 border border-purple-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Shield className="h-3 w-3 text-purple-400" />
                Enforced
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#070311] border border-purple-900/30">
              <div>
                <span className="font-medium text-xs text-[#F5F0FF] block">Embedding Engine</span>
                <span className="text-[11px] text-[#8D829F]">
                  {deploymentInfo?.embedding_provider || "OpenAI (text-embedding-3-small)"}
                </span>
              </div>
              <span className="text-indigo-300 font-mono text-[10px] bg-indigo-950/60 border border-indigo-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Layers className="h-3 w-3 text-indigo-400" />
                {deploymentInfo?.embedding_dim || 1536}-dim
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#070311] border border-purple-900/30">
              <div>
                <span className="font-medium text-xs text-[#F5F0FF] block">Host Environment</span>
                <span className="text-[11px] text-[#8D829F] capitalize">
                  {deploymentInfo?.environment || "production"} (Zero Client Secrets)
                </span>
              </div>
              <span className="text-emerald-300 font-mono text-[10px] bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Shield className="h-3 w-3 text-emerald-400" />
                Audited
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
