"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: replaces the whole document when the root layout itself fails, so it cannot rely on
 * the app's providers, styles or components. It must render its own <html> and <body>.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#05020D", color: "#F5F0FF", fontFamily: "system-ui, sans-serif" }}>
        <div role="alert" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>CiteLock hit an unexpected error</h2>
          <p style={{ margin: 0, maxWidth: 420, color: "#B0A4C3", fontSize: 14, lineHeight: 1.5 }}>
            Reload the page to continue. If it keeps happening, the service may be restarting.
          </p>
          {error.digest && <p style={{ margin: 0, color: "#7B708F", fontSize: 12, fontFamily: "monospace" }}>Reference: {error.digest}</p>}
          <button
            type="button"
            onClick={reset}
            style={{ padding: "8px 16px", borderRadius: 12, border: "none", background: "#7C3AED", color: "#fff", fontSize: 14, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
