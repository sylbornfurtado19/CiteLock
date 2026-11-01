"use client";

import React, { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace";
import { Workspace } from "@/types";
import { Plus, Loader2, AlertCircle } from "lucide-react";
import { notify } from "@/components/ui/toast";

interface CreateWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (workspace: Workspace) => void;
}

export function CreateWorkspaceModal({
  open,
  onClose,
  onSuccess,
}: CreateWorkspaceModalProps) {
  const { createWorkspace } = useWorkspace();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setDescription("");
    setValidationError(null);
    setApiError(null);
    setLoading(false);
  };

  const handleClose = () => {
    if (loading) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setApiError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setValidationError("Workspace name is required.");
      return;
    }
    if (trimmedName.length < 2) {
      setValidationError("Workspace name must be at least 2 characters.");
      return;
    }
    if (trimmedName.length > 255) {
      setValidationError("Workspace name must not exceed 255 characters.");
      return;
    }

    const toastId = `create-ws-${Date.now()}`;
    try {
      setLoading(true);
      notify.loading(`Provisioning "${trimmedName}"...`, {
        id: toastId,
        description: "Configuring isolated tenant environment and vector namespace...",
      });

      const newWs = await createWorkspace(trimmedName, description.trim() || undefined);
      resetForm();
      notify.success("Workspace Created", {
        id: toastId,
        description: `"${newWs.name}" is now active and ready for document ingestion.`,
      });

      if (onSuccess) {
        onSuccess(newWs);
      }
      onClose();
    } catch (err: unknown) {
      console.error("Failed to create workspace:", err);
      const message =
        err instanceof Error
          ? err.message
          : "Failed to create workspace. Please check your network connection and try again.";
      setApiError(message);
      notify.error("Workspace Creation Failed", err, {
        id: toastId,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} title="Create Isolated Workspace">
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <p className="text-xs text-[#B0A4C3] leading-relaxed">
          Provision an isolated tenant environment for document ingestion, vector indexing,
          and fact-verification auditing. All claims and documents remain private to this workspace.
        </p>

        {apiError && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1 font-sans">{apiError}</div>
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor="workspace-name-input"
            className="block text-xs font-semibold text-[#F5F0FF] uppercase tracking-wider"
          >
            Workspace Name <span className="text-purple-400">*</span>
          </label>
          <input
            id="workspace-name-input"
            type="text"
            required
            autoFocus
            maxLength={255}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (validationError) setValidationError(null);
            }}
            placeholder="e.g. Legal Compliance Audit 2026"
            className={`w-full rounded-xl border bg-[#080412] px-3.5 py-2.5 text-sm text-[#F5F0FF] placeholder-[#8D829F] focus:outline-none transition-all duration-200 ${
              validationError
                ? "border-rose-500/60 focus:border-rose-400 focus:ring-1 focus:ring-rose-400/30"
                : "border-purple-900/40 focus:border-purple-400/80 focus:ring-1 focus:ring-purple-400/30"
            }`}
          />
          {validationError && (
            <p className="text-[11px] text-rose-400 font-medium pl-1">{validationError}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="workspace-description-input"
            className="block text-xs font-semibold text-[#B0A4C3] uppercase tracking-wider"
          >
            Description <span className="text-[10px] text-[#8D829F] lowercase font-normal">(optional)</span>
          </label>
          <textarea
            id="workspace-description-input"
            rows={3}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. SEC 10-K and internal policy review corpus."
            className="w-full rounded-xl border border-purple-900/40 bg-[#080412] px-3.5 py-2.5 text-sm text-[#F5F0FF] placeholder-[#8D829F] focus:border-purple-400/80 focus:outline-none focus:ring-1 focus:ring-purple-400/30 transition-all duration-200 resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-purple-900/30">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={loading}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={loading || !name.trim()}
            className="text-xs gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-[0_0_16px_rgba(147,51,234,0.35)]"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Provisioning...
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                Create Workspace
              </>
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
