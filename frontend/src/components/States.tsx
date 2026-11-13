import type { ReactNode } from "react";
import { Button, Skeleton } from "antd";
import { AlertTriangle, Inbox, RotateCw } from "lucide-react";
import { useT } from "../i18n";
import { errorText } from "../lib/errors";

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14"}`}>
      <div
        className={`flex items-center justify-center rounded-lg border border-solid border-line bg-subtle text-ink-3 ${compact ? "h-9 w-9" : "h-11 w-11"}`}
      >
        {icon ?? <Inbox size={compact ? 16 : 20} />}
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <p className={`font-medium text-ink ${compact ? "text-sm" : "text-base"}`}>{title}</p>
        {description && <p className="text-sm text-ink-3">{description}</p>}
      </div>
      {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact = false }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const t = useT();
  return (
    <EmptyState
      compact={compact}
      icon={<AlertTriangle size={compact ? 16 : 20} className="text-bad" />}
      title={t("common.errorTitle")}
      description={errorText(error, t)}
      action={
        onRetry && (
          <Button size="small" icon={<RotateCw size={14} />} onClick={onRetry}>
            {t("common.retry")}
          </Button>
        )
      }
    />
  );
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card p-5">
      <Skeleton active title={{ width: "40%" }} paragraph={{ rows }} />
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-1">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton.Avatar active shape="square" size={32} />
          <div className="flex-1">
            <Skeleton active title={false} paragraph={{ rows: 2, width: ["70%", "40%"] }} />
          </div>
        </div>
      ))}
    </div>
  );
}
