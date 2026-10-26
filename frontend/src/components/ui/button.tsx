import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05020D] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none";

    const variants = {
      primary:
        "bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 text-white hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 shadow-[0_0_20px_rgba(139,92,246,0.35)] hover:shadow-[0_0_28px_rgba(168,85,247,0.45)] hover:-translate-y-0.5 border border-purple-400/30",
      secondary:
        "bg-[#171025] text-purple-100 hover:bg-[#1E1435] border border-purple-500/20 shadow-sm hover:border-purple-500/35 hover:-translate-y-0.5",
      outline:
        "border border-purple-500/25 bg-transparent hover:bg-purple-950/30 text-purple-200 hover:text-white hover:border-purple-400/50 hover:-translate-y-0.5",
      danger:
        "bg-red-950/70 text-red-200 hover:bg-red-900/80 border border-red-800/60 shadow-sm hover:-translate-y-0.5",
      ghost: "hover:bg-purple-950/40 text-purple-300 hover:text-white transition-colors duration-150",
    };

    const sizes = {
      sm: "h-8 px-3 text-xs tracking-tight",
      md: "h-9 px-4 text-sm tracking-tight",
      lg: "h-11 px-6 text-base tracking-tight",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
