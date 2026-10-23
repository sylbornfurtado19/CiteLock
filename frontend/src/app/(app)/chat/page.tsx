import React from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";

export default function ChatPage() {
  const workspaceId = "default-workspace-001";

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Grounded Q&A Workspace</h1>
        <p className="text-sm text-slate-400 mt-1">
          Submit prompts to execute the self-correcting RAG pipeline: retrieval, draft generation, atomic claim verification, and correction loops.
        </p>
      </div>

      <ChatPanel workspaceId={workspaceId} />
    </div>
  );
}
