import { useEffect, useState } from "react";
import { App, Button, Popconfirm, Select, Spin } from "antd";
import { ArrowRight, FileText, History, MessageSquareText, Trash2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { Conversation, ConversationDetail } from "../api/types";
import { Page, PageHeader } from "../components/PageHeader";
import { EmptyState, ErrorState, ListSkeleton } from "../components/States";
import { AnswerCard } from "../features/reader/AnswerCard";
import { useT } from "../i18n";
import { errorText } from "../lib/errors";
import { formatDate, fromNow } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { usePrefs } from "../stores/prefs";

export default function HistoryPage() {
  const t = useT();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const locale = usePrefs((state) => state.locale);
  const [params, setParams] = useSearchParams();
  const documentFilter = params.get("document") ?? undefined;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const docs = useAsync(() => api.documents.list(), []);
  const list = useAsync(() => api.conversations.list(documentFilter), [documentFilter]);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<unknown>(null);

  useEffect(() => {
    if (!selectedId && list.data?.length) setSelectedId(list.data[0].id);
    if (selectedId && list.data && !list.data.some((item) => item.id === selectedId)) {
      setSelectedId(list.data[0]?.id ?? null);
    }
  }, [list.data, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    api.conversations
      .get(selectedId)
      .then(setDetail)
      .catch(setDetailError)
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const open = (conversation: Conversation) => {
    const doc = conversation.documents.find((item) => item.available);
    if (doc) navigate(`/reader/${doc.id}?conversation=${conversation.id}`);
  };

  const remove = async (conversation: Conversation) => {
    try {
      await api.conversations.remove(conversation.id);
      list.setData((previous) => (previous ?? []).filter((item) => item.id !== conversation.id));
      if (selectedId === conversation.id) setSelectedId(null);
    } catch (error) {
      message.error(errorText(error, t));
    }
  };

  const conversations = list.data ?? [];

  return (
    <Page wide>
      <PageHeader
        title={t("hist.title")}
        subtitle={t("hist.subtitle")}
        actions={
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t("hist.filter")}
            value={documentFilter}
            onChange={(value?: string) => setParams(value ? { document: value } : {})}
            className="w-64"
            options={(docs.data ?? []).map((doc) => ({ value: doc.id, label: doc.title }))}
          />
        }
      />

      {list.error && !list.data ? (
        <div className="card">
          <ErrorState error={list.error} onRetry={list.reload} />
        </div>
      ) : list.loading && !list.data ? (
        <div className="card p-4">
          <ListSkeleton rows={5} />
        </div>
      ) : conversations.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<History size={20} />}
            title={t("hist.empty")}
            description={t("hist.emptyDesc")}
            action={
              <Button type="primary" onClick={() => navigate("/reader")}>
                {t("nav.reader")}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid min-h-[560px] grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,2fr)_3fr]">
          <div className="card flex flex-col overflow-hidden">
            <div className="flex h-11 items-center border-0 border-b border-solid border-line px-4 text-xs text-ink-3">
              {t("hist.messages", { n: conversations.reduce((sum, item) => sum + item.message_count, 0) })} ·{" "}
              {conversations.length}
            </div>
            <ul className="scroll-thin m-0 max-h-[calc(100vh-260px)] list-none overflow-y-auto p-1.5">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(conversation.id)}
                    className={`group flex w-full cursor-pointer flex-col gap-1 rounded-md border-0 px-3 py-2.5 text-left transition-colors ${
                      selectedId === conversation.id ? "bg-brand-50" : "bg-transparent hover:bg-subtle"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquareText
                        size={14}
                        className={`mt-[3px] shrink-0 ${selectedId === conversation.id ? "text-brand-600" : "text-ink-4"}`}
                      />
                      <p className="line-clamp-2 flex-1 text-sm font-medium text-ink">
                        {conversation.last_question ?? conversation.title}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-[22px] text-2xs text-ink-3">
                      {conversation.documents.map((doc) => (
                        <span key={doc.id} className={`chip max-w-[200px] ${doc.available ? "bg-subtle text-ink-3" : "bg-bad-soft text-bad line-through"}`}>
                          <FileText size={10} className="shrink-0" />
                          <span className="truncate">{doc.title}</span>
                        </span>
                      ))}
                    </div>
                    <p className="pl-[22px] text-2xs text-ink-4">
                      {t("hist.messages", { n: conversation.message_count })} · {fromNow(conversation.updated_at, locale)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="card flex min-h-0 flex-col overflow-hidden">
            {!selectedId ? (
              <EmptyState compact title={t("hist.selectOne")} />
            ) : detailLoading && !detail ? (
              <div className="flex flex-1 items-center justify-center py-16">
                <Spin />
              </div>
            ) : detailError ? (
              <ErrorState error={detailError} />
            ) : detail ? (
              <>
                <div className="flex items-center gap-3 border-0 border-b border-solid border-line px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{detail.title}</p>
                    <p className="text-2xs text-ink-4">{formatDate(detail.created_at, locale, true)}</p>
                  </div>
                  <Popconfirm
                    title={t("hist.deleteConfirm")}
                    okButtonProps={{ danger: true }}
                    okText={t("common.delete")}
                    cancelText={t("common.cancel")}
                    onConfirm={() => remove(detail)}
                  >
                    <Button icon={<Trash2 size={14} />} size="small" danger type="text" />
                  </Popconfirm>
                  <Button
                    type="primary"
                    size="small"
                    disabled={!detail.documents.some((doc) => doc.available)}
                    onClick={() => open(detail)}
                  >
                    {t("hist.continue")} <ArrowRight size={13} />
                  </Button>
                </div>
                <div className="scroll-thin flex max-h-[calc(100vh-260px)] flex-col gap-3 overflow-y-auto bg-canvas/50 p-4">
                  {detail.messages.map((item) =>
                    item.role === "user" ? (
                      <div key={item.id} className="flex justify-end">
                        <p className="max-w-[80%] rounded-lg rounded-br-sm bg-brand-600 px-3 py-2 text-sm text-white">{item.content}</p>
                      </div>
                    ) : item.payload ? (
                      <AnswerCard
                        key={item.id}
                        payload={item.payload}
                        active={false}
                        onLocate={() => open(detail)}
                        onShow={() => open(detail)}
                      />
                    ) : null,
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </Page>
  );
}
