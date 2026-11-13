import { App, Spin, Tooltip } from "antd";
import { AlertTriangle, Copy, Crosshair, MousePointerSquareDashed } from "lucide-react";
import type { Annotation, SelectionAction } from "../../api/types";
import { EmptyState } from "../../components/States";
import { useT, type MessageKey } from "../../i18n";
import { fromNow } from "../../lib/format";
import { usePrefs } from "../../stores/prefs";
import { Markdownish } from "./Markdownish";

export interface PendingSelection {
  text: string;
  action: SelectionAction;
  question?: string;
  error?: string;
}

const actionKey: Record<SelectionAction, MessageKey> = {
  explain: "sel.explain",
  translate: "sel.translate",
  methods: "sel.methods",
  formula: "sel.formula",
  summarize: "sel.summarize",
  ask: "sel.ask",
};

function AnnotationCard({ item, onLocate, highlight }: { item: Annotation; onLocate: (item: Annotation) => void; highlight: boolean }) {
  const t = useT();
  const { message } = App.useApp();
  const locale = usePrefs((state) => state.locale);
  return (
    <li className={`card overflow-hidden ${highlight ? "animate-fade-up ring-1 ring-brand-200" : ""}`}>
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className="chip bg-brand-50 text-brand-700">{t(actionKey[item.action])}</span>
        <span className="text-2xs text-ink-4">
          {t("reader.page", { n: item.page_index + 1 })}
          {item.section && ` · ${item.section}`}
        </span>
        <span className="flex-1" />
        <span className="text-2xs text-ink-4">{fromNow(item.created_at, locale)}</span>
      </div>
      <blockquote className="mx-3 mt-2 line-clamp-3 border-0 border-l-2 border-solid border-brand-200 pl-2 text-xs italic text-ink-3">
        {item.text}
      </blockquote>
      {item.question && <p className="mx-3 mt-2 text-xs font-medium text-ink-2">Q: {item.question}</p>}
      <div className="px-3 py-2 text-[13.5px] leading-[22px] text-ink">
        <Markdownish text={item.answer} />
      </div>
      <div className="flex items-center justify-end gap-1 border-0 border-t border-solid border-line px-2 py-1">
        <Tooltip title={t("common.copy")}>
          <button
            type="button"
            className="icon-btn h-7 w-7"
            onClick={() => {
              void navigator.clipboard.writeText(item.answer);
              message.success(t("common.copied"));
            }}
          >
            <Copy size={13} />
          </button>
        </Tooltip>
        <button
          type="button"
          onClick={() => onLocate(item)}
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-2 text-xs font-medium text-brand-600 hover:bg-brand-50"
        >
          <Crosshair size={13} />
          {t("sel.locate")}
        </button>
      </div>
    </li>
  );
}

export function SelectionPanel({
  pending,
  items,
  loading,
  latestId,
  onLocate,
}: {
  pending: PendingSelection | null;
  items: Annotation[];
  loading: boolean;
  latestId: string | null;
  onLocate: (item: Annotation) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 p-3">
      {pending && (
        <div className={`card p-3 ${pending.error ? "border-bad/30" : ""}`}>
          <div className="flex items-center gap-2">
            <span className="chip bg-brand-50 text-brand-700">{t(actionKey[pending.action])}</span>
            {!pending.error && (
              <span className="flex items-center gap-2 text-xs text-ink-3">
                <Spin size="small" /> {t("sel.analyzing")}
              </span>
            )}
          </div>
          <blockquote className="mx-0 mt-2 line-clamp-3 border-0 border-l-2 border-solid border-brand-200 pl-2 text-xs italic text-ink-3">
            {pending.text}
          </blockquote>
          {pending.error && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-bad">
              <AlertTriangle size={13} className="mt-[2px] shrink-0" />
              {t("sel.failed")}: {pending.error}
            </p>
          )}
        </div>
      )}
      {loading && items.length === 0 ? (
        <div className="flex justify-center py-8">
          <Spin />
        </div>
      ) : items.length === 0 && !pending ? (
        <EmptyState compact icon={<MousePointerSquareDashed size={16} />} title={t("reader.tab.selection")} description={t("sel.empty")} />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((item) => (
            <AnnotationCard key={item.id} item={item} onLocate={onLocate} highlight={item.id === latestId} />
          ))}
        </ul>
      )}
    </div>
  );
}
