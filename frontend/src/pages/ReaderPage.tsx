import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Drawer, Grid, Spin } from "antd";
import { AlertTriangle, BookOpenText, FileSearch, Loader2, MessageSquareText, MousePointerSquareDashed, PanelRightOpen, RefreshCw, Route } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type {
  Annotation,
  Claim,
  ConversationDetail,
  DocumentDetail,
  DocumentRef,
  Evidence,
  Message,
  SelectionAction,
  SystemName,
} from "../api/types";
import { DocIcon } from "../components/DocIcon";
import { Page, PageHeader } from "../components/PageHeader";
import { CardSkeleton, EmptyState, ErrorState } from "../components/States";
import { ChatPanel, type PendingAsk } from "../features/reader/ChatPanel";
import { EvidencePanel } from "../features/reader/EvidencePanel";
import { OutlinePanel } from "../features/reader/OutlinePanel";
import type { PDFDocumentProxy } from "../features/reader/pdf";
import { PdfViewer, type PdfViewerHandle } from "../features/reader/PdfViewer";
import { SelectionPanel, type PendingSelection } from "../features/reader/SelectionPanel";
import { SelectionToolbar } from "../features/reader/SelectionToolbar";
import { targetFromAnnotation, targetFromClaim, targetFromEvidence } from "../features/reader/targets";
import { TracePanel } from "../features/reader/TracePanel";
import type { HighlightTarget, SelectionInfo } from "../features/reader/types";
import { useT, type MessageKey } from "../i18n";
import { errorText } from "../lib/errors";
import { formatBytes, fromNow } from "../lib/format";
import { useAsync, useInterval } from "../lib/useAsync";
import { usePrefs } from "../stores/prefs";
import { useUi } from "../stores/ui";

type Tab = "chat" | "evidence" | "trace" | "selection";

const tabs: { key: Tab; label: MessageKey; icon: typeof Route }[] = [
  { key: "chat", label: "reader.tab.chat", icon: MessageSquareText },
  { key: "evidence", label: "reader.tab.evidence", icon: FileSearch },
  { key: "trace", label: "reader.tab.trace", icon: Route },
  { key: "selection", label: "reader.tab.selection", icon: MousePointerSquareDashed },
];

