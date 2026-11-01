/**
 * TypeScript definitions mirroring CiteLock backend schemas and models.
 */

export type Verdict =
  | "supported"
  | "partially_supported"
  | "contradicted"
  | "unsupported"
  | "insufficient_evidence";

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  created_at: string;
}

export interface Document {
  id: string;
  workspace_id: string;
  filename: string;
  storage_path: string;
  checksum: string;
  status: "uploaded" | "processing" | "indexed" | "failed" | "pending" | "error";
  file_size_bytes: number;
  mime_type: string;
  error_message?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export interface DocumentSignedUrlResponse {
  document_id: string;
  filename: string;
  download_url: string;
  expires_in_seconds: number;
}

export interface Chunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  token_count?: number;
  metadata?: {
    page_number?: number;
    section_title?: string;
    start_char_offset?: number;
    end_char_offset?: number;
    source_filename?: string;
    [key: string]: any;
  };
  document_filename?: string;
  created_at: string;
}

export interface EvidenceLink {
  id: string;
  claim_id: string;
  chunk_id: string;
  document_filename?: string;
  relevance_score?: number;
  exact_quote?: string;
  start_char_offset?: number;
  end_char_offset?: number;
  chunk_content?: string;
  document_id?: string;
  page_number?: number;
}

export interface Claim {
  id: string;
  answer_id: string;
  claim_index: number;
  claim_text: string;
  verdict: Verdict;
  confidence_score?: number;
  rationale?: string;
  evidence_links: EvidenceLink[];
}

export interface Answer {
  id: string;
  query_id: string;
  draft_text: string;
  final_text: string;
  correction_rounds: number;
  is_abstained: boolean;
  claims: Claim[];
  created_at: string;
}

export interface CorrectionRound {
  round: number;
  draft_before?: string;
  revised_text?: string;
  targeted_claims?: string[];
  failed_count_before?: number;
  failed_count_after?: number;
  new_evidence_chunks?: string[];
  metrics?: Record<string, any>;
  unsupported_count?: number;
  retrieved_passages?: string[];
}

export interface AnswerAudit {
  answer_id: string;
  query_id: string;
  prompt: string;
  draft_text: string;
  final_text: string;
  correction_rounds: number;
  is_abstained: boolean;
  claims: Claim[];
  hallucination_rate: number;
  correction_history?: CorrectionRound[];
  verification_status?: string;
  execution_metadata?: Record<string, any>;
  created_at: string;
}

export type AnswerAuditResponse = AnswerAudit;

export interface AuditListItem {
  answer_id: string;
  prompt: string;
  verification_status?: string;
  claim_count: number;
  claims_count?: number;
  hallucination_rate: number;
  correction_rounds: number;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  workspace_id: string;
  event_type: string;
  actor: string;
  description?: string;
  payload?: Record<string, any>;
  created_at: string;
}

export interface AnalyticsSummary {
  total_queries: number;
  total_documents: number;
  overall_hallucination_rate: number;
  grounding_rate?: number;
  verdict_distribution: Record<Verdict, number>;
  avg_latency_ms: number;
}

export interface DeploymentInfo {
  database_engine: string;
  storage_provider: string;
  embedding_provider: string;
  embedding_dim: number;
  environment: string;
  available_llm_providers: string[];
}

export interface WorkspaceSettings {
  workspace_id: string;
  retrieval_top_k: number;
  max_correction_retries: number;
  abstention_policy: "strict" | "soft";
  preferred_llm_provider: string | null;
  available_llm_providers: string[];
  deployment_info: DeploymentInfo;
}

export interface ServiceHealthItem {
  status: "operational" | "degraded" | "error";
  latency_ms: number;
  details?: string;
}

export interface ConnectivityTestResponse {
  status: "healthy" | "degraded" | "error";
  total_latency_ms: number;
  services: {
    database: ServiceHealthItem;
    storage: ServiceHealthItem;
    llm: ServiceHealthItem;
  };
}
