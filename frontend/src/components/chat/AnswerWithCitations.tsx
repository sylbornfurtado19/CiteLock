"use client";

import React from "react";
import Link from "next/link";
import { Answer } from "@/types";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AnswerWithCitations({
  workspaceId,
  answer,
}: {
  workspaceId: string;
  answer: Answer;
}) {
  return (
    <div className="rounded-2xl border border-purple-500/30 bg-[#120B22]/90 p-5 space-y-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-mono font-medium tracking-wide text-purple-300">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-purple-950 border border-purple-500/40">
            <ShieldCheck className="h-3.5 w-3.5 text-purple-300" />
          </div>
          <span>Audited & Self-Corrected Answer</span>
        </div>
        <Link href={`/audits/${answer.id}`}>
          <Button
            variant="ghost"
            size="sm"
            className="text-purple-300 hover:text-white text-xs bg-purple-950/40 border border-purple-500/20 hover:border-purple-400/40"
          >
            Inspect Claims & Evidence
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </Link>
      </div>

      <div className="text-sm leading-relaxed text-[#F5F0FF] whitespace-pre-wrap">
        {answer.final_text}
      </div>

      <div className="flex items-center gap-3 pt-2.5 border-t border-purple-900/30 text-xs text-[#8D829F] font-mono">
        <span>Correction passes: {answer.correction_rounds}</span>
        <span>•</span>
        <span>Claims evaluated: {answer.claims?.length || 0}</span>
      </div>
    </div>
  );
}
