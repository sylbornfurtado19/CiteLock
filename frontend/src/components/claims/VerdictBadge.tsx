import React from "react";
import { Verdict } from "@/types";
import { Badge } from "@/components/ui/badge";

const VERDICT_CONFIG: Record<
  Verdict,
  { label: string; variant: "success" | "warning" | "danger" | "neutral" }
> = {
  supported: { label: "Supported", variant: "success" },
  partially_supported: { label: "Partially Supported", variant: "warning" },
  contradicted: { label: "Contradicted", variant: "danger" },
  unsupported: { label: "Unsupported", variant: "danger" },
  insufficient_evidence: { label: "Insufficient Evidence", variant: "neutral" },
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const config = VERDICT_CONFIG[verdict] || {
    label: verdict,
    variant: "neutral",
  };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
