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
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const uploadFile = async (file: File) => {
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

      setSuccess(`Uploaded "${file.name}" successfully.`);
      if (onUploadSuccess) onUploadSuccess(uploadedDoc);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Failed to upload document to backend API.";
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
    // Reset file input value to allow uploading the same file again if needed
    e.target.value = "";
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await uploadFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`relative rounded-2xl border-2 border-dashed transition-all p-8 text-center backdrop-blur-md ${
        isDragOver
          ? "border-purple-400 bg-purple-950/40 shadow-[0_0_30px_rgba(168,85,247,0.35)] scale-[1.01]"
          : "border-purple-500/30 hover:border-purple-400/60 bg-[#100A1C]/60 hover:bg-[#150E26]/80 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
      }`}
    >
      <input
        type="file"
        id="file-upload"
        className="hidden"
        accept=".pdf,.docx,.txt,.md"
        onChange={handleFileChange}
        disabled={isUploading}
      />
      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-950/80 border border-purple-500/35 text-purple-300 shadow-[0_0_16px_rgba(139,92,246,0.3)] mb-3">
          <UploadCloud className="h-6 w-6" />
        </div>
        <h4 className="text-base font-semibold text-[#F5F0FF] mb-1">
          {isUploading ? "Uploading & Indexing into pgvector..." : "Upload reference documents for grounded auditing"}
        </h4>
        <p className="text-xs text-[#B0A4C3] max-w-sm mb-4">
          PDF, DOCX, TXT or Markdown up to 25MB. Files are verified server-side and streamed to private Firebase Storage.
        </p>
        <span className="inline-flex items-center gap-2 rounded-lg border border-purple-500/30 bg-[#171025] px-4 py-2 text-xs font-medium text-purple-200 hover:bg-[#1E1435] hover:text-white transition-all shadow-sm">
          <FileText className="h-4 w-4 text-purple-300" />
          {isUploading ? "Uploading..." : "Select Document File"}
        </span>
      </label>

      {error && (
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-xl p-2.5 max-w-md mx-auto">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-2.5 max-w-md mx-auto">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{success}</span>
        </div>
      )}
    </div>
  );
}
