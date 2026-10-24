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
  created_at: string;
}

export interface DocumentSignedUrlResponse {
  document_id: string;
  filename: string;
  download_url: string;
  expires_in_seconds: number;
}

export interface EvidenceLink {
  id: string;
  claim_id: string;
  chunk_id: string;
  relevance_score?: number;
  exact_quote?: string;
  start_char_offset?: number;
  end_char_offset?: number;
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
  created_at: string;
}

export interface AnalyticsSummary {
  total_queries: number;
  total_documents: number;
  overall_hallucination_rate: number;
  verdict_distribution: Record<Verdict, number>;
  avg_latency_ms: number;
}
