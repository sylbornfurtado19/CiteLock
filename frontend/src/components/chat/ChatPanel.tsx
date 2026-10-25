"use client";

import React, { useState } from "react";
import { Send, Bot, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnswerWithCitations } from "./AnswerWithCitations";
import { Answer } from "@/types";
import { apiFetch } from "@/lib/api";

interface Message {
  id: string;
  sender: "user" | "assistant";
  text?: string;
  answer?: Answer;
}

export function ChatPanel({ workspaceId }: { workspaceId: string }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "initial",
      sender: "assistant",
      text: "Ask any question against your workspace documents. CiteLock will decompose the answer, audit every atomic claim, and self-correct hallucinations before output.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: Message = { id: Date.now().toString(), sender: "user", text: input };
    setMessages((prev) => [...prev, userMsg]);
    const currentInput = input;
    setInput("");
    setLoading(true);

    try {
      const response = await apiFetch<{ query_id: string; answer: Answer }>(
        `/api/v1/workspaces/${workspaceId}/queries`,
        {
          method: "POST",
          body: JSON.stringify({ prompt: currentInput, top_k: 5 }),
        }
      );

      setMessages((prev) => [
        ...prev,
        {
          id: response.answer.id,
          sender: "assistant",
          answer: response.answer,
        },
      ]);
    } catch (err: unknown) {
      console.error(err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "An error occurred executing the audited RAG pipeline. Check backend connection.";
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: "assistant",
          text: errorMessage,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-13rem)] min-h-[520px] max-h-[820px] rounded-2xl border border-purple-900/30 bg-[#100A1C]/75 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      {/* Message history */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.sender === "assistant" && (
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-950/80 border border-purple-500/40 text-purple-300 shadow-[0_0_12px_rgba(139,92,246,0.25)] shrink-0">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div className="max-w-2xl">
              {msg.text && (
                <div
                  className={`rounded-2xl p-4 text-sm leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 text-white rounded-tr-sm shadow-[0_4px_18px_rgba(139,92,246,0.3)]"
                      : "bg-[#0B0616]/90 text-[#F5F0FF] border border-purple-900/35 rounded-tl-sm shadow-sm"
                  }`}
                >
                  {msg.text}
                </div>
              )}
              {msg.answer && (
                <AnswerWithCitations workspaceId={workspaceId} answer={msg.answer} />
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2.5 text-xs text-purple-300 font-mono py-1">
            <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
            <span>Auditing claims & verifying source provenance against pgvector...</span>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-3 sm:p-4 border-t border-purple-900/30 bg-[#0B0616]/80">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your indexed documents..."
            className="flex-1 rounded-xl border border-purple-900/40 bg-[#070311] px-4 py-2.5 text-sm text-[#F5F0FF] placeholder:text-[#8D829F] focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400/50 transition-all"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !input.trim()} className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            <span>Query</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
