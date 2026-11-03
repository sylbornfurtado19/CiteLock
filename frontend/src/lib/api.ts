import { auth } from "./firebase/client";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

/** How many times a rate-limited read (GET) is retried before the error is shown. */
export const RATE_LIMIT_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 5000;

/** Wait before retrying a rate-limited request: the server's Retry-After if given, else 1s, 2s, 4s (capped). */
export function retryDelayMs(retryAfterHeader: string | null, attempt: number): number {
  const seconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  const requested = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 1000 * 2 ** attempt;
  return Math.min(requested, MAX_RETRY_DELAY_MS);
}

/**
 * Custom error wrapper for CiteLock API HTTP responses.
 */
export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Resolves the request destination URL.
 * In the browser, relative URLs (/api/...) are preferred to leverage Next.js server rewrites.
 * This completely avoids browser cross-origin CORS preflight overhead, Safari "Load failed" drops,
 * and mixed content errors by routing seamlessly through the Next.js reverse proxy.
 */
export function resolveApiUrl(endpoint: string): string {
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
    return endpoint;
  }
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (typeof window !== "undefined") {
    // In browser, use relative path so Next.js rewrites proxy /api/:path* to backend
    return cleanEndpoint;
  }

  return `${API_BASE_URL}${cleanEndpoint}`;
}

/**
 * Formats a user-friendly connectivity failure message based on the configured target URL.
 */
function formatConnectionError(targetUrl: string, status?: number): string {
  const isLocal =
    API_BASE_URL.includes("localhost") ||
    API_BASE_URL.includes("127.0.0.1") ||
    targetUrl.includes("localhost") ||
    targetUrl.includes("127.0.0.1");

  if (isLocal) {
    return `Cannot connect to CiteLock backend (${API_BASE_URL}). Please verify the backend server is running on port 8000 (run: bash scripts/dev.sh).`;
  }

  if (status === 502 || status === 503 || status === 504) {
    return `CiteLock backend (${API_BASE_URL}) is currently waking up or unavailable. Please wait a few moments and try again.`;
  }

  return `Cannot connect to CiteLock backend (${API_BASE_URL}). Please verify that the remote service is active and responsive.`;
}

/**
 * Typed HTTP client attaching Firebase ID token in Authorization header.
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});

  // Wait for Firebase Auth session to be restored from IndexedDB
  if (typeof window !== "undefined" && typeof auth.authStateReady === "function") {
    try {
      await auth.authStateReady();
    } catch {
      // Continue even if auth state ready check encounters an issue
    }
  }

  // Retrieve Firebase ID token from current authenticated user
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken();
      headers.set("Authorization", `Bearer ${token}`);
    } catch (e) {
      console.warn("Failed to retrieve ID token:", e);
    }
  } else if (!headers.has("Authorization")) {
    // Fallback development bearer token when unauthenticated
    headers.set("Authorization", "Bearer dev-token");
  }

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const targetUrl = resolveApiUrl(endpoint);
  const isRead = (options.method || "GET").toUpperCase() === "GET";
  let response: Response;

  for (let attempt = 0; ; attempt++) {
    try {
      response = await fetch(targetUrl, {
        ...options,
        headers,
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      const rawMsg = err instanceof Error ? err.message : String(err);
      if (
        rawMsg === "Load failed" ||
        rawMsg === "Failed to fetch" ||
        rawMsg.includes("NetworkError") ||
        rawMsg.includes("network")
      ) {
        throw new ApiError(0, formatConnectionError(targetUrl));
      }
      throw new ApiError(0, `Network request failed: ${rawMsg}`);
    }

    // A rate limit says "slow down", so reads wait and try again a couple of times. Writes are never repeated
    // automatically, because repeating a create could duplicate it.
    if (response.status === 429 && isRead && attempt < RATE_LIMIT_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response.headers.get("Retry-After"), attempt)));
      continue;
    }
    break;
  }

  if (!response.ok) {
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      throw new ApiError(response.status, formatConnectionError(targetUrl, response.status));
    }

    let errorDetail = response.statusText;
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || JSON.stringify(errorJson);
    } catch {
      // Ignore JSON parse failure
    }
    if (response.status === 429) {
      // Rate limits often come from the hosting edge with an empty body; never show a bare "API Error 429:".
      throw new ApiError(response.status, errorDetail || "Too many requests. Please wait a moment and try again.");
    }
    throw new ApiError(response.status, `API Error ${response.status}: ${errorDetail}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}
