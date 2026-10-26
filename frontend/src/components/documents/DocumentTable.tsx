"use client";

import React from "react";
import { Document } from "@/types";
import { formatBytes } from "@/lib/utils";
import { FileText, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function DocumentTable({
  documents,
  onViewSource,
  onDeleteDocument,
}: {
  documents: Document[];
  onViewSource: (doc: Document) => void;
  onDeleteDocument: (docId: string) => void;
}) {
  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border border-purple-900/25 bg-[#100A1C]/60 p-12 text-center text-[#8D829F] text-sm backdrop-blur-md">
        No documents uploaded to this workspace yet. Upload reference files to begin grounded auditing.
      </div>
    );
  }

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
          {documents.map((doc) => (
            <tr key={doc.id} className="hover:bg-purple-950/25 transition-colors duration-150 group">
              <td className="px-4 sm:px-6 py-4 flex items-center gap-2.5 font-medium text-[#F5F0FF]">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-950/80 border border-purple-500/30 text-purple-300 shrink-0 group-hover:scale-110 group-hover:border-purple-400/50 transition-all duration-150">
                  <FileText className="h-3.5 w-3.5" />
                </div>
                <span className="truncate max-w-xs group-hover:text-purple-100 transition-colors">{doc.filename}</span>
              </td>
              <td className="px-4 py-4">
                <Badge
                  variant={
                    doc.status === "indexed"
                      ? "success"
                      : doc.status === "failed" || doc.status === "error"
                      ? "danger"
                      : "warning"
                  }
                  className={doc.status === "processing" || doc.status === "pending" ? "animate-pulse" : ""}
                >
                  {doc.status}
                </Badge>
              </td>
              <td className="px-4 py-4 text-xs text-[#8D829F] font-mono">
                {formatBytes(doc.file_size_bytes)}
              </td>
              <td className="px-4 py-4 text-xs text-[#8D829F] font-mono uppercase">
                {doc.mime_type.split("/")[1] || doc.mime_type}
              </td>
              <td className="px-4 sm:px-6 py-4 text-right space-x-2">
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
