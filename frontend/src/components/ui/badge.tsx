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
    default:
      "bg-purple-950/80 text-purple-200 border-purple-500/35 shadow-[0_0_10px_rgba(168,85,247,0.15)]",
    success:
      "bg-emerald-950/80 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.15)]",
    warning:
      "bg-amber-950/80 text-amber-300 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]",
    danger:
      "bg-rose-950/80 text-rose-300 border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.15)]",
    neutral:
      "bg-[#140C24] text-purple-200/90 border-purple-500/30",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-tight transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
