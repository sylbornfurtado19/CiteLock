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
    <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
          <ShieldCheck className="h-4 w-4" />
          <span>Audited & Self-Corrected Answer</span>
        </div>
        <Link href={`/audits/${answer.id}`}>
          <Button variant="ghost" size="sm" className="text-emerald-400 hover:text-emerald-300 text-xs">
            Inspect Claims & Evidence
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </Link>
      </div>

      <div className="text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">
        {answer.final_text}
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-emerald-950 text-xs text-slate-400">
        <span>Correction passes: {answer.correction_rounds}</span>
        <span>•</span>
        <span>Claims evaluated: {answer.claims?.length || 0}</span>
      </div>
    </div>
  );
}
