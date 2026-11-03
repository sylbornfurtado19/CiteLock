/**
 * Backend URL resolution with a production safety net.
 *
 * Local development may default to http://localhost:8000. A deployed site must never do that silently:
 * visitors' browsers would try to reach *their own* localhost. In production a missing or localhost URL is
 * reported as a clear configuration error instead.
 */

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i;
const DEV_DEFAULT = "http://localhost:8000";

export class ApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiConfigError";
  }
}

export interface ApiUrlInputs {
  /** Value of NEXT_PUBLIC_API_URL. */
  env?: string;
  nodeEnv?: string;
  /** window.location.hostname in the browser; undefined on the server. */
  hostname?: string;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function resolveApiBaseUrl({ env, nodeEnv, hostname }: ApiUrlInputs): string {
  const configured = (env ?? "").trim().replace(/\/+$/, "");
  const deployed = nodeEnv === "production" && !!hostname && !LOCAL_HOSTS.test(hostname);

  if (!configured) {
    if (deployed) {
      throw new ApiConfigError(
        "NEXT_PUBLIC_API_URL is not set for this deployment, so the app cannot reach the CiteLock backend. " +
          "Set it to your backend's public https URL in the hosting provider's environment variables and redeploy."
      );
    }
    return DEV_DEFAULT;
  }

  if (deployed && LOCAL_HOSTS.test(hostOf(configured))) {
    throw new ApiConfigError(
      `NEXT_PUBLIC_API_URL points at ${configured}, which is not reachable from visitors' browsers. ` +
        "Set it to your backend's public https URL and redeploy."
    );
  }
  return configured;
}

/** Backend base URL for the running environment; throws ApiConfigError when a deployment is misconfigured. */
export function getApiBaseUrl(): string {
  return resolveApiBaseUrl({
    env: process.env.NEXT_PUBLIC_API_URL,
    nodeEnv: process.env.NODE_ENV,
    hostname: typeof window !== "undefined" ? window.location.hostname : undefined,
  });
}
