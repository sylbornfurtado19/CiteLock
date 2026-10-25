"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { auth } from "@/lib/firebase/client";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch (err: any) {
      if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential" || err.code === "auth/invalid-login-credentials") {
        try {
          // Auto-create account if new
          await createUserWithEmailAndPassword(auth, email, password);
          router.push("/dashboard");
          return;
        } catch (createErr: any) {
          setErrorMsg(createErr.message || "Failed to sign in or create account.");
        }
      } else {
        setErrorMsg(err.message || "Authentication failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.push("/dashboard");
    } catch (err: any) {
      setErrorMsg(err.message || "Google authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#05020D] px-4 overflow-hidden">
      {/* Background ambient glow */}
      <div 
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(139,92,246,0.18)_0%,rgba(168,85,247,0.06)_40%,transparent_75%)]" 
        aria-hidden="true"
      />
      <div 
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-purple-600/10 blur-3xl"
        aria-hidden="true"
      />

      <Card className="relative z-10 w-full max-w-md border-purple-500/20 bg-[#100A1C]/80 backdrop-blur-xl p-8 shadow-glow-sm">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-950/60 border border-purple-500/30 text-purple-300 shadow-glow-xs">
            <Shield className="h-7 w-7 text-purple-400" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-purple-100">Sign in to CiteLock</CardTitle>
          <CardDescription className="text-purple-300/70 text-sm mt-1.5">
            Enter your credentials or use Google Auth to access your audited workspaces.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-purple-200/80 mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-purple-400/60" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="auditor@enterprise.com"
                className="w-full rounded-lg border border-purple-900/40 bg-[#070311] pl-10 pr-4 py-2.5 text-sm text-purple-100 placeholder:text-purple-400/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400/50 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-purple-200/80 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-purple-400/60" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-purple-900/40 bg-[#070311] pl-10 pr-4 py-2.5 text-sm text-purple-100 placeholder:text-purple-400/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400/50 transition-all"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-200">
              {errorMsg}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full mt-2 h-10 font-medium">
            {loading ? "Authenticating..." : "Sign In with Email"}
          </Button>
        </form>

        <div className="relative my-6 text-center text-xs text-purple-400/60">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-purple-900/30" />
          </div>
          <span className="relative bg-[#100A1C] px-3 font-mono tracking-wider uppercase">Or continue with</span>
        </div>

        <div className="space-y-2.5">
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={handleGoogleLogin}
            className="w-full h-10 gap-2.5 border-purple-900/40 bg-[#171025] hover:bg-[#1E1435] text-purple-200"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Google Workspace Account
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              try {
                const { signInAnonymously } = await import("firebase/auth");
                await signInAnonymously(auth);
              } catch (e) {
                console.warn("Guest sign in fallback:", e);
              }
              router.push("/dashboard");
            }}
            className="w-full h-10 border border-purple-500/20 bg-purple-950/20 hover:bg-purple-900/30 text-purple-300 text-xs font-mono"
          >
            Continue as Guest / Demo Auditor →
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-purple-400/50 leading-relaxed">
          CiteLock client SDK coordinates authentication state. Token verification occurs via FastAPI on Render.
        </p>
      </Card>
    </div>
  );
}
