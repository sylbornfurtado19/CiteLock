import React from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Verdict } from "@/types";

export function VerdictDistributionChart({
  distribution,
}: {
  distribution: Record<Verdict, number>;
}) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0) || 1;

  const items: { label: string; count: number; color: string; verdict: Verdict }[] = [
    { label: "Supported", count: distribution.supported || 0, color: "bg-emerald-500", verdict: "supported" },
    { label: "Partially Supported", count: distribution.partially_supported || 0, color: "bg-amber-500", verdict: "partially_supported" },
    { label: "Contradicted", count: distribution.contradicted || 0, color: "bg-red-500", verdict: "contradicted" },
    { label: "Unsupported", count: distribution.unsupported || 0, color: "bg-orange-500", verdict: "unsupported" },
    { label: "Insufficient Evidence", count: distribution.insufficient_evidence || 0, color: "bg-slate-500", verdict: "insufficient_evidence" },
  ];

  return (
    <Card className="rounded-xl border border-purple-900/30 bg-[#100A1C]/80 shadow-[0_4px_24px_rgba(0,0,0,0.4)] backdrop-blur-md p-6">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#F5F0FF]">
          Audit Verdict Distribution
        </CardTitle>
      </CardHeader>

      <div className="space-y-4">
        {/* Progress bar stack */}
        <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-[#070311] border border-purple-900/40 p-0.5">
          {items.map((item) => {
            const pct = (item.count / total) * 100;
            if (pct === 0) return null;
            return (
              <div
                key={item.verdict}
                style={{ width: `${pct}%` }}
                className={`${item.color} h-full first:rounded-l-full last:rounded-r-full transition-all duration-300 shadow-sm`}
                title={`${item.label}: ${item.count} (${Math.round(pct)}%)`}
              />
            );
          })}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.verdict} className="flex items-center gap-2 text-xs">
              <span className={`h-2.5 w-2.5 rounded-full ${item.color} shadow-[0_0_8px_currentColor]`} />
              <span className="text-[#B0A4C3]">{item.label}:</span>
              <span className="font-mono font-semibold text-[#F5F0FF]">{item.count}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
