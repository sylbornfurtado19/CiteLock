import React from "react";
import { Card } from "@/components/ui/card";

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  className = "",
}: {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ElementType;
  trend?: string;
  className?: string;
}) {
  return (
    <Card
      className={`relative overflow-hidden rounded-2xl border border-purple-900/30 bg-[#100A1C]/85 p-5 sm:p-6 shadow-[0_4px_24px_rgba(0,0,0,0.45)] backdrop-blur-md hover:border-purple-500/40 hover:-translate-y-1 hover:shadow-[0_10px_32px_rgba(139,92,246,0.18)] transition-all duration-200 group cursor-default flex flex-col justify-between min-h-[142px] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-purple-400/30 before:to-transparent ${className}`}
    >
      {/* Subtle top-right ambient spotlight */}
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-purple-600/10 blur-xl group-hover:bg-purple-600/20 transition-all duration-300"
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-mono font-medium text-[#B0A4C3] uppercase tracking-wider group-hover:text-purple-200 transition-colors leading-snug">
          {title}
        </span>
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-950/70 border border-purple-500/30 text-purple-300 shadow-[0_0_12px_rgba(139,92,246,0.2)] group-hover:scale-110 group-hover:border-purple-400/50 group-hover:text-purple-100 transition-all duration-200">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F0FF] font-mono leading-none">
            {value}
          </span>
          {trend && (
            <span className="text-[11px] font-semibold text-purple-300 font-mono bg-purple-950/60 border border-purple-500/25 px-2 py-0.5 rounded-md">
              {trend}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-2 text-xs text-[#8D829F] leading-relaxed group-hover:text-[#A89CBF] transition-colors">
            {description}
          </p>
        )}
      </div>
    </Card>
  );
}
