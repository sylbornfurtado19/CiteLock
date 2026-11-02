"use client";

import React, { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Bot, Network, MessageSquare, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnswerWithCitations } from "./AnswerWithCitations";
import { PipelineProgressStepper } from "./PipelineProgressStepper";
import { ExecutionPanel } from "@/components/execution/ExecutionPanel";
import { useExecutionGraph } from "@/hooks/useExecutionGraph";
import { Answer } from "@/types";
import type { ExecutionState } from "@/types/execution";
import { PipelineEvent, PipelineStage } from "@/types/pipeline";
import { streamPipelineQuery } from "@/lib/stream";
import { StreamInterruptedError } from "@/lib/sse";
import { notify } from "@/components/ui/toast";
import { queryKeys } from "@/lib/query";

interface Message {
  id: string;
  sender: "user" | "assistant";
  text?: string;
  answer?: Answer;
}

/** One finished (or failed) execution kept for the session so earlier answers can be re-inspected. */
interface ExecutionRecord {
  id: string;
  prompt: string;
  state: ExecutionState;
}

type Tab = "chat" | "execution";

export function ChatPanel({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const execution = useExecutionGraph();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "initial",
      sender: "assistant",
      text: "Ask any question against your workspace documents. CiteLock will decompose the answer, audit every atomic claim, and self-correct hallucinations before output.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [history, setHistory] = useState<ExecutionRecord[]>([]);
  // null shows the current/latest run; otherwise the id of a saved execution
  const [viewingId, setViewingId] = useState<string | null>(null);

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
    if (tab === "chat") scrollToBottom();
  }, [messages, activeStage, loading, tab]);

  const saveExecution = (id: string, prompt: string) => {
    const snapshot = execution.getState();
    setHistory((prev) => [...prev.filter((r) => r.id !== id), { id, prompt, state: snapshot }]);
  };

  const executeQuery = async (userPrompt: string) => {
    // Reset pipeline streaming state
    setActiveStage("retrieval");
    setPipelineEvents({} as Record<PipelineStage, PipelineEvent>);
    setIsStreamComplete(false);
    setIsStreamFailed(false);
    setStreamErrorMessage(null);
    execution.reset();
    setViewingId(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    let receivedGraphEvents = false;

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
        onGraphEvent: (event) => {
          receivedGraphEvents = true;
          execution.onGraphEvent(event);
        },
        onComplete: () => {
          setIsStreamComplete(true);
        },
        onError: (err: Error) => {
          setIsStreamFailed(true);
          setStreamErrorMessage(err.message);
        },
      });

      // A cache hit runs no graph; show the original execution that produced the cached answer.
      // Without live events or a persisted trace there is nothing truthful to draw, so the graph stays empty.
      const persistedTrace = response.answer.execution_trace;
      if (receivedGraphEvents) {
        execution.onComplete();
      } else if (persistedTrace?.length) {
        execution.restore(persistedTrace);
      }
      if (execution.getState().runStatus !== "idle") {
        saveExecution(response.answer.id, userPrompt);
      }

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

      if (err instanceof StreamInterruptedError) {
        execution.onInterrupted(errorMessage);
      } else {
        execution.onFailed(errorMessage);
      }
      const failureId = `failed-${Date.now()}`;
      saveExecution(failureId, userPrompt);

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
          id: failureId,
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

  const viewedState: ExecutionState =
    (viewingId && history.find((r) => r.id === viewingId)?.state) || execution.state;
  const hasHistory = history.length > 0;
  const runningNow = loading && execution.state.runStatus === "running";

  const openExecution = (id: string | null) => {
    setViewingId(id);
    setTab("execution");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-13rem)] min-h-[520px] max-h-[820px] rounded-2xl border border-purple-900/30 bg-[#100A1C]/75 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      {/* View switcher: conversation or the LangGraph execution graph */}
      <div className="flex items-center justify-between gap-2 border-b border-purple-900/30 px-3 py-2" role="tablist" aria-label="Workspace view">
        <div className="flex items-center gap-1">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "chat"}
            onClick={() => setTab("chat")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 ${
              tab === "chat" ? "bg-purple-950/70 text-purple-100 border border-purple-500/30" : "text-[#9E93B3] hover:text-purple-200 border border-transparent"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            Conversation
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "execution"}
            onClick={() => openExecution(viewingId)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 ${
              tab === "execution" ? "bg-purple-950/70 text-purple-100 border border-purple-500/30" : "text-[#9E93B3] hover:text-purple-200 border border-transparent"
            }`}
          >
            <Network className="h-3.5 w-3.5" aria-hidden />
            Execution graph
            {runningNow && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.9)]" aria-label="Running" />}
          </button>
        </div>

        {tab === "execution" && hasHistory && (
          <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-[#9E93B3]">
            <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="sr-only">Execution history</span>
            <select
              value={viewingId ?? ""}
              onChange={(e) => setViewingId(e.target.value || null)}
              className="max-w-[220px] truncate rounded-lg border border-purple-900/40 bg-[#06020E] px-2 py-1 text-[11px] text-[#E6E0F5] focus:border-purple-500/70 focus:outline-none"
            >
              <option value="">Latest run</option>
              {history.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.prompt.length > 40 ? `${r.prompt.slice(0, 39)}…` : r.prompt}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {tab === "execution" ? (
        <div className="min-h-0 flex-1 p-3">
          <ExecutionPanel state={viewedState} workspaceId={workspaceId} className="h-full" />
        </div>
      ) : (
        /* Message history */
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
                {msg.sender === "assistant" && history.some((r) => r.id === msg.id) && (
                  <button
                    type="button"
                    onClick={() => openExecution(msg.id)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-purple-500/25 bg-purple-950/40 px-2.5 py-1 font-mono text-[11px] text-purple-300 transition-colors hover:bg-purple-900/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
                  >
                    <Network className="h-3 w-3" aria-hidden />
                    View execution graph
                  </button>
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
              <div className="max-w-2xl w-full space-y-2">
                <PipelineProgressStepper
                  activeStage={activeStage}
                  events={pipelineEvents}
                  isComplete={isStreamComplete}
                  isFailed={isStreamFailed}
                  errorMessage={streamErrorMessage || undefined}
                />
                <button
                  type="button"
                  onClick={() => openExecution(null)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/25 bg-purple-950/40 px-2.5 py-1 font-mono text-[11px] text-purple-300 transition-colors hover:bg-purple-900/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
                >
                  <Network className="h-3 w-3" aria-hidden />
                  Watch live execution graph
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

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
