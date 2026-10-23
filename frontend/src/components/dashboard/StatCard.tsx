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
    <Card className="border-slate-800 bg-slate-900/50">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</span>
        {Icon && <Icon className="h-5 w-5 text-emerald-400" />}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-white">{value}</span>
        {trend && <span className="text-xs font-semibold text-emerald-400">{trend}</span>}
      </div>
      {description && <p className="mt-1 text-xs text-slate-400">{description}</p>}
    </Card>
  );
}
