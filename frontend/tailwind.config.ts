import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        canvas: {
          DEFAULT: "#05020D",
          subtle: "#080412",
        },
        surface: {
          DEFAULT: "#100A1C",
          elevated: "#171025",
          hover: "#1E1435",
          border: "rgba(196, 167, 255, 0.14)",
          highlight: "rgba(216, 180, 254, 0.18)",
        },
        brand: {
          50: "#faf5ff",
          100: "#f3e8ff",
          200: "#e9d5ff",
          300: "#d8b4fe",
          400: "#c084fc",
          500: "#a855f7",
          600: "#8b5cf6",
          700: "#7c3aed",
          800: "#6d28d9",
          900: "#581c87",
          950: "#2e1065",
        },
        audit: {
          supported: "#10b981",
          partially: "#f59e0b",
          contradicted: "#ef4444",
          unsupported: "#f97316",
          insufficient: "#6b7280",
        },
      },
      boxShadow: {
        "glow-xs": "0 0 10px rgba(139, 92, 246, 0.15)",
        "glow-sm": "0 0 18px rgba(139, 92, 246, 0.25)",
        "glow-md": "0 0 32px rgba(139, 92, 246, 0.35)",
        "glow-lg": "0 0 60px rgba(139, 92, 246, 0.45)",
        "glow-halo": "0 0 100px 30px rgba(168, 85, 247, 0.35)",
        "inner-glow": "inset 0 1px 0 0 rgba(216, 180, 254, 0.2)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-smooth": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      transitionDuration: {
        "150": "150ms",
        "200": "200ms",
        "250": "250ms",
        "350": "350ms",
        "500": "500ms",
        "700": "700ms",
      },
      keyframes: {
        "halo-pulse": {
          "0%, 100%": { opacity: "0.82", transform: "translateX(-50%) scale(1)" },
          "50%": { opacity: "0.98", transform: "translateX(-50%) scale(1.02)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-down": {
          "0%": { opacity: "0", transform: "translateY(-12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "halo-pulse": "halo-pulse 9s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-in-down": "fade-in-down 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-in": "fade-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scale-in": "scale-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
    },
  },
  plugins: [],
};

export default config;
