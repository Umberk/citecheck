import { useState } from "react";
import { App, Button, Modal, Progress, Upload } from "antd";
import { FileText, FlaskConical, UploadCloud } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useT } from "../i18n";
import { errorText } from "../lib/errors";
import { formatBytes } from "../lib/format";
import { useUi } from "../stores/ui";

interface Item {
  uid: string;
  name: string;
  size: number;
  percent: number;
  state: "uploading" | "done" | "error";
  error?: string;
}

export function UploadModal() {
  const t = useT();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const open = useUi((state) => state.uploadOpen);
  const setOpen = useUi((state) => state.setUploadOpen);
  const bump = useUi((state) => state.bumpLibrary);
  const maxMb = useUi((state) => state.maxUploadMb);
  const [items, setItems] = useState<Item[]>([]);
  const [importing, setImporting] = useState(false);

  const update = (uid: string, patch: Partial<Item>) =>
    setItems((list) => list.map((item) => (item.uid === uid ? { ...item, ...patch } : item)));

  const start = async (file: File, uid: string) => {
    setItems((list) => [{ uid, name: file.name, size: file.size, percent: 0, state: "uploading" }, ...list]);
    if (file.size > maxMb * 1024 * 1024) {
      update(uid, { state: "error", error: t("lib.err.file_too_large") });
      return;
    }
    try {
      await api.documents.upload(file, (percent) => update(uid, { percent }));
      update(uid, { state: "done", percent: 100 });
      bump();
    } catch (error) {
      update(uid, { state: "error", error: errorText(error, t, "lib") });
    }
  };

  const importSamples = async () => {
    setImporting(true);
    try {
      const docs = await api.documents.importSamples();
      message.success(t("lib.samplesImported", { n: docs.length }));
      bump();
      setOpen(false);
      navigate("/library");
    } catch (error) {
      message.error(errorText(error, t, "lib"));
    } finally {
      setImporting(false);
    }
  };

  const close = () => {
    setOpen(false);
    setItems((list) => list.filter((item) => item.state === "uploading"));
  };

  return (
    <Modal
      open={open}
      onCancel={close}
      title={t("lib.upload")}
      width={560}
      footer={
        <div className="flex items-center justify-between">
          <Button icon={<FlaskConical size={14} />} loading={importing} onClick={importSamples}>
            {t("lib.importSamples")}
          </Button>
          <Button
            type="primary"
            onClick={() => {
              close();
              navigate("/library");
            }}
          >
            {t("nav.library")}
          </Button>
        </div>
      }
    >
      <Upload.Dragger
        accept="application/pdf,.pdf"
        multiple
        showUploadList={false}
        beforeUpload={(file) => {
          void start(file, file.uid);
          return false;
        }}
      >
        <div className="flex flex-col items-center gap-2 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <UploadCloud size={22} />
          </div>
          <p className="text-base font-medium text-ink">{t("lib.dropTitle")}</p>
          <p className="text-sm text-ink-3">{t("lib.limit", { mb: maxMb })}</p>
        </div>
      </Upload.Dragger>
      {items.length > 0 && (
        <ul className="mt-4 flex list-none flex-col gap-2 p-0">
          {items.map((item) => (
            <li key={item.uid} className="flex items-center gap-3 rounded-md border border-solid border-line px-3 py-2">
              <FileText size={16} className="shrink-0 text-ink-3" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-ink">{item.name}</span>
                  <span className="shrink-0 text-xs text-ink-4">{formatBytes(item.size)}</span>
                </div>
                {item.state === "error" ? (
                  <p className="text-xs text-bad">{item.error}</p>
                ) : (
                  <Progress
                    percent={item.percent}
                    size="small"
                    showInfo={false}
                    status={item.state === "done" ? "success" : "active"}
                    className="!m-0"
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.some((item) => item.state === "done") && (
        <p className="mt-3 text-xs text-ink-3">{t("lib.uploaded")}</p>
      )}
    </Modal>
  );
}
