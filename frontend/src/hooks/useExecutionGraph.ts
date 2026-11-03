"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ExecutionState, GraphEvent, TraceRecord } from "@/types/execution";
import { createInitialState, executionReducer, type ExecutionAction } from "@/lib/execution/reducer";

/**
 * Owns the execution graph state. Every mutation flows from a real backend event or a persisted trace.
 * A synchronous ref mirrors the rendered state so callers can read the final state the moment a stream ends.
 */
export function useExecutionGraph() {
  const ref = useRef<ExecutionState>(createInitialState());
  const [state, setState] = useState<ExecutionState>(ref.current);

  const apply = useCallback((action: ExecutionAction) => {
    ref.current = executionReducer(ref.current, action);
    setState(ref.current);
  }, []);

  const actions = useMemo(
    () => ({
      reset: () => apply({ type: "reset" }),
      onStarted: () => apply({ type: "stream_started" }),
      onGraphEvent: (event: GraphEvent) => apply({ type: "graph_event", event }),
      onComplete: () => apply({ type: "stream_complete" }),
      onFailed: (message: string) => apply({ type: "stream_failed", message }),
      onInterrupted: (message: string) => apply({ type: "stream_interrupted", message }),
      restore: (trace: TraceRecord[]) => apply({ type: "restore", trace }),
    }),
    [apply]
  );

  const getState = useCallback((): ExecutionState => ref.current, []);

  return { state, getState, ...actions };
}
