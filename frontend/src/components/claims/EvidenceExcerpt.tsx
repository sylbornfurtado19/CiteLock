import React from "react";
import { EvidenceLink } from "@/types";
import { Quote } from "lucide-react";

export function EvidenceExcerpt({ evidence }: { evidence: EvidenceLink }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
      <div className="flex items-center gap-2 mb-1.5 text-slate-400">
        <Quote className="h-3.5 w-3.5 text-emerald-500" />
        <span className="font-mono text-[10px]">
          Chunk: {evidence.chunk_id.slice(0, 8)}... | Relevance:{" "}
          {evidence.relevance_score ? `${Math.round(evidence.relevance_score * 100)}%` : "N/A"}
        </span>
      </div>
      <p className="italic text-slate-200">
        &ldquo;{evidence.exact_quote || "Ground truth passage text excerpt."}&rdquo;
      </p>
    </div>
  );
}
