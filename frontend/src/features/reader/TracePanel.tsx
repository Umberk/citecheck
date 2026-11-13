import { CircleCheck, CircleHelp, FileSearch, GitMerge, Route, Search, ShieldCheck, Square, Sparkles } from "lucide-react";
import type { AnswerPayload } from "../../api/types";
import { EmptyState } from "../../components/States";
import { useT } from "../../i18n";

const PIPELINE: Record<string, { plan: boolean; retrieve: boolean; verify: boolean; mode: string }> = {
  b1: { plan: false, retrieve: false, verify: false, mode: "—" },
  b2: { plan: false, retrieve: true, verify: false, mode: "BM25 + Embedding · RRF" },
  b3: { plan: true, retrieve: true, verify: false, mode: "BM25 + Embedding · RRF" },
  full: { plan: true, retrieve: true, verify: true, mode: "BM25 + Embedding · RRF" },
  no_planner: { plan: false, retrieve: true, verify: true, mode: "BM25 + Embedding · RRF" },
  embedding_only: { plan: true, retrieve: true, verify: true, mode: "Embedding" },
  no_verifier: { plan: true, retrieve: true, verify: false, mode: "BM25 + Embedding · RRF" },
};

function Stage({ icon: Icon, label, on, detail }: { icon: typeof Route; label: string; on: boolean; detail?: string }) {
  return (
    <div className={`flex flex-1 flex-col items-center gap-1 rounded-md px-1 py-2 text-center ${on ? "bg-brand-50 text-brand-700" : "bg-subtle text-ink-4"}`}>
      <Icon size={15} />
      <span className="text-2xs font-semibold leading-tight">{label}</span>
      {detail && <span className="text-[10px] leading-tight opacity-80">{detail}</span>}
    </div>
  );
}

export function TracePanel({ payload }: { payload: AnswerPayload | null }) {
  const t = useT();
  if (!payload) {
    return <EmptyState compact icon={<Route size={16} />} title={t("reader.tab.trace")} description={t("reader.traceEmpty")} />;
  }
  const pipeline = PIPELINE[payload.system] ?? PIPELINE.full;
  const supported = payload.claims.filter((claim) => claim.label === "supported").length;
  const rounds = payload.trace.filter((step) => step.action !== "none");

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="card p-3">
        <p className="eyebrow mb-2">Pipeline · {payload.system}</p>
        <div className="flex items-stretch gap-1">
          <Stage icon={Route} label="Planner" on={pipeline.plan} />
          <Stage icon={GitMerge} label="Retrieval" on={pipeline.retrieve} detail={pipeline.retrieve ? pipeline.mode : undefined} />
          <Stage icon={Sparkles} label="Draft" on />
          <Stage icon={ShieldCheck} label="Verifier" on={pipeline.verify} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-subtle py-1.5">
            <p className="text-base font-semibold tabular-nums text-ink">{payload.steps}</p>
            <p className="text-2xs text-ink-3">{t("eval.metric.steps")}</p>
          </div>
          <div className="rounded-md bg-subtle py-1.5">
            <p className="text-base font-semibold tabular-nums text-ink">{payload.evidence.length}</p>
            <p className="text-2xs text-ink-3">{t("reader.tab.evidence")}</p>
          </div>
          <div className="rounded-md bg-subtle py-1.5">
            <p className="text-base font-semibold tabular-nums text-ink">
              {supported}/{payload.claims.length}
            </p>
            <p className="text-2xs text-ink-3">{t("reader.label.supported")}</p>
          </div>
        </div>
      </div>

      <div>
        <p className="eyebrow mb-2 px-0.5">{t("reader.tab.trace")}</p>
        {rounds.length === 0 ? (
          <p className="px-0.5 text-sm text-ink-3">{t("reader.trace.none")}</p>
        ) : (
          <ol className="m-0 flex list-none flex-col p-0">
            {rounds.map((step, index) => {
              const stop = step.action === "stop";
              return (
                <li key={index} className="relative flex gap-3 pb-4 last:pb-0">
                  {index < rounds.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-line" />}
                  <span
                    className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${stop ? "bg-ok-soft text-ok" : "bg-brand-50 text-brand-600"}`}
                  >
                    {stop ? <Square size={11} /> : <Search size={13} />}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-xs font-medium text-ink-2">
                      {step.action === "single" ? t("reader.trace.single") : t("reader.trace.round", { n: index + 1 })}
                      <span className="ml-1.5 font-normal text-ink-4">
                        {stop ? t("reader.trace.stop") : step.action === "single" ? "" : t("reader.trace.search")}
                      </span>
                    </p>
                    {step.queries.length > 0 && (
                      <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0">
                        {step.queries.map((query, queryIndex) => (
                          <li key={queryIndex} className="flex items-start gap-1.5 rounded-md border border-solid border-line bg-surface px-2 py-1 text-xs text-ink-2">
                            <FileSearch size={12} className="mt-[3px] shrink-0 text-ink-4" />
                            <span className="min-w-0 break-words">{query}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {payload.verify && payload.claims.length > 0 && (
        <div>
          <p className="eyebrow mb-2 px-0.5">{t("reader.verified")}</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {payload.claims.map((claim) => (
              <li key={claim.index} className="flex items-start gap-2 text-xs text-ink-2">
                {claim.label === "supported" ? (
                  <CircleCheck size={13} className="mt-[3px] shrink-0 text-ok" />
                ) : (
                  <CircleHelp size={13} className="mt-[3px] shrink-0 text-warn" />
                )}
                <span className="min-w-0">
                  {claim.text}
                  <span className="ml-1 text-ink-4">→ {t(`reader.verdict.${claim.verdict}`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
