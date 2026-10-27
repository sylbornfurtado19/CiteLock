"use client";

import React, { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  borderSpotlightColor?: string;
  withTopEdgeHighlight?: boolean;
}

/**
 * SpotlightCard: An interactive luminous glass card.
 * Dynamically tracks cursor movement to project hardware-accelerated
 * specular surface reflections and perimeter border illumination without re-render lag.
 */
export function SpotlightCard({
  children,
  className,
  spotlightColor = "rgba(168, 85, 247, 0.12)",
  borderSpotlightColor = "rgba(216, 180, 254, 0.35)",
  withTopEdgeHighlight = true,
  ...props
}: SpotlightCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    containerRef.current.style.setProperty("--mouse-x", `${x}px`);
    containerRef.current.style.setProperty("--mouse-y", `${y}px`);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    if (!containerRef.current) return;
    containerRef.current.style.setProperty("--mouse-x", "-999px");
    containerRef.current.style.setProperty("--mouse-y", "-999px");
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-purple-900/30 bg-[#100A1C]/85 shadow-[0_4px_24px_rgba(0,0,0,0.45)] backdrop-blur-md transition-all duration-200 hover:border-purple-500/40 hover:-translate-y-1 hover:shadow-[0_12px_36px_rgba(139,92,246,0.18)]",
        withTopEdgeHighlight &&
          "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-purple-400/35 before:to-transparent before:z-10",
        className
      )}
      {...props}
    >
      {/* Specular Radial Surface Spotlight */}
      <div
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(280px circle at var(--mouse-x, -999px) var(--mouse-y, -999px), ${spotlightColor}, transparent 80%)`,
        }}
        aria-hidden="true"
      />

      {/* Dynamic Specular Border Highlight Layer */}
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl z-0 transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(200px circle at var(--mouse-x, -999px) var(--mouse-y, -999px), ${borderSpotlightColor}, transparent 70%)`,
          maskImage: "linear-gradient(black, black) content-box, linear-gradient(black, black)",
          WebkitMaskImage: "linear-gradient(black, black) content-box, linear-gradient(black, black)",
          maskComposite: "exclude",
          WebkitMaskComposite: "xor",
          padding: "1px",
        }}
        aria-hidden="true"
      />

      {/* Inner Content with layout protection above spotlights */}
      <div className="relative z-10 h-full flex flex-col justify-between">{children}</div>
    </div>
  );
}
