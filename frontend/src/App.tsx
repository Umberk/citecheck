import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { App as AntApp, ConfigProvider, Spin } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { onUnauthorized } from "./api/client";
import { AppShell } from "./layouts/AppShell";
import { AuthPage } from "./pages/AuthPage";
import { useAuth } from "./stores/auth";
import { usePrefs } from "./stores/prefs";
import { antdTheme } from "./theme/antdTheme";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const LibraryPage = lazy(() => import("./pages/LibraryPage"));
const ReaderPage = lazy(() => import("./pages/ReaderPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const EvaluationPage = lazy(() => import("./pages/EvaluationPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

function FullScreenSpin() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spin />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuth((state) => state.status);
  const location = useLocation();
  if (status === "unknown") return <FullScreenSpin />;
  if (status === "guest") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const status = useAuth((state) => state.status);
  if (status === "unknown") return <FullScreenSpin />;
  if (status === "authed") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  const locale = usePrefs((state) => state.locale);
  const check = useAuth((state) => state.check);
  const expire = useAuth((state) => state.expire);

  useEffect(() => {
    void check();
    return onUnauthorized(expire);
  }, [check, expire]);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  return (
    <ConfigProvider theme={antdTheme} locale={locale === "zh" ? zhCN : enUS}>
      <AntApp className="h-full" message={{ maxCount: 3, top: 64 }}>
        <BrowserRouter basename="/app">
          <Suspense fallback={<FullScreenSpin />}>
            <Routes>
              <Route path="/login" element={<GuestOnly><AuthPage mode="login" /></GuestOnly>} />
              <Route path="/register" element={<GuestOnly><AuthPage mode="register" /></GuestOnly>} />
              <Route
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/reader" element={<ReaderPage />} />
                <Route path="/reader/:documentId" element={<ReaderPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/evaluation" element={<EvaluationPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
