import { Answer } from "./index";

export type PipelineStage =
  | "retrieval"
  | "generation"
  | "decomposition"
  | "verification"
  | "correction"
  | "finalizing";

export type PipelineStageStatus = "pending" | "running" | "completed" | "failed";

export interface PipelineEvent {
  stage: PipelineStage;
  status: PipelineStageStatus;
  message: string;
  timestamp: string;
  data?: Record<string, any>;
}

export interface PipelineCompletePayload {
  query_id: string;
  workspace_id: string;
  prompt: string;
  answer: Answer;
  verification_status?: string;
  execution_metadata?: Record<string, any>;
}

export interface PipelineErrorPayload {
  stage?: string;
  status: "failed";
  message: string;
  timestamp?: string;
}

