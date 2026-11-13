export type Locale = "zh" | "en";
export type LlmProvider = "llm" | "teamily";

export interface User {
  id: string;
  email: string;
  display_name: string;
  locale: Locale;
  llm_provider: LlmProvider;
  created_at: string;
}

export interface LlmProviderOption {
  id: LlmProvider;
  model: string;
  configured: boolean;
}

export type DocumentStatus = "pending" | "indexing" | "ready" | "failed";

export interface OutlineSection {
  name: string;
  page: number | null;
  page_index: number | null;
  chunks: number;
}

/** One PDF owned by the current user. `file_url` is the only way to read its bytes. */
export interface DocumentItem {
  id: string;
  title: string;
  filename: string;
  source: "upload" | "sample";
  size_bytes: number;
  page_count: number | null;
  chunk_count: number | null;
  status: DocumentStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  file_url: string;
}

export interface DocumentDetail extends DocumentItem {
  outline: OutlineSection[];
}

/**
 * A library is the set of documents one question is asked against.
 * `library_id` is derived from the sorted document ids, so the same set
 * always maps to the same retriever on the server.
 */
export interface Library {
  library_id: string;
  document_ids: string[];
}

/** Rect in page-relative units: [x0, y0, x1, y1] with 0..1 coordinates. */
export type Rect = [number, number, number, number];

export interface PageLocation {
  page_index: number;
  rects: Rect[];
}

/** exact: rects found in the PDF; page: only the page is known; none: no location. */
export type LocateLevel = "exact" | "page" | "none";

export interface Evidence {
  evidence_id: string;
  rank: number;
  chunk_id: string;
  document_id: string;
  paper_title: string;
  section: string;
  page: number | null;
  page_index: number | null;
  text: string;
  locate: LocateLevel;
  locations: PageLocation[];
}

export type ClaimLabel = "supported" | "uncertain";
export type Verdict = "supports" | "refutes" | "not_enough";

export interface Claim {
  index: number;
  text: string;
  label: ClaimLabel;
  verdict: Verdict;
  section: string | null;
  page: number | null;
  page_index: number | null;
  paper_title: string | null;
  document_id: string | null;
  evidence_id: string | null;
  locate: LocateLevel;
  focus: PageLocation[];
}

export interface TraceStep {
  action: string;
  queries: string[];
}

export type SystemName = "b1" | "b2" | "b3" | "full" | "no_planner" | "embedding_only" | "no_verifier";

export interface AnswerPayload {
  answer: string;
  system: SystemName;
  verify: boolean;
  steps: number;
  latency_s: number;
  prompt_tokens: number;
  completion_tokens: number;
  trace: TraceStep[];
  claims: Claim[];
  evidence: Evidence[];
  library_id: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  system: SystemName | null;
  created_at: string;
  payload: AnswerPayload | null;
}

export interface DocumentRef {
  id: string;
  title: string;
  available: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  library_id: string;
  document_ids: string[];
  documents: DocumentRef[];
  created_at: string;
  updated_at: string;
  message_count: number;
  last_question: string | null;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export type SelectionAction = "explain" | "translate" | "methods" | "formula" | "summarize" | "ask";

export interface SelectionAnchor {
  page_index: number;
  rects: Rect[];
  text_offset: number | null;
}

export interface SelectionRequest {
  document_id: string;
  page_index: number;
  text: string;
  action: SelectionAction;
  question?: string;
  context?: string;
  anchor?: SelectionAnchor;
  locale: Locale;
}

export interface Annotation {
  id: string;
  document_id: string;
  page_index: number;
  text: string;
  action: SelectionAction;
  question: string | null;
  answer: string;
  section: string | null;
  chunk_id: string | null;
  anchor: SelectionAnchor | null;
  latency_s: number | null;
  created_at: string;
}

export interface ActivityItem {
  kind: "upload" | "question" | "selection";
  title: string;
  detail: string | null;
  document_id: string | null;
  conversation_id: string | null;
  created_at: string;
}

export interface DashboardSummary {
  stats: {
    documents: number;
    ready: number;
    processing: number;
    failed: number;
    pages: number;
    conversations: number;
    questions: number;
    selections: number;
    claims_total: number;
    claims_supported: number;
  };
  recent_documents: DocumentItem[];
  recent_conversations: Conversation[];
  activity: ActivityItem[];
}

export interface Health {
  status: "ok";
  storage: "cos" | "local";
  llm_configured: boolean;
  llm_provider?: LlmProvider;
  llm_providers: LlmProviderOption[];
  index_queue: number;
  max_upload_mb: number;
}

export interface EvalSystemSummary {
  n: number;
  token_f1: number | null;
  evidence_recall: number | null;
  citation_precision: number | null;
  citation_recall: number | null;
  unsupported_rate: number | null;
  success_rate: number | null;
  steps: number | null;
  latency_s: number | null;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface EvalRunInfo {
  name: string;
  kind: "qa" | "scifact";
  dataset: "custom" | "qasper" | "scifact" | "unknown";
  modified_at: string;
  systems: string[];
  row_count: number;
  errors: number;
}

export interface EvalRow {
  id: string;
  system: string;
  prediction?: string;
  token_f1?: number;
  evidence_recall?: number | null;
  unsupported_rate?: number;
  success?: boolean;
  steps?: number;
  latency_s?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  citation_precision?: number;
  citation_recall?: number;
  error?: string;
  gold?: string;
  predicted?: string;
  correct?: boolean;
}

export interface EvalQuestion {
  id: string;
  question: string;
  answers: string[];
  citations: { section: string; page: number | null }[];
}

export interface EvalRun extends EvalRunInfo {
  summary: Record<string, EvalSystemSummary> | { dataset: string; n: number; label_accuracy: number };
  rows: EvalRow[];
  errors_by_system: Record<string, number>;
  questions: EvalQuestion[];
}
