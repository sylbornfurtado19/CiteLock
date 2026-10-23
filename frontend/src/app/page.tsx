import Link from "next/link";
import { Shield, Sparkles, Database, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      {/* Navigation */}
      <header className="border-b border-slate-800/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-emerald-400" />
            <span className="text-xl font-bold tracking-tight text-white">CiteLock</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="primary" size="sm">Launch App</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 text-xs font-medium text-emerald-400 mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Self-Correcting RAG & Hallucination Auditor</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl text-white">
            Trust your RAG outputs with <br />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              mathematical citation provenance
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-slate-400 sm:text-lg">
            CiteLock decomposes generated responses into atomic claims, audits every assertion against source documents using structured LLM judges, and self-corrects hallucinations in real time.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link href="/dashboard">
              <Button size="lg" className="gap-2">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">
                View Demo Workspace
              </Button>
            </Link>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="border-t border-slate-800/80 bg-slate-900/30 py-16">
          <div className="mx-auto max-w-6xl px-6 grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <Database className="h-8 w-8 text-emerald-400 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Private Document Vault</h3>
              <p className="text-sm text-slate-400">
                Direct browser-to-FastAPI multipart streaming to private Firebase Storage with strict workspace tenancy and pgvector search.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <Shield className="h-8 w-8 text-emerald-400 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Claim-Level Auditing</h3>
              <p className="text-sm text-slate-400">
                Every proposition is extracted and assigned a rigorous Verdict: supported, contradicted, or unsupported with character-level quote spans.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <CheckCircle className="h-8 w-8 text-emerald-400 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Bounded Self-Correction</h3>
              <p className="text-sm text-slate-400">
                Multi-pass revision loop corrects unsupported assertions or enforces graceful abstention before answers ever reach the user.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-6 text-center text-xs text-slate-500">
        CiteLock • Enterprise Self-Correcting RAG Platform
      </footer>
    </div>
  );
}