function ReaderPicker() {
  const t = useT();
  const locale = usePrefs((state) => state.locale);
  const openUpload = useUi((state) => state.setUploadOpen);
  const version = useUi((state) => state.libraryVersion);
  const { data, loading, error, reload } = useAsync(() => api.documents.list(), [version]);
  const ready = (data ?? []).filter((doc) => doc.status === "ready");

  return (
    <Page>
      <PageHeader title={t("reader.pick")} subtitle={t("reader.pickDesc")} />
      {error ? (
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      ) : loading && !data ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <CardSkeleton key={index} rows={1} />
          ))}
        </div>
      ) : ready.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<BookOpenText size={20} />}
            title={t("lib.empty")}
            description={t("lib.emptyDesc")}
            action={
              <>
                <Link to="/library">
                  <Button>{t("nav.library")}</Button>
                </Link>
                <Button type="primary" onClick={() => openUpload(true)}>
                  {t("lib.upload")}
                </Button>
              </>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ready.map((doc) => (
            <Link key={doc.id} to={`/reader/${doc.id}`} className="card card-hover flex items-center gap-3 p-4">
              <DocIcon status={doc.status} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{doc.title}</p>
                <p className="truncate text-xs text-ink-3">
                  {t("common.pages", { n: doc.page_count ?? 0 })} · {formatBytes(doc.size_bytes)} · {fromNow(doc.created_at, locale)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}

function DocumentStatusView({ doc, onReindex }: { doc: DocumentDetail; onReindex: () => void }) {
  const t = useT();
  if (doc.status === "failed") {
    return (
      <EmptyState
        icon={<AlertTriangle size={20} className="text-bad" />}
        title={t("reader.failed")}
        description={doc.error_message ?? undefined}
        action={
          <Button icon={<RefreshCw size={14} />} onClick={onReindex}>
            {t("lib.reindex")}
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={<Loader2 size={20} className="animate-spin text-info" />}
      title={t("reader.notReady")}
      description={t("reader.notReadyDesc")}
    />
  );
}

function Workspace({ documentId, conversationId }: { documentId: string; conversationId: string | null }) {
  const t = useT();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const screens = Grid.useBreakpoint();
  const locale = usePrefs((state) => state.locale);
  const defaultSystem = usePrefs((state) => state.defaultSystem);
  const setCrumb = useUi((state) => state.setCrumb);
  const version = useUi((state) => state.libraryVersion);

  const [activeDocId, setActiveDocId] = useState(documentId);
  const [scopeIds, setScopeIds] = useState<string[]>([documentId]);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [conversationError, setConversationError] = useState<unknown>(null);
  const [system, setSystem] = useState<SystemName>(defaultSystem);
  const [pending, setPending] = useState<PendingAsk | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [target, setTarget] = useState<HighlightTarget | null>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [latestAnnotationId, setLatestAnnotationId] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const viewerRef = useRef<PdfViewerHandle>(null);

  const docs = useAsync(() => api.documents.list(), [version]);
  const detail = useAsync(() => api.documents.get(activeDocId), [activeDocId]);
  const annotations = useAsync<Annotation[]>(() => api.documents.annotations(activeDocId), [activeDocId]);
  const doc = detail.data;
  const notReady = doc && doc.status !== "ready";
  useInterval(() => void detail.reload(), notReady && doc.status !== "failed" ? 2000 : null);

  useEffect(() => {
    setCrumb(doc?.title ?? null);
  }, [doc?.title, setCrumb]);

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      return;
    }
    if (conversation?.id === conversationId) return;
    setConversationError(null);
    api.conversations
      .get(conversationId)
      .then((loaded) => {
        setConversation(loaded);
        setScopeIds(loaded.document_ids);
        const lastAnswer = [...loaded.messages].reverse().find((item) => item.role === "assistant");
        setActiveMessageId(lastAnswer?.id ?? null);
        const lastSystem = lastAnswer?.payload?.system;
        if (lastSystem) setSystem(lastSystem);
      })
      .catch((error) => setConversationError(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const docList = docs.data ?? [];
  const scope: DocumentRef[] = useMemo(() => {
    if (conversation) return conversation.documents;
    return scopeIds.map((id) => {
      const found = docList.find((item) => item.id === id);
      return { id, title: found?.title ?? (id === doc?.id ? doc.title : "…"), available: true };
    });
  }, [conversation, scopeIds, docList, doc]);
  const candidates = docList.filter((item) => item.status === "ready" && !scopeIds.includes(item.id));
  const messages = conversation?.messages ?? [];
  const activeMessage =
    messages.find((item) => item.id === activeMessageId && item.payload) ??
    [...messages].reverse().find((item) => item.role === "assistant" && item.payload) ??
    null;

  const ask = async (question: string) => {
    setPending({ question, system, startedAt: Date.now() });
    setAskError(null);
    setLastQuestion(question);
    setTab("chat");
    try {
      let current = conversation;
      if (!current) {
        current = await api.conversations.create(scopeIds);
        setConversation(current);
        setParams({ conversation: current.id }, { replace: true });
      }
      const result = await api.conversations.ask(current.id, question, system);
      setConversation((previous) =>
        previous
          ? {
              ...previous,
              messages: [...previous.messages, result.question, result.answer],
              message_count: previous.message_count + 2,
              last_question: question,
            }
          : previous,
      );
      setActiveMessageId(result.answer.id);
    } catch (error) {
      setAskError(errorText(error, t));
    } finally {
      setPending(null);
    }
  };

  const show = (next: HighlightTarget | null) => {
    if (!next) {
      message.info(t("reader.locate.noneHint"));
      return;
    }
    if (next.documentId !== activeDocId) {
      setActiveDocId(next.documentId);
      setPdf(null);
    }
    setTarget(next);
  };

  const locateClaim = (claim: Claim, owner: Message) => {
    setActiveMessageId(owner.id);
    show(targetFromClaim(claim, owner.payload?.evidence ?? []));
  };
  const locateEvidence = (item: Evidence) => show(targetFromEvidence(item));
  const locateAnnotation = (item: Annotation) => show(targetFromAnnotation(item, doc?.title ?? ""));

  const runSelection = async (action: SelectionAction, question?: string) => {
    const current = selection;
    if (!current) return;
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    setTab("selection");
    if (!screens.lg) setPanelOpen(true);
    const base: PendingSelection = { text: current.text, action, question };
    setPendingSelection(base);
    try {
      const created = await api.selection({
        document_id: current.documentId,
        page_index: current.pageIndex,
        text: current.text,
        action,
        question,
        context: current.context,
        anchor: { page_index: current.pageIndex, rects: current.rects, text_offset: current.textOffset },
        locale,
      });
      annotations.setData((previous) => [created, ...(previous ?? [])]);
      setLatestAnnotationId(created.id);
      setPendingSelection(null);
    } catch (error) {
      setPendingSelection({ ...base, error: errorText(error, t) });
    }
  };

  const onSelection = useCallback((info: SelectionInfo | null) => setSelection(info), []);
  const clearTarget = useCallback(() => setTarget(null), []);

  const newChat = () => {
    setConversation(null);
    setActiveMessageId(null);
    setAskError(null);
    setScopeIds([activeDocId]);
    setParams({}, { replace: true });
  };

  const reindex = async () => {
    try {
      await api.documents.reindex(activeDocId);
      void detail.reload();
    } catch (error) {
      message.error(errorText(error, t, "lib"));
    }
  };

  const showLeft = screens.xl;
  const inlinePanel = screens.lg;

  const panel = (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-11 shrink-0 items-center gap-0.5 border-0 border-b border-solid border-line px-2">
        {tabs.map(({ key, label, icon: Icon }) => {
          const count =
            key === "evidence"
              ? activeMessage?.payload?.evidence.length
              : key === "selection"
                ? annotations.data?.length
                : undefined;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`relative flex h-8 cursor-pointer items-center gap-1.5 rounded-md border-0 px-2.5 text-xs font-medium transition-colors ${
                tab === key ? "bg-subtle text-ink" : "bg-transparent text-ink-3 hover:text-ink"
              }`}
            >
              <Icon size={14} className={tab === key ? "text-brand-600" : undefined} />
              {t(label)}
              {count ? <span className="rounded-sm bg-muted px-1 text-2xs tabular-nums text-ink-3">{count}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="relative min-h-0 flex-1">
        <div className={`absolute inset-0 ${tab === "chat" ? "" : "hidden"}`}>
          {conversationError ? (
            <ErrorState error={conversationError} onRetry={() => navigate(`/reader/${documentId}`)} />
          ) : (
            <ChatPanel
              messages={messages}
              pending={pending}
              error={askError}
              activeMessageId={activeMessage?.id ?? null}
              system={system}
              scope={scope}
              scopeEditable={!conversation}
              candidates={candidates}
              onSystemChange={setSystem}
              onAsk={(question) => void ask(question)}
              onRetry={() => lastQuestion && void ask(lastQuestion)}
              onLocate={locateClaim}
              onShow={(owner, next) => {
                setActiveMessageId(owner.id);
                setTab(next);
              }}
              onAddScope={(id) => setScopeIds((ids) => [...ids, id])}
              onRemoveScope={(id) => setScopeIds((ids) => ids.filter((item) => item !== id))}
              onNewChat={newChat}
            />
          )}
        </div>
        {tab !== "chat" && (
          <div className="scroll-thin absolute inset-0 overflow-y-auto bg-canvas/60">
            {tab === "evidence" && <EvidencePanel payload={activeMessage?.payload ?? null} onLocate={locateEvidence} />}
            {tab === "trace" && <TracePanel payload={activeMessage?.payload ?? null} />}
            {tab === "selection" && (
              <SelectionPanel
                pending={pendingSelection}
                items={annotations.data ?? []}
                loading={annotations.loading}
                latestId={latestAnnotationId}
                onLocate={locateAnnotation}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );

  let center;
  if (detail.error && !doc) {
    center = <ErrorState error={detail.error} onRetry={detail.reload} />;
  } else if (!doc) {
    center = (
      <div className="flex h-full items-center justify-center">
        <Spin />
      </div>
    );
  } else if (notReady) {
    center = (
      <div className="flex h-full items-center justify-center">
        <DocumentStatusView doc={doc} onReindex={reindex} />
      </div>
    );
  } else {
    center = (
      <PdfViewer
        key={doc.id}
        ref={viewerRef}
        documentId={doc.id}
        fileUrl={doc.file_url}
        target={target}
        onClearTarget={clearTarget}
        onSelection={onSelection}
        onLoaded={setPdf}
        onPageChange={setCurrentPage}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {showLeft && (
        <aside className="w-[248px] shrink-0 border-0 border-r border-solid border-line bg-canvas">
          {scope.length > 1 && (
            <div className="flex flex-col gap-0.5 border-0 border-b border-solid border-line p-2">
              {scope
                .filter((item) => item.available)
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveDocId(item.id);
                      setPdf(null);
                    }}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border-0 px-2 py-1.5 text-left text-xs ${
                      item.id === activeDocId ? "bg-surface font-medium text-ink shadow-xs ring-1 ring-line" : "bg-transparent text-ink-2 hover:bg-muted"
                    }`}
                  >
                    <BookOpenText size={13} className="shrink-0 text-ink-3" />
                    <span className="truncate">{item.title}</span>
                  </button>
                ))}
            </div>
          )}
          <div className={scope.length > 1 ? "h-[calc(100%-1px)]" : "h-full"}>
            <OutlinePanel document={doc ?? null} pdf={pdf} currentPage={currentPage} onJump={(index) => viewerRef.current?.scrollToPage(index)} />
          </div>
        </aside>
      )}
      <section className="relative min-w-0 flex-1">{center}</section>
      {inlinePanel ? (
        <aside className="w-[400px] shrink-0 border-0 border-l border-solid border-line 2xl:w-[460px]">{panel}</aside>
      ) : (
        <>
          <Button
            type="primary"
            shape="round"
            icon={<PanelRightOpen size={15} />}
            onClick={() => setPanelOpen(true)}
            className="!fixed bottom-5 right-5 z-30 shadow-lg"
          >
            {t("reader.tab.chat")}
          </Button>
          <Drawer open={panelOpen} onClose={() => setPanelOpen(false)} width="min(460px, 100vw)" closable={false} styles={{ body: { padding: 0 } }}>
            {panel}
          </Drawer>
        </>
      )}
      {selection && <SelectionToolbar selection={selection} onAction={(action, question) => void runSelection(action, question)} onClose={() => setSelection(null)} />}
    </div>
  );
}

export default function ReaderPage() {
  const { documentId } = useParams();
  const [params] = useSearchParams();
  if (!documentId) return <ReaderPicker />;
  return <Workspace key={documentId} documentId={documentId} conversationId={params.get("conversation")} />;
}
