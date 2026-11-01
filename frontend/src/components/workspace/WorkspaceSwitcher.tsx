"use client";

import React, { useState, useRef, useEffect } from "react";
import { useWorkspace } from "@/lib/workspace";
import { CreateWorkspaceModal } from "./CreateWorkspaceModal";
import {
  ChevronsUpDown,
  Check,
  Plus,
  Loader2,
  FolderOpen,
  Sparkles,
  Building2,
} from "lucide-react";

/**
 * Derives a 1-2 character monogram from a workspace name.
 */
function getWorkspaceInitials(name: string): string {
  if (!name) return "CL";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

interface WorkspaceSwitcherProps {
  compact?: boolean;
  className?: string;
}

export function WorkspaceSwitcher({ compact = false, className = "" }: WorkspaceSwitcherProps) {
  const { workspaces, currentWorkspace, isLoading, switchWorkspace } = useWorkspace();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  // Close dropdown on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && dropdownOpen) {
        setDropdownOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dropdownOpen]);

  return (
    <>
      <div ref={containerRef} className={`relative ${className}`}>
        {/* Switcher Trigger Button */}
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          disabled={isLoading}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
          aria-label="Select Workspace"
          className={`group flex items-center justify-between w-full rounded-xl border border-purple-500/25 bg-[#0D0819]/90 px-3 py-2 text-left shadow-sm backdrop-blur-md transition-all duration-200 hover:border-purple-400/50 hover:bg-purple-950/40 hover:shadow-[0_0_16px_rgba(139,92,246,0.18)] active:scale-[0.99] ${
            dropdownOpen ? "border-purple-400/70 ring-1 ring-purple-400/40" : ""
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0 pr-1">
            {isLoading ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-950/70 border border-purple-500/30">
                <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
              </div>
            ) : currentWorkspace ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-700 to-indigo-900 border border-purple-400/40 font-mono text-xs font-bold text-white shadow-[0_0_10px_rgba(147,51,234,0.3)]">
                {getWorkspaceInitials(currentWorkspace.name)}
              </div>
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-950/40 border border-purple-900/50 text-[#8D829F]">
                <Building2 className="h-4 w-4" />
              </div>
            )}

            {!compact && (
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-[#F5F0FF] truncate leading-tight group-hover:text-white">
                  {isLoading
                    ? "Loading workspaces..."
                    : currentWorkspace
                    ? currentWorkspace.name
                    : "No workspace selected"}
                </span>
                <span className="text-[10px] text-[#8D829F] font-mono leading-none mt-0.5 truncate">
                  {currentWorkspace?.description || "Audited Tenant"}
                </span>
              </div>
            )}
          </div>

          <ChevronsUpDown className="h-4 w-4 shrink-0 text-[#8D829F] transition-colors duration-150 group-hover:text-purple-300" />
        </button>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div
            role="listbox"
            className="absolute left-0 right-0 top-full mt-1.5 z-50 w-full min-w-[240px] rounded-2xl border border-purple-500/35 bg-[#0D0819] p-1.5 shadow-[0_16px_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-fade-in"
          >
            {/* Header info */}
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-purple-900/30">
              <span className="text-[10px] font-semibold text-[#8D829F] uppercase tracking-wider">
                Workspaces
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950/80 border border-purple-500/30 text-purple-300">
                {workspaces.length} active
              </span>
            </div>

            {/* Workspaces list */}
            <div className="max-h-56 overflow-y-auto py-1 space-y-1">
              {workspaces.length === 0 ? (
                <div className="p-3 text-center text-xs text-[#8D829F]">
                  <FolderOpen className="h-5 w-5 mx-auto mb-1 text-purple-400/60" />
                  No workspaces found.
                </div>
              ) : (
                workspaces.map((ws) => {
                  const isActive = currentWorkspace?.id === ws.id;
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => {
                        switchWorkspace(ws.id);
                        setDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition-all duration-150 ${
                        isActive
                          ? "bg-purple-950/80 text-purple-100 border border-purple-500/40 shadow-[0_0_12px_rgba(139,92,246,0.2)]"
                          : "text-[#B0A4C3] hover:bg-purple-950/40 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold ${
                            isActive
                              ? "bg-purple-600 text-white shadow-sm"
                              : "bg-purple-950/70 border border-purple-500/30 text-purple-300"
                          }`}
                        >
                          {getWorkspaceInitials(ws.name)}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate text-[#F5F0FF]">
                            {ws.name}
                          </span>
                          {ws.description && (
                            <span className="text-[10px] text-[#8D829F] truncate">
                              {ws.description}
                            </span>
                          )}
                        </div>
                      </div>

                      {isActive && (
                        <Check className="h-4 w-4 shrink-0 text-purple-400 drop-shadow-[0_0_6px_rgba(192,132,252,0.8)]" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Bottom Actions */}
            <div className="border-t border-purple-900/30 pt-1 mt-1">
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  setCreateModalOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-purple-300 hover:bg-purple-950/60 hover:text-white transition-all duration-150"
              >
                <Plus className="h-4 w-4 text-purple-400" />
                <span>Create Workspace</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <CreateWorkspaceModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />
    </>
  );
}

