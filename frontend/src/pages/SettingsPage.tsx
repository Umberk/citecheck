import { useEffect, useState, type ReactNode } from "react";
import { App, Avatar, Button, Input, Segmented, Select, Tag } from "antd";
import { Cloud, HardDrive, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { Locale, SystemName } from "../api/types";
import { Page, PageHeader } from "../components/PageHeader";
import { useT } from "../i18n";
import { errorText } from "../lib/errors";
import { formatDate } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { useAuth } from "../stores/auth";
import { usePrefs } from "../stores/prefs";

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        {desc && <p className="mt-0.5 text-xs text-ink-3">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card px-5">
      <h2 className="border-0 border-b border-solid border-line py-3 text-sm font-semibold text-ink">{title}</h2>
      <div className="divide-y divide-solid divide-line [&>div]:border-0">{children}</div>
    </section>
  );
}

const SYSTEMS: SystemName[] = ["full", "b3", "b2", "b1", "no_planner", "embedding_only", "no_verifier"];

export default function SettingsPage() {
  const t = useT();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const setUser = useAuth((state) => state.setUser);
  const logout = useAuth((state) => state.logout);
  const locale = usePrefs((state) => state.locale);
  const setLocale = usePrefs((state) => state.setLocale);
  const defaultSystem = usePrefs((state) => state.defaultSystem);
  const setDefaultSystem = usePrefs((state) => state.setDefaultSystem);
  const [name, setName] = useState(user?.display_name ?? "");
  const [saving, setSaving] = useState(false);
  const health = useAsync(() => api.health(), []);

  useEffect(() => setName(user?.display_name ?? ""), [user?.display_name]);

  const saveName = async () => {
    setSaving(true);
    try {
      setUser(await api.auth.updateMe({ display_name: name.trim() }));
      message.success(t("common.saved"));
    } catch (error) {
      message.error(errorText(error, t));
    } finally {
      setSaving(false);
    }
  };

  const changeLocale = async (value: Locale) => {
    setLocale(value);
    try {
      setUser(await api.auth.updateMe({ locale: value }));
    } catch (error) {
      message.error(errorText(error, t));
    }
  };

  return (
    <Page>
      <div className="mx-auto max-w-3xl">
        <PageHeader title={t("set.title")} subtitle={t("set.subtitle")} />
        <div className="flex flex-col gap-4">
          <Section title={t("set.profile")}>
            <div className="flex items-center gap-4 py-4">
              <Avatar size={48} className="!bg-brand-600 !text-lg !font-semibold">
                {(user?.display_name || user?.email || "?").slice(0, 1).toUpperCase()}
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-ink">{user?.display_name}</p>
                <p className="truncate text-sm text-ink-3">{user?.email}</p>
                {user && <p className="text-xs text-ink-4">{t("set.memberSince", { date: formatDate(user.created_at, locale) })}</p>}
              </div>
            </div>
            <Row title={t("auth.displayName")}>
              <div className="flex gap-2">
                <Input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} className="!w-56" />
                <Button type="primary" loading={saving} disabled={!name.trim() || name.trim() === user?.display_name} onClick={saveName}>
                  {t("common.save")}
                </Button>
              </div>
            </Row>
            <Row title={t("auth.email")}>
              <span className="text-sm text-ink-2">{user?.email}</span>
            </Row>
          </Section>

          <Section title={t("set.prefs")}>
            <Row title={t("set.language")} desc={t("set.languageDesc")}>
              <Segmented
                value={locale}
                onChange={(value) => void changeLocale(value as Locale)}
                options={[
                  { label: "简体中文", value: "zh" },
                  { label: "English", value: "en" },
                ]}
              />
            </Row>
            <Row title={t("set.defaultSystem")} desc={t("set.defaultSystemDesc")}>
              <Select<SystemName>
                value={defaultSystem}
                onChange={setDefaultSystem}
                className="w-72"
                options={SYSTEMS.map((value) => ({ value, label: t(`reader.sys.${value}`) }))}
              />
            </Row>
            <Row title={t("set.theme")} desc={t("set.themeDesc")}>
              <Segmented
                value="light"
                options={[
                  { label: t("set.themeLight"), value: "light" },
                  { label: t("set.themeDark"), value: "dark", disabled: true },
                ]}
              />
            </Row>
          </Section>

          <Section title={t("set.system")}>
            <Row title={t("set.storage")}>
              {health.data ? (
                <Tag icon={health.data.storage === "cos" ? <Cloud size={12} className="mr-1 align-[-2px]" /> : <HardDrive size={12} className="mr-1 align-[-2px]" />} color={health.data.storage === "cos" ? "blue" : "default"}>
                  {health.data.storage === "cos" ? t("set.storageCos") : t("set.storageLocal")}
                </Tag>
              ) : (
                <span className="text-sm text-ink-4">—</span>
              )}
            </Row>
          </Section>

          <Section title={t("set.session")}>
            <Row title={t("auth.logout")} desc={t("set.sessionDesc", { email: user?.email ?? "" })}>
              <Button
                danger
                icon={<LogOut size={14} />}
                onClick={async () => {
                  await logout();
                  navigate("/login");
                }}
              >
                {t("auth.logout")}
              </Button>
            </Row>
          </Section>
        </div>
      </div>
    </Page>
  );
}
