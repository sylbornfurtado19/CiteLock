"use client";

import React, { useState } from "react";
import { UploadDropzone } from "@/components/documents/UploadDropzone";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { SourceViewer } from "@/components/documents/SourceViewer";
import { Document } from "@/types";

export default function DocumentsPage() {
  const workspaceId = "default-workspace-001";
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

  const [documents, setDocuments] = useState<Document[]>([
    {
      id: "doc-1",
      workspace_id: workspaceId,
      filename: "financial_report_q3_2024.pdf",
      storage_path: `workspaces/${workspaceId}/documents/doc-1/financial_report_q3_2024.pdf`,
      checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      status: "indexed",
      file_size_bytes: 2450000,
      mime_type: "application/pdf",
      created_at: "2026-10-23T10:00:00Z",
    },
    {
      id: "doc-2",
      workspace_id: workspaceId,
      filename: "ai_model_technical_spec.docx",
      storage_path: `workspaces/${workspaceId}/documents/doc-2/ai_model_technical_spec.docx`,
      checksum: "8743b52063cd84097a65d1633f5c74f5",
      status: "indexed",
      file_size_bytes: 1120000,
      mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      created_at: "2026-10-23T11:15:00Z",
    },
  ]);

  const handleUploadSuccess = (newDoc: Document) => {
    setDocuments((prev) => [newDoc, ...prev]);
  };

  const handleDelete = (docId: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Document Vault</h1>
        <p className="text-sm text-slate-400 mt-1">
          Upload and index reference documents. Files are stored in private Firebase Storage and embedded into Neon pgvector.
        </p>
      </div>

      {/* Upload Zone */}
      <UploadDropzone
        workspaceId={workspaceId}
        onUploadSuccess={handleUploadSuccess}
      />

      {/* Document Registry Table */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-white">Indexed Documents ({documents.length})</h3>
        <DocumentTable
          documents={documents}
          onViewSource={(doc) => setSelectedDoc(doc)}
          onDeleteDocument={handleDelete}
        />
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
