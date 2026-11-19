import { useEffect, useState, type ReactNode } from "react";
import { Avatar, Breadcrumb, Button, Drawer, Dropdown, Grid, Segmented, Tooltip } from "antd";
import {
  BookOpenText,
  ChevronsLeft,
  ChevronsRight,
  FlaskConical,
  History,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  // MonitorSmartphone,
  Plus,
  Settings,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Logo, LogoMark } from "../components/Logo";
import { UploadModal } from "../components/UploadModal";
import { useT, type MessageKey } from "../i18n";
import { useAuth } from "../stores/auth";
import { usePrefs } from "../stores/prefs";
import { useUi } from "../stores/ui";
import { api } from "../api";
import type { Locale, LlmProvider } from "../api/types";
import { useAsync } from "../lib/useAsync";

interface NavEntry {
  to: string;
  key: MessageKey;
  icon: typeof LayoutDashboard;
}

const workspace: NavEntry[] = [
  { to: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { to: "/library", key: "nav.library", icon: Library },
  { to: "/reader", key: "nav.reader", icon: BookOpenText },
  { to: "/history", key: "nav.history", icon: History },
];
const insights: NavEntry[] = [{ to: "/evaluation", key: "nav.evaluation", icon: FlaskConical }];

function NavList({ entries, collapsed, onNavigate }: { entries: NavEntry[]; collapsed: boolean; onNavigate?: () => void }) {
  const t = useT();
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {entries.map(({ to, key, icon: Icon }) => {
        const link = (
          <NavLink
            to={to}
            onClick={onNavigate}
            className={({ isActive }) => `nav-item ${collapsed ? "justify-center px-0" : ""} ${isActive ? "nav-item-active" : ""}`}
          >
            {({ isActive }) => (
              <>
                <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} className={isActive ? "text-brand-600" : "text-ink-3"} />
                {!collapsed && <span className="truncate">{t(key)}</span>}
              </>
            )}
          </NavLink>
        );
        return (
          <li key={to}>
            {collapsed ? (
              <Tooltip title={t(key)} placement="right">
                {link}
              </Tooltip>
            ) : (
              link
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const t = useT();
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const navigate = useNavigate();
  const toggle = usePrefs((state) => state.toggleSidebar);
  const openUpload = useUi((state) => state.setUploadOpen);

  return (
    <div className="flex h-full flex-col">
      <div className={`flex h-topbar shrink-0 items-center ${collapsed ? "justify-center" : "justify-between px-4"}`}>
        <Link to="/dashboard" onClick={onNavigate}>
          {collapsed ? <LogoMark size={26} /> : <Logo />}
        </Link>
      </div>

      <div className={`${collapsed ? "px-2" : "px-3"} pb-3`}>
        <Button
          type="primary"
          block
          icon={<Plus size={15} />}
          onClick={() => {
            openUpload(true);
            onNavigate?.();
          }}
          className={collapsed ? "!px-0" : ""}
        >
          {!collapsed && t("lib.upload")}
        </Button>
      </div>

      <nav className={`scroll-thin flex-1 overflow-y-auto ${collapsed ? "px-2" : "px-3"}`}>
        {!collapsed && <p className="eyebrow px-2.5 pb-1.5 pt-2">{t("nav.workspace")}</p>}
        <NavList entries={workspace} collapsed={collapsed} onNavigate={onNavigate} />
        {!collapsed ? (
          <p className="eyebrow px-2.5 pb-1.5 pt-5">{t("nav.insights")}</p>
        ) : (
          <div className="mx-2 my-3 h-px bg-line" />
        )}
        <NavList entries={insights} collapsed={collapsed} onNavigate={onNavigate} />
      </nav>

      <div className={`flex flex-col gap-0.5 border-0 border-t border-solid border-line py-3 ${collapsed ? "px-2" : "px-3"}`}>
        <NavList entries={[{ to: "/settings", key: "nav.settings", icon: Settings }]} collapsed={collapsed} onNavigate={onNavigate} />
        {/* 旧版演示页暂不展示
        {!collapsed && (
          <a href="/legacy" className="nav-item text-ink-3">
            <MonitorSmartphone size={16} className="text-ink-4" />
            <span className="truncate">{t("nav.legacy")}</span>
          </a>
        )}
        */}
        <Dropdown
          trigger={["click"]}
          placement="topLeft"
          menu={{
            items: [
              { key: "settings", icon: <Settings size={14} />, label: t("nav.settings"), onClick: () => navigate("/settings") },
              { type: "divider" },
              {
                key: "logout",
                icon: <LogOut size={14} />,
                danger: true,
                label: t("auth.logout"),
                onClick: async () => {
                  await logout();
                  navigate("/login");
                },
              },
            ],
          }}
        >
          <button
            type="button"
            className={`mt-1 flex w-full cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent py-1.5 text-left hover:bg-muted ${collapsed ? "justify-center px-0" : "px-2"}`}
          >
            <Avatar size={26} className="!bg-brand-600 !text-xs !font-semibold">
              {(user?.display_name || user?.email || "?").slice(0, 1).toUpperCase()}
            </Avatar>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{user?.display_name}</span>
                <span className="block truncate text-2xs text-ink-3">{user?.email}</span>
              </span>
            )}
          </button>
        </Dropdown>
        <div className={`flex ${collapsed ? "justify-center" : "justify-end"} pt-1`}>
          {!onNavigate && (
            <Tooltip title={collapsed ? t("nav.expand") : t("nav.collapse")} placement="right">
              <button type="button" className="icon-btn h-7 w-7" onClick={toggle}>
                {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

const crumbKeys: Record<string, MessageKey> = {
  dashboard: "nav.dashboard",
  library: "nav.library",
  reader: "nav.reader",
  history: "nav.history",
  evaluation: "nav.evaluation",
  settings: "nav.settings",
};

function TopBar({ onMenu, compact }: { onMenu: () => void; compact: boolean }) {
  const t = useT();
  const location = useLocation();
  const crumb = useUi((state) => state.crumb);
  const locale = usePrefs((state) => state.locale);
  const setLocale = usePrefs((state) => state.setLocale);
  const user = useAuth((state) => state.user);
  const setUser = useAuth((state) => state.setUser);
  const health = useAsync(() => api.health(), []);
  const section = location.pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  const sectionKey = crumbKeys[section];

  const items: { title: ReactNode }[] = [{ title: <span className="text-ink-3">{t("app.name")}</span> }];
  if (sectionKey) {
    items.push({
      title: crumb ? (
        <Link to={`/${section}`} className="!text-ink-3 hover:!text-ink">
          {t(sectionKey)}
        </Link>
      ) : (
        <span className="font-medium text-ink">{t(sectionKey)}</span>
      ),
    });
  }
  if (crumb) items.push({ title: <span className="inline-block max-w-[420px] truncate align-bottom font-medium text-ink">{crumb}</span> });

  const changeLocale = async (value: Locale) => {
    setLocale(value);
    try {
      setUser(await api.auth.updateMe({ locale: value }));
    } catch {
      /* preference still applies locally */
    }
  };

  const models: { id: LlmProvider; label: string }[] = [
    { id: "llm", label: "DeepSeek" },
    { id: "teamily", label: "Teamily" },
  ];
  const configured = new Set((health.data?.llm_providers ?? []).filter((item) => item.configured).map((item) => item.id));
  const activeProvider = (user?.llm_provider ?? "llm") as LlmProvider;

  const changeProvider = async (value: LlmProvider) => {
    if (value === activeProvider || !configured.has(value)) return;
    try {
      setUser(await api.auth.updateMe({ llm_provider: value }));
    } catch {
      /* keep the previous choice */
    }
  };

  return (
    <header className="flex h-topbar shrink-0 items-center gap-3 border-0 border-b border-solid border-line bg-surface/80 px-4 backdrop-blur">
      {compact && (
        <button type="button" className="icon-btn" onClick={onMenu} aria-label="menu">
          <Menu size={18} />
        </button>
      )}
      <Breadcrumb items={items} className="min-w-0 flex-1 text-sm" />
      <Segmented<LlmProvider>
        size="small"
        value={configured.has(activeProvider) ? activeProvider : undefined}
        onChange={(value) => void changeProvider(value)}
        options={models.map((item) => ({
          label: item.label,
          value: item.id,
          disabled: configured.size > 0 && !configured.has(item.id),
        }))}
      />
      <Segmented
        size="small"
        value={locale}
        onChange={(value) => void changeLocale(value as Locale)}
        options={[
          { label: "中", value: "zh" },
          { label: "EN", value: "en" },
        ]}
      />
    </header>
  );
}

export function AppShell() {
  const collapsed = usePrefs((state) => state.sidebarCollapsed);
  const screens = Grid.useBreakpoint();
  const compact = !screens.lg;
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const setCrumb = useUi((state) => state.setCrumb);
  const setMaxUploadMb = useUi((state) => state.setMaxUploadMb);
  const fullBleed = location.pathname.startsWith("/reader");

  useEffect(() => {
    setCrumb(null);
    setDrawer(false);
  }, [location.pathname, setCrumb]);

  useEffect(() => {
    api
      .health()
      .then((health) => setMaxUploadMb(health.max_upload_mb))
      .catch(() => undefined);
  }, [setMaxUploadMb]);

  return (
    <div className="flex h-full overflow-hidden bg-canvas">
      {!compact && (
        <aside
          className="shrink-0 border-0 border-r border-solid border-line bg-canvas transition-[width] duration-200"
          style={{ width: collapsed ? 60 : "var(--sidebar-width)" }}
        >
          <SidebarBody collapsed={collapsed} />
        </aside>
      )}
      {compact && (
        <Drawer
          open={drawer}
          onClose={() => setDrawer(false)}
          placement="left"
          width={260}
          closable={false}
          styles={{ body: { padding: 0, background: "rgb(var(--canvas))" } }}
        >
          <SidebarBody collapsed={false} onNavigate={() => setDrawer(false)} />
        </Drawer>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar compact={compact} onMenu={() => setDrawer(true)} />
        <main className={`min-h-0 flex-1 ${fullBleed ? "overflow-hidden" : "scroll-thin overflow-y-auto"}`}>
          <Outlet />
        </main>
      </div>
      <UploadModal />
    </div>
  );
}
