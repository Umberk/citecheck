import { useState } from "react";
import { App, Button, Progress, Tooltip } from "antd";
import {
  ArrowRight,
  BookOpenText,
  FileStack,
  FileUp,
  FlaskConical,
  MessageSquareText,
  MousePointerSquareDashed,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { ActivityItem, DashboardSummary, EvalRun, EvalSystemSummary } from "../api/types";
import { DocIcon } from "../components/DocIcon";
import { Page, SectionCard } from "../components/PageHeader";
import { CardSkeleton, EmptyState, ErrorState, ListSkeleton } from "../components/States";
import { StatusTag } from "../components/StatusTag";
import { useT } from "../i18n";
import { errorText } from "../lib/errors";
import { formatBytes, fromNow, percent } from "../lib/format";
import { useAsync, useInterval } from "../lib/useAsync";
import { useAuth } from "../stores/auth";
import { usePrefs } from "../stores/prefs";
import { useUi } from "../stores/ui";
import { chartColors } from "../theme/antdTheme";

function greetingKey() {
  const hour = new Date().getHours();
  if (hour < 12) return "dash.morning" as const;
  if (hour < 18) return "dash.afternoon" as const;
  return "dash.evening" as const;
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof FileStack;
  label: string;
  value: string;
  hint: string;
  accent: string;
}) {
  return (
    <div className="card flex items-start gap-3.5 p-4">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${accent}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-3">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
        <p className="mt-0.5 truncate text-xs text-ink-4">{hint}</p>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  title,
  desc,
  onClick,
  loading,
}: {
  icon: typeof FileStack;
  title: string;
  desc: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="card card-hover group flex cursor-pointer flex-col items-start gap-2 p-3.5 text-left disabled:cursor-wait disabled:opacity-60"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
        <Icon size={16} />
      </span>
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-3">{desc}</span>
      </span>
    </button>
  );
}

const activityIcon: Record<ActivityItem["kind"], typeof FileStack> = {
  upload: FileUp,
  question: MessageSquareText,
  selection: MousePointerSquareDashed,
};

