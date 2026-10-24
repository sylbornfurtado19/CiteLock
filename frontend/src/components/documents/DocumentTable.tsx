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
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-8 text-center text-slate-400 text-sm">
        No documents uploaded to this workspace yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
      <table className="w-full text-left text-sm text-slate-300">
        <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
          <tr>
            <th className="px-4 py-3">Document Name</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Size</th>
            <th className="px-4 py-3">MIME</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {documents.map((doc) => (
            <tr key={doc.id} className="hover:bg-slate-850/50 transition-colors">
              <td className="px-4 py-3.5 flex items-center gap-2 font-medium text-white">
                <FileText className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="truncate max-w-xs">{doc.filename}</span>
              </td>
              <td className="px-4 py-3.5">
                <Badge
                  variant={
                    doc.status === "indexed"
                      ? "success"
                      : doc.status === "failed" || doc.status === "error"
                      ? "danger"
                      : "warning"
                  }
                >
                  {doc.status}
                </Badge>
              </td>
              <td className="px-4 py-3.5 text-xs text-slate-400 font-mono">
                {formatBytes(doc.file_size_bytes)}
              </td>
              <td className="px-4 py-3.5 text-xs text-slate-400 font-mono">
                {doc.mime_type.split("/")[1] || doc.mime_type}
              </td>
              <td className="px-4 py-3.5 text-right space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onViewSource(doc)}
                  title="View Document via Signed URL"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  View
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDeleteDocument(doc.id)}
                  className="text-red-400 hover:text-red-300"
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
