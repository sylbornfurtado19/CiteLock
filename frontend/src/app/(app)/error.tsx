"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/ui/ErrorPanel";

/** Catches render and data errors inside the signed-in app, keeping the sidebar and layout in place. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("App route error:", error);
  }, [error]);

  return <ErrorPanel digest={error.digest} onRetry={reset} />;
}
