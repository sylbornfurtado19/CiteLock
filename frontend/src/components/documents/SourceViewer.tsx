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
        <p className="text-xs text-[#B0A4C3]">
          Private bucket document accessed through a temporary backend-generated signed URL.
        </p>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-8 space-y-2">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
            <span className="text-xs text-[#8D829F] font-mono">Generating signed URL...</span>
          </div>
        ) : signedUrlData ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-purple-900/35 bg-[#070311] p-4 space-y-2">
              <span className="text-[11px] font-mono text-[#8D829F] block truncate">
                Storage Path: {document.storage_path}
              </span>
              <span className="text-[11px] font-mono text-purple-300 block">
                Valid for: {signedUrlData.expires_in_seconds / 60} minutes
              </span>
              <div className="pt-2">
                <a
                  href={signedUrlData.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="primary" size="sm" className="w-full gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Open Document in New Tab
                  </Button>
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-500/30 rounded-xl p-3">
            Unable to generate signed URL. Verify workspace permissions.
          </div>
        )}
      </div>
    </Dialog>
  );
}
