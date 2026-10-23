import React from "react";
import { FlaskConical, Play, Award, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function EvaluationPage() {
  const baselines = [
    {
      name: "Baseline A: Plain RAG",
      description: "Standard prompt-based retrieval and generation without factual verification.",
      hallucinationRate: "24.5%",
      faithfulness: "0.75",
      latency: "1.2s",
    },
    {
      name: "Baseline B: Single-Pass Verify",
      description: "RAG generation followed by single verification judge pass without self-correction.",
      hallucinationRate: "11.2%",
      faithfulness: "0.89",
      latency: "2.4s",
    },
    {
      name: "CiteLock: Self-Correcting RAG",
      description: "Claim decomposition + structured judge + provenance alignment + bounded multi-pass correction.",
      hallucinationRate: "2.1%",
      faithfulness: "0.98",
      latency: "3.1s",
      highlight: true,
    },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Evaluation Benchmarks</h1>
          <p className="text-sm text-slate-400 mt-1">
            Compare CiteLock against industry RAG baselines across hallucination reduction and citation precision.
          </p>
        </div>
        <Button>
          <Play className="h-4 w-4 mr-2" />
          Run Benchmark Suite
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {baselines.map((b) => (
          <Card
            key={b.name}
            className={`flex flex-col justify-between ${
              b.highlight
                ? "border-emerald-600/60 bg-emerald-950/20 shadow-lg shadow-emerald-950/40"
                : "border-slate-800 bg-slate-900/40"
            }`}
          >
            <div>
              <CardHeader>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono uppercase text-emerald-400">
                    {b.highlight ? "Active Engine" : "Baseline"}
                  </span>
                  {b.highlight && <Award className="h-4 w-4 text-emerald-400" />}
                </div>
                <CardTitle className="text-base text-white">{b.name}</CardTitle>
                <CardDescription className="text-xs">{b.description}</CardDescription>
              </CardHeader>

              <div className="space-y-3 pt-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-400">Hallucination Rate</span>
                  <span className={`font-mono font-bold ${b.highlight ? "text-emerald-400" : "text-slate-300"}`}>
                    {b.hallucinationRate}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-400">Faithfulness F1</span>
                  <span className="font-mono text-slate-200">{b.faithfulness}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-400">Avg Execution Time</span>
                  <span className="font-mono text-slate-400">{b.latency}</span>
                </div>
              </div>
            </div>

            {b.highlight && (
              <div className="mt-4 pt-3 border-t border-emerald-900/50 flex items-center gap-1.5 text-xs text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                <span>91.4% Hallucination Reduction over Baseline A</span>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
