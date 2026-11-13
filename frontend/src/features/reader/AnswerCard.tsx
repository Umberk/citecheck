import { useState } from "react";
import { Tooltip } from "antd";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  Crosshair,
  FileSearch,
  Route,
} from "lucide-react";
import type { AnswerPayload, Claim } from "../../api/types";
import { useT } from "../../i18n";

function CitationPill({ claim, onLocate, index }: { claim: Claim; onLocate: (claim: Claim) => void; index: number }) {
  const t = useT();
  const clickable = claim.locate !== "none" && claim.document_id;
  const tip =
    claim.locate === "page" ? t("reader.locate.pageHint") : claim.locate === "none" ? t("reader.locate.noneHint") : t("reader.jump");
  return (
    <Tooltip title={<span>{[claim.paper_title, claim.section, claim.page ? t("reader.page", { n: claim.page }) : null].filter(Boolean).join(" · ")}<br />{tip}</span>}>
      <button
        type="button"
        disabled={!clickable}
        onClick={() => onLocate(claim)}
        className={`mx-0.5 inline-flex h-[18px] translate-y-[-1px] cursor-pointer items-center gap-0.5 rounded-sm border-0 px-1 align-middle text-2xs font-semibold tabular-nums transition-colors disabled:cursor-default ${
          claim.locate === "exact"
            ? "bg-brand-100 text-brand-700 hover:bg-brand-600 hover:text-white"
            : claim.locate === "page"
              ? "bg-warn-soft text-warn hover:bg-warn hover:text-white"
              : "bg-subtle text-ink-4"
        }`}
      >
        {index}
        {claim.page !== null && <span className="font-normal opacity-80">·p{claim.page}</span>}
      </button>
    </Tooltip>
  );
}

function VerdictIcon({ claim }: { claim: Claim }) {
  if (claim.label === "supported") return <CircleCheck size={15} className="shrink-0 text-ok" />;
  if (claim.verdict === "refutes") return <CircleX size={15} className="shrink-0 text-bad" />;
  return <CircleHelp size={15} className="shrink-0 text-warn" />;
}

function ClaimRow({ claim, onLocate }: { claim: Claim; onLocate: (claim: Claim) => void }) {
  const t = useT();
  return (
    <li className="flex gap-2.5 py-2">
      <VerdictIcon claim={claim} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{claim.text}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs">
          <span className={`chip ${claim.label === "supported" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
            {t(`reader.label.${claim.label}`)} · {t(`reader.verdict.${claim.verdict}`)}
          </span>
          {claim.section && (
            <span className="truncate text-ink-3">
              {claim.section}
              {claim.page !== null && ` · ${t("reader.page", { n: claim.page })}`}
            </span>
          )}
          {claim.document_id && claim.locate !== "none" && (
            <button
              type="button"
              onClick={() => onLocate(claim)}
              className="inline-flex cursor-pointer items-center gap-0.5 border-0 bg-transparent p-0 text-2xs font-medium text-brand-600 hover:underline"
            >
              <Crosshair size={11} />
              {t(`reader.locate.${claim.locate}`)}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function AnswerCard({
  payload,
  active,
  onLocate,
  onShow,
}: {
  payload: AnswerPayload;
  active: boolean;
  onLocate: (claim: Claim) => void;
  onShow: (tab: "evidence" | "trace") => void;
}) {
  const t = useT();
  const [details, setDetails] = useState(false);
  const supported = payload.claims.filter((claim) => claim.label === "supported");
  const hidden = payload.claims.length - supported.length;

  return (
    <div className={`card overflow-hidden transition-shadow ${active ? "ring-1 ring-brand-200" : ""}`}>
      <div className="flex items-center gap-2 border-0 border-b border-solid border-line bg-subtle/60 px-3.5 py-2">
        <span className="chip bg-brand-600 font-mono uppercase text-white">{payload.system}</span>
        <span className="text-xs font-medium text-ink-2">{t("reader.answer")}</span>
        <span className="flex-1" />
        <span className="inline-flex items-center gap-1 text-2xs tabular-nums text-ink-4">
          <Clock size={11} />
          {t("reader.meta", {
            s: payload.latency_s.toFixed(1),
            steps: payload.steps,
            tokens: payload.prompt_tokens + payload.completion_tokens,
          })}
        </span>
      </div>

      <div className="px-3.5 py-3 text-[14.5px] leading-[24px] text-ink">
        {payload.verify ? (
          supported.length > 0 ? (
            <p>
              {supported.map((claim, index) => (
                <span key={claim.index}>
                  {claim.text}
                  <CitationPill claim={claim} index={index + 1} onLocate={onLocate} />{" "}
                </span>
              ))}
            </p>
          ) : (
            <p className="flex items-start gap-2 text-ink-2">
              <AlertTriangle size={16} className="mt-1 shrink-0 text-warn" />
              {payload.answer}
            </p>
          )
        ) : (
          <>
            <p>
              {payload.claims.map((claim, index) => (
                <span key={claim.index}>
                  {claim.text}
                  {claim.label === "supported" && <CitationPill claim={claim} index={index + 1} onLocate={onLocate} />}{" "}
                </span>
              ))}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
              <AlertTriangle size={12} className="text-warn" />
              {t("reader.noVerify")}
            </p>
          </>
        )}
      </div>

      {payload.verify && payload.claims.length > 0 && (
        <div className="border-0 border-t border-solid border-line">
          <button
            type="button"
            onClick={() => setDetails((value) => !value)}
            className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3.5 py-2 text-left text-xs text-ink-2 hover:bg-subtle"
          >
            {details ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <span className="font-medium">{t("reader.verified")}</span>
            <span className="chip bg-ok-soft text-ok">
              <CircleCheck size={11} /> {supported.length}
            </span>
            {hidden > 0 && (
              <span className="chip bg-warn-soft text-warn">
                <CircleHelp size={11} /> {hidden}
              </span>
            )}
            <span className="flex-1" />
            {hidden > 0 && !details && <span className="text-2xs text-ink-4">{t("reader.claimsHidden", { n: hidden })}</span>}
          </button>
          {details && (
            <ul className="m-0 list-none divide-y divide-solid divide-line px-3.5 pb-1 [&>li]:border-0">
              {payload.claims.map((claim) => (
                <ClaimRow key={claim.index} claim={claim} onLocate={onLocate} />
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 border-0 border-t border-solid border-line px-2 py-1">
        <button
          type="button"
          onClick={() => onShow("evidence")}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs text-ink-3 hover:bg-subtle hover:text-ink"
        >
          <FileSearch size={13} />
          {t("reader.tab.evidence")} · {payload.evidence.length}
        </button>
        <button
          type="button"
          onClick={() => onShow("trace")}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs text-ink-3 hover:bg-subtle hover:text-ink"
        >
          <Route size={13} />
          {t("reader.tab.trace")} · {payload.trace.filter((step) => step.queries.length).length}
        </button>
      </div>
    </div>
  );
}
