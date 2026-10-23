"use client";

import React, { useState } from "react";
import { UploadCloud, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { Document } from "@/types";

export function UploadDropzone({
  workspaceId,
  onUploadSuccess,
}: {
  workspaceId: string;
  onUploadSuccess?: (doc: Document) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Upload goes directly to FastAPI backend via multipart, which streams to Firebase Storage
      const uploadedDoc = await apiFetch<Document>(
        `/api/v1/workspaces/${workspaceId}/documents/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      setSuccess(`Uploaded ${file.name} successfully.`);
      if (onUploadSuccess) onUploadSuccess(uploadedDoc);
    } catch (err: unknown) {
      console.error(err);
      setError("Failed to upload document to backend API.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/30 p-8 text-center hover:border-emerald-500/50 transition-colors">
      <input
        type="file"
        id="file-upload"
        className="hidden"
        accept=".pdf,.docx,.txt,.md"
        onChange={handleFileChange}
        disabled={isUploading}
      />
      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
        <UploadCloud className="h-10 w-10 text-emerald-400 mb-3" />
        <h4 className="text-base font-medium text-white mb-1">
          {isUploading ? "Uploading & Indexing..." : "Upload documents for grounded auditing"}
        </h4>
        <p className="text-xs text-slate-400 max-w-sm mb-4">
          PDF, DOCX, TXT or Markdown up to 25MB. Files are verified server-side and streamed to private storage.
        </p>
        <Button variant="secondary" size="sm" disabled={isUploading} type="button">
          <FileText className="h-4 w-4 mr-2" />
          Select File
        </Button>
      </label>

      {error && (
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          <span>{success}</span>
        </div>
      )}
    </div>
  );
}
