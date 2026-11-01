"use client";

import React from "react";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/**
 * Base primitive skeleton loader with a subtle purple-violet shimmer effect.
 */
export function Skeleton({ className = "", ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden rounded-xl bg-purple-950/25 border border-purple-900/20 ${className}`}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-purple-400/10 to-transparent animate-shimmer pointer-events-none" />
    </div>
  );
}

/**
 * Multi-line text skeleton emulating natural paragraph line lengths.
 */
export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-3/4", "w-2/3"];

  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3.5 ${
            i === lines - 1 && lines > 1
              ? "w-3/5"
              : widths[i % widths.length]
          }`}
        />
      ))}
    </div>
  );
}

/**
 * Avatar or initials monogram skeleton loader.
 */
export function SkeletonAvatar({
  size = "md",
  shape = "rounded",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  shape?: "circle" | "rounded";
  className?: string;
}) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-11 w-11",
  };

  const shapeClasses = shape === "circle" ? "rounded-full" : "rounded-xl";

  return (
    <Skeleton
      className={`${sizeClasses[size]} ${shapeClasses} shrink-0 ${className}`}
    />
  );
}

/**
 * Generic card container skeleton loader.
 */
export function SkeletonCard({
  className = "",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-2xl border border-purple-900/30 bg-[#100A1C]/75 p-5 sm:p-6 backdrop-blur-md relative overflow-hidden ${className}`}
    >
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-purple-400/8 to-transparent animate-shimmer pointer-events-none" />
      {children || (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-8 w-3/4" />
          <SkeletonText lines={2} />
        </div>
      )}
    </div>
  );
}

/**
 * KPI Metric card skeleton matching StatCard dimensions.
 */
export function SkeletonKpi({
  isHero = false,
  className = "",
}: {
  isHero?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-2xl border border-purple-900/30 bg-[#100A1C]/80 p-5 backdrop-blur-md space-y-3.5 relative overflow-hidden ${className}`}
    >
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-purple-400/10 to-transparent animate-shimmer pointer-events-none" />
      
      {/* Title & Icon Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>

      {/* Main Metric Value */}
      <div className="space-y-1 py-1">
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-3 w-40" />
      </div>

      {/* Hero arc or sparkline representation */}
      <div className="pt-2 border-t border-purple-900/20 flex items-center justify-between">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className={`h-4 ${isHero ? "w-16" : "w-12"}`} />
      </div>
    </div>
  );
}

/**
 * Table row skeleton matching DocumentTable or RecentAuditsFeed columns.
 */
export function SkeletonTableRow({
  variant = "audit",
  className = "",
}: {
  variant?: "document" | "audit";
  className?: string;
}) {
  if (variant === "document") {
    return (
      <tr className={`border-b border-purple-900/15 ${className}`} aria-hidden="true">
        <td className="px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-7 w-7 rounded-lg shrink-0" />
            <div className="space-y-1.5 flex-1 max-w-xs">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-2.5 w-24" />
            </div>
          </div>
        </td>
        <td className="px-4 py-4">
          <Skeleton className="h-5 w-16 rounded-full" />
        </td>
        <td className="px-4 py-4">
          <Skeleton className="h-3.5 w-14" />
        </td>
        <td className="px-4 py-4">
          <Skeleton className="h-3.5 w-12" />
        </td>
        <td className="px-4 sm:px-6 py-4 text-right">
          <div className="flex justify-end gap-2">
            <Skeleton className="h-7 w-16 rounded-md" />
            <Skeleton className="h-7 w-8 rounded-md" />
          </div>
        </td>
      </tr>
    );
  }

  // Audit Feed Row
  return (
    <tr className={`border-b border-purple-900/15 ${className}`} aria-hidden="true">
      <td className="py-3 pr-3 max-w-xs sm:max-w-md">
        <div className="flex items-start gap-2.5">
          <Skeleton className="h-6 w-6 rounded-md shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-3.5 w-64" />
            <Skeleton className="h-2.5 w-36" />
          </div>
        </div>
      </td>
      <td className="py-3 px-3">
        <Skeleton className="h-5 w-24 rounded-full" />
      </td>
      <td className="py-3 px-3">
        <Skeleton className="h-3.5 w-16" />
      </td>
      <td className="py-3 px-3">
        <Skeleton className="h-3 w-16" />
      </td>
      <td className="py-3 text-right">
        <Skeleton className="h-6 w-16 rounded-md ml-auto" />
      </td>
    </tr>
  );
}

/**
 * Chart container skeleton matching VerdictDistributionChart.
 */
export function SkeletonChart({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-2xl border border-purple-900/30 bg-[#100A1C]/75 p-6 backdrop-blur-md space-y-5 relative overflow-hidden ${className}`}
    >
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-purple-400/8 to-transparent animate-shimmer pointer-events-none" />
      
      {/* Chart Header */}
      <div className="flex items-center justify-between border-b border-purple-900/25 pb-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-6 w-20 rounded-md" />
      </div>

      {/* Bar / Donut Visualization Placeholder */}
      <div className="h-44 flex items-end justify-between gap-3 px-4 pt-6">
        {[65, 40, 85, 25, 95].map((height, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <Skeleton
              className="w-full rounded-t-lg transition-all"
              style={{ height: `${height}%` }}
            />
            <Skeleton className="h-2.5 w-8" />
          </div>
        ))}
      </div>

      {/* Legend Footer */}
      <div className="flex flex-wrap items-center justify-center gap-4 pt-2 border-t border-purple-900/20">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Skeleton className="h-2.5 w-2.5 rounded-full" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Claim card skeleton matching ClaimCard layout on Audit Detail page.
 */
export function SkeletonClaimCard({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`space-y-3.5 border-l-2 border-l-purple-500/40 border border-purple-900/30 bg-[#100A1C]/80 rounded-2xl p-5 relative overflow-hidden ${className}`}
    >
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-purple-400/10 to-transparent animate-shimmer pointer-events-none" />

      {/* Header with Icon, Claim #, and Verdict Badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1">
          <Skeleton className="h-4 w-4 rounded-full mt-0.5 shrink-0" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>

      {/* Auditor Rationale Placeholder */}
      <div className="pl-6 border-l border-purple-900/40 space-y-1.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>

      {/* Evidence Excerpt Box Placeholder */}
      <div className="pl-6 space-y-2 pt-1">
        <Skeleton className="h-3 w-28" />
        <div className="rounded-xl border border-purple-900/35 bg-[#070311] p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-2.5 w-36" />
          </div>
          <Skeleton className="h-3 w-full" />
        </div>
      </div>
    </div>
  );
}

