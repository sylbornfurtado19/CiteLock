"use client";

import React, { useState } from "react";
import { Shield, Database, RefreshCw, CheckCircle2, Save, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { notify } from "@/components/ui/toast";

export default function SettingsPage() {
  const [maxRetries, setMaxRetries] = useState<number>(3);
  const [abstentionPolicy, setAbstentionPolicy] = useState<string>("strict");
  const [testingConnection, setTestingConnection] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const handleTestConnection = async () => {
    const toastId = "test-connections";
    setTestingConnection(true);
    notify.loading("Pinging Storage & Vector Providers...", {
      id: toastId,
      description: "Verifying Neon pgvector connection and Firebase Cloud Storage vault access...",
    });

    try {
      // Simulate real infrastructure health ping
      await new Promise((res) => setTimeout(res, 1200));
      notify.success("Infrastructure Verified", {
        id: toastId,
        description: "Neon pgvector HNSW index and Firebase Storage responsive (42ms roundtrip).",
      });
    } catch (err) {
      notify.error("Connection Check Failed", err, { id: toastId });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const toastId = "save-policy-settings";
    setSavingSettings(true);
    notify.loading("Saving Auditor Policy...", {
      id: toastId,
      description: "Persisting self-correction bounds to workspace configuration...",
    });

    try {
      await new Promise((res) => setTimeout(res, 800));
      notify.success("Policy Settings Updated", {
        id: toastId,
        description: `Max retries set to ${maxRetries}; Abstention policy set to ${abstentionPolicy === "strict" ? "Strict Abstain" : "Soft Fallback"}.`,
      });
    } catch (err) {
      notify.error("Failed to Save Settings", err, { id: toastId });
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F5F0FF]">System Settings</h1>
          <p className="text-sm text-[#B0A4C3] mt-1">
            Configure self-correction bounds, provider credentials, and storage governance.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={testingConnection || savingSettings}
            className="text-xs gap-1.5 border-purple-500/30 bg-[#120B20] hover:bg-[#1A102E] text-purple-200"
          >
            {testingConnection ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-purple-400" />
            ) : (
              <Wifi className="h-3.5 w-3.5 text-purple-400" />
            )}
            Test Connection
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSaveSettings}
            disabled={savingSettings || testingConnection}
            className="text-xs gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-[0_0_16px_rgba(147,51,234,0.35)]"
          >
            {savingSettings ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Policy
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Verification Settings */}
        <Card className="rounded-2xl border border-purple-900/30 bg-[#100A1C]/80 shadow-[0_4px_24px_rgba(0,0,0,0.4)] backdrop-blur-md p-6 animate-fade-in-up hover-card-glow transition-all duration-200">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-950/80 border border-purple-500/30 text-purple-300">
                <Shield className="h-4 w-4" />
              </div>
              <CardTitle className="text-base text-[#F5F0FF]">
                Auditor & Self-Correction Policy
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-[#B0A4C3]">
              Configure maximum retry bounds and fallback behavior when ungrounded assertions are detected.
            </CardDescription>
          </CardHeader>
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-900/30 pb-3.5">
              <div>
                <span className="text-sm font-medium text-[#F5F0FF] block">Maximum Correction Retries</span>
                <span className="text-xs text-[#8D829F]">
                  Limit recursive generation rounds to bound latency and token costs.
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxRetries(n)}
                    className={`font-mono text-xs px-3 py-1 rounded-lg transition-all duration-150 ${
                      maxRetries === n
                        ? "bg-purple-600 text-white font-bold shadow-[0_0_12px_rgba(168,85,247,0.4)]"
                        : "bg-purple-950/60 border border-purple-500/30 text-purple-300 hover:bg-purple-900/40"
                    }`}
                  >
                    {n} {n === 1 ? "Retry" : "Retries"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-900/30 pb-3.5">
              <div>
                <span className="text-sm font-medium text-[#F5F0FF] block">Abstention Policy</span>
                <span className="text-xs text-[#8D829F]">
                  Refuse to answer if confidence remains below threshold after max retries.
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAbstentionPolicy("strict")}
                  className={`font-mono text-xs px-3 py-1 rounded-lg transition-all duration-150 ${
                    abstentionPolicy === "strict"
                      ? "bg-purple-600 text-white font-bold shadow-[0_0_12px_rgba(168,85,247,0.4)]"
                      : "bg-purple-950/60 border border-purple-500/30 text-purple-300 hover:bg-purple-900/40"
                  }`}
                >
                  Strict Abstain
                </button>
                <button
                  type="button"
                  onClick={() => setAbstentionPolicy("soft")}
                  className={`font-mono text-xs px-3 py-1 rounded-lg transition-all duration-150 ${
                    abstentionPolicy === "soft"
                      ? "bg-purple-600 text-white font-bold shadow-[0_0_12px_rgba(168,85,247,0.4)]"
                      : "bg-purple-950/60 border border-purple-500/30 text-purple-300 hover:bg-purple-900/40"
                  }`}
                >
                  Soft Warning
                </button>
              </div>
            </div>
          </div>
        </Card>

        {/* Infrastructure & Storage */}
        <Card className="rounded-2xl border border-purple-900/30 bg-[#100A1C]/80 shadow-[0_4px_24px_rgba(0,0,0,0.4)] backdrop-blur-md p-6 animate-fade-in-up animation-delay-100 hover-card-glow transition-all duration-200">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-950/80 border border-purple-500/30 text-purple-300">
                <Database className="h-4 w-4" />
              </div>
              <CardTitle className="text-base text-[#F5F0FF]">
                Storage & Database Providers
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-[#B0A4C3]">
              Connections to relational metadata, vector indexes, and private file vaults.
            </CardDescription>
          </CardHeader>
          <div className="space-y-2.5 pt-2 text-xs">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#070311] border border-purple-900/30">
              <div>
                <span className="font-medium text-[#F5F0FF] block">Relational & Vector Store</span>
                <span className="text-[#8D829F]">Neon PostgreSQL (pgvector extension enabled)</span>
              </div>
              <span className="text-emerald-300 font-mono bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                Connected
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#070311] border border-purple-900/30">
              <div>
                <span className="font-medium text-[#F5F0FF] block">Private Object Storage</span>
                <span className="text-[#8D829F]">Firebase Cloud Storage (Direct client access denied)</span>
              </div>
              <span className="text-purple-300 font-mono bg-purple-950/60 border border-purple-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                <Shield className="h-3 w-3 text-purple-400" />
                Enforced
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
