import { useMemo, useState } from "react";
import { App, Button, Dropdown, Input, Popconfirm, Segmented, Select, Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  BookOpenText,
  Download,
  LayoutGrid,
  List,
  MoreHorizontal,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { DocumentItem, DocumentStatus } from "../api/types";
import { DocIcon } from "../components/DocIcon";
import { Page, PageHeader } from "../components/PageHeader";
import { CardSkeleton, EmptyState, ErrorState } from "../components/States";
import { StatusTag } from "../components/StatusTag";
import { useT } from "../i18n";
import { errorText } from "../lib/errors";
import { formatBytes, formatDate, fromNow } from "../lib/format";
import { useAsync, useInterval } from "../lib/useAsync";
import { usePrefs } from "../stores/prefs";
import { useUi } from "../stores/ui";

type SortKey = "newest" | "oldest" | "title" | "size";

function useDocumentActions(onChanged: () => void) {
  const t = useT();
  const { message, modal } = App.useApp();
  const bump = useUi((state) => state.bumpLibrary);

  const confirmRemove = (doc: DocumentItem) =>
    modal.confirm({
      title: t("lib.deleteConfirm"),
      content: t("lib.deleteDesc"),
      okText: t("common.delete"),
      cancelText: t("common.cancel"),
      okButtonProps: { danger: true },
      onOk: () => remove(doc),
    });

  const remove = async (doc: DocumentItem) => {
    try {
      await api.documents.remove(doc.id);
      message.success(t("lib.deleted"));
      bump();
      onChanged();
    } catch (error) {
      message.error(errorText(error, t, "lib"));
    }
  };
  const reindex = async (doc: DocumentItem) => {
    try {
      await api.documents.reindex(doc.id);
      onChanged();
    } catch (error) {
      message.error(errorText(error, t, "lib"));
    }
  };
  const download = (doc: DocumentItem) => {
    window.location.href = api.documents.downloadUrl(doc.id);
  };
  return { remove, confirmRemove, reindex, download };
}

function DocumentCard({
  doc,
  onOpen,
  actions,
}: {
  doc: DocumentItem;
  onOpen: () => void;
  actions: ReturnType<typeof useDocumentActions>;
}) {
  const t = useT();
  const locale = usePrefs((state) => state.locale);
  const ready = doc.status === "ready";
  return (
    <div className="card card-hover group flex flex-col">
      <button
        type="button"
        onClick={onOpen}
        disabled={!ready}
        className="flex flex-1 cursor-pointer flex-col items-start gap-3 rounded-t-lg border-0 bg-transparent p-4 text-left disabled:cursor-default"
      >
        <div className="flex w-full items-start justify-between gap-2">
          <DocIcon status={doc.status} size={36} />
          <StatusTag status={doc.status} />
        </div>
        <div className="min-w-0 w-full">
          <p className="line-clamp-2 min-h-[44px] text-[15px] font-medium leading-[22px] text-ink group-hover:text-brand-700">
            {doc.title}
          </p>
          <p className="mt-1 truncate text-xs text-ink-4">{doc.filename}</p>
        </div>
        {doc.status === "failed" && doc.error_message && (
          <p className="line-clamp-2 w-full rounded-md bg-bad-soft px-2 py-1 text-xs text-bad">{doc.error_message}</p>
        )}
      </button>
      <div className="flex items-center justify-between gap-2 border-0 border-t border-solid border-line px-4 py-2 text-xs text-ink-3">
        <span className="truncate tabular-nums">
          {doc.page_count ? `${t("common.pages", { n: doc.page_count })} · ` : ""}
          {formatBytes(doc.size_bytes)} · {fromNow(doc.created_at, locale)}
        </span>
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              ready && { key: "open", icon: <BookOpenText size={14} />, label: t("lib.openReader"), onClick: onOpen },
              { key: "download", icon: <Download size={14} />, label: t("common.download"), onClick: () => actions.download(doc) },
              doc.status === "failed" && {
                key: "reindex",
                icon: <RefreshCw size={14} />,
                label: t("lib.reindex"),
                onClick: () => void actions.reindex(doc),
              },
              { type: "divider" as const },
              {
                key: "delete",
                danger: true,
                icon: <Trash2 size={14} />,
                label: t("common.delete"),
                onClick: () => actions.confirmRemove(doc),
              },
            ].filter(Boolean) as never,
          }}
        >
          <button type="button" className="icon-btn h-7 w-7" aria-label="more">
            <MoreHorizontal size={16} />
          </button>
        </Dropdown>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const t = useT();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const locale = usePrefs((state) => state.locale);
  const view = usePrefs((state) => state.libraryView);
  const setView = usePrefs((state) => state.setLibraryView);
  const version = useUi((state) => state.libraryVersion);
  const openUpload = useUi((state) => state.setUploadOpen);
  const bump = useUi((state) => state.bumpLibrary);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [status, setStatus] = useState<DocumentStatus | "all">("all");
  const [importing, setImporting] = useState(false);
  const { data, loading, error, reload } = useAsync(() => api.documents.list(), [version]);
  const actions = useDocumentActions(() => void reload());

  const processing = data?.some((doc) => doc.status === "pending" || doc.status === "indexing") ?? false;
  useInterval(() => void reload(), processing ? 2000 : null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = (data ?? []).filter(
      (doc) =>
        (status === "all" || doc.status === status) &&
        (!needle || doc.title.toLowerCase().includes(needle) || doc.filename.toLowerCase().includes(needle)),
    );
    const sorters: Record<SortKey, (a: DocumentItem, b: DocumentItem) => number> = {
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
      oldest: (a, b) => a.created_at.localeCompare(b.created_at),
      title: (a, b) => a.title.localeCompare(b.title),
      size: (a, b) => b.size_bytes - a.size_bytes,
    };
    return [...list].sort(sorters[sort]);
  }, [data, query, sort, status]);

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

  const open = (doc: DocumentItem) => doc.status === "ready" && navigate(`/reader/${doc.id}`);

  const columns: ColumnsType<DocumentItem> = [
    {
      title: t("lib.col.title"),
      dataIndex: "title",
      render: (_, doc) => (
        <div className="flex items-center gap-3">
          <DocIcon status={doc.status} />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{doc.title}</p>
            <p className="truncate text-xs text-ink-4">{doc.filename}</p>
          </div>
        </div>
      ),
    },
    {
      title: t("lib.col.status"),
      dataIndex: "status",
      width: 130,
      render: (_, doc) =>
        doc.status === "failed" && doc.error_message ? (
          <Tooltip title={`${t("lib.failedReason")}: ${doc.error_message}`}>
            <span>
              <StatusTag status={doc.status} />
            </span>
          </Tooltip>
        ) : (
          <StatusTag status={doc.status} />
        ),
    },
    { title: t("lib.col.pages"), dataIndex: "page_count", width: 80, render: (value) => value ?? "—" },
    { title: t("lib.col.size"), dataIndex: "size_bytes", width: 100, render: (value: number) => formatBytes(value) },
    {
      title: t("lib.col.uploaded"),
      dataIndex: "created_at",
      width: 180,
      render: (value: string) => <span className="text-ink-3">{formatDate(value, locale, true)}</span>,
    },
    {
      title: t("lib.col.actions"),
      key: "actions",
      width: 150,
      align: "right",
      render: (_, doc) => (
        <div className="flex justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
          <Tooltip title={t("lib.openReader")}>
            <button type="button" className="icon-btn" disabled={doc.status !== "ready"} onClick={() => open(doc)}>
              <BookOpenText size={15} />
            </button>
          </Tooltip>
          {doc.status === "failed" && (
            <Tooltip title={t("lib.reindex")}>
              <button type="button" className="icon-btn" onClick={() => void actions.reindex(doc)}>
                <RefreshCw size={15} />
              </button>
            </Tooltip>
          )}
          <Tooltip title={t("common.download")}>
            <button type="button" className="icon-btn" onClick={() => actions.download(doc)}>
              <Download size={15} />
            </button>
          </Tooltip>
          <Popconfirm
            title={t("lib.deleteConfirm")}
            description={<p className="max-w-[260px]">{t("lib.deleteDesc")}</p>}
            okButtonProps={{ danger: true }}
            okText={t("common.delete")}
            cancelText={t("common.cancel")}
            onConfirm={() => actions.remove(doc)}
          >
            <button type="button" className="icon-btn hover:!text-bad">
              <Trash2 size={15} />
            </button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <Page wide>
      <PageHeader
        title={t("lib.title")}
        subtitle={t("lib.subtitle")}
        meta={
          data && (
            <>
              <span className="chip bg-subtle text-ink-3">{t("lib.count", { n: data.length })}</span>
              {processing && <span className="chip bg-info-soft text-info">{t("lib.processingHint")}</span>}
            </>
          )
        }
        actions={
          <>
            <Button icon={<Sparkles size={14} />} loading={importing} onClick={importSamples}>
              {t("lib.importSamples")}
            </Button>
            <Button type="primary" icon={<UploadCloud size={14} />} onClick={() => openUpload(true)}>
              {t("lib.upload")}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          allowClear
          prefix={<Search size={14} className="text-ink-4" />}
          placeholder={t("lib.search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="!w-full sm:!w-72"
        />
        <Select<SortKey>
          value={sort}
          onChange={setSort}
          className="w-36"
          options={(["newest", "oldest", "title", "size"] as const).map((value) => ({ value, label: t(`lib.sort.${value}`) }))}
        />
        <Select<DocumentStatus | "all">
          value={status}
          onChange={setStatus}
          className="w-36"
          options={[
            { value: "all", label: t("lib.filter.all") },
            ...(["ready", "indexing", "pending", "failed"] as const).map((value) => ({ value, label: t(`status.${value}`) })),
          ]}
        />
        <div className="flex-1" />
        <Segmented
          value={view}
          onChange={(value) => setView(value as "grid" | "list")}
          options={[
            { value: "grid", icon: <LayoutGrid size={14} className="align-[-2px]" />, title: t("lib.view.grid") },
            { value: "list", icon: <List size={14} className="align-[-2px]" />, title: t("lib.view.list") },
          ]}
        />
      </div>

      {error && !data ? (
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      ) : loading && !data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <CardSkeleton key={index} rows={2} />
          ))}
        </div>
      ) : data && data.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<BookOpenText size={20} />}
            title={t("lib.empty")}
            description={t("lib.emptyDesc")}
            action={
              <>
                <Button icon={<Sparkles size={14} />} loading={importing} onClick={importSamples}>
                  {t("lib.importSamples")}
                </Button>
                <Button type="primary" icon={<UploadCloud size={14} />} onClick={() => openUpload(true)}>
                  {t("lib.upload")}
                </Button>
              </>
            }
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="card">
          <EmptyState compact icon={<Search size={16} />} title={t("lib.noMatch")} />
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visible.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} onOpen={() => open(doc)} actions={actions} />
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <Table<DocumentItem>
            rowKey="id"
            columns={columns}
            dataSource={visible}
            pagination={visible.length > 20 ? { pageSize: 20, size: "small" } : false}
            onRow={(doc) => ({
              onClick: () => open(doc),
              className: doc.status === "ready" ? "cursor-pointer" : "",
            })}
            scroll={{ x: 820 }}
          />
        </div>
      )}
    </Page>
  );
}
