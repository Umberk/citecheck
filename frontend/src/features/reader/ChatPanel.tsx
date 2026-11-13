import { useEffect, useRef, useState } from "react";
import { Button, Input, Select, Tooltip } from "antd";
import { AlertTriangle, ArrowUp, FileText, MessageSquarePlus, Plus, RotateCw, Sparkles, X } from "lucide-react";
import type { Claim, DocumentItem, DocumentRef, Message, SystemName } from "../../api/types";
import { useT } from "../../i18n";
import { AnswerCard } from "./AnswerCard";

export interface PendingAsk {
  question: string;
  system: SystemName;
  startedAt: number;
}

const SYSTEMS: SystemName[] = ["full", "b3", "b2", "b1", "no_planner", "embedding_only", "no_verifier"];

function Thinking({ pending }: { pending: PendingAsk }) {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const stages: string[] = [];
  if (pending.system !== "b1") {
    if (!["b2", "no_planner"].includes(pending.system)) stages.push(t("reader.thinking.plan"));
    stages.push(t("reader.thinking.retrieve"));
  }
  stages.push(t("reader.thinking.draft"));
  if (["full", "no_planner", "embedding_only"].includes(pending.system)) stages.push(t("reader.thinking.verify"));

  return (
    <div className="card animate-fade-up overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
        </span>
        <span className="text-xs font-medium text-ink-2">CiteCheck · {pending.system}</span>
        <span className="flex-1" />
        <span className="text-2xs tabular-nums text-ink-4">{((now - pending.startedAt) / 1000).toFixed(1)}s</span>
      </div>
      <div className="flex flex-wrap items-center gap-1 px-3.5 pb-3">
        {stages.map((stage, index) => (
          <span key={stage} className="flex items-center gap-1">
            <span className="chip bg-subtle text-ink-3">{stage}</span>
            {index < stages.length - 1 && <span className="text-ink-4">→</span>}
          </span>
        ))}
      </div>
      <div className="h-0.5 w-full overflow-hidden bg-subtle">
        <div className="h-full w-1/3 animate-[shimmer_1.4s_ease-in-out_infinite] bg-brand-500/60" />
      </div>
    </div>
  );
}

