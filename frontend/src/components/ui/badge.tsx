import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "warning" | "danger" | "neutral";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variants = {
    default: "bg-emerald-950 text-emerald-300 border-emerald-800",
    success: "bg-emerald-950 text-emerald-400 border-emerald-800",
    warning: "bg-amber-950 text-amber-300 border-amber-800",
    danger: "bg-red-950 text-red-400 border-red-800",
    neutral: "bg-slate-800 text-slate-300 border-slate-700",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
