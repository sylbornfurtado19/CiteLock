"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/ui/ErrorPanel";

/** Boundary for pages outside the signed-in app (landing, login). */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return <ErrorPanel fullScreen digest={error.digest} onRetry={reset} />;
}
