"use client";

import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";

/**
 * Creates and configures the centralized TanStack Query client.
 *
 * Defaults:
 * - staleTime: 30 seconds for safe navigation cache reuse without redundant network roundtrips.
 * - gcTime: 5 minutes before unmounted query cache entries are garbage collected.
 * - refetchOnWindowFocus: true for background revalidation.
 * - retry: 1 retry for transient network faults, 0 retries for 401/403/404 API responses.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000, // 30 seconds
        gcTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (failureCount, error) => {
          if (error instanceof ApiError) {
            // Do not retry authorization or not-found errors
            if ([401, 403, 404].includes(error.status)) {
              return false;
            }
          }
          return failureCount < 1;
        },
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

// Global browser-side client instance for singleton usage across client components
let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    // Server: always create a new QueryClient per request
    return createQueryClient();
  }
  // Browser: keep singleton query client
  if (!browserQueryClient) {
    browserQueryClient = createQueryClient();
  }
  return browserQueryClient;
}

