"use client";

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UploadDropzone } from "@/components/documents/UploadDropzone";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { SourceViewer } from "@/components/documents/SourceViewer";
import { Document } from "@/types";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkeletonTableRow } from "@/components/ui/skeleton";
import { useWorkspace } from "@/lib/workspace";
import { notify } from "@/components/ui/toast";
import {
  useWorkspaceDocuments,
  useDeleteDocumentMutation,
  useReprocessDocumentMutation,
  queryKeys,
} from "@/lib/query";

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(new Set());

  // TanStack Query: 30s stale time, background revalidation, auto-polling on pending statuses
  const {
    data: documents = [],
    isLoading,
    isFetching,
    refetch,
  } = useWorkspaceDocuments(workspaceId);

  const deleteMutation = useDeleteDocumentMutation(workspaceId);
  const reprocessMutation = useReprocessDocumentMutation(workspaceId);

  const pendingCount = documents.filter((d) =>
    ["uploaded", "processing", "pending"].includes(d.status)
  ).length;
  const isPolling = isFetching && pendingCount > 0;
  const isInitialLoading = (workspaceLoading || isLoading) && documents.length === 0;

  const handleManualRefresh = async () => {
    try {
      const result = await refetch();
      const count = result.data?.length ?? 0;
      notify.info("Document Vault Synchronized", {
        description: `${count} indexed document${count === 1 ? "" : "s"} found in workspace vault.`,
        duration: 3000,
      });
    } catch (err) {
      console.error("Failed to refresh documents:", err);
      notify.error("Failed to Refresh Documents", err);
    }
  };

  const handleUploadSuccess = (newDoc: Document) => {
    // Optimistically update query cache and invalidate dependent queries
    queryClient.setQueryData(
      queryKeys.documents.list(workspaceId),
      (prev: Document[] | undefined) => {
        if (!prev) return [newDoc];
        return [newDoc, ...prev.filter((d) => d.id !== newDoc.id)];
      }
    );
    queryClient.invalidateQueries({
      queryKey: queryKeys.analytics.all(workspaceId),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.documents.all(workspaceId),
    });
  };

  const handleReprocess = async (docId: string) => {
    const doc = documents.find((d) => d.id === docId);
    const docTitle = doc?.filename || "Document";
    const toastId = `reprocess-${docId}`;

    setReprocessingIds((prev) => new Set(prev).add(docId));
    notify.loading(`Reprocessing "${docTitle}"...`, {
      id: toastId,
      description: "Requesting server-side re-extraction and pgvector chunking...",
    });

    try {
      await reprocessMutation.mutateAsync({ documentId: docId });
      notify.info("Indexing In Progress", {
        id: toastId,
        description: `"${docTitle}" is being parsed and re-embedded into pgvector.`,
      });
    } catch (err) {
      console.error("Reprocess error:", err);
      notify.error("Reprocess Failed", err, { id: toastId });
    } finally {
      setReprocessingIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  const handleDelete = async (docId: string) => {
    const targetDoc = documents.find((d) => d.id === docId);
    const docTitle = targetDoc?.filename || "Document";
    const toastId = `delete-doc-${docId}`;

    notify.loading(`Deleting "${docTitle}"...`, {
      id: toastId,
      description: "Removing chunks from pgvector and deleting storage blob...",
    });

    try {
      await deleteMutation.mutateAsync(docId);
      notify.success("Document Deleted", {
        id: toastId,
        description: `"${docTitle}" and its associated embeddings were permanently deleted.`,
      });
    } catch (err) {
      console.error("Failed to delete document:", err);
      notify.error("Failed to Delete Document", err, {
        id: toastId,
        action: {
          label: "Retry",
          onClick: () => {
            handleDelete(docId);
          },
        },
      });
    }
  };

  if (!workspaceLoading && !currentWorkspace) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-950/60 border border-purple-500/30 text-purple-300 shadow-[0_0_24px_rgba(139,92,246,0.25)]">
          <RefreshCw className="h-8 w-8 text-purple-400" />
        </div>
        <h2 className="text-xl font-bold text-[#F5F0FF]">No Active Workspace Found</h2>
        <p className="text-sm text-[#B0A4C3] max-w-md">
          Please select or create an isolated workspace using the tenant selector in the sidebar to view and manage documents.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F5F0FF]">Document Vault</h1>
          <p className="text-sm text-[#B0A4C3] mt-1">
            Upload and index reference documents. Files are stored in private Firebase Storage and embedded into Neon pgvector.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Live Auto-Polling Status Badge */}
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-purple-500/35 bg-purple-950/60 text-xs text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.25)] animate-fade-in">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
              <span className="font-mono text-[11px] font-medium">
                Auto-syncing {pendingCount} document{pendingCount === 1 ? "" : "s"}...
              </span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isFetching}
            className="text-xs self-start sm:self-auto"
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5 text-purple-400" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5 text-purple-300" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* Upload Zone */}
      <UploadDropzone
        workspaceId={workspaceId}
        onUploadSuccess={handleUploadSuccess}
      />

      {/* Document Registry Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#F5F0FF]">
            Indexed Documents ({isLoading && documents.length === 0 ? "..." : documents.length})
          </h3>
          {isFetching && (
            <span className="text-xs font-mono text-purple-300/80">
              Synchronizing vector embeddings...
            </span>
          )}
        </div>

        {isInitialLoading ? (
          <div className="overflow-x-auto rounded-2xl border border-purple-900/30 bg-[#100A1C]/75 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md">
            <table className="w-full text-left text-sm text-[#F5F0FF]">
              <thead className="border-b border-purple-900/40 bg-[#0B0616]/90 text-xs font-mono uppercase tracking-wider text-[#B0A4C3]">
                <tr>
                  <th className="px-4 sm:px-6 py-3.5">Document Name</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Size</th>
                  <th className="px-4 py-3.5">Format</th>
                  <th className="px-4 sm:px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-900/20">
                {[1, 2, 3, 4].map((i) => (
                  <SkeletonTableRow key={i} variant="document" />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <DocumentTable
            documents={documents}
            onViewSource={(doc) => setSelectedDoc(doc)}
            onDeleteDocument={handleDelete}
            onReprocessDocument={handleReprocess}
            reprocessingIds={reprocessingIds}
          />
        )}
      </div>

      {/* Signed URL Preview Dialog */}
      <SourceViewer
        workspaceId={workspaceId}
        document={selectedDoc}
        onClose={() => setSelectedDoc(null)}
      />
    </div>
  );
}
