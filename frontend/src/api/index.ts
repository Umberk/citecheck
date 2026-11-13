import { request, uploadForm } from "./client";
import type {
  Annotation,
  Conversation,
  ConversationDetail,
  DashboardSummary,
  DocumentDetail,
  DocumentItem,
  EvalRun,
  EvalRunInfo,
  Health,
  Locale,
  Message,
  SelectionRequest,
  SystemName,
  User,
} from "./types";

export const api = {
  health: () => request<Health>("/api/health"),

  auth: {
    me: () => request<User>("/api/v1/auth/me", { skipAuthEvent: true }),
    login: (email: string, password: string) =>
      request<User>("/api/v1/auth/login", { method: "POST", json: { email, password }, skipAuthEvent: true }),
    register: (email: string, password: string, display_name: string, locale: Locale) =>
      request<User>("/api/v1/auth/register", {
        method: "POST",
        json: { email, password, display_name, locale },
        skipAuthEvent: true,
      }),
    logout: () => request<void>("/api/v1/auth/logout", { method: "POST", skipAuthEvent: true }),
    updateMe: (patch: Partial<Pick<User, "display_name" | "locale" | "llm_provider">>) =>
      request<User>("/api/v1/users/me", { method: "PATCH", json: patch }),
  },

  documents: {
    list: () => request<DocumentItem[]>("/api/v1/documents"),
    get: (id: string) => request<DocumentDetail>(`/api/v1/documents/${id}`),
    upload: (file: File, onProgress?: (percent: number) => void) => {
      const form = new FormData();
      form.append("file", file);
      return uploadForm<DocumentItem>("/api/v1/documents", form, onProgress);
    },
    importSamples: () => request<DocumentItem[]>("/api/v1/documents/samples", { method: "POST" }),
    remove: (id: string) => request<void>(`/api/v1/documents/${id}`, { method: "DELETE" }),
    reindex: (id: string) => request<DocumentItem>(`/api/v1/documents/${id}/reindex`, { method: "POST" }),
    downloadUrl: (id: string) => `/api/v1/documents/${id}/file?download=1`,
    annotations: (id: string) => request<Annotation[]>(`/api/v1/documents/${id}/annotations`),
  },

  conversations: {
    list: (documentId?: string) =>
      request<Conversation[]>(
        `/api/v1/conversations${documentId ? `?document_id=${encodeURIComponent(documentId)}` : ""}`,
      ),
    create: (document_ids: string[]) =>
      request<ConversationDetail>("/api/v1/conversations", { method: "POST", json: { document_ids } }),
    get: (id: string) => request<ConversationDetail>(`/api/v1/conversations/${id}`),
    remove: (id: string) => request<void>(`/api/v1/conversations/${id}`, { method: "DELETE" }),
    ask: (id: string, question: string, system: SystemName) =>
      request<{ question: Message; answer: Message }>(`/api/v1/conversations/${id}/messages`, {
        method: "POST",
        json: { question, system },
      }),
  },

  selection: (body: SelectionRequest) =>
    request<Annotation>("/api/v1/selection", { method: "POST", json: body }),

  dashboard: () => request<DashboardSummary>("/api/v1/dashboard/summary"),

  evaluation: {
    runs: () => request<EvalRunInfo[]>("/api/v1/evaluation/runs"),
    run: (name: string) => request<EvalRun>(`/api/v1/evaluation/runs/${encodeURIComponent(name)}`),
  },
};