export function ChatPanel({
  messages,
  pending,
  error,
  activeMessageId,
  system,
  scope,
  scopeEditable,
  candidates,
  onSystemChange,
  onAsk,
  onRetry,
  onLocate,
  onShow,
  onAddScope,
  onRemoveScope,
  onNewChat,
}: {
  messages: Message[];
  pending: PendingAsk | null;
  error: string | null;
  activeMessageId: string | null;
  system: SystemName;
  scope: DocumentRef[];
  scopeEditable: boolean;
  candidates: DocumentItem[];
  onSystemChange: (system: SystemName) => void;
  onAsk: (question: string) => void;
  onRetry: () => void;
  onLocate: (claim: Claim, message: Message) => void;
  onShow: (message: Message, tab: "evidence" | "trace") => void;
  onAddScope: (id: string) => void;
  onRemoveScope: (id: string) => void;
  onNewChat: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  const submit = (text = draft) => {
    const question = text.trim();
    if (!question || pending) return;
    onAsk(question);
    setDraft("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-0 border-b border-solid border-line px-3 py-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-4">{t("reader.scope")}</span>
        {scope.map((doc) => (
          <span key={doc.id} className="chip max-w-[180px] bg-subtle py-0.5 text-ink-2">
            <FileText size={11} className="shrink-0" />
            <span className="truncate">{doc.available ? doc.title : t("reader.docUnavailable")}</span>
            {scopeEditable && scope.length > 1 && (
              <button type="button" className="ml-0.5 cursor-pointer border-0 bg-transparent p-0 text-ink-4 hover:text-ink" onClick={() => onRemoveScope(doc.id)}>
                <X size={11} />
              </button>
            )}
          </span>
        ))}
        {scopeEditable && candidates.length > 0 && (
          <Select
            size="small"
            variant="borderless"
            value={null}
            placeholder={
              <span className="inline-flex items-center gap-1 text-xs">
                <Plus size={12} /> {t("reader.addDoc")}
              </span>
            }
            popupMatchSelectWidth={260}
            onChange={(value: string) => onAddScope(value)}
            options={candidates.map((doc) => ({ value: doc.id, label: doc.title }))}
            className="min-w-[96px]"
          />
        )}
        <span className="flex-1" />
        <Tooltip title={t("reader.newChat")}>
          <button type="button" className="icon-btn h-7 w-7" onClick={onNewChat} disabled={!messages.length && !pending}>
            <MessageSquarePlus size={15} />
          </button>
        </Tooltip>
      </div>

      <div ref={listRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !pending ? (
          <div className="flex h-full flex-col justify-center gap-4 px-1">
            <div>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Sparkles size={18} />
              </div>
              <p className="text-base font-semibold text-ink">{t("reader.chatEmpty")}</p>
              <p className="mt-1 text-sm text-ink-3">{t("reader.chatEmptyDesc")}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="eyebrow">{t("reader.suggest")}</p>
              {(["reader.suggest.1", "reader.suggest.2", "reader.suggest.3"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => submit(t(key))}
                  className="card card-hover cursor-pointer px-3 py-2 text-left text-sm text-ink-2"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex animate-fade-up justify-end">
                  <p className="max-w-[88%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-brand-600 px-3 py-2 text-sm text-white">
                    {message.content}
                  </p>
                </div>
              ) : message.payload ? (
                <div key={message.id} className="animate-fade-up">
                  <AnswerCard
                    payload={message.payload}
                    active={message.id === activeMessageId}
                    onLocate={(claim) => onLocate(claim, message)}
                    onShow={(tab) => onShow(message, tab)}
                  />
                </div>
              ) : null,
            )}
            {pending && (
              <>
                <div className="flex justify-end">
                  <p className="max-w-[88%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-brand-600 px-3 py-2 text-sm text-white">
                    {pending.question}
                  </p>
                </div>
                <Thinking pending={pending} />
              </>
            )}
            {error && !pending && (
              <div className="card flex items-start gap-2 border-bad/30 bg-bad-soft/40 p-3 text-sm">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-bad" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-bad">{t("reader.askFailed")}</p>
                  <p className="break-words text-xs text-ink-2">{error}</p>
                </div>
                <Button size="small" icon={<RotateCw size={13} />} onClick={onRetry}>
                  {t("common.retry")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-0 border-t border-solid border-line p-3">
        <div className="rounded-lg border border-solid border-line-strong bg-surface shadow-xs transition-shadow focus-within:border-brand-500 focus-within:shadow-focus">
          <Input.TextArea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPressEnter={(event) => {
              if (!event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={t("reader.askPlaceholder")}
            autoSize={{ minRows: 2, maxRows: 6 }}
            variant="borderless"
            maxLength={1000}
            className="!px-3 !pt-2.5 !text-sm"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <Select<SystemName>
              size="small"
              value={system}
              onChange={onSystemChange}
              popupMatchSelectWidth={280}
              variant="filled"
              options={SYSTEMS.map((value) => ({
                value,
                label: <span className="text-xs">{t(`reader.sys.${value}`)}</span>,
              }))}
              className="min-w-0 max-w-[230px] flex-1"
            />
            <span className="flex-1" />
            <Button
              type="primary"
              size="small"
              shape="circle"
              icon={<ArrowUp size={15} />}
              disabled={!draft.trim() || !!pending}
              onClick={() => submit()}
            />
          </div>
        </div>
        {messages.length > 0 && <p className="mt-1.5 px-1 text-2xs text-ink-4">{t("reader.continueNote")}</p>}
      </div>
    </div>
  );
}
