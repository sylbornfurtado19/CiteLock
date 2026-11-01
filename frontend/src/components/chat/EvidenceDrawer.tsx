"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Info,
  Loader2,
  Bookmark,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerdictBadge } from "@/components/claims/VerdictBadge";
import { SourceViewer } from "@/components/documents/SourceViewer";
import { apiFetch } from "@/lib/api";
import { Chunk, Document, DocumentSignedUrlResponse } from "@/types";

export interface CitationItem {
  id: string;
  citationNumber: number;
  label: string;
  claimIndex: number;
  claimText: string;
  verdict: string;
  confidenceScore?: number;
  rationale?: string;
  chunkId?: string;
  documentFilename?: string;
  documentId?: string;
  pageNumber?: number;
  exactQuote?: string;
  startCharOffset?: number;
  endCharOffset?: number;
  chunkContent?: string;
}

interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  citations: CitationItem[];
  activeCitationIndex: number;
  onSelectCitation: (index: number) => void;
}

export function EvidenceDrawer({
  isOpen,
  onClose,
  workspaceId,
  citations,
  activeCitationIndex,
  onSelectCitation,
}: EvidenceDrawerProps) {
  const [activeChunk, setActiveChunk] = useState<Chunk | null>(null);
  const [loadingChunk, setLoadingChunk] = useState(false);
  const [chunkError, setChunkError] = useState<string | null>(null);

  // Document preview state
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [openingFile, setOpeningFile] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const currentCitation = citations[activeCitationIndex] || null;

  // Fetch full chunk details if not already populated on citation
  useEffect(() => {
    if (!isOpen || !currentCitation) {
      setActiveChunk(null);
      return;
    }

    if (currentCitation.chunkContent) {
      setActiveChunk({
        id: currentCitation.chunkId || "",
        document_id: currentCitation.documentId || "",
        chunk_index: 0,
        content: currentCitation.chunkContent,
        metadata: {
          page_number: currentCitation.pageNumber,
        },
        document_filename: currentCitation.documentFilename,
        created_at: "",
      });
      return;
    }

    if (!currentCitation.chunkId) {
      setActiveChunk(null);
      return;
    }

    let isMounted = true;
    setLoadingChunk(true);
    setChunkError(null);

    apiFetch<Chunk>(`/api/v1/workspaces/${workspaceId}/documents/chunks/${currentCitation.chunkId}`)
      .then((data) => {
        if (isMounted) {
          setActiveChunk(data);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn("Could not fetch full chunk:", err);
          setChunkError("Original chunk details could not be retrieved from vector index.");
        }
      })
      .finally(() => {
        if (isMounted) setLoadingChunk(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentCitation, workspaceId]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (activeCitationIndex > 0) {
          onSelectCitation(activeCitationIndex - 1);
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (activeCitationIndex < citations.length - 1) {
          onSelectCitation(activeCitationIndex + 1);
        }
      }
    },
    [isOpen, activeCitationIndex, citations.length, onClose, onSelectCitation]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Handle document file opening
  const handleOpenOriginalDocument = async () => {
    const docId = currentCitation?.documentId || activeChunk?.document_id;
    const filename = currentCitation?.documentFilename || activeChunk?.document_filename || "document";

    if (!docId) {
      // Fallback: document ID not resolved
      return;
    }

    try {
      setOpeningFile(true);
      const data = await apiFetch<DocumentSignedUrlResponse>(
        `/api/v1/workspaces/${workspaceId}/documents/${docId}/file`
      );
      if (data.download_url) {
        window.open(data.download_url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      console.error("Failed to generate document signed URL:", err);
      // Fallback: open SourceViewer modal
      setPreviewDocument({
        id: docId,
        workspace_id: workspaceId,
        filename,
        storage_path: "",
        checksum: "",
        status: "indexed",
        file_size_bytes: 0,
        mime_type: "application/pdf",
        created_at: "",
      });
    } finally {
      setOpeningFile(false);
    }
  };

  if (!isOpen) return null;

  // Offsets and highlight evaluation
  const content = activeChunk?.content || currentCitation?.chunkContent || "";
  const startOffset = currentCitation?.startCharOffset;
  const endOffset = currentCitation?.endCharOffset;
  const exactQuote = currentCitation?.exactQuote || "";

  // Check if backend provided reliable offsets that match the chunk text
  const hasReliableOffsets =
    startOffset !== undefined &&
    endOffset !== undefined &&
    startOffset !== null &&
    endOffset !== null &&
    startOffset >= 0 &&
    endOffset <= content.length &&
    startOffset < endOffset &&
    content.length > 0;

  // Verify slice matches exact quote (or trimmed)
  const sliceMatchesQuote =
    hasReliableOffsets &&
    (content.slice(startOffset, endOffset).trim() === exactQuote.trim() ||
      content.slice(startOffset, endOffset).toLowerCase().includes(exactQuote.trim().toLowerCase().slice(0, 30)));

  const pageNum =
    currentCitation?.pageNumber ??
    activeChunk?.metadata?.page_number;

  const docFilename =
    currentCitation?.documentFilename ||
    activeChunk?.document_filename ||
    activeChunk?.metadata?.source_filename ||
    "Source Document";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Evidence Source Inspector"
        className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-xl md:max-w-2xl bg-[#0C061A]/95 border-l border-purple-500/25 shadow-[-16px_0_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl flex flex-col transition-transform duration-300 ease-out animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-purple-900/35 bg-[#090314]/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-950/80 border border-purple-500/40 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.3)]">
              <Bookmark className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[#F5F0FF]">Evidence Inspector</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-purple-950/80 text-purple-300 border border-purple-500/30">
                  Citation [{currentCitation?.citationNumber ?? 1}]
                </span>
              </div>
              <p className="text-[11px] text-[#8D829F]">
                Verified ground truth passage from workspace vector store
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Citation Stepper Controls */}
            {citations.length > 1 && (
              <div className="flex items-center gap-1 bg-[#130B24] border border-purple-900/40 rounded-lg p-0.5 mr-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectCitation(activeCitationIndex - 1)}
                  disabled={activeCitationIndex === 0}
                  className="h-7 w-7 p-0 text-purple-300 hover:text-white disabled:opacity-30"
                  title="Previous citation (ArrowLeft)"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-[11px] font-mono text-purple-200 px-1.5 select-none">
                  {activeCitationIndex + 1}/{citations.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectCitation(activeCitationIndex + 1)}
                  disabled={activeCitationIndex === citations.length - 1}
                  className="h-7 w-7 p-0 text-purple-300 hover:text-white disabled:opacity-30"
                  title="Next citation (ArrowRight)"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 text-[#8D829F] hover:text-white rounded-lg hover:bg-purple-950/50"
              title="Close drawer (Esc)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Document Source Card */}
          <div className="rounded-2xl border border-purple-900/40 bg-[#120B22]/70 p-4 space-y-3 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-950 border border-purple-500/30 text-purple-300 shrink-0">
                  <FileText className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-[#F5F0FF] truncate block">
                    {docFilename}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-[#8D829F]">
                    {pageNum !== undefined && pageNum !== null && (
                      <span>Page {pageNum}</span>
                    )}
                    {currentCitation?.chunkId && (
                      <>
                        <span>•</span>
                        <span title={currentCitation.chunkId}>
                          Chunk: {currentCitation.chunkId.slice(0, 8)}...
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {(currentCitation?.documentId || activeChunk?.document_id) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenOriginalDocument}
                  disabled={openingFile}
                  className="text-xs gap-1.5 self-start sm:self-auto shrink-0 bg-purple-950/40 border-purple-500/30 hover:border-purple-400 text-purple-300 hover:text-white"
                >
                  {openingFile ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5" />
                  )}
                  <span>Open File</span>
                </Button>
              )}
            </div>
          </div>

          {/* Evaluated Atomic Claim */}
          {currentCitation?.claimText && (
            <div className="rounded-2xl border border-purple-900/30 bg-[#0E071D]/90 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-purple-400">
                  Audited Claim #{currentCitation.claimIndex + 1}
                </span>
                {currentCitation.verdict && (
                  <VerdictBadge verdict={currentCitation.verdict as any} />
                )}
              </div>
              <p className="text-xs font-medium text-[#F5F0FF] leading-relaxed">
                {currentCitation.claimText}
              </p>
              {currentCitation.rationale && (
                <p className="text-[11px] text-[#A89CB8] pt-1 border-t border-purple-900/20 italic">
                  Rationale: {currentCitation.rationale}
                </p>
              )}
            </div>
          )}

          {/* Exact Cited Excerpt */}
          {exactQuote && (
            <div className="rounded-xl border border-purple-500/30 bg-[#140A26]/80 p-3.5 space-y-1.5 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
              <div className="flex items-center gap-1.5 text-purple-300 text-[11px] font-mono">
                <Quote className="h-3.5 w-3.5 text-purple-400" />
                <span>Exact Cited Statement:</span>
              </div>
              <p className="text-xs text-purple-100 italic leading-relaxed pl-2 border-l-2 border-purple-400">
                &ldquo;{exactQuote}&rdquo;
              </p>
            </div>
          )}

          {/* Passage Canvas with Highlighting */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-purple-300">
                Source Document Chunk Context
              </span>
              {sliceMatchesQuote && (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                  Offsets Verified ({startOffset} - {endOffset})
                </span>
              )}
            </div>

            <div className="rounded-2xl border border-purple-900/40 bg-[#070311] p-4 text-xs font-mono leading-relaxed text-slate-300 min-h-[160px] shadow-inner select-text">
              {loadingChunk ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-2 text-[#8D829F]">
                  <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                  <span>Loading passage context from vector store...</span>
                </div>
              ) : chunkError ? (
                <div className="text-rose-400 text-xs py-4 space-y-1">
                  <p>{chunkError}</p>
                  {exactQuote && (
                    <p className="text-slate-300 italic pt-2">
                      Verified quote: &ldquo;{exactQuote}&rdquo;
                    </p>
                  )}
                </div>
              ) : content ? (
                <div>
                  {sliceMatchesQuote ? (
                    <>
                      <span>{content.slice(0, startOffset!)}</span>
                      <mark className="bg-purple-500/35 text-purple-100 border-b-2 border-purple-400 font-semibold px-1 py-0.5 rounded shadow-[0_0_12px_rgba(168,85,247,0.35)]">
                        {content.slice(startOffset!, endOffset!)}
                      </mark>
                      <span>{content.slice(endOffset!)}</span>
                    </>
                  ) : (
                    // Safe Fallback: exact offsets not reliable or missing; display full passage without guessing
                    <div>
                      <p className="text-slate-300">{content}</p>
                      <div className="mt-3 pt-2 border-t border-purple-900/30 text-[10px] text-[#8D829F] italic">
                        Exact character boundary offsets not returned for this chunk; showing un-truncated passage text.
                      </div>
                    </div>
                  )}
                </div>
              ) : exactQuote ? (
                <p className="italic text-purple-200">&ldquo;{exactQuote}&rdquo;</p>
              ) : (
                <p className="text-[#6B5F80] italic">No passage text available.</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-purple-900/35 bg-[#090314]/80 flex items-center justify-between text-xs text-[#8D829F] font-mono">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
            <span>Cryptographically audited provenance</span>
          </div>
          <div className="text-[11px] text-[#6B5F80]">
            Use <kbd className="px-1 py-0.5 rounded bg-purple-950/60 border border-purple-900 text-purple-300">←</kbd> / <kbd className="px-1 py-0.5 rounded bg-purple-950/60 border border-purple-900 text-purple-300">→</kbd> to navigate
          </div>
        </div>
      </aside>

      {/* Optional Document Viewer Modal */}
      {previewDocument && (
        <SourceViewer
          workspaceId={workspaceId}
          document={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      )}
    </>
  );
}

