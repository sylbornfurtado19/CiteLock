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
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: "assistant",
          text: "An error occurred executing the audited RAG pipeline. Check backend connection.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[700px] rounded-xl border border-slate-800 bg-slate-900/40">
      {/* Message history */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.sender === "assistant" && (
              <div className="h-8 w-8 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-emerald-400" />
              </div>
            )}
            <div className="max-w-2xl">
              {msg.text && (
                <div
                  className={`rounded-xl p-4 text-sm leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800/80 text-slate-200 border border-slate-700"
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
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Auditing claims & verifying source provenance...</span>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-800 bg-slate-900/60">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your indexed documents..."
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            Query
          </Button>
        </div>
      </form>
    </div>
  );
}
