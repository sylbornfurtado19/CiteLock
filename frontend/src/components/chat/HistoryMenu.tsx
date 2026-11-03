"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, History, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { QueryHistoryItem } from "@/types";

interface HistoryMenuProps {
  workspaceId: string;
  /** Called with the chosen query; the parent loads and restores it. */
  onSelect: (item: QueryHistoryItem) => void;
  disabled?: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  completed: "border-emerald-500/30 bg-emerald-950/40 text-emerald-300",
  failed: "border-rose-500/40 bg-rose-950/50 text-rose-300",
};

export const historyQueryKey = (workspaceId: string) => ["query-history", workspaceId] as const;

/** Lists previous queries for the workspace (completed and failed) and lets the user reopen one. */
export function HistoryMenu({ workspaceId, onSelect, disabled }: HistoryMenuProps) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: historyQueryKey(workspaceId),
    queryFn: () => apiFetch<QueryHistoryItem[]>(`/api/v1/workspaces/${workspaceId}/queries?limit=25`),
    enabled: open && !!workspaceId,
    staleTime: 15_000,
  });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-purple-900/40 bg-[#06020E] px-2.5 py-1.5 text-xs text-[#C4B7DB] transition-colors hover:border-purple-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 disabled:opacity-50"
      >
        <History className="h-3.5 w-3.5" aria-hidden />
        Previous queries
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Previous queries"
          className="absolute right-0 z-30 mt-1.5 max-h-80 w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-purple-500/30 bg-[#0B0517] p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.7)]"
        >
          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-[#9E93B3]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading history{"…"}
            </div>
          )}
          {isError && (
            <div className="px-3 py-3 text-xs text-rose-300">
              Could not load previous queries.{" "}
              <button type="button" className="underline" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          )}
          {data && data.length === 0 && <div className="px-3 py-3 text-xs text-[#9E93B3]">No previous queries in this workspace yet.</div>}
          {data?.map((item) => (
            <button
              key={item.query_id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => {
                setOpen(false);
                onSelect(item);
              }}
              className="flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors hover:bg-purple-950/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
            >
              <span className="line-clamp-2 text-xs text-[#E6E0F5]">{item.prompt}</span>
              <span className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[#8D829F]">
                <span className={`rounded border px-1.5 py-0.5 ${STATUS_STYLE[item.status] ?? "border-purple-900/40 text-[#9E93B3]"}`}>
                  {item.status}
                </span>
                {item.verification_status && <span>{item.verification_status.replace(/_/g, " ")}</span>}
                {item.claim_count != null && <span>{item.claim_count} claims</span>}
                <span>{new Date(item.created_at).toLocaleString()}</span>
                {!item.has_trace && <span className="text-amber-300/80">no graph recorded</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
