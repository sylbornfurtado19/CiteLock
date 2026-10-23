import React from "react";
import { Claim } from "@/types";
import { VerdictBadge } from "./VerdictBadge";
import { EvidenceExcerpt } from "./EvidenceExcerpt";
import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

export function ClaimCard({ claim }: { claim: Claim }) {
  const getIcon = () => {
    switch (claim.verdict) {
      case "supported":
        return <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />;
      case "partially_supported":
        return <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />;
      case "contradicted":
      case "unsupported":
        return <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />;
      default:
        return <Info className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />;
    }
  };

  return (
    <Card className="space-y-3 border-slate-800 bg-slate-900/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {getIcon()}
          <div>
            <span className="text-xs font-mono text-slate-500 uppercase tracking-wider block mb-1">
              Claim #{claim.claim_index + 1}
            </span>
            <p className="text-sm font-medium text-slate-100">{claim.claim_text}</p>
          </div>
        </div>
        <VerdictBadge verdict={claim.verdict} />
      </div>

      {claim.rationale && (
        <p className="text-xs text-slate-400 pl-6 border-l border-slate-800">
          <span className="font-semibold text-slate-300">Auditor Rationale: </span>
          {claim.rationale}
        </p>
      )}

      {claim.evidence_links && claim.evidence_links.length > 0 && (
        <div className="pl-6 space-y-2 pt-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
            Supporting Evidence ({claim.evidence_links.length})
          </span>
          {claim.evidence_links.map((link) => (
            <EvidenceExcerpt key={link.id} evidence={link} />
          ))}
        </div>
      )}
    </Card>
  );
}
