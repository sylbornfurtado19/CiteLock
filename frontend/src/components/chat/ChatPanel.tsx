"use client";

import React, { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Bot, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnswerWithCitations } from "./AnswerWithCitations";
import { PipelineProgressStepper } from "./PipelineProgressStepper";
import { Answer } from "@/types";
import { PipelineEvent, PipelineStage } from "@/types/pipeline";
import { streamPipelineQuery } from "@/lib/stream";
import { notify } from "@/components/ui/toast";
import { queryKeys } from "@/lib/query";

interface Message {
  id: string;
  sender: "user" | "assistant";
  text?: string;
  answer?: Answer;
}

export function ChatPanel({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "initial",
      sender: "assistant",
      text: "Ask any question against your workspace documents. CiteLock will decompose the answer, audit every atomic claim, and self-correct hallucinations before output.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Real-time streaming pipeline state
  const [activeStage, setActiveStage] = useState<PipelineStage | null>(null);
  const [pipelineEvents, setPipelineEvents] = useState<Record<PipelineStage, PipelineEvent>>(
    {} as Record<PipelineStage, PipelineEvent>
  );
  const [isStreamComplete, setIsStreamComplete] = useState(false);
  const [isStreamFailed, setIsStreamFailed] = useState(false);
  const [streamErrorMessage, setStreamErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeStage, loading]);

  const executeQuery = async (userPrompt: string) => {
    // Reset pipeline streaming state
    setActiveStage("retrieval");
    setPipelineEvents({} as Record<PipelineStage, PipelineEvent>);
    setIsStreamComplete(false);
    setIsStreamFailed(false);
    setStreamErrorMessage(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await streamPipelineQuery({
        workspaceId,
        prompt: userPrompt,
        topK: 5,
        signal: abortController.signal,
        onEvent: (event: PipelineEvent) => {
          setActiveStage(event.stage);
          setPipelineEvents((prev) => ({
            ...prev,
            [event.stage]: event,
          }));
        },
        onComplete: () => {
          setIsStreamComplete(true);
        },
        onError: (err: Error) => {
          setIsStreamFailed(true);
          setStreamErrorMessage(err.message);
        },
      });

      // Transition smoothly to final verified answer
      setMessages((prev) => [
        ...prev,
        {
          id: response.answer.id,
          sender: "assistant",
          answer: response.answer,
        },
      ]);

      // Invalidate analytics and audits cache so dashboard and audit feed show fresh metrics
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.analytics.all(workspaceId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.audits.all(workspaceId),
        });
      }
    } catch (err: unknown) {
      console.error("Pipeline streaming error:", err);
      setIsStreamFailed(true);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "An error occurred executing the audited RAG pipeline. Check backend connection.";
      setStreamErrorMessage(errorMessage);

      notify.error("Auditor Pipeline Interrupted", err, {
        description: errorMessage,
        action: {
          label: "Retry",
          onClick: () => {
            executeQuery(userPrompt);
          },
        },
      });

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: "assistant",
          text: `Pipeline Execution Interrupted: ${errorMessage}`,
        },
      ]);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userPrompt = input.trim();
    const userMsg: Message = { id: Date.now().toString(), sender: "user", text: userPrompt };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    await executeQuery(userPrompt);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-13rem)] min-h-[520px] max-h-[820px] rounded-2xl border border-purple-900/30 bg-[#100A1C]/75 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      {/* Message history */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 animate-fade-in-up duration-250 ${
              msg.sender === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {msg.sender === "assistant" && (
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-950/80 border border-purple-500/40 text-purple-300 shadow-[0_0_12px_rgba(139,92,246,0.25)] shrink-0 transition-transform hover:scale-105">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div className="max-w-2xl">
              {msg.answer ? (
                <AnswerWithCitations answer={msg.answer} workspaceId={workspaceId} />
              ) : (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm transition-all duration-200 ${
                    msg.sender === "user"
                      ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_4px_16px_rgba(147,51,234,0.3)]"
                      : "bg-[#160E29]/90 border border-purple-900/40 text-[#E2D9F3] shadow-[0_4px_16px_rgba(0,0,0,0.3)] leading-relaxed"
                  }`}
                >
                  {msg.text}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Real-Time Pipeline Progress Stepper (Visible while pipeline executes) */}
        {loading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-950/80 border border-purple-500/40 text-purple-300 shadow-[0_0_12px_rgba(139,92,246,0.25)] shrink-0 animate-pulse">
              <Bot className="h-4 w-4" />
            </div>
            <div className="max-w-2xl w-full">
              <PipelineProgressStepper
                activeStage={activeStage}
                events={pipelineEvents}
                isComplete={isStreamComplete}
                isFailed={isStreamFailed}
                errorMessage={streamErrorMessage || undefined}
              />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-purple-900/30 bg-[#0B0517]/80 rounded-b-2xl flex gap-2.5 backdrop-blur-md"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a factual question against your indexed documents..."
          disabled={loading}
          className="flex-1 rounded-xl border border-purple-900/40 bg-[#06020E] px-4 py-2.5 text-sm text-[#F5F0FF] placeholder-[#8D829F] focus:outline-none focus:border-purple-500/70 focus:ring-1 focus:ring-purple-500/30 transition-all duration-200"
        />
        <Button
          type="submit"
          disabled={loading || !input.trim()}
          size="sm"
          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl shadow-[0_0_16px_rgba(147,51,234,0.35)] transition-all duration-200 active:scale-95"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
