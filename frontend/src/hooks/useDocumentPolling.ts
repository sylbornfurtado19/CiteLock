"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Document } from "@/types";
import { apiFetch } from "@/lib/api";

export interface DocumentPollingOptions {
  baseIntervalMs?: number;
  maxRetries?: number;
  onDocumentIndexed?: (doc: Document) => void;
  onDocumentFailed?: (doc: Document) => void;
}

export const NON_TERMINAL_STATUSES = new Set(["uploaded", "processing", "pending"]);

export function isPendingDocument(doc: Document): boolean {
  return NON_TERMINAL_STATUSES.has(doc.status);
}

/**
 * Intelligent document ingestion polling hook.
 *
 * Automatically monitors documents in non-terminal states ('uploaded', 'processing'),
 * checks backend at a configurable interval (default 2500ms), stops when all documents
 * reach terminal states ('indexed', 'failed'), pauses when the tab/page is hidden,
 * prevents overlapping requests, and applies exponential backoff on network errors.
 */
export function useDocumentPolling(
  workspaceId: string,
  documents: Document[],
  setDocuments: React.Dispatch<React.SetStateAction<Document[]>>,
  options: DocumentPollingOptions = {}
) {
  const {
    baseIntervalMs = 2500,
    maxRetries = 5,
    onDocumentIndexed,
    onDocumentFailed,
  } = options;

  const [isPolling, setIsPolling] = useState(false);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);

  // References to prevent stale closures and overlapping calls
  const inFlightRef = useRef(false);
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);
  const consecutiveErrorsRef = useRef(0);
  const documentsRef = useRef<Document[]>(documents);
  documentsRef.current = documents;

  // Count documents currently processing
  const pendingCount = documents.filter(isPendingDocument).length;
  const hasPending = pendingCount > 0;

  const clearTimer = useCallback(() => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async () => {
    if (!workspaceId || inFlightRef.current) return;

    // Guard: Check visibility state; pause if page is hidden
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      setIsPolling(false);
      return;
    }

    inFlightRef.current = true;

    try {
      const fetchedDocs = await apiFetch<Document[]>(
        `/api/v1/workspaces/${workspaceId}/documents`
      );

      consecutiveErrorsRef.current = 0;
      setConsecutiveErrors(0);

      // Map of fetched documents for fast diffing
      const fetchedMap = new Map<string, Document>(
        fetchedDocs.map((d) => [d.id, d])
      );

      let anyStatusChanged = false;
      const newlyIndexed: Document[] = [];
      const newlyFailed: Document[] = [];

      setDocuments((prevDocs) => {
        let hasChanges = false;

        const updated = prevDocs.map((prev) => {
          const fresh = fetchedMap.get(prev.id);
          if (!fresh) return prev;

          // Check if status, error message, or size changed
          const statusChanged = prev.status !== fresh.status;
          const errorChanged = prev.error_message !== fresh.error_message;
          const sizeChanged = prev.file_size_bytes !== fresh.file_size_bytes;

          if (statusChanged || errorChanged || sizeChanged) {
            hasChanges = true;
            anyStatusChanged = true;

            if (statusChanged && fresh.status === "indexed") {
              newlyIndexed.push(fresh);
            } else if (statusChanged && fresh.status === "failed") {
              newlyFailed.push(fresh);
            }

            return {
              ...prev,
              ...fresh,
            };
          }

          return prev;
        });

        // Check if new documents were added remotely
        const existingIds = new Set(prevDocs.map((d) => d.id));
        const addedDocs = fetchedDocs.filter((d) => !existingIds.has(d.id));

        if (addedDocs.length > 0) {
          hasChanges = true;
          return [...addedDocs, ...updated];
        }

        // Return exact same reference if no changes occurred to prevent unnecessary re-renders
        return hasChanges ? updated : prevDocs;
      });

      // Notify caller of terminal state transitions
      if (onDocumentIndexed) {
        newlyIndexed.forEach((d) => onDocumentIndexed(d));
      }
      if (onDocumentFailed) {
        newlyFailed.forEach((d) => onDocumentFailed(d));
      }

      // Check if any documents in fetchedDocs still need processing
      const stillPending = fetchedDocs.some(isPendingDocument);
      if (stillPending) {
        setIsPolling(true);
        clearTimer();
        timeoutIdRef.current = setTimeout(pollStatus, baseIntervalMs);
      } else {
        setIsPolling(false);
        clearTimer();
      }
    } catch (err) {
      consecutiveErrorsRef.current += 1;
      setConsecutiveErrors(consecutiveErrorsRef.current);

      if (consecutiveErrorsRef.current <= maxRetries) {
        // Exponential backoff: base * 1.5^failures
        const backoffDelay = Math.min(
          baseIntervalMs * Math.pow(1.5, consecutiveErrorsRef.current),
          15000
        );
        clearTimer();
        timeoutIdRef.current = setTimeout(pollStatus, backoffDelay);
      } else {
        // Exceeded retries, stop polling
        setIsPolling(false);
        clearTimer();
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [
    workspaceId,
    baseIntervalMs,
    maxRetries,
    clearTimer,
    setDocuments,
    onDocumentIndexed,
    onDocumentFailed,
  ]);

  // Manage polling lifecycle based on presence of pending documents
  useEffect(() => {
    if (!workspaceId) {
      clearTimer();
      setIsPolling(false);
      return;
    }

    if (hasPending) {
      setIsPolling(true);
      // Start polling cycle if timer isn't already active
      if (!timeoutIdRef.current && !inFlightRef.current) {
        timeoutIdRef.current = setTimeout(pollStatus, baseIntervalMs);
      }
    } else {
      clearTimer();
      setIsPolling(false);
    }

    return () => {
      clearTimer();
    };
  }, [hasPending, workspaceId, baseIntervalMs, clearTimer, pollStatus]);

  // Page Visibility: Pause when hidden, resume immediately when visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;

      if (document.visibilityState === "visible") {
        const currentPending = documentsRef.current.some(isPendingDocument);
        if (currentPending && !inFlightRef.current) {
          clearTimer();
          pollStatus();
        }
      } else {
        // Pause timer when hidden to prevent unnecessary background network calls
        clearTimer();
        setIsPolling(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearTimer, pollStatus]);

  // Explicit trigger to kick off a poll immediately (e.g. after uploading a new document)
  const triggerPoll = useCallback(() => {
    clearTimer();
    pollStatus();
  }, [clearTimer, pollStatus]);

  return {
    isPolling,
    pendingCount,
    consecutiveErrors,
    triggerPoll,
  };
}

