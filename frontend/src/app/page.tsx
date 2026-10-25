"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Shield,
  Sparkles,
  Database,
  CheckCircle,
  ArrowRight,
  ShieldCheck,
  FileSearch,
  RefreshCw,
  MessageSquare,
  SlidersHorizontal,
  FlaskConical,
  Menu,
  X,
  ExternalLink,
  ChevronRight,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen flex-col bg-[#05020D] text-[#F5F0FF] overflow-x-hidden selection:bg-purple-600 selection:text-white">
      {/* Background Radial Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[650px] bg-ambient-hero pointer-events-none z-0" />

      {/* Floating Header */}
      <header className="sticky top-0 z-50 w-full px-4 sm:px-8 pt-4 pb-2">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-950/80 border border-purple-500/30 shadow-[0_0_16px_rgba(139,92,246,0.3)] transition-transform group-hover:scale-105">
              <Shield className="h-5 w-5 text-purple-300" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-white leading-tight">
                CiteLock
              </span>
              <span className="text-[10px] text-purple-400 font-mono tracking-wider">
                RAG AUDITOR
              </span>
            </div>
          </Link>

          {/* Desktop Floating Navigation Capsule */}
          <nav className="hidden md:flex items-center gap-1.5 rounded-full border border-purple-500/20 bg-[#100A1C]/80 px-5 py-1.5 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
            <a
              href="#features"
              className="px-3 py-1 text-xs font-medium text-[#B0A4C3] hover:text-white transition-colors"
            >
              Features
            </a>
            <Link
              href="/dashboard"
              className="px-3 py-1 text-xs font-medium text-[#B0A4C3] hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/chat"
              className="px-3 py-1 text-xs font-medium text-[#B0A4C3] hover:text-white transition-colors"
            >
              Grounded Chat
            </Link>
            <Link
              href="/documents"
              className="px-3 py-1 text-xs font-medium text-[#B0A4C3] hover:text-white transition-colors"
            >
              Vault
            </Link>
            <Link
              href="/evaluation"
              className="px-3 py-1 text-xs font-medium text-[#B0A4C3] hover:text-white transition-colors"
            >
              Benchmarks
            </Link>
          </nav>

          {/* Action Buttons */}
          <div className="hidden sm:flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-xs text-purple-200">
                Sign In
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="primary" size="sm" className="text-xs">
                Launch App
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-purple-500/25 bg-[#100A1C] text-purple-300 hover:text-white"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-3 mx-auto max-w-md rounded-2xl border border-purple-500/25 bg-[#100A1C]/95 p-5 backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95 duration-150">
            <nav className="flex flex-col space-y-2">
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 text-sm text-[#B0A4C3] hover:text-white rounded-lg hover:bg-purple-950/40"
              >
                Features
              </a>
              <Link
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 text-sm text-[#B0A4C3] hover:text-white rounded-lg hover:bg-purple-950/40"
              >
                Dashboard
              </Link>
              <Link
                href="/chat"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 text-sm text-[#B0A4C3] hover:text-white rounded-lg hover:bg-purple-950/40"
              >
                Grounded Chat
              </Link>
              <Link
                href="/documents"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 text-sm text-[#B0A4C3] hover:text-white rounded-lg hover:bg-purple-950/40"
              >
                Document Vault
              </Link>
              <Link
                href="/evaluation"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 text-sm text-[#B0A4C3] hover:text-white rounded-lg hover:bg-purple-950/40"
              >
                Evaluation Benchmarks
              </Link>
              <div className="pt-3 border-t border-purple-900/40 flex flex-col gap-2">
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    Sign In
                  </Button>
                </Link>
                <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="primary" size="sm" className="w-full text-xs">
                    Launch App
                  </Button>
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Main Hero Section */}
      <main className="flex-1">
        <section className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-16 sm:pt-24 pb-12 text-center">
          {/* Announcement Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/30 bg-purple-950/40 px-3.5 py-1 text-xs font-medium text-purple-200 shadow-[0_0_16px_rgba(168,85,247,0.2)] mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
            <span>SELF-CORRECTING RAG VERIFICATION</span>
          </div>

          {/* Large Hero Display Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-[#F5F0FF] max-w-4xl mx-auto leading-[1.1]">
            Ground every answer with{" "}
            <span className="bg-gradient-to-r from-purple-300 via-violet-300 to-indigo-200 bg-clip-text text-transparent">
              CiteLock.
            </span>
          </h1>

          {/* Supporting Text */}
          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-[#B0A4C3] leading-relaxed">
            Verify claims, trace evidence, and audit every correction before responses reach users.
          </p>

          {/* Hero CTAs */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/dashboard">
              <Button size="lg" className="gap-2 text-sm shadow-[0_0_30px_rgba(139,92,246,0.45)]">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="text-sm">
                Sign In
              </Button>
            </Link>
          </div>

          {/* Luminous Neon Arch / Halo Visual Behind Product Preview */}
          <div className="relative mt-20 sm:mt-28">
            {/* The Elliptical Luminous Purple Halo */}
            <div className="neon-halo-arch -top-24 sm:-top-32" />
            <div className="neon-halo-rim -top-16 sm:-top-24" />

            {/* Product-Preview Console Window */}
            <div className="relative z-10 mx-auto max-w-5xl rounded-2xl border border-purple-500/25 bg-[#0D0719]/90 backdrop-blur-2xl p-4 sm:p-6 shadow-[0_24px_80px_rgba(0,0,0,0.85)] text-left">
              {/* Console Window Header */}
              <div className="flex items-center justify-between border-b border-purple-900/40 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-rose-500/80" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 text-xs font-mono text-[#8D829F]">
                    citelock-auditor // workspace-001
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-950/60 px-2.5 py-0.5 text-[10px] font-mono font-medium text-purple-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    GROUNDED PROVENANCE VERIFIED
                  </span>
                </div>
              </div>

              {/* Console Body Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left Mini-Rail: Source Citations */}
                <div className="lg:col-span-4 rounded-xl border border-purple-900/30 bg-[#100A1C]/70 p-3.5 space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-mono text-purple-300">
                    <span>SOURCE EVIDENCE</span>
                    <span className="text-emerald-400">pgvector cosine: 0.984</span>
                  </div>
                  <div className="rounded-lg border border-purple-900/40 bg-[#070311] p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-[#8D829F] font-mono">
                      <span>Chunk #8b1c4e</span>
                      <span>10-K_Annual_Report.pdf</span>
                    </div>
                    <p className="text-slate-300 italic text-[11px] leading-relaxed">
                      &ldquo;Q3 enterprise operational revenue expanded by 14.2% YoY, driven by multi-year cloud compliance agreements.&rdquo;
                    </p>
                  </div>
                  <div className="rounded-lg border border-purple-900/40 bg-[#070311] p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-[#8D829F] font-mono">
                      <span>Chunk #a90f22</span>
                      <span>Balance_Sheet_Q3.pdf</span>
                    </div>
                    <p className="text-slate-300 italic text-[11px] leading-relaxed">
                      &ldquo;Operating expenditures remained strictly bounded within the forecasted $4.2M envelope.&rdquo;
                    </p>
                  </div>
                </div>

                {/* Right Area: Claim-Level Verification */}
                <div className="lg:col-span-8 rounded-xl border border-purple-900/30 bg-[#100A1C]/70 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-purple-200">
                      SYNTHESIZED DRAFT & CLAIM VERIFICATION
                    </span>
                    <span className="text-xs font-mono text-emerald-400">
                      Hallucination Rate: 0.0%
                    </span>
                  </div>

                  {/* Verified Text Excerpt */}
                  <div className="rounded-lg border border-purple-900/30 bg-[#070311] p-3.5 text-xs text-purple-100 leading-relaxed">
                    According to the audited Q3 reports, enterprise operational revenue expanded by 14.2% year-over-year. Operating expenditures remained within the forecasted $4.2M envelope, corroborated by multi-year cloud compliance contracts.
                  </div>

                  {/* Decomposed Atomic Claims */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between rounded-lg border border-emerald-500/25 bg-emerald-950/20 p-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span className="text-slate-200">
                          Claim 1: Operational revenue grew by 14.2% YoY.
                        </span>
                      </div>
                      <span className="rounded-full bg-emerald-950 border border-emerald-800 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                        Supported • 100%
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-emerald-500/25 bg-emerald-950/20 p-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span className="text-slate-200">
                          Claim 2: Operating expenditures bounded at $4.2M.
                        </span>
                      </div>
                      <span className="rounded-full bg-emerald-950 border border-emerald-800 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                        Supported • 100%
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-purple-500/25 bg-purple-950/20 p-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-3.5 w-3.5 text-purple-300 shrink-0" />
                        <span className="text-slate-200">
                          Claim 3: Growth attributed to compliance contracts.
                        </span>
                      </div>
                      <span className="rounded-full bg-purple-950 border border-purple-800 px-2 py-0.5 text-[10px] font-medium text-purple-300">
                        Self-Corrected (Pass 1)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 8-Item Feature Grid */}
        <section id="features" className="border-t border-purple-900/25 bg-[#080412]/50 py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <span className="text-xs font-mono uppercase tracking-widest text-purple-400 block mb-2">
                ARCHITECTURAL CAPABILITIES
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                Engineered for zero ungrounded hallucinations
              </h2>
              <p className="mt-3 text-sm text-[#B0A4C3]">
                CiteLock decouples synthesis from auditing, verifying propositions against mathematical vector bounds before end users ever see a response.
              </p>
            </div>

            {/* The 8 Items Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Item 1 */}
              <div className="rounded-xl border border-purple-900/25 bg-[#100A1C]/60 p-6 hover:border-purple-500/30 hover:bg-[#171025]/80 transition-all">
                <div className="h-10 w-10 rounded-lg bg-purple-950/70 border border-purple-800/50 flex items-center justify-center text-purple-300 mb-4">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1.5">
                  Claim-Level Verification
                </h3>
                <p className="text-xs text-[#B0A4C3] leading-relaxed">
                  Break generated answers into verifiable atomic claims with structured LLM judges.
                </p>
              </div>

              {/* Item 2 */}
              <div className="rounded-xl border border-purple-900/25 bg-[#100A1C]/60 p-6 hover:border-purple-500/30 hover:bg-[#171025]/80 transition-all">
                <div className="h-10 w-10 rounded-lg bg-purple-950/70 border border-purple-800/50 flex items-center justify-center text-purple-300 mb-4">
                  <FileSearch className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1.5">
                  Source-Linked Evidence
                </h3>
                <p className="text-xs text-[#B0A4C3] leading-relaxed">
                  Inspect evidence associated with individual claims with exact character offsets.
                </p>
              </div>

              {/* Item 3 */}
              <div className="rounded-xl border border-purple-900/25 bg-[#100A1C]/60 p-6 hover:border-purple-500/30 hover:bg-[#171025]/80 transition-all">
                <div className="h-10 w-10 rounded-lg bg-purple-950/70 border border-purple-800/50 flex items-center justify-center text-purple-300 mb-4">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1.5">
                  Self-Correcting Answers
                </h3>
                <p className="text-xs text-[#B0A4C3] leading-relaxed">
                  Review the bounded correction process that critiques failed assertions in real time.
                </p>
              </div>

              {/* Item 4 */}
              <div className="rounded-xl border border-purple-900/25 bg-[#100A1C]/60 p-6 hover:border-purple-500/30 hover:bg-[#171025]/80 transition-all">
                <div className="h-10 w-10 rounded-lg bg-purple-950/70 border border-purple-800/50 flex items-center justify-center text-purple-300 mb-4">
                  <Database className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1.5">
                  Document Vault
                </h3>
                <p className="text-xs text-[#B0A4C3] leading-relaxed">
                  Manage documents streamed directly to private storage and embedded in pgvector.
                </p>
              </div>

              {/* Item 5 */}
              <div className="rounded-xl border border-purple-900/25 bg-[#100A1C]/60 p-6 hover:border-purple-500/30 hover:bg-[#171025]/80 transition-all">
                <div className="h-10 w-10 rounded-lg bg-purple-950/70 border border-purple-800/50 flex items-center justify-center text-purple-300 mb-4">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1.5">
                  Grounded Q&A
                </h3>
                <p className="text-xs text-[#B0A4C3] leading-relaxed">
                  Submit questions and inspect verified answers with full citation provenance.
                </p>
              </div>

              {/* Item 6 */}
              <div className="rounded-xl border border-purple-900/25 bg-[#100A1C]/60 p-6 hover:border-purple-500/30 hover:bg-[#171025]/80 transition-all">
                <div className="h-10 w-10 rounded-lg bg-purple-950/70 border border-purple-800/50 flex items-center justify-center text-purple-300 mb-4">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1.5">
                  Audit Trails
                </h3>
                <p className="text-xs text-[#B0A4C3] leading-relaxed">
                  Examine claims, verdicts, corrections, and export compliance-ready JSON logs.
                </p>
              </div>

              {/* Item 7 */}
              <div className="rounded-xl border border-purple-900/25 bg-[#100A1C]/60 p-6 hover:border-purple-500/30 hover:bg-[#171025]/80 transition-all">
                <div className="h-10 w-10 rounded-lg bg-purple-950/70 border border-purple-800/50 flex items-center justify-center text-purple-300 mb-4">
                  <FlaskConical className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1.5">
                  Evaluation Benchmarks
                </h3>
                <p className="text-xs text-[#B0A4C3] leading-relaxed">
                  Compare CiteLock against plain RAG and single-pass baselines across hallucination metrics.
                </p>
              </div>

              {/* Item 8 */}
              <div className="rounded-xl border border-purple-900/25 bg-[#100A1C]/60 p-6 hover:border-purple-500/30 hover:bg-[#171025]/80 transition-all">
                <div className="h-10 w-10 rounded-lg bg-purple-950/70 border border-purple-800/50 flex items-center justify-center text-purple-300 mb-4">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1.5">
                  Governance Controls
                </h3>
                <p className="text-xs text-[#B0A4C3] leading-relaxed">
                  Review the existing system policies, maximum retry limits, and abstention thresholds.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-purple-900/25 bg-[#05020D] px-6 py-8 text-center text-xs text-[#8D829F]">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-purple-400" />
            <span className="font-semibold text-purple-200">CiteLock</span>
            <span>• Self-Correcting RAG & Hallucination Auditor</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-[#B0A4C3]">
            <Link href="/dashboard" className="hover:text-white transition-colors">
              App
            </Link>
            <Link href="/login" className="hover:text-white transition-colors">
              Sign In
            </Link>
            <a href="#features" className="hover:text-white transition-colors">
              Features
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
