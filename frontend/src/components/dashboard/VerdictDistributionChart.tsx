"use client";

import React, { useState, useEffect } from "react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { CardTitle } from "@/components/ui/card";
import { Verdict } from "@/types";
import { FileSearch, PieChart } from "lucide-react";

export function VerdictDistributionChart({
  distribution,
}: {
  distribution: Record<Verdict, number>;
}) {
  const [mounted, setMounted] = useState(false);
  const [hoveredVerdict, setHoveredVerdict] = useState<Verdict | null>(null);

  const totalClaims = Object.values(distribution).reduce((a, b) => a + b, 0);
  const hasClaims = totalClaims > 0;
  const divisor = hasClaims ? totalClaims : 1;

  useEffect(() => {
    // Trigger smooth expansion after mount
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const rawItems: {
    label: string;
    count: number;
    color: string;
    hoverBorder: string;
    verdict: Verdict;
    definition: string;
  }[] = [
    {
      label: "Supported",
      count: distribution.supported || 0,
      color: "bg-emerald-500",
      hoverBorder: "border-emerald-500/50",
      verdict: "supported",
      definition: "Assertions fully verified and backed by retrieved private source citations.",
    },
    {
      label: "Partially Supported",
      count: distribution.partially_supported || 0,
      color: "bg-amber-500",
      hoverBorder: "border-amber-500/50",
      verdict: "partially_supported",
      definition: "Assertions partially true but missing complete evidence citations.",
    },
    {
      label: "Contradicted",
      count: distribution.contradicted || 0,
      color: "bg-red-500",
      hoverBorder: "border-red-500/50",
      verdict: "contradicted",
      definition: "Assertions directly refuted or conflicting with document ground-truth.",
    },
    {
      label: "Unsupported",
      count: distribution.unsupported || 0,
      color: "bg-orange-500",
      hoverBorder: "border-orange-500/50",
      verdict: "unsupported",
      definition: "Assertions with zero supporting evidence in the indexed knowledge vault.",
    },
    {
      label: "Insufficient Evidence",
      count: distribution.insufficient_evidence || 0,
      color: "bg-slate-500",
      hoverBorder: "border-slate-500/50",
      verdict: "insufficient_evidence",
      definition: "Ambiguous assertions requiring additional source documentation.",
    },
  ];

  // Calculate cumulative position for each segment to anchor the floating tooltip
  let cumulative = 0;
  const computedItems = rawItems.map((item) => {
    const rawPct = (item.count / divisor) * 100;
    const startPct = cumulative;
    const centerPct = cumulative + rawPct / 2;
    cumulative += rawPct;
    return {
      ...item,
      rawPct,
      startPct,
      centerPct,
    };
  });

  const activeItem = computedItems.find((i) => i.verdict === hoveredVerdict);
  const activeCenterClamped = activeItem
    ? Math.max(16, Math.min(84, activeItem.centerPct))
    : 50;

  return (
    <SpotlightCard
      className="p-6 cursor-default"
      spotlightColor="rgba(168, 85, 247, 0.12)"
      borderSpotlightColor="rgba(216, 180, 254, 0.35)"
    >
      <div className="flex items-center justify-between border-b border-purple-900/25 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-950/70 border border-purple-500/30 text-purple-300 shadow-[0_0_10px_rgba(139,92,246,0.2)]">
            <PieChart className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-[#F5F0FF]">
              Audit Verdict Distribution
            </CardTitle>
            <p className="text-xs text-[#8D829F] mt-0.5">
              Breakdown of claim verification outcomes across processed queries
            </p>
          </div>
        </div>
        <span className="font-mono text-xs px-2.5 py-1 bg-purple-950/60 border border-purple-500/25 rounded-lg text-purple-300">
          {totalClaims} {totalClaims === 1 ? "Claim" : "Claims"}
        </span>
      </div>

      <div className="space-y-6">
        {hasClaims ? (
          /* Segmented Bar Stack with Floating Scrubber Tooltip Portal */
          <div className="relative pt-6 pb-1">
            {/* Floating Live Tooltip Portal anchored above active segment */}
            {activeItem && activeItem.count > 0 && (
              <div
                className="absolute -top-14 z-30 transition-all duration-200 pointer-events-none animate-fade-in-up"
                style={{
                  left: `${activeCenterClamped}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <div className="relative rounded-xl border border-purple-500/40 bg-[#130B24]/95 p-3 shadow-[0_8px_32px_rgba(0,0,0,0.85)] backdrop-blur-xl w-64 max-w-[90vw] text-left">
                  {/* Specular top-edge sheen */}
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-400/40 to-transparent" />

                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${activeItem.color} shadow-[0_0_8px_currentColor]`}
                      />
                      <span className="text-xs font-bold text-white tracking-wide">
                        {activeItem.label}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-purple-200 bg-purple-950/70 border border-purple-500/30 px-2 py-0.5 rounded-md">
                      {activeItem.count} ({Math.round(activeItem.rawPct)}%)
                    </span>
                  </div>

                  <p className="text-[11px] text-[#C4B5FD] leading-snug">
                    {activeItem.definition}
                  </p>

                  {/* Downward triangle indicator pointing to the active segment */}
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#130B24] border-r border-b border-purple-500/40 rotate-45" />
                </div>
              </div>
            )}

            {/* Segmented Bar Track */}
            <div className="flex h-5 sm:h-6 w-full overflow-hidden rounded-full bg-[#070311] border border-purple-900/40 p-0.5 shadow-inner relative z-10">
              {computedItems.map((item) => {
                if (item.rawPct === 0) return null;
                const displayPct = mounted ? item.rawPct : 0;
                const isHovered = hoveredVerdict === item.verdict;
                const isDimmed = hoveredVerdict !== null && !isHovered;

                return (
                  <div
                    key={item.verdict}
                    onMouseEnter={() => setHoveredVerdict(item.verdict)}
                    onMouseLeave={() => setHoveredVerdict(null)}
                    style={{ width: `${displayPct}%` }}
                    className={`${item.color} h-full first:rounded-l-full last:rounded-r-full transition-all duration-300 ease-out cursor-pointer relative ${
                      isHovered
                        ? "scale-y-110 shadow-[0_0_14px_currentColor] z-20 brightness-110"
                        : isDimmed
                        ? "opacity-35 scale-y-95"
                        : "opacity-100"
                    }`}
                    title={`${item.label}: ${item.count} (${Math.round(item.rawPct)}%)`}
                  />
                );
              })}
            </div>

            {/* Static Axis Legend */}
            <div className="flex justify-between items-center text-[11px] font-mono text-[#8D829F] px-1 mt-2">
              <span>0%</span>
              <span className="text-[10px] text-[#7E7391]">
                Hover segments or legend to isolate verdict telemetry
              </span>
              <span>100% of Evaluated Claims</span>
            </div>
          </div>
        ) : (
          /* Deliberate Zero-Data Empty State */
          <div className="space-y-3">
            <div className="h-3.5 w-full rounded-full bg-[#070311] border border-dashed border-purple-900/50 p-0.5 flex items-center justify-center">
              <div className="h-1.5 w-1/3 rounded-full bg-purple-900/30" />
            </div>

            <div className="rounded-xl border border-dashed border-purple-900/40 bg-[#070311]/60 p-5 text-center my-2">
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-purple-950/60 border border-purple-500/25 text-purple-300">
                <FileSearch className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-purple-200">No claims evaluated yet</p>
              <p className="text-[11px] text-[#8D829F] mt-1 max-w-sm mx-auto leading-relaxed">
                Distribution metrics will populate automatically as grounded queries and verification audits are processed in this workspace.
              </p>
            </div>
          </div>
        )}

        {/* Interactive Legend Grid with Synchronized Hover Highlighting */}
        <div className="pt-2 border-t border-purple-900/20">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {computedItems.map((item) => {
              const isHovered = hoveredVerdict === item.verdict;
              const isDimmed = hoveredVerdict !== null && !isHovered;

              return (
                <div
                  key={item.verdict}
                  onMouseEnter={() => setHoveredVerdict(item.verdict)}
                  onMouseLeave={() => setHoveredVerdict(null)}
                  className={`flex flex-col p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                    isHovered
                      ? `bg-[#160D2A] ${item.hoverBorder} shadow-[0_0_16px_rgba(139,92,246,0.2)] -translate-y-0.5`
                      : isDimmed
                      ? "bg-[#0B0616]/40 border-purple-900/10 opacity-50"
                      : "bg-[#0B0616]/70 border-purple-900/20 hover:border-purple-500/30 hover:bg-[#120A24]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${item.color} ${
                        isHovered ? "shadow-[0_0_10px_currentColor] scale-110" : ""
                      } shrink-0 transition-transform`}
                    />
                    <span className="text-[11px] text-[#B0A4C3] truncate">{item.label}</span>
                  </div>
                  <div className="flex items-baseline justify-between mt-0.5">
                    <span className="font-mono text-sm font-semibold text-[#F5F0FF]">
                      {item.count}
                    </span>
                    <span className="font-mono text-[10px] text-[#8D829F]">
                      {hasClaims ? `${Math.round(item.rawPct)}%` : "0%"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </SpotlightCard>
  );
}
