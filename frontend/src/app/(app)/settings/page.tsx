import React from "react";
import { SlidersHorizontal, Shield, Key, Database, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">System Settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure self-correction bounds, provider credentials, and storage governance.
        </p>
      </div>

      <div className="space-y-6">
        {/* Verification Settings */}
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-400" />
              <CardTitle className="text-base">Auditor & Self-Correction Policy</CardTitle>
            </div>
            <CardDescription>
              Configure maximum retry bounds and fallback behavior when ungrounded assertions are detected.
            </CardDescription>
          </CardHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-sm font-medium text-white block">Maximum Correction Retries</span>
                <span className="text-xs text-slate-400">
                  Limit recursive generation rounds to bound latency and token costs.
                </span>
              </div>
              <span className="font-mono text-sm px-3 py-1 bg-slate-950 border border-slate-800 rounded-md text-emerald-400">
                3 Retries
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-sm font-medium text-white block">Abstention Policy</span>
                <span className="text-xs text-slate-400">
                  Refuse to answer if confidence remains below threshold after max retries.
                </span>
              </div>
              <span className="font-mono text-sm px-3 py-1 bg-slate-950 border border-slate-800 rounded-md text-emerald-400">
                Strict Abstain
              </span>
            </div>
          </div>
        </Card>

        {/* Infrastructure & Storage */}
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-emerald-400" />
              <CardTitle className="text-base">Storage & Database Providers</CardTitle>
            </div>
            <CardDescription>
              Connections to relational metadata, vector indexes, and private file vaults.
            </CardDescription>
          </CardHeader>
          <div className="space-y-3 pt-2 text-xs">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div>
                <span className="font-medium text-white block">Relational & Vector Store</span>
                <span className="text-slate-400">Neon PostgreSQL (pgvector extension enabled)</span>
              </div>
              <span className="text-emerald-400 font-mono">Connected</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div>
                <span className="font-medium text-white block">Private Object Storage</span>
                <span className="text-slate-400">Firebase Cloud Storage (Direct client access denied)</span>
              </div>
              <span className="text-emerald-400 font-mono">Enforced</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
