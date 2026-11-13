import { useEffect, useMemo, useState } from "react";
import { Alert, Select, Table, Tooltip as AntTooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { AlertTriangle, CircleCheck, CircleHelp, Database, FileJson, FlaskConical, Info, Terminal } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import type { EvalRow, EvalRun, EvalSystemSummary } from "../api/types";
import { Page, PageHeader, SectionCard } from "../components/PageHeader";
import { CardSkeleton, EmptyState, ErrorState } from "../components/States";
import { useT, type MessageKey } from "../i18n";
import { fixed, formatDate, percent } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { usePrefs } from "../stores/prefs";
import { chartColors, palette } from "../theme/antdTheme";

const MAIN = ["b1", "b2", "b3", "full"];
const ABLATIONS = ["no_planner", "embedding_only", "no_verifier"];
const RATE_METRICS = ["token_f1", "evidence_recall", "citation_precision", "citation_recall", "success_rate", "unsupported_rate"] as const;
type RateMetric = (typeof RATE_METRICS)[number];
const LOWER_BETTER = new Set<string>(["unsupported_rate", "latency_s"]);

function sysLabel(t: ReturnType<typeof useT>, system: string) {
  const key = `eval.sys.${system}` as MessageKey;
  return t(key) === key ? system : t(key);
}

function MetricCard({
  label,
  help,
  value,
  compare,
  compareLabel,
  lowerBetter,
}: {
  label: string;
  help?: string;
  value: number | null;
  compare: number | null;
  compareLabel: string;
  lowerBetter?: boolean;
}) {
  const delta = value !== null && compare !== null ? value - compare : null;
  const good = delta !== null && (lowerBetter ? delta < 0 : delta > 0);
  const bad = delta !== null && (lowerBetter ? delta > 0 : delta < 0);
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-medium text-ink-3">{label}</p>
        {help && (
          <AntTooltip title={help}>
            <Info size={12} className="text-ink-4" />
          </AntTooltip>
        )}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">{percent(value)}</p>
      <p className="mt-0.5 text-xs text-ink-4">
        {compareLabel} {percent(compare)}
        {delta !== null && Math.abs(delta) > 0.0005 && (
          <span className={`ml-1.5 font-medium ${good ? "text-ok" : bad ? "text-bad" : "text-ink-3"}`}>
            {delta > 0 ? "+" : ""}
            {(delta * 100).toFixed(1)} pt
          </span>
        )}
      </p>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-solid border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-ink">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="flex items-center gap-2 text-ink-2">
          <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
          <span className="flex-1">{item.name}</span>
          <span className="tabular-nums">{typeof item.value === "number" ? item.value.toFixed(item.value > 5 ? 0 : 3) : item.value}</span>
        </p>
      ))}
    </div>
  );
}

