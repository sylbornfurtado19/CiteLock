import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-purple-500/25 bg-[#100A1C] p-6 shadow-[0_16px_60px_rgba(0,0,0,0.7)] backdrop-blur-xl animate-scale-in overflow-hidden">
        {/* Subtle ambient spotlight */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-32 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-center justify-between border-b border-purple-900/30 pb-3 mb-4">
          <h3 className="text-lg font-semibold tracking-tight text-[#F5F0FF]">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-purple-300 hover:bg-purple-950/60 hover:text-white transition-all duration-150 active:scale-90"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}
