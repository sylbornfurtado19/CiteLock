"use client";

import "@xyflow/react/dist/style.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import { Crosshair, Maximize2 } from "lucide-react";
import type { ExecutionState, GraphNodeId, NodeStatus } from "@/types/execution";
import { GRAPH_NODES, NODE_BY_ID, NODE_HEIGHT, NODE_WIDTH } from "@/lib/execution/graphDefinition";
import { activeNode, visibleEdges } from "@/lib/execution/reducer";
import { ExecutionNode, type ExecutionFlowNode } from "./ExecutionNode";
import { ExecutionEdge, edgeColor, type ExecutionFlowEdge } from "./ExecutionEdge";

const nodeTypes: NodeTypes = { exec: ExecutionNode };
const edgeTypes: EdgeTypes = { exec: ExecutionEdge };

const MINIMAP_COLORS: Record<NodeStatus, string> = {
  pending: "#3B2A5C",
  running: "#C084FC",
  completed: "#34D399",
  failed: "#FB7185",
  skipped: "#4B4660",
};

interface ExecutionGraphProps {
  state: ExecutionState;
  selectedNode: GraphNodeId | null;
  onSelectNode: (id: GraphNodeId | null) => void;
}

/** Zoom used when the camera follows the running node; keeps node text readable on tall graphs. */
const FOLLOW_ZOOM = 0.85;

function GraphCanvas({ state, selectedNode, onSelectNode }: ExecutionGraphProps) {
  const { fitView, setCenter } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const running = activeNode(state);
  const runStatus = state.runStatus;

  const nodes = useMemo<ExecutionFlowNode[]>(
    () =>
      GRAPH_NODES.map((def) => ({
        id: def.id,
        type: "exec",
        position: def.position,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        draggable: false,
        connectable: false,
        data: { def, runtime: state.nodes[def.id], selected: selectedNode === def.id, onInspect: onSelectNode },
      })),
    [state.nodes, selectedNode, onSelectNode]
  );

  const edges = useMemo<ExecutionFlowEdge[]>(
    () =>
      visibleEdges(state).map((def) => {
        const runtime = state.edges[def.id] ?? { decided: false, taken: false, active: false, count: 0 };
        return {
          id: def.id,
          type: "exec",
          source: def.source,
          target: def.target,
          sourceHandle: def.sourceHandle,
          targetHandle: def.targetHandle,
          selectable: false,
          zIndex: runtime.active ? 10 : 0,
          markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor(runtime, def.route), width: 16, height: 16 },
          data: { label: def.label, route: def.route, feedback: def.feedback, runtime },
        };
      }),
    [state]
  );

  const refit = useCallback(() => fitView({ padding: 0.12, duration: 250 }), [fitView]);

  // A new execution (new start time) is followed again by default.
  useEffect(() => {
    setFollow(true);
  }, [state.startedAt]);

  const followingRef = useRef(false);
  followingRef.current = follow && runStatus === "running";

  // Camera follows the node that is actually running; a finished run shows the whole graph.
  useEffect(() => {
    if (!follow) return;
    if (runStatus === "running" && running) {
      const def = NODE_BY_ID[running];
      setCenter(def.position.x + NODE_WIDTH / 2, def.position.y + NODE_HEIGHT / 2, { zoom: FOLLOW_ZOOM, duration: 450 });
    } else if (runStatus === "completed" || runStatus === "failed" || runStatus === "interrupted") {
      refit();
    }
  }, [running, runStatus, follow, setCenter, refit]);

  // Keep the whole graph in view when the panel is resized (responsive layouts, collapsing, rotation).
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      // While the camera follows a running node, resizing must not yank it back to the full view.
      timer = setTimeout(() => {
        if (!followingRef.current) refit();
      }, 120);
    });
    observer.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [refit]);

  return (
    <div ref={wrapperRef} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.2}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => onSelectNode(node.id as GraphNodeId)}
        onPaneClick={() => onSelectNode(null)}
        // A move with an originating event is the user's own pan/zoom, which takes over from the follow camera.
        onMoveStart={(event) => {
          if (event) setFollow(false);
        }}
        aria-label="LangGraph execution graph"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(168, 85, 247, 0.16)" />
        <Controls showInteractive={false} position="bottom-left" className="exec-controls" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          className="exec-minimap !hidden md:!block"
          maskColor="rgba(5, 2, 13, 0.72)"
          nodeColor={(n) => MINIMAP_COLORS[state.nodes[n.id as GraphNodeId]?.status ?? "pending"]}
          nodeStrokeWidth={2}
        />
        <Panel position="top-right" className="flex items-center gap-1.5">
          {runStatus === "running" && (
            <button
              type="button"
              aria-pressed={follow}
              onClick={() => setFollow((f) => !f)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 ${
                follow ? "border-purple-400/50 bg-purple-950/80 text-purple-100" : "border-purple-500/30 bg-[#0E071D]/90 text-purple-200 hover:bg-purple-950/70"
              }`}
            >
              <Crosshair className="h-3 w-3" aria-hidden />
              Follow
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setFollow(false);
              refit();
            }}
            className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-[#0E071D]/90 px-2.5 py-1.5 font-mono text-[11px] text-purple-200 transition-colors hover:bg-purple-950/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
          >
            <Maximize2 className="h-3 w-3" aria-hidden />
            Fit to screen
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function ExecutionGraph(props: ExecutionGraphProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