function QaRun({ run }: { run: EvalRun }) {
  const t = useT();
  const summary = run.summary as Record<string, EvalSystemSummary>;
  const present = (systems: string[]) => systems.filter((system) => summary[system]);
  const main = present(MAIN);
  const ablations = present(ABLATIONS);
  const full = summary.full;
  const reference = summary.b3 ?? summary.b2;
  const referenceName = summary.b3 ? "B3" : "B2";
  const [questionId, setQuestionId] = useState<string | null>(null);

  const questionIds = useMemo(() => Array.from(new Set(run.rows.map((row) => row.id))), [run.rows]);
  useEffect(() => {
    setQuestionId(questionIds[0] ?? null);
  }, [questionIds]);

  const chartData = RATE_METRICS.map((metric) => {
    const row: Record<string, string | number> = { metric: t(`eval.metric.${metric}`) };
    for (const system of main) row[sysLabel(t, system)] = summary[system][metric] ?? 0;
    return row;
  });
  const costData = [...main, ...ablations].map((system) => ({
    system,
    [t("eval.metric.latency_s")]: summary[system].latency_s ?? 0,
    tokens: summary[system].n ? (summary[system].prompt_tokens + summary[system].completion_tokens) / summary[system].n : 0,
  }));
  const ablationData = full
    ? (["citation_precision", "citation_recall", "token_f1", "unsupported_rate", "success_rate"] as RateMetric[]).map((metric) => {
        const row: Record<string, string | number> = { metric: t(`eval.metric.${metric}`) };
        row[sysLabel(t, "full")] = full[metric] ?? 0;
        for (const system of ablations) row[sysLabel(t, system)] = summary[system][metric] ?? 0;
        return row;
      })
    : [];

  const allSystems = [...main, ...ablations];
  const tableRows = allSystems.map((system) => ({ system, ...summary[system], errors: run.errors_by_system[system] ?? 0 }));
  const columns: ColumnsType<(typeof tableRows)[number]> = [
    {
      title: t("eval.system"),
      dataIndex: "system",
      fixed: "left",
      width: 170,
      render: (system: string) => (
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: chartColors[system] ?? palette.ink4 }} />
          <span className={system === "full" ? "font-semibold text-ink" : "text-ink-2"}>{sysLabel(t, system)}</span>
        </span>
      ),
    },
    { title: t("eval.n"), dataIndex: "n", width: 60, align: "right" },
    ...RATE_METRICS.map((metric) => ({
      title: t(`eval.metric.${metric}`),
      dataIndex: metric,
      align: "right" as const,
      width: 120,
      render: (value: number | null, row: (typeof tableRows)[number]) => {
        const values = allSystems.map((system) => summary[system][metric]).filter((item): item is number => item !== null);
        const best = LOWER_BETTER.has(metric) ? Math.min(...values) : Math.max(...values);
        return (
          <span className={`tabular-nums ${value === best && row.system !== "b1" ? "font-semibold text-ok" : ""}`}>{percent(value)}</span>
        );
      },
    })),
    { title: t("eval.metric.steps"), dataIndex: "steps", width: 100, align: "right", render: (value: number | null) => fixed(value, 1) },
    { title: t("eval.metric.latency_s"), dataIndex: "latency_s", width: 120, align: "right", render: (value: number | null) => fixed(value, 2) },
    {
      title: t("eval.metric.tokens"),
      key: "tokens",
      width: 100,
      align: "right",
      render: (_, row) => <span className="tabular-nums">{(row.prompt_tokens + row.completion_tokens).toLocaleString()}</span>,
    },
    {
      title: t("eval.errors"),
      dataIndex: "errors",
      width: 90,
      align: "right",
      render: (value: number) => (value ? <span className="text-warn">{value}</span> : <span className="text-ink-4">0</span>),
    },
  ];

  const question = run.questions.find((item) => item.id === questionId);
  const caseRows = run.rows.filter((row) => row.id === questionId);
  const orderedCases = allSystems
    .map((system) => caseRows.find((row) => row.system === system && !row.error) ?? caseRows.find((row) => row.system === system))
    .filter((row): row is EvalRow => Boolean(row));

  return (
    <div className="flex flex-col gap-4">
      {run.errors > 0 && (
        <Alert type="warning" showIcon icon={<AlertTriangle size={16} />} message={t("eval.errorsNote", { n: run.errors })} />
      )}

      {full && reference && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            label={`Full · ${t("eval.metric.citation_precision")}`}
            help={t("eval.metricHelp.citation_precision")}
            value={full.citation_precision}
            compare={reference.citation_precision}
            compareLabel={referenceName}
          />
          <MetricCard
            label={`Full · ${t("eval.metric.unsupported_rate")}`}
            help={t("eval.metricHelp.unsupported_rate")}
            value={full.unsupported_rate}
            compare={reference.unsupported_rate}
            compareLabel={referenceName}
            lowerBetter
          />
          <MetricCard
            label={`Full · ${t("eval.metric.evidence_recall")}`}
            help={t("eval.metricHelp.evidence_recall")}
            value={full.evidence_recall}
            compare={summary.b1?.evidence_recall ?? null}
            compareLabel="B1"
          />
          <MetricCard
            label={`Full · ${t("eval.metric.token_f1")}`}
            help={t("eval.metricHelp.token_f1")}
            value={full.token_f1}
            compare={reference.token_f1}
            compareLabel={referenceName}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-5">
        <SectionCard title={t("eval.overview")} className="2xl:col-span-3" bodyClassName="p-4">
          <div className="h-[320px]">
            <ResponsiveContainer>
              <BarChart data={chartData} barGap={2} barCategoryGap="22%">
                <CartesianGrid strokeDasharray="3 3" stroke={palette.line} vertical={false} />
                <XAxis dataKey="metric" tick={{ fontSize: 11, fill: palette.ink3 }} axisLine={{ stroke: palette.line }} tickLine={false} interval={0} />
                <YAxis domain={[0, 1]} tickFormatter={(value: number) => `${Math.round(value * 100)}%`} tick={{ fontSize: 11, fill: palette.ink4 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgb(15 23 42 / 0.03)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" iconSize={10} />
                {main.map((system) => (
                  <Bar key={system} dataKey={sysLabel(t, system)} fill={chartColors[system]} radius={[3, 3, 0, 0]} maxBarSize={22} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-ink-4">
            {t("eval.metric.unsupported_rate")}: {t("eval.lowerBetter")}
          </p>
        </SectionCard>

        <SectionCard title={t("eval.cost")} className="2xl:col-span-2" bodyClassName="p-4">
          <div className="h-[320px]">
            <ResponsiveContainer>
              <BarChart data={costData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.line} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: palette.ink4 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="system" tick={{ fontSize: 11, fill: palette.ink3, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} width={104} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgb(15 23 42 / 0.03)" }} />
                <Bar dataKey={t("eval.metric.latency_s")} fill={palette.brand} radius={[0, 3, 3, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-ink-4">
            Tokens / {t("eval.question")}:{" "}
            {costData.map((row) => `${row.system} ${Math.round(row.tokens)}`).join(" · ")}
          </p>
        </SectionCard>
      </div>

      {ablations.length > 0 && full && (
        <SectionCard
          title={
            <span>
              {t("eval.ablation")}
              <span className="ml-2 text-xs font-normal text-ink-4">{t("eval.ablationDesc")}</span>
            </span>
          }
          bodyClassName="grid grid-cols-1 gap-4 p-4 xl:grid-cols-5"
        >
          <div className="h-[280px] xl:col-span-3">
            <ResponsiveContainer>
              <BarChart data={ablationData} barGap={2} barCategoryGap="24%">
                <CartesianGrid strokeDasharray="3 3" stroke={palette.line} vertical={false} />
                <XAxis dataKey="metric" tick={{ fontSize: 11, fill: palette.ink3 }} axisLine={{ stroke: palette.line }} tickLine={false} interval={0} />
                <YAxis domain={[0, 1]} tickFormatter={(value: number) => `${Math.round(value * 100)}%`} tick={{ fontSize: 11, fill: palette.ink4 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgb(15 23 42 / 0.03)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" iconSize={10} />
                {["full", ...ablations].map((system) => (
                  <Bar key={system} dataKey={sysLabel(t, system)} fill={chartColors[system]} radius={[3, 3, 0, 0]} maxBarSize={22} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-2 xl:col-span-2">
            {ablations.map((system) => (
              <div key={system} className="rounded-md border border-solid border-line p-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: chartColors[system] }} />
                  {sysLabel(t, system)}
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {(["citation_precision", "unsupported_rate", "latency_s"] as const).map((metric) => {
                    const value = summary[system][metric];
                    const base = full[metric];
                    const delta = value !== null && base !== null ? value - base : null;
                    const lower = LOWER_BETTER.has(metric);
                    const good = delta !== null && (lower ? delta < 0 : delta > 0);
                    return (
                      <div key={metric}>
                        <p className="text-ink-4">{t(`eval.metric.${metric}`)}</p>
                        <p className="tabular-nums text-ink-2">
                          {metric === "latency_s" ? fixed(value, 2) : percent(value)}
                          {delta !== null && Math.abs(delta) > 0.0005 && (
                            <span className={`ml-1 ${good ? "text-ok" : "text-bad"}`}>
                              {delta > 0 ? "+" : ""}
                              {metric === "latency_s" ? delta.toFixed(2) : `${(delta * 100).toFixed(1)}`}
                            </span>
                          )}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title={`${t("eval.overview")} · ${run.name}`}>
        <Table rowKey="system" columns={columns} dataSource={tableRows} pagination={false} size="middle" scroll={{ x: 1300 }} />
      </SectionCard>

      <SectionCard
        title={
          <span>
            {t("eval.cases")}
            <span className="ml-2 text-xs font-normal text-ink-4">{t("eval.casesDesc")}</span>
          </span>
        }
        extra={
          <Select
            size="small"
            value={questionId}
            onChange={setQuestionId}
            className="w-72"
            options={questionIds.map((id) => ({
              value: id,
              label: run.questions.find((item) => item.id === id)?.question ?? id,
            }))}
          />
        }
        bodyClassName="p-4"
      >
        {question && (
          <div className="mb-4 rounded-md bg-subtle p-3">
            <p className="text-sm font-medium text-ink">
              {t("eval.question")}: {question.question}
            </p>
            <p className="mt-1 text-xs text-ink-3">
              {t("eval.gold")}: {question.answers[0] ?? "—"}
              {question.citations.length > 0 && (
                <>
                  {" · "}
                  {t("eval.goldCite")}: {question.citations.map((cite) => `${cite.section}, p. ${cite.page ?? "?"}`).join("; ")}
                </>
              )}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {orderedCases.map((row) => (
            <div key={`${row.system}-${row.id}`} className={`rounded-md border border-solid p-3 ${row.system === "full" ? "border-brand-200 bg-brand-50/40" : "border-line"}`}>
              <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-ink-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: chartColors[row.system] ?? palette.ink4 }} />
                {sysLabel(t, row.system)}
                {!row.error && (
                  <span className="ml-auto flex items-center gap-1 font-normal text-ink-4">
                    {row.success ? <CircleCheck size={12} className="text-ok" /> : <CircleHelp size={12} className="text-warn" />}
                    F1 {fixed(row.token_f1, 2)} · {t("eval.metric.citation_precision")} {percent(row.citation_precision ?? null, 0)}
                  </span>
                )}
              </p>
              {row.error ? (
                <p className="flex items-center gap-1.5 text-xs text-warn">
                  <AlertTriangle size={12} /> {t("eval.failedRow")}: {row.error}
                </p>
              ) : (
                <p className="text-[13px] leading-5 text-ink-2">{row.prediction}</p>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function ScifactRun({ run }: { run: EvalRun }) {
  const t = useT();
  const summary = run.summary as { n: number; label_accuracy: number };
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-medium text-ink-3">{t("eval.labelAccuracy")}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{percent(summary.label_accuracy)}</p>
          <p className="text-xs text-ink-4">n = {summary.n}</p>
        </div>
      </div>
      <Alert type="info" showIcon message={t("eval.scifactNote")} />
      <SectionCard title={run.name}>
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20, size: "small" }}
          dataSource={run.rows}
          columns={[
            { title: "ID", dataIndex: "id" },
            { title: "Gold", dataIndex: "gold" },
            { title: "Predicted", dataIndex: "predicted", render: (value, row) => row.error ?? value },
            {
              title: "",
              dataIndex: "correct",
              render: (value: boolean) => (value ? <CircleCheck size={14} className="text-ok" /> : <CircleHelp size={14} className="text-warn" />),
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}

export default function EvaluationPage() {
  const t = useT();
  const locale = usePrefs((state) => state.locale);
  const runs = useAsync(() => api.evaluation.runs(), []);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!name && runs.data?.length) {
      const preferred = runs.data.find((run) => run.name === "latest.json") ?? runs.data[0];
      setName(preferred.name);
    }
  }, [runs.data, name]);

  const run = useAsync<EvalRun | null>(() => (name ? api.evaluation.run(name) : Promise.resolve(null)), [name]);
  const info = runs.data?.find((item) => item.name === name);

  return (
    <Page wide>
      <PageHeader
        title={t("eval.title")}
        subtitle={t("eval.subtitle")}
        meta={
          info && (
            <>
              <span className="chip bg-subtle text-ink-3">
                <Database size={11} /> {t(`eval.ds.${info.dataset}`)}
              </span>
              <span className="chip bg-subtle text-ink-3">
                <FileJson size={11} /> data/results/{info.name}
              </span>
              <span className="chip bg-subtle text-ink-3">
                {t("eval.generated")} {formatDate(info.modified_at, locale, true)}
              </span>
              {info.errors > 0 && (
                <span className="chip bg-warn-soft text-warn">
                  {t("eval.errors")} {info.errors}
                </span>
              )}
            </>
          )
        }
        actions={
          runs.data && runs.data.length > 0 && (
            <Select
              value={name}
              onChange={setName}
              className="w-64"
              options={runs.data.map((item) => ({
                value: item.name,
                label: `${item.name} · ${t(`eval.ds.${item.dataset}`)}`,
              }))}
            />
          )
        }
      />

      {runs.error ? (
        <div className="card">
          <ErrorState error={runs.error} onRetry={runs.reload} />
        </div>
      ) : runs.loading && !runs.data ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <CardSkeleton key={index} rows={1} />
          ))}
        </div>
      ) : runs.data && runs.data.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FlaskConical size={20} />}
            title={t("eval.noData")}
            description={
              <span className="flex flex-col items-center gap-2">
                {t("eval.noDataDesc")}
                <code className="flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-left font-mono text-xs text-white">
                  <Terminal size={13} />
                  python -m citecheck.evaluate --dataset custom --systems b1,b2,b3,full,no_planner,embedding_only,no_verifier
                </code>
              </span>
            }
          />
        </div>
      ) : run.error ? (
        <div className="card">
          <ErrorState error={run.error} onRetry={run.reload} />
        </div>
      ) : !run.data ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <CardSkeleton key={index} rows={1} />
          ))}
        </div>
      ) : run.data.kind === "scifact" ? (
        <ScifactRun run={run.data} />
      ) : (
        <QaRun run={run.data} />
      )}
    </Page>
  );
}
