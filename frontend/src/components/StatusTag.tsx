import { AlertCircle, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import type { DocumentStatus } from "../api/types";
import { useT } from "../i18n";

const styles: Record<DocumentStatus, string> = {
  pending: "bg-subtle text-ink-3",
  indexing: "bg-info-soft text-info",
  ready: "bg-ok-soft text-ok",
  failed: "bg-bad-soft text-bad",
};

export function StatusTag({ status }: { status: DocumentStatus }) {
  const t = useT();
  const Icon = { pending: Clock3, indexing: Loader2, ready: CheckCircle2, failed: AlertCircle }[status];
  return (
    <span className={`chip ${styles[status]}`}>
      <Icon size={12} className={status === "indexing" ? "animate-spin" : undefined} />
      {t(`status.${status}`)}
    </span>
  );
}
