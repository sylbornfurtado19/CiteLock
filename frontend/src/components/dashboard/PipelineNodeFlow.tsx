"use client";

import React, { useState } from "react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { CardTitle } from "@/components/ui/card";
import { AnimatedMetricValue } from "@/components/dashboard/StatCard";
import {
  Lock,
  Layers,
  Cpu,
  ShieldCheck,
  Activity,
  ArrowRight,
  ArrowDown,
  Info,
} from "lucide-react";

interface PipelineNodeFlowProps {
  latencyMs?: number;
  className?: string;
}

export function PipelineNodeFlow({ latencyMs = 0, className = "" }: PipelineNodeFlowProps) {
  const [activeNode, setActiveNode] = useState<string | null>(null);

  // Health calculation based on latency SLAs
  const isHealthy = latencyMs < 400;
  const isModerate = latencyMs >= 400 && latencyMs < 1000;
  const isDegraded = latencyMs >= 1000;

  const slaBadgeColor =
    latencyMs === 0 || isHealthy
      ? "text-emerald-300 border-emerald-500/30 bg-emerald-950/70"
      : isModerate
      ? "text-amber-300 border-amber-500/30 bg-amber-950/70"
      : "text-rose-300 border-rose-500/30 bg-rose-950/70";

  const slaStatusText =
    latencyMs === 0
      ? "SLA READY"
      : isHealthy
      ? "SLA OPTIMAL"
      : isModerate
      ? "SLA MODERATE"
      : "SLA DEGRADED";

  const nodes = [
    {
      id: "storage",
      name: "Private Storage",
      provider: "Firebase Storage",
      badge: "AES-256",
      icon: Lock,
      status: "Connected",
      metadata: "Encrypted private bucket • Signed temporary URLs • Zero public ingress",
    },
    {
      id: "vector",
      name: "Vector Index",
      provider: "Neon Postgres",
      badge: "pgvector",
      icon: Layers,
      status: "Synced",
      metadata: "HNSW cosine distance indexing • Sub-millisecond similarity search",
    },
    {
      id: "judge",
      name: "Judge Provider",
      provider: "Remote API",
      badge: "RAM-Safe",
      icon: Cpu,
      status: "Active",
      metadata: "Stateless remote verification • Zero host RAM footprint • NLI Engine",
    },
  ];

  return (
    <SpotlightCard
      className={`p-6 cursor-default flex flex-col justify-between ${className}`}
      spotlightColor="rgba(168, 85, 247, 0.12)"
      borderSpotlightColor="rgba(216, 180, 254, 0.35)"
    >
      <div>
        {/* Header Bar */}
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
                Active verification DAG & runtime topology
              </p>
            </div>
          </div>
          <span className="font-mono text-[10px] font-semibold px-2.5 py-1 bg-purple-950/70 border border-purple-500/30 rounded-lg text-purple-300 shadow-sm">
            DAG TOPOLOGY
          </span>
        </div>

        {/* Visual DAG Flow: Upstream Connected Nodes */}
        <div className="space-y-2 mt-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#8D829F] mb-1.5 flex items-center justify-between">
            <span>Core Ingestion & Retrieval Pipeline</span>
            <span className="text-[9px] text-purple-400">Hover node to inspect config</span>
          </div>

          <div className="flex flex-col gap-2">
            {nodes.map((node, index) => {
              const Icon = node.icon;
              const isHovered = activeNode === node.id;

              return (
                <div key={node.id} className="relative">
                  {/* Pipeline Node */}
                  <div
                    onMouseEnter={() => setActiveNode(node.id)}
                    onMouseLeave={() => setActiveNode(null)}
                    onClick={() => setActiveNode(isHovered ? null : node.id)}
                    className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                      isHovered
                        ? "bg-[#160D2C] border-purple-400/50 shadow-[0_0_16px_rgba(139,92,246,0.22)] -translate-y-0.5"
                        : "bg-[#0B0616]/75 border-purple-900/25 hover:border-purple-500/35 hover:bg-[#120A24]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                            isHovered
                              ? "bg-purple-900/80 border-purple-400/60 text-purple-100 shadow-[0_0_8px_rgba(168,85,247,0.4)]"
                              : "bg-purple-950/60 border-purple-500/25 text-purple-300"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-[#F5F0FF] truncate">
                              {node.name}
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-950/70 border border-purple-500/25 text-purple-300 shrink-0">
                              {node.badge}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-purple-200/80 truncate block">
                            {node.provider}
                          </span>
                        </div>
                      </div>

                      {/* Status Indicator */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                        <span className="text-[10px] font-mono text-emerald-300 hidden sm:inline">
                          {node.status}
                        </span>
                      </div>
                    </div>

                    {/* Metadata Drawer shown on hover */}
                    {isHovered && (
                      <div className="mt-2.5 pt-2 border-t border-purple-900/30 text-[10px] font-mono text-purple-200/90 leading-tight flex items-center gap-1.5 animate-fade-in">
                        <Info className="h-3 w-3 text-purple-400 shrink-0" />
                        <span>{node.metadata}</span>
                      </div>
                    )}
                  </div>

                  {/* Flow Connector Arrow between nodes */}
                  {index < nodes.length - 1 && (
                    <div className="flex items-center justify-center my-1 relative">
                      <div className="h-3 w-0.5 bg-gradient-to-b from-purple-500/40 via-purple-400/80 to-purple-500/40 relative">
                        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1 w-1 rounded-full bg-purple-300 shadow-[0_0_6px_#C084FC] animate-ping" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Converging Conduit Connector */}
        <div className="flex items-center justify-center my-2">
          <div className="flex flex-col items-center">
            <div className="h-3 w-0.5 bg-gradient-to-b from-purple-500/40 to-purple-400" />
            <ArrowDown className="h-3 w-3 text-purple-400 -mt-0.5 animate-bounce" />
          </div>
        </div>

        {/* Terminal Sink Node: Grounded Auditor Engine & Runtime SLA */}
        <div className="p-3.5 rounded-xl border border-purple-500/30 bg-[#0B0616]/90 shadow-[0_0_20px_rgba(139,92,246,0.12)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-950/80 border border-purple-400/40 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.3)]">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-white">Grounded Auditor Engine</span>
                  <span
                    className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full border ${slaBadgeColor}`}
                  >
                    ● {slaStatusText}
                  </span>
                </div>
                <span className="text-[10px] text-[#8D829F] mt-0.5 block">
                  Consolidated verification runtime SLA
                </span>
              </div>
            </div>

            {/* Right: Latency Equalizer + Reading */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              {/* 5-bar vertical equalizer graphic */}
              <div className="flex items-end gap-1 h-5" title={`Latency SLA: ${latencyMs}ms`}>
                {[
                  { threshold: 80, height: "h-2" },
                  { threshold: 200, height: "h-2.5" },
                  { threshold: 400, height: "h-3.5" },
                  { threshold: 750, height: "h-4" },
                  { threshold: 1000, height: "h-5" },
                ].map((tier, idx) => {
                  const active =
                    (latencyMs === 0 && idx === 0) || latencyMs >= tier.threshold;
                  return (
                    <div
                      key={idx}
                      className={`w-1 rounded-full transition-all duration-300 ${
                        tier.height
                      } ${
                        active
                          ? isHealthy || latencyMs === 0
                            ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]"
                            : isModerate
                            ? "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.7)]"
                            : "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]"
                          : "bg-purple-950/60 border border-purple-900/30"
                      }`}
                    />
                  );
                })}
              </div>

              {/* Latency Number Reading */}
              <span className="font-mono text-xs font-bold text-purple-200">
                <AnimatedMetricValue value={Math.round(latencyMs)} /> ms
              </span>
            </div>
          </div>
        </div>
      </div>
    </SpotlightCard>
  );
}
