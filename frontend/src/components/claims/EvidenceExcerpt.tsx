import React from "react";
import { EvidenceLink } from "@/types";
import { Quote } from "lucide-react";

export function EvidenceExcerpt({ evidence }: { evidence: EvidenceLink }) {
  return (
    <div className="rounded-xl border border-purple-900/35 bg-[#070311] p-3.5 text-xs text-[#F5F0FF] shadow-sm">
      <div className="flex items-center gap-2 mb-1.5 text-[#8D829F]">
        <Quote className="h-3.5 w-3.5 text-purple-400" />
        <span className="font-mono text-[10px] text-purple-300">
          Chunk: {evidence.chunk_id.slice(0, 8)}... | Relevance:{" "}
          {evidence.relevance_score ? `${Math.round(evidence.relevance_score * 100)}%` : "N/A"}
        </span>
      </div>
      <p className="italic text-slate-200 leading-relaxed">
        &ldquo;{evidence.exact_quote || "Ground truth passage text excerpt."}&rdquo;
      </p>
    </div>
  );
}
