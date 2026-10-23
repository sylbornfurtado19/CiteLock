"use client";

import React, { useEffect, useState } from "react";
import { Document, DocumentSignedUrlResponse } from "@/types";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SourceViewer({
  workspaceId,
  document,
  onClose,
}: {
  workspaceId: string;
  document: Document | null;
  onClose: () => void;
}) {
  const [signedUrlData, setSignedUrlData] = useState<DocumentSignedUrlResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!document) {
      setSignedUrlData(null);
      return;
    }

    setLoading(true);
    // Request temporary signed URL from backend
    apiFetch<DocumentSignedUrlResponse>(
      `/api/v1/workspaces/${workspaceId}/documents/${document.id}/file`
    )
      .then((data) => setSignedUrlData(data))
      .catch((err) => console.error("Error fetching signed URL:", err))
      .finally(() => setLoading(false));
  }, [workspaceId, document]);

  if (!document) return null;

  return (
    <Dialog open={!!document} onClose={onClose} title={document.filename}>
      <div className="space-y-4">
        <p className="text-xs text-slate-400">
          Private bucket document accessed through a temporary backend-generated signed URL.
        </p>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
          </div>
        ) : signedUrlData ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <span className="text-[11px] font-mono text-slate-500 block mb-1">
                Storage Path: {document.storage_path}
              </span>
              <span className="text-[11px] font-mono text-slate-400 block mb-3">
                Valid for: {signedUrlData.expires_in_seconds / 60} minutes
              </span>
              <a
                href={signedUrlData.download_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="primary" size="sm" className="w-full">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Document in New Tab
                </Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-xs text-red-400">Unable to generate signed URL.</div>
        )}
      </div>
    </Dialog>
  );
}
