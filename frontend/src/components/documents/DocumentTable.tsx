"use client";

import React from "react";
import { Document } from "@/types";
import { formatBytes } from "@/lib/utils";
import {
  FileText,
  ExternalLink,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function DocumentTable({
  documents,
  onViewSource,
  onDeleteDocument,
  onReprocessDocument,
  reprocessingIds = new Set(),
}: {
  documents: Document[];
  onViewSource: (doc: Document) => void;
  onDeleteDocument: (docId: string) => void;
  onReprocessDocument?: (docId: string) => void;
  reprocessingIds?: Set<string>;
}) {
  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border border-purple-900/25 bg-[#100A1C]/60 p-12 text-center text-[#8D829F] text-sm backdrop-blur-md">
        No documents uploaded to this workspace yet. Upload reference files to begin grounded auditing.
      </div>
    );
  }

  const renderStatusBadge = (doc: Document) => {
    const isReprocessing = reprocessingIds.has(doc.id);
    const status = isReprocessing ? "processing" : doc.status;

    switch (status) {
      case "indexed":
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge
              variant="success"
              className="inline-flex items-center gap-1.5 py-0.5 px-2.5 bg-emerald-950/80 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
              <span>Indexed</span>
            </Badge>
            {doc.metadata?.chunk_count && (
              <span className="text-[10px] font-mono text-[#8D829F] pl-1">
                {doc.metadata.chunk_count} vector chunks
              </span>
            )}
          </div>
        );

      case "processing":
      case "pending":
        return (
          <Badge
            variant="warning"
            className="inline-flex items-center gap-1.5 py-0.5 px-2.5 bg-purple-950/80 border-purple-500/40 text-purple-300 animate-pulse shadow-[0_0_12px_rgba(168,85,247,0.25)]"
          >
            <Loader2 className="h-3 w-3 animate-spin text-purple-400 shrink-0" />
            <span>Processing...</span>
          </Badge>
        );

      case "uploaded":
        return (
          <Badge
            variant="neutral"
            className="inline-flex items-center gap-1.5 py-0.5 px-2.5 bg-[#140C24] border-purple-500/30 text-purple-300/90"
          >
            <Clock className="h-3 w-3 text-purple-400 shrink-0" />
            <span>Queued</span>
          </Badge>
        );

      case "failed":
      case "error":
      default:
        return (
          <div className="flex flex-col items-start gap-1 max-w-xs">
            <Badge
              variant="danger"
              className="inline-flex items-center gap-1.5 py-0.5 px-2.5 bg-rose-950/80 border-rose-500/40 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.2)]"
            >
              <AlertCircle className="h-3 w-3 text-rose-400 shrink-0" />
              <span>Failed</span>
            </Badge>
            {doc.error_message && (
              <span
                className="text-[11px] text-rose-300/80 font-sans leading-tight line-clamp-2 max-w-[220px]"
                title={doc.error_message}
              >
                {doc.error_message}
              </span>
            )}
          </div>
        );
    }
  };

  return (
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
          {documents.map((doc) => {
            const isFailed = doc.status === "failed" || doc.status === "error";
            const isReprocessing = reprocessingIds.has(doc.id);

            return (
              <tr
                key={doc.id}
                className="hover:bg-purple-950/25 transition-colors duration-150 group"
              >
                <td className="px-4 sm:px-6 py-4 flex items-center gap-2.5 font-medium text-[#F5F0FF]">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-950/80 border border-purple-500/30 text-purple-300 shrink-0 group-hover:scale-110 group-hover:border-purple-400/50 transition-all duration-150">
                    <FileText className="h-3.5 w-3.5" />
                  </div>
                  <div className="truncate max-w-xs">
                    <span className="block truncate group-hover:text-purple-100 transition-colors">
                      {doc.filename}
                    </span>
                    <span className="text-[10px] text-[#8D829F] font-mono block">
                      ID: {doc.id.slice(0, 8)}...
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4">{renderStatusBadge(doc)}</td>
                <td className="px-4 py-4 text-xs text-[#8D829F] font-mono">
                  {formatBytes(doc.file_size_bytes)}
                </td>
                <td className="px-4 py-4 text-xs text-[#8D829F] font-mono uppercase">
                  {doc.mime_type.split("/")[1] || doc.mime_type}
                </td>
                <td className="px-4 sm:px-6 py-4 text-right space-x-2">
                  {/* Retry action for failed documents (safe backend reprocessing) */}
                  {isFailed && onReprocessDocument && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onReprocessDocument(doc.id)}
                      disabled={isReprocessing}
                      title="Retry document extraction and vector indexing"
                      className="text-xs border-amber-500/35 text-amber-300 hover:text-amber-200 hover:border-amber-400/60 hover:bg-amber-950/30 active:scale-95 transition-all duration-150"
                    >
                      {isReprocessing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1 text-amber-400" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      )}
                      Retry
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewSource(doc)}
                    title="View Document via Signed URL"
                    className="text-xs active:scale-95 transition-all duration-150"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    View
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteDocument(doc.id)}
                    className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 text-xs active:scale-90 transition-all duration-150"
                    title="Delete Document"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
