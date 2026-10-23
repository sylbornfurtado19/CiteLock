"use client";

import React from "react";
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

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/40 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-2.5 px-6 py-5 border-b border-slate-800">
            <Shield className="h-6 w-6 text-emerald-400" />
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-white leading-tight">CiteLock</span>
              <span className="text-[10px] text-emerald-400 font-mono">v0.1.0 • AUDITOR</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
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
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60"
                      : "text-slate-400 hover:text-white hover:bg-slate-850/60"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-emerald-400" : "text-slate-400"}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between">
          <div className="flex flex-col truncate pr-2">
            <span className="text-xs font-medium text-white truncate">
              {user?.email || "Auditor (Demo Mode)"}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Default Workspace</span>
          </div>
          <button
            onClick={() => logout()}
            title="Log Out"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