function EvalSnapshot() {
  const t = useT();
  const { data, loading, error } = useAsync<EvalRun | null>(async () => {
    const runs = await api.evaluation.runs();
    const preferred = runs.find((run) => run.name === "latest.json" && run.kind === "qa") ?? runs.find((run) => run.kind === "qa");
    return preferred ? api.evaluation.run(preferred.name) : null;
  });
  const systems = ["b1", "b2", "b3", "full"];

  return (
    <SectionCard
      title={t("dash.evalSnapshot")}
      extra={
        <Link to="/evaluation" className="inline-flex items-center gap-1 text-xs !text-ink-3 hover:!text-ink">
          {t("common.viewAll")} <ArrowRight size={12} />
        </Link>
      }
    >
      {loading ? (
        <div className="p-4">
          <ListSkeleton rows={2} />
        </div>
      ) : error || !data ? (
        <EmptyState compact icon={<FlaskConical size={16} />} title={t("dash.evalNone")} description={<code className="text-xs">python -m citecheck.evaluate --dataset custom</code>} />
      ) : (
        <div className="flex flex-col gap-3 p-4">
          <p className="text-xs text-ink-3">{t("dash.evalSnapshotDesc", { file: data.name })}</p>
          {(["citation_precision", "unsupported_rate"] as const).map((metric) => (
            <div key={metric}>
              <p className="mb-1.5 text-xs font-medium text-ink-2">
                {t(`eval.metric.${metric}`)}
                {metric === "unsupported_rate" && <span className="ml-1 font-normal text-ink-4">· {t("eval.lowerBetter")}</span>}
              </p>
              <div className="flex flex-col gap-1">
                {systems.map((system) => {
                  const summary = (data.summary as Record<string, EvalSystemSummary>)[system];
                  if (!summary) return null;
                  const value = summary[metric] ?? 0;
                  return (
                    <div key={system} className="flex items-center gap-2 text-xs">
                      <span className="w-10 shrink-0 font-mono text-ink-3">{system}</span>
                      <Progress
                        percent={value * 100}
                        showInfo={false}
                        size="small"
                        strokeColor={chartColors[system]}
                        className="!m-0 flex-1"
                      />
                      <span className="w-12 shrink-0 text-right tabular-nums text-ink-2">{percent(value)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export default function DashboardPage() {
  const t = useT();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const locale = usePrefs((state) => state.locale);
  const user = useAuth((state) => state.user);
  const version = useUi((state) => state.libraryVersion);
  const openUpload = useUi((state) => state.setUploadOpen);
  const bump = useUi((state) => state.bumpLibrary);
  const [importing, setImporting] = useState(false);
  const { data, loading, error, reload } = useAsync<DashboardSummary>(() => api.dashboard(), [version]);

  useInterval(() => void reload(), data && data.stats.processing > 0 ? 3000 : null);

  const importSamples = async () => {
    setImporting(true);
    try {
      const docs = await api.documents.importSamples();
      message.success(t("lib.samplesImported", { n: docs.length }));
      bump();
    } catch (caught) {
      message.error(errorText(caught, t, "lib"));
    } finally {
      setImporting(false);
    }
  };

  const stats = data?.stats;
  const latestReady = data?.recent_documents.find((doc) => doc.status === "ready");

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {t(greetingKey())}
            {locale === "zh" ? "，" : ", "}
            {user?.display_name}
          </h1>
          <p className="mt-1 text-sm text-ink-3">
            {stats && stats.documents > 0
              ? t("dash.summary", { docs: stats.documents, questions: stats.questions })
              : t("dash.summaryEmpty")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button icon={<Sparkles size={14} />} loading={importing} onClick={importSamples}>
            {t("lib.importSamples")}
          </Button>
          <Button type="primary" icon={<UploadCloud size={14} />} onClick={() => openUpload(true)}>
            {t("lib.upload")}
          </Button>
        </div>
      </div>

      {error && !data ? (
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {!stats ? (
              Array.from({ length: 4 }).map((_, index) => <CardSkeleton key={index} rows={1} />)
            ) : (
              <>
                <StatCard
                  icon={FileStack}
                  label={t("dash.stat.documents")}
                  value={String(stats.documents)}
                  hint={t("dash.stat.documentsHint", { ready: stats.ready, processing: stats.processing })}
                  accent="bg-brand-50 text-brand-600"
                />
                <StatCard
                  icon={BookOpenText}
                  label={t("dash.stat.pages")}
                  value={String(stats.pages)}
                  hint={t("dash.stat.pagesHint")}
                  accent="bg-info-soft text-info"
                />
                <StatCard
                  icon={MessageSquareText}
                  label={t("dash.stat.questions")}
                  value={String(stats.questions)}
                  hint={t("dash.stat.questionsHint", { n: stats.conversations })}
                  accent="bg-[#f3efff] text-[#6941c6]"
                />
                <StatCard
                  icon={ShieldCheck}
                  label={t("dash.stat.support")}
                  value={stats.claims_total ? percent(stats.claims_supported / stats.claims_total, 0) : "—"}
                  hint={
                    stats.claims_total
                      ? t("dash.stat.supportHint", { supported: stats.claims_supported, total: stats.claims_total })
                      : t("dash.stat.supportEmpty")
                  }
                  accent="bg-ok-soft text-ok"
                />
              </>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="flex flex-col gap-4 xl:col-span-8">
              <SectionCard
                title={t("dash.recentDocs")}
                extra={
                  <Link to="/library" className="inline-flex items-center gap-1 text-xs !text-ink-3 hover:!text-ink">
                    {t("common.viewAll")} <ArrowRight size={12} />
                  </Link>
                }
              >
                {loading && !data ? (
                  <div className="p-4">
                    <ListSkeleton rows={3} />
                  </div>
                ) : data && data.recent_documents.length > 0 ? (
                  <ul className="m-0 list-none divide-y divide-solid divide-line p-0 [&>li]:border-0">
                    {data.recent_documents.map((doc) => (
                      <li key={doc.id}>
                        <Link
                          to={doc.status === "ready" ? `/reader/${doc.id}` : "/library"}
                          className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-subtle"
                        >
                          <DocIcon status={doc.status} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink">{doc.title}</p>
                            <p className="truncate text-xs text-ink-3">
                              {doc.page_count ? `${t("common.pages", { n: doc.page_count })} · ` : ""}
                              {formatBytes(doc.size_bytes)} · {fromNow(doc.created_at, locale)}
                            </p>
                          </div>
                          <StatusTag status={doc.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    compact
                    title={t("dash.noDocs")}
                    description={t("lib.emptyDesc")}
                    action={
                      <Button size="small" type="primary" onClick={() => openUpload(true)}>
                        {t("lib.upload")}
                      </Button>
                    }
                  />
                )}
              </SectionCard>

              <SectionCard
                title={t("dash.recentConversations")}
                extra={
                  <Link to="/history" className="inline-flex items-center gap-1 text-xs !text-ink-3 hover:!text-ink">
                    {t("common.viewAll")} <ArrowRight size={12} />
                  </Link>
                }
              >
                {loading && !data ? (
                  <div className="p-4">
                    <ListSkeleton rows={3} />
                  </div>
                ) : data && data.recent_conversations.length > 0 ? (
                  <ul className="m-0 grid list-none grid-cols-1 gap-px bg-line p-0 md:grid-cols-2">
                    {data.recent_conversations.map((conversation, index) => {
                      const doc = conversation.documents.find((item) => item.available);
                      const lastOdd = index === data.recent_conversations.length - 1 && index % 2 === 0;
                      return (
                        <li key={conversation.id} className={`bg-surface ${lastOdd ? "md:col-span-2" : ""}`}>
                          <Link
                            to={doc ? `/reader/${doc.id}?conversation=${conversation.id}` : "/history"}
                            className="flex h-full flex-col gap-1 px-4 py-3 transition-colors hover:bg-subtle"
                          >
                            <p className="line-clamp-2 text-sm font-medium text-ink">{conversation.last_question ?? conversation.title}</p>
                            <p className="truncate text-xs text-ink-3">
                              {conversation.documents.map((item) => item.title).join(" · ")}
                            </p>
                            <p className="text-2xs text-ink-4">
                              {t("hist.messages", { n: conversation.message_count })} · {fromNow(conversation.updated_at, locale)}
                            </p>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyState compact icon={<MessageSquareText size={16} />} title={t("dash.noConversations")} description={t("reader.chatEmptyDesc")} />
                )}
              </SectionCard>
            </div>

            <div className="flex flex-col gap-4 xl:col-span-4">
              <SectionCard title={t("dash.quick")}>
                <div className="grid grid-cols-2 gap-2.5 p-3">
                  <QuickAction icon={UploadCloud} title={t("dash.quick.upload")} desc={t("dash.quick.uploadDesc")} onClick={() => openUpload(true)} />
                  <QuickAction
                    icon={Sparkles}
                    title={t("dash.quick.samples")}
                    desc={t("dash.quick.samplesDesc")}
                    onClick={importSamples}
                    loading={importing}
                  />
                  <QuickAction
                    icon={BookOpenText}
                    title={t("dash.quick.reader")}
                    desc={latestReady ? latestReady.title : t("dash.quick.readerDesc")}
                    onClick={() => navigate(latestReady ? `/reader/${latestReady.id}` : "/reader")}
                  />
                  <QuickAction icon={FlaskConical} title={t("dash.quick.eval")} desc={t("dash.quick.evalDesc")} onClick={() => navigate("/evaluation")} />
                </div>
              </SectionCard>

              <EvalSnapshot />

              <SectionCard title={t("dash.activity")}>
                {loading && !data ? (
                  <div className="p-4">
                    <ListSkeleton rows={3} />
                  </div>
                ) : data && data.activity.length > 0 ? (
                  <ol className="m-0 flex list-none flex-col p-4">
                    {data.activity.map((item, index) => {
                      const Icon = activityIcon[item.kind];
                      const target = item.conversation_id && item.document_id
                        ? `/reader/${item.document_id}?conversation=${item.conversation_id}`
                        : item.document_id
                          ? `/reader/${item.document_id}`
                          : undefined;
                      const body = (
                        <div className="min-w-0 flex-1 pb-3">
                          <p className="text-xs text-ink-3">
                            {t(`dash.act.${item.kind}`)} · {fromNow(item.created_at, locale)}
                          </p>
                          <Tooltip title={item.detail} placement="left">
                            <p className="line-clamp-2 text-sm text-ink">{item.title}</p>
                          </Tooltip>
                        </div>
                      );
                      return (
                        <li key={`${item.kind}-${item.created_at}-${index}`} className="relative flex gap-3">
                          {index < data.activity.length - 1 && (
                            <span className="absolute left-[13px] top-7 h-[calc(100%-24px)] w-px bg-line" />
                          )}
                          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-solid border-line bg-surface text-ink-3">
                            <Icon size={13} />
                          </span>
                          {target ? (
                            <Link to={target} className="min-w-0 flex-1 hover:[&_p:last-child]:text-brand-600">
                              {body}
                            </Link>
                          ) : (
                            body
                          )}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <EmptyState compact title={t("dash.noActivity")} />
                )}
              </SectionCard>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
