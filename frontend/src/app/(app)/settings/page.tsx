import React from "react";
import { SlidersHorizontal, Shield, Key, Database, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#F5F0FF]">System Settings</h1>
        <p className="text-sm text-[#B0A4C3] mt-1">
          Configure self-correction bounds, provider credentials, and storage governance.
        </p>
      </div>

      <div className="space-y-6">
        {/* Verification Settings */}
        <Card className="rounded-2xl border border-purple-900/30 bg-[#100A1C]/80 shadow-[0_4px_24px_rgba(0,0,0,0.4)] backdrop-blur-md p-6">
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
            <div className="flex items-center justify-between border-b border-purple-900/30 pb-3.5">
              <div>
                <span className="text-sm font-medium text-[#F5F0FF] block">Maximum Correction Retries</span>
                <span className="text-xs text-[#8D829F]">
                  Limit recursive generation rounds to bound latency and token costs.
                </span>
              </div>
              <span className="font-mono text-xs px-3 py-1 bg-purple-950/60 border border-purple-500/30 rounded-lg text-purple-300">
                3 Retries
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-purple-900/30 pb-3.5">
              <div>
                <span className="text-sm font-medium text-[#F5F0FF] block">Abstention Policy</span>
                <span className="text-xs text-[#8D829F]">
                  Refuse to answer if confidence remains below threshold after max retries.
                </span>
              </div>
              <span className="font-mono text-xs px-3 py-1 bg-purple-950/60 border border-purple-500/30 rounded-lg text-purple-300">
                Strict Abstain
              </span>
            </div>
          </div>
        </Card>

        {/* Infrastructure & Storage */}
        <Card className="rounded-2xl border border-purple-900/30 bg-[#100A1C]/80 shadow-[0_4px_24px_rgba(0,0,0,0.4)] backdrop-blur-md p-6">
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
              <span className="text-purple-300 font-mono bg-purple-950/60 border border-purple-500/30 px-2.5 py-0.5 rounded-full">
                Connected
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#070311] border border-purple-900/30">
              <div>
                <span className="font-medium text-[#F5F0FF] block">Private Object Storage</span>
                <span className="text-[#8D829F]">Firebase Cloud Storage (Direct client access denied)</span>
              </div>
              <span className="text-purple-300 font-mono bg-purple-950/60 border border-purple-500/30 px-2.5 py-0.5 rounded-full">
                Enforced
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
