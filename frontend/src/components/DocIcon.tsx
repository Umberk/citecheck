import { FileText } from "lucide-react";
import type { DocumentStatus } from "../api/types";

const tone: Record<DocumentStatus, string> = {
  ready: "bg-brand-50 text-brand-600",
  pending: "bg-subtle text-ink-3",
  indexing: "bg-info-soft text-info",
  failed: "bg-bad-soft text-bad",
};

export function DocIcon({ status, size = 32 }: { status: DocumentStatus; size?: number }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md ${tone[status]}`}
      style={{ width: size, height: size }}
    >
      <FileText size={Math.round(size * 0.5)} />
    </span>
  );
}
