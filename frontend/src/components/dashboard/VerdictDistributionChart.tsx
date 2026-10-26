import React from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Verdict } from "@/types";
import { FileSearch, PieChart } from "lucide-react";

export function VerdictDistributionChart({
  distribution,
}: {
  distribution: Record<Verdict, number>;
}) {
  const [mounted, setMounted] = React.useState(false);
  const totalClaims = Object.values(distribution).reduce((a, b) => a + b, 0);
  const hasClaims = totalClaims > 0;
  const divisor = hasClaims ? totalClaims : 1;

  React.useEffect(() => {
    // Trigger smooth expansion after mount
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const items: { label: string; count: number; color: string; verdict: Verdict }[] = [
    { label: "Supported", count: distribution.supported || 0, color: "bg-emerald-500", verdict: "supported" },
    { label: "Partially Supported", count: distribution.partially_supported || 0, color: "bg-amber-500", verdict: "partially_supported" },
    { label: "Contradicted", count: distribution.contradicted || 0, color: "bg-red-500", verdict: "contradicted" },
    { label: "Unsupported", count: distribution.unsupported || 0, color: "bg-orange-500", verdict: "unsupported" },
    { label: "Insufficient Evidence", count: distribution.insufficient_evidence || 0, color: "bg-slate-500", verdict: "insufficient_evidence" },
  ];

  return (
    <Card className="relative overflow-hidden rounded-2xl border border-purple-900/30 bg-[#100A1C]/85 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.45)] backdrop-blur-md before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-purple-400/30 before:to-transparent">
      {/* Top right ambient highlight */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-600/10 blur-2xl"
        aria-hidden="true"
      />

      <div className="flex items-center justify-between border-b border-purple-900/25 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-950/70 border border-purple-500/30 text-purple-300">
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
          /* Segmented Bar Stack with Data */
          <div className="space-y-2">
            <div className="flex h-4 sm:h-5 w-full overflow-hidden rounded-full bg-[#070311] border border-purple-900/40 p-0.5 shadow-inner">
              {items.map((item) => {
                const rawPct = (item.count / divisor) * 100;
                if (rawPct === 0) return null;
                const displayPct = mounted ? rawPct : 0;
                return (
                  <div
                    key={item.verdict}
                    style={{ width: `${displayPct}%` }}
                    className={`${item.color} h-full first:rounded-l-full last:rounded-r-full transition-all duration-700 ease-out shadow-sm`}
                    title={`${item.label}: ${item.count} (${Math.round(rawPct)}%)`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[11px] font-mono text-[#8D829F] px-1">
              <span>0%</span>
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

        {/* Legend */}
        <div className="pt-2 border-t border-purple-900/20">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((item) => {
              const rawPct = (item.count / divisor) * 100;
              return (
                <div
                  key={item.verdict}
                  className="flex flex-col p-2.5 rounded-xl bg-[#0B0616]/70 border border-purple-900/20 hover:border-purple-500/30 hover:bg-[#120A24] transition-all duration-150 cursor-default"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`h-2.5 w-2.5 rounded-full ${item.color} shadow-[0_0_8px_currentColor] shrink-0`} />
                    <span className="text-[11px] text-[#B0A4C3] truncate">{item.label}</span>
                  </div>
                  <div className="flex items-baseline justify-between mt-0.5">
                    <span className="font-mono text-sm font-semibold text-[#F5F0FF]">{item.count}</span>
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
    </Card>
  );
}
