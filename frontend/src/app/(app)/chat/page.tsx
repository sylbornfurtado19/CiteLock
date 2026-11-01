"use client";

import React from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useWorkspace } from "@/lib/workspace";
import { MessageSquare, Loader2 } from "lucide-react";

export default function ChatPage() {
  const { currentWorkspace, isLoading } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-[#8D829F] text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2 text-purple-400" />
        Resolving workspace context...
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
