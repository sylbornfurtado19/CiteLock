"use client";

import React, { useEffect, useState, useRef } from "react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";

/**
 * AnimatedMetricValue: Smoothly counts up to numeric values
 * using an ease-out exponential curve, maintaining exact decimal precision,
 * smoothly gliding from previous to new values on data refresh.
 */
export function AnimatedMetricValue({ value }: { value: string | number }) {
  const [displayValue, setDisplayValue] = useState<string | number>(value);
  const prevNumRef = useRef<number | null>(null);

  useEffect(() => {
    // If loading or empty placeholder state
    if (typeof value === "string" && (value === "--" || value.trim() === "")) {
      setDisplayValue("--");
      prevNumRef.current = null;
      return;
    }

    // Check prefers-reduced-motion
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplayValue(value);
      return;
    }

    const strVal = String(value);
    const hasPercent = strVal.endsWith("%");
    const num = parseFloat(strVal.replace("%", ""));

    if (isNaN(num)) {
      setDisplayValue(value);
      return;
    }

    const start = prevNumRef.current !== null ? prevNumRef.current : 0;
    prevNumRef.current = num;

    if (start === num) {
      setDisplayValue(value);
      return;
    }

    const duration = 600; // ms
    const startTime = performance.now();
    let animFrame: number;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out-expo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = start + (num - start) * ease;

      const formatted = hasPercent
        ? `${current.toFixed(1)}%`
        : Math.round(current).toString();

      setDisplayValue(formatted);

      if (progress < 1) {
        animFrame = requestAnimationFrame(animate);
      }
    };

    animFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrame);
  }, [value]);

  return <>{displayValue}</>;
}

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  className = "",
  isHero = false,
  sparklineType = "none",
}: {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ElementType;
  trend?: string;
  className?: string;
  isHero?: boolean;
  sparklineType?: "none" | "documents" | "claims" | "hallucinations";
}) {
  // Parse numeric value for hero gauge & sparklines
  const strVal = String(value);
  const numericVal = parseFloat(strVal.replace("%", ""));
  const isValidNum = !isNaN(numericVal);
  const isPercent = strVal.endsWith("%");

  // Hero Radial Gauge parameters
  // Radius = 24, circumference = 2 * PI * 24 ≈ 150.8
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const score = isValidNum ? Math.min(100, Math.max(0, numericVal)) : 100;
  const strokeOffset = circumference - (score / 100) * circumference;

  // Gauge theme based on grounding score
  const isOptimal = score >= 95;
  const isWarning = score < 90;

  const arcColor = isOptimal
    ? "stroke-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]"
    : isWarning
    ? "stroke-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]"
    : "stroke-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]";

  const heroBacklight = isOptimal
    ? "rgba(16, 185, 129, 0.12)"
    : isWarning
    ? "rgba(245, 158, 11, 0.15)"
    : "rgba(168, 85, 247, 0.14)";

  return (
    <SpotlightCard
      className={`p-5 sm:p-6 min-h-[156px] cursor-default flex flex-col justify-between ${
        isHero
          ? "border-purple-500/35 bg-[#120B22]/90 shadow-[0_4px_28px_rgba(139,92,246,0.14)]"
          : ""
      } ${className}`}
      spotlightColor={isHero ? heroBacklight : "rgba(168, 85, 247, 0.14)"}
      borderSpotlightColor={
        isHero
          ? isOptimal
            ? "rgba(52, 211, 153, 0.4)"
            : "rgba(216, 180, 254, 0.4)"
          : "rgba(216, 180, 254, 0.4)"
      }
    >
      {/* Top Row: Title + Micro Badges / Icon */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-medium text-[#B0A4C3] uppercase tracking-wider group-hover:text-purple-200 transition-colors leading-snug">
            {title}
          </span>
          {isHero && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-emerald-300 bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              TARGET: ≥98.5%
            </span>
          )}
        </div>

        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-950/70 border border-purple-500/30 text-purple-300 shadow-[0_0_12px_rgba(139,92,246,0.2)] group-hover:scale-110 group-hover:border-purple-400/60 group-hover:text-purple-100 group-hover:shadow-[0_0_16px_rgba(168,85,247,0.35)] transition-all duration-200">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Middle Row: Hero Radial Arc or Standard Metric Display */}
      <div className="mt-3">
        {isHero ? (
          /* Hero Radial Arc Layout */
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F0FF] font-mono leading-none">
                  <AnimatedMetricValue value={value} />
                </span>
                {trend && (
                  <span className="text-[11px] font-semibold text-purple-300 font-mono bg-purple-950/60 border border-purple-500/25 px-2 py-0.5 rounded-md">
                    {trend}
                  </span>
                )}
              </div>

              {/* Sub-telemetry indicators */}
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Verified Citations Proof</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8D829F]">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                  <span>Continuous NLI Verification</span>
                </div>
              </div>
            </div>

            {/* Circular Radial SVG Arc Gauge */}
            <div className="relative shrink-0 flex items-center justify-center">
              <svg className="h-14 w-14 -rotate-90 overflow-visible" viewBox="0 0 60 60">
                {/* Background track circle */}
                <circle
                  cx="30"
                  cy="30"
                  r={radius}
                  className="stroke-purple-950/80"
                  strokeWidth="4.5"
                  fill="transparent"
                />
                {/* Active progress arc */}
                <circle
                  cx="30"
                  cy="30"
                  r={radius}
                  className={`${arcColor} transition-all duration-700 ease-out`}
                  strokeWidth="4.5"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              {/* Inner score badge */}
              <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-bold text-white">
                {isValidNum ? `${Math.round(score)}%` : "--"}
              </div>
            </div>
          </div>
        ) : (
          /* Standard Metric Display with Micro-Trend Sparklines */
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F0FF] font-mono leading-none">
                <AnimatedMetricValue value={value} />
              </span>
              {trend && (
                <span className="text-[11px] font-semibold text-purple-300 font-mono bg-purple-950/60 border border-purple-500/25 px-2 py-0.5 rounded-md">
                  {trend}
                </span>
              )}
            </div>

            {/* Micro-Trend Rhythm Strips */}
            {sparklineType === "documents" && (
              <div className="mt-2.5 space-y-1">
                {/* 6-segment Vault Sync Strip */}
                <div className="flex items-center gap-1 h-1.5 w-full max-w-[180px]">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className={`h-full flex-1 rounded-full ${
                        isValidNum && numericVal > 0
                          ? i <= 4
                            ? "bg-purple-500/80 shadow-[0_0_6px_rgba(168,85,247,0.5)]"
                            : i === 5
                            ? "bg-emerald-500/80"
                            : "bg-purple-900/40"
                          : "bg-purple-950/60 border border-purple-900/30"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8D829F]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>AES-256 Storage Sync</span>
                </div>
              </div>
            )}

            {sparklineType === "claims" && (
              <div className="mt-2.5 space-y-1">
                {/* 5-segment Proposition Rhythm Strip */}
                <div className="flex items-center gap-1 h-1.5 w-full max-w-[180px]">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={`h-full flex-1 rounded-full ${
                        isValidNum && numericVal > 0
                          ? "bg-purple-400 shadow-[0_0_6px_rgba(192,132,252,0.4)]"
                          : "bg-purple-950/60 border border-purple-900/30"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8D829F]">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                  <span>Atomic NLI Propositions</span>
                </div>
              </div>
            )}

            {sparklineType === "hallucinations" && (
              <div className="mt-2.5 space-y-1">
                {/* Guard Safety Strip */}
                <div className="flex items-center gap-1 h-1.5 w-full max-w-[180px]">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className={`h-full flex-1 rounded-full ${
                        isValidNum && numericVal === 0
                          ? "bg-emerald-400/90 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                          : i <= Math.min(6, numericVal)
                          ? "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)]"
                          : "bg-purple-900/30"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8D829F]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isValidNum && numericVal === 0 ? "bg-emerald-400" : "bg-rose-400"
                    }`}
                  />
                  <span>
                    {isValidNum && numericVal === 0
                      ? "Zero False Claims Intercepted"
                      : "Active Interception Guard"}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {description && (
          <p className="mt-2 text-xs text-[#8D829F] leading-relaxed group-hover:text-[#A89CBF] transition-colors">
            {description}
          </p>
        )}
      </div>
    </SpotlightCard>
  );
}
