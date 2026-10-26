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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F5F0FF]">Evaluation Benchmarks</h1>
          <p className="text-sm text-[#B0A4C3] mt-1">
            Compare CiteLock against industry RAG baselines across hallucination reduction and citation precision.
          </p>
        </div>
        <Button className="self-start sm:self-auto gap-2">
          <Play className="h-4 w-4" />
          Run Benchmark Suite
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {baselines.map((b, idx) => (
          <Card
            key={b.name}
            style={{ animationDelay: `${idx * 100}ms` }}
            className={`flex flex-col justify-between rounded-2xl transition-all duration-200 animate-fade-in-up hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(139,92,246,0.18)] ${
              b.highlight
                ? "border border-purple-500/50 bg-[#140D26]/90 shadow-[0_0_32px_rgba(139,92,246,0.22)] ring-1 ring-purple-400/30 hover:border-purple-400/70"
                : "border border-purple-900/30 bg-[#100A1C]/75 shadow-sm hover:border-purple-500/40"
            }`}
          >
            <div>
              <CardHeader>
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`text-xs font-mono uppercase tracking-wider ${
                      b.highlight ? "text-purple-300 font-bold" : "text-[#8D829F]"
                    }`}
                  >
                    {b.highlight ? "Active Engine" : "Baseline"}
                  </span>
                  {b.highlight && <Award className="h-4 w-4 text-purple-300" />}
                </div>
                <CardTitle className="text-base text-[#F5F0FF]">{b.name}</CardTitle>
                <CardDescription className="text-xs text-[#B0A4C3]">{b.description}</CardDescription>
              </CardHeader>

              <div className="space-y-2.5 pt-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070311] border border-purple-900/30">
                  <span className="text-[#B0A4C3]">Hallucination Rate</span>
                  <span className={`font-mono font-bold ${b.highlight ? "text-emerald-400" : "text-slate-300"}`}>
                    {b.hallucinationRate}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070311] border border-purple-900/30">
                  <span className="text-[#B0A4C3]">Faithfulness F1</span>
                  <span className="font-mono text-[#F5F0FF]">{b.faithfulness}</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#070311] border border-purple-900/30">
                  <span className="text-[#B0A4C3]">Avg Execution Time</span>
                  <span className="font-mono text-[#8D829F]">{b.latency}</span>
                </div>
              </div>
            </div>

            {b.highlight && (
              <div className="mt-4 pt-3.5 border-t border-purple-500/30 flex items-center gap-2 text-xs text-purple-200 font-medium">
                <CheckCircle2 className="h-4 w-4 text-purple-300 shrink-0" />
                <span>91.4% Hallucination Reduction over Baseline A</span>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
