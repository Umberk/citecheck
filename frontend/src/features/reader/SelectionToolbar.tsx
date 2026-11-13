import { useEffect, useRef, useState } from "react";
import { Input, Tooltip } from "antd";
import { BookOpen, FlaskConical, Languages, ListCollapse, MessageCircleQuestion, Send, Sigma } from "lucide-react";
import type { SelectionAction } from "../../api/types";
import { useT, type MessageKey } from "../../i18n";
import type { SelectionInfo } from "./types";

const actions: { action: Exclude<SelectionAction, "ask">; key: MessageKey; icon: typeof BookOpen }[] = [
  { action: "explain", key: "sel.explain", icon: BookOpen },
  { action: "translate", key: "sel.translate", icon: Languages },
  { action: "methods", key: "sel.methods", icon: FlaskConical },
  { action: "formula", key: "sel.formula", icon: Sigma },
  { action: "summarize", key: "sel.summarize", icon: ListCollapse },
];

export function SelectionToolbar({
  selection,
  onAction,
  onClose,
}: {
  selection: SelectionInfo;
  onAction: (action: SelectionAction, question?: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const timer = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const width = asking ? 360 : 470;
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, selection.clientRect.left + selection.clientRect.width / 2 - width / 2));
  const above = selection.clientRect.top > 120;
  const top = above ? selection.clientRect.top - 48 : selection.clientRect.bottom + 8;

  return (
    <div
      ref={ref}
      className="fixed z-50 animate-fade-up rounded-lg border border-solid border-line bg-surface p-1 shadow-lg"
      style={{ top, left, width }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {asking ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (question.trim()) onAction("ask", question.trim());
          }}
        >
          <Input
            autoFocus
            variant="borderless"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("sel.askPlaceholder")}
            maxLength={500}
          />
          <button type="submit" className="icon-btn text-brand-600" disabled={!question.trim()}>
            <Send size={15} />
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-0.5">
          {actions.map(({ action, key, icon: Icon }) => (
            <button
              key={action}
              type="button"
              onClick={() => onAction(action)}
              className="flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border-0 bg-transparent px-2 text-xs font-medium text-ink-2 hover:bg-brand-50 hover:text-brand-700"
            >
              <Icon size={14} />
              {t(key)}
            </button>
          ))}
          <span className="mx-0.5 h-5 w-px bg-line" />
          <Tooltip title={t("sel.askPlaceholder")}>
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border-0 bg-brand-600 px-2.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              <MessageCircleQuestion size={14} />
              {t("sel.ask")}
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
