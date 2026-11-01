"use client";

import React from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useWorkspace } from "@/lib/workspace";
import { MessageSquare } from "lucide-react";
import { Skeleton, SkeletonAvatar, SkeletonText } from "@/components/ui/skeleton";

export default function ChatPage() {
  const { currentWorkspace, isLoading } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto animate-fade-in" aria-busy="true">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-purple-900/20 pb-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <Skeleton className="h-8 w-32 rounded-xl" />
        </div>

        {/* Chat Panel Skeleton Frame */}
        <div className="flex flex-col h-[calc(100vh-13rem)] min-h-[520px] max-h-[820px] rounded-2xl border border-purple-900/30 bg-[#100A1C]/75 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-purple-400/8 to-transparent animate-shimmer pointer-events-none" />
          
          <div className="flex-1 p-6 space-y-6">
            {/* Assistant message skeleton */}
            <div className="flex gap-3">
              <SkeletonAvatar size="md" />
              <div className="rounded-2xl p-4 bg-[#0B0616]/90 border border-purple-900/35 max-w-md w-full space-y-2">
                <SkeletonText lines={2} />
              </div>
            </div>

            {/* User message skeleton */}
            <div className="flex justify-end">
              <div className="rounded-2xl p-4 bg-purple-950/40 border border-purple-500/20 max-w-sm w-full space-y-1.5">
                <Skeleton className="h-3.5 w-3/4 ml-auto" />
              </div>
            </div>
          </div>

          {/* Input Form Skeleton */}
          <div className="p-4 border-t border-purple-900/30 bg-[#0B0616]/80 flex gap-2">
            <Skeleton className="h-10 flex-1 rounded-xl" />
            <Skeleton className="h-10 w-24 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!currentWorkspace) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-950/60 border border-purple-500/30 text-purple-300 shadow-[0_0_24px_rgba(139,92,246,0.25)]">
          <MessageSquare className="h-8 w-8 text-purple-400" />
        </div>
        <h2 className="text-xl font-bold text-[#F5F0FF]">No Active Workspace Selected</h2>
        <p className="text-sm text-[#B0A4C3] max-w-md">
          Please select or create an isolated workspace using the tenant selector in the sidebar before initiating grounded Q&A.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-purple-900/20 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F5F0FF]">Grounded Q&A Workspace</h1>
          <p className="text-sm text-[#B0A4C3] mt-1">
            Submit prompts to execute the self-correcting RAG pipeline: retrieval, draft generation, atomic claim verification, and correction loops.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-xl bg-purple-950/50 border border-purple-500/30 text-xs text-purple-300 font-mono">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          {currentWorkspace.name}
        </div>
      </div>

      <ChatPanel key={workspaceId} workspaceId={workspaceId} />
    </div>
  );
}
