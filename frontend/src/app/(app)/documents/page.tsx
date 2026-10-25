"use client";

import React, { useEffect, useState } from "react";
import { UploadDropzone } from "@/components/documents/UploadDropzone";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { SourceViewer } from "@/components/documents/SourceViewer";
import { Document } from "@/types";
import { apiFetch } from "@/lib/api";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DocumentsPage() {
  const workspaceId = "default-workspace-001";
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const docs = await apiFetch<Document[]>(
        `/api/v1/workspaces/${workspaceId}/documents`
      );
      setDocuments(docs);
    } catch (err) {
      console.error("Failed to load documents:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [workspaceId]);

  const handleUploadSuccess = (newDoc: Document) => {
    setDocuments((prev) => [newDoc, ...prev.filter((d) => d.id !== newDoc.id)]);
  };

  const handleDelete = async (docId: string) => {
    try {
      await apiFetch(`/api/v1/workspaces/${workspaceId}/documents/${docId}`, {
        method: "DELETE",
      });
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F5F0FF]">Document Vault</h1>
          <p className="text-sm text-[#B0A4C3] mt-1">
            Upload and index reference documents. Files are stored in private Firebase Storage and embedded into Neon pgvector.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadDocuments}
          disabled={loading}
          className="text-xs self-start sm:self-auto"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5 text-purple-400" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 text-purple-300" />
          )}
          Refresh
        </Button>
      </div>

      {/* Upload Zone */}
      <UploadDropzone
        workspaceId={workspaceId}
        onUploadSuccess={handleUploadSuccess}
      />

      {/* Document Registry Table */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-[#F5F0FF]">
          Indexed Documents ({documents.length})
        </h3>
        {loading ? (
          <div className="flex items-center justify-center p-12 text-[#8D829F] text-sm">
            <Loader2 className="h-6 w-6 animate-spin mr-2 text-purple-400" />
            Loading documents...
          </div>
        ) : (
          <DocumentTable
            documents={documents}
            onViewSource={(doc) => setSelectedDoc(doc)}
            onDeleteDocument={handleDelete}
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
