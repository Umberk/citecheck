import { useState } from "react";
import { CircleCheck, Crosshair, FileSearch } from "lucide-react";
import type { AnswerPayload, Evidence } from "../../api/types";
import { EmptyState } from "../../components/States";
import { useT } from "../../i18n";

function EvidenceCard({ item, cited, onLocate }: { item: Evidence; cited: boolean; onLocate: (item: Evidence) => void }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const long = item.text.length > 320;
  return (
    <li className={`card overflow-hidden ${cited ? "border-brand-200" : ""}`}>
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className="flex h-5 min-w-5 items-center justify-center rounded-sm bg-subtle px-1 font-mono text-2xs font-semibold text-ink-2">
          E{item.rank}
        </span>
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-ink-2">
          {item.section}
          {item.page !== null && <span className="font-normal text-ink-4"> · {t("reader.page", { n: item.page })}</span>}
        </p>
        {cited && (
          <span className="chip bg-ok-soft text-ok">
            <CircleCheck size={11} />
          </span>
        )}
      </div>
      <p className="truncate px-3 text-2xs text-ink-4">{item.paper_title}</p>
      <p
        className={`cursor-pointer px-3 pt-1.5 text-[13px] leading-5 text-ink-2 ${expanded || !long ? "" : "line-clamp-5"}`}
        onClick={() => setExpanded((value) => !value)}
      >
        {item.text}
      </p>
      <div className="mt-2 flex items-center justify-between border-0 border-t border-solid border-line px-2 py-1">
        <span
          className={`chip ${item.locate === "exact" ? "bg-ok-soft text-ok" : item.locate === "page" ? "bg-warn-soft text-warn" : "bg-subtle text-ink-4"}`}
        >
          {t(`reader.locate.${item.locate}`)}
        </span>
        <button
          type="button"
          disabled={item.locate === "none" && item.page_index === null}
          onClick={() => onLocate(item)}
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-2 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Crosshair size={13} />
          {t("reader.jump")}
        </button>
      </div>
    </li>
  );
}

export function EvidencePanel({ payload, onLocate }: { payload: AnswerPayload | null; onLocate: (item: Evidence) => void }) {
  const t = useT();
  if (!payload || payload.evidence.length === 0) {
    return <EmptyState compact icon={<FileSearch size={16} />} title={t("reader.evidenceTitle")} description={t("reader.evidenceEmpty")} />;
  }
  const cited = new Set(payload.claims.filter((claim) => claim.label === "supported").map((claim) => claim.evidence_id));
  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="eyebrow px-0.5">{t("reader.evidenceTitle")} · {payload.evidence.length}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {payload.evidence.map((item) => (
          <EvidenceCard key={item.evidence_id} item={item} cited={cited.has(item.evidence_id)} onLocate={onLocate} />
        ))}
      </ul>
    </div>
  );
}
