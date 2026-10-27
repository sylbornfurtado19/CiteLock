"use client";

import React, { useState, useEffect } from "react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { CardTitle } from "@/components/ui/card";
import { Verdict } from "@/types";
import { FileSearch, PieChart, Info } from "lucide-react";

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

  const items: {
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
      definition: "Assertions fully grounded by retrieved source citations.",
    },
    {
      label: "Partially Supported",
      count: distribution.partially_supported || 0,
      color: "bg-amber-500",
      hoverBorder: "border-amber-500/50",
      verdict: "partially_supported",
      definition: "Assertions partially true but missing complete evidence.",
    },
    {
      label: "Contradicted",
      count: distribution.contradicted || 0,
      color: "bg-red-500",
      hoverBorder: "border-red-500/50",
      verdict: "contradicted",
      definition: "Assertions directly refuted by private document evidence.",
    },
    {
      label: "Unsupported",
      count: distribution.unsupported || 0,
      color: "bg-orange-500",
      hoverBorder: "border-orange-500/50",
      verdict: "unsupported",
      definition: "Assertions with zero supporting evidence in the knowledge vault.",
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

  const activeItem = items.find((i) => i.verdict === hoveredVerdict);

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

      <div className="space-y-5">
        {hasClaims ? (
          /* Segmented Bar Stack with Interactive Hover Luminance */
          <div className="space-y-2">
            <div className="flex h-5 sm:h-6 w-full overflow-hidden rounded-full bg-[#070311] border border-purple-900/40 p-0.5 shadow-inner">
              {items.map((item) => {
                const rawPct = (item.count / divisor) * 100;
                if (rawPct === 0) return null;
                const displayPct = mounted ? rawPct : 0;
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
                        ? "scale-y-110 shadow-[0_0_12px_currentColor] z-20 brightness-110"
                        : isDimmed
                        ? "opacity-35 scale-y-95"
                        : "opacity-100"
                    }`}
                    title={`${item.label}: ${item.count} (${Math.round(rawPct)}%)`}
                  />
                );
              })}
            </div>

            {/* Dynamic Hover Tooltip / Status Row */}
            <div className="flex justify-between items-center text-[11px] font-mono text-[#8D829F] px-1 h-5">
              {activeItem ? (
                <div className="flex items-center gap-2 text-purple-200 transition-all">
                  <span className={`h-2 w-2 rounded-full ${activeItem.color}`} />
                  <span className="font-semibold text-white">{activeItem.label}:</span>
                  <span>
                    {activeItem.count} claims (
                    {Math.round((activeItem.count / divisor) * 100)}%)
                  </span>
                  <span className="text-[10px] text-[#8D829F] hidden sm:inline">
                    — {activeItem.definition}
                  </span>
                </div>
              ) : (
                <>
                  <span>0%</span>
                  <span className="text-[10px] text-[#7E7391]">
                    Hover over segments for audit definitions
                  </span>
                  <span>100% of Evaluated Claims</span>
                </>
              )}
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

        {/* Interactive Legend Grid */}
        <div className="pt-2 border-t border-purple-900/20">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((item) => {
              const rawPct = (item.count / divisor) * 100;
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
                      {hasClaims ? `${Math.round(rawPct)}%` : "0%"}
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
