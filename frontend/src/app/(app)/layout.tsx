"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  LayoutDashboard,
  Files,
  MessageSquare,
  FileSearch,
  SlidersHorizontal,
  FlaskConical,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Documents", href: "/documents", icon: Files },
  { label: "Grounded Chat", href: "/chat", icon: MessageSquare },
  { label: "Audits", href: "/audits/demo-audit-001", icon: FileSearch },
  { label: "Evaluation", href: "/evaluation", icon: FlaskConical },
  { label: "Settings", href: "/settings", icon: SlidersHorizontal },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on navigation change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const renderNavLinks = () => (
    <nav className="p-3 space-y-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href.split("/demo")[0]);

        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isActive
                ? "bg-purple-950/70 text-purple-200 border border-purple-500/35 shadow-[0_0_14px_rgba(139,92,246,0.18)]"
                : "text-[#B0A4C3] hover:text-white hover:bg-purple-950/30"
            }`}
          >
            <Icon
              className={`h-4 w-4 ${
                isActive ? "text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]" : "text-[#8D829F]"
              }`}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-[#05020D] text-[#F5F0FF]">
      {/* Mobile Top Navigation Bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-purple-900/30 bg-[#0B0616]/90 backdrop-blur-md sticky top-0 z-40">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-950 border border-purple-500/30">
            <Shield className="h-4 w-4 text-purple-300" />
          </div>
          <span className="text-base font-bold tracking-tight text-white">CiteLock</span>
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle Navigation Drawer"
          className="p-2 rounded-lg border border-purple-500/25 bg-[#100A1C] text-purple-300 hover:text-white"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex w-64 border-r border-purple-900/25 bg-[#080412]/95 flex-col justify-between shrink-0 sticky top-0 h-screen">
        <div>
          {/* Logo Brand Box */}
          <Link
            href="/"
            className="flex items-center gap-2.5 px-6 py-5 border-b border-purple-900/25 hover:bg-purple-950/20 transition-colors"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-950/80 border border-purple-500/40 shadow-[0_0_12px_rgba(139,92,246,0.3)]">
              <Shield className="h-5 w-5 text-purple-300" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-white leading-tight">
                CiteLock
              </span>
              <span className="text-[10px] text-purple-400 font-mono tracking-wider">
                v0.1.0 • AUDITOR
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          {renderNavLinks()}
        </div>

        {/* User Profile & Logout */}
        <div className="p-4 border-t border-purple-900/25 bg-[#0B0616]/60 flex items-center justify-between">
          <div className="flex flex-col truncate pr-2">
            <span className="text-xs font-medium text-[#F5F0FF] truncate">
              {user?.email || "Auditor (Demo Mode)"}
            </span>
            <span className="text-[10px] text-[#8D829F] font-mono">Default Workspace</span>
          </div>
          <button
            onClick={() => logout()}
            title="Log Out"
            aria-label="Log Out"
            className="rounded-lg p-2 text-purple-300 hover:bg-purple-950/60 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative w-72 max-w-[80vw] bg-[#0B0616] border-r border-purple-900/40 flex flex-col justify-between h-full z-10 shadow-2xl animate-in slide-in-from-left duration-200">
            <div>
              <div className="flex items-center justify-between px-5 py-4 border-b border-purple-900/30">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-purple-300" />
                  <span className="text-base font-bold text-white">CiteLock</span>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close Navigation Drawer"
                  className="p-1 text-purple-300 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {renderNavLinks()}
            </div>

            <div className="p-4 border-t border-purple-900/30 bg-[#070311] flex items-center justify-between">
              <div className="flex flex-col truncate pr-2">
                <span className="text-xs font-medium text-white truncate">
                  {user?.email || "Auditor (Demo Mode)"}
                </span>
                <span className="text-[10px] text-[#8D829F] font-mono">Default Workspace</span>
              </div>
              <button
                onClick={() => logout()}
                title="Log Out"
                aria-label="Log Out"
                className="rounded-lg p-2 text-purple-300 hover:bg-purple-950 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#05020D] text-[#F5F0FF]">{children}</main>
    </div>
  );
}
