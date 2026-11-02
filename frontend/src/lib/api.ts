import { auth } from "./firebase/client";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

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
  }

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
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
      throw new ApiError(
        0,
        `Cannot connect to CiteLock backend (${API_BASE_URL}). Please verify the backend server is running on port 8000.`
      );
    }
    throw new ApiError(0, `Network request failed: ${rawMsg}`);
  }

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || JSON.stringify(errorJson);
    } catch {
      // Ignore JSON parse failure
    }
    throw new ApiError(response.status, `API Error ${response.status}: ${errorDetail}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}
