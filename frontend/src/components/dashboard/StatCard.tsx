import React from "react";
import { Card } from "@/components/ui/card";

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ElementType;
  trend?: string;
}) {
  return (
    <Card className="rounded-xl border border-purple-900/30 bg-[#100A1C]/80 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.4)] backdrop-blur-md hover:border-purple-500/35 transition-all group">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-medium text-[#B0A4C3] uppercase tracking-wider">
          {title}
        </span>
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-950/80 border border-purple-500/30 text-purple-300 shadow-[0_0_10px_rgba(139,92,246,0.2)] group-hover:scale-105 transition-transform">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-[#F5F0FF]">{value}</span>
        {trend && <span className="text-xs font-semibold text-purple-400 font-mono">{trend}</span>}
      </div>
      {description && <p className="mt-1 text-xs text-[#8D829F]">{description}</p>}
    </Card>
  );
}
