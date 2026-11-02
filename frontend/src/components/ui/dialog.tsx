"use client";

import * as React from "react";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when dialog is active
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  // Handle Escape key to close dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  const dialogContent = (
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in"
    >
      <div
        className={cn(
          "relative w-full max-w-lg rounded-2xl border border-purple-500/30 bg-[#100A1C] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl animate-scale-in overflow-hidden",
          className
        )}
      >
        {/* Subtle ambient spotlight */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-32 bg-purple-600/25 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-center justify-between border-b border-purple-900/30 pb-3 mb-4">
          <h3 className="text-lg font-semibold tracking-tight text-[#F5F0FF]">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-purple-300 hover:bg-purple-950/60 hover:text-white transition-all duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative">{children}</div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
}
