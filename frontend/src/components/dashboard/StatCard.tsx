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

    // If starting and target are identical, update directly
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
}: {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ElementType;
  trend?: string;
  className?: string;
}) {
  return (
    <SpotlightCard
      className={`p-5 sm:p-6 min-h-[148px] cursor-default ${className}`}
      spotlightColor="rgba(168, 85, 247, 0.14)"
      borderSpotlightColor="rgba(216, 180, 254, 0.4)"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-mono font-medium text-[#B0A4C3] uppercase tracking-wider group-hover:text-purple-200 transition-colors leading-snug">
          {title}
        </span>
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-950/70 border border-purple-500/30 text-purple-300 shadow-[0_0_12px_rgba(139,92,246,0.2)] group-hover:scale-110 group-hover:border-purple-400/60 group-hover:text-purple-100 group-hover:shadow-[0_0_16px_rgba(168,85,247,0.35)] transition-all duration-200">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      <div className="mt-4">
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
        {description && (
          <p className="mt-2 text-xs text-[#8D829F] leading-relaxed group-hover:text-[#A89CBF] transition-colors">
            {description}
          </p>
        )}
      </div>
    </SpotlightCard>
  );
}
