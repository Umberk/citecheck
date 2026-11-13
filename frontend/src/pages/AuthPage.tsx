import { useState } from "react";
import { Alert, Button, Form, Input, Segmented } from "antd";
import { GitMerge, Route as RouteIcon, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { Locale } from "../api/types";
import { Logo } from "../components/Logo";
import { useT } from "../i18n";
import { errorText } from "../lib/errors";
import { useAuth } from "../stores/auth";
import { usePrefs } from "../stores/prefs";

interface FormValues {
  email: string;
  password: string;
  display_name?: string;
}

function Pitch() {
  const t = useT();
  const points = [
    { icon: RouteIcon, text: t("auth.pitch.p1") },
    { icon: GitMerge, text: t("auth.pitch.p2") },
    { icon: ShieldCheck, text: t("auth.pitch.p3") },
  ];
  return (
    <div className="relative hidden h-full flex-col justify-between overflow-hidden bg-brand-900 p-10 text-white lg:flex">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="relative">
        <span className="inline-flex items-center gap-2 text-[15px] font-semibold">
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#fff" fillOpacity="0.12" />
            <path d="M20.6 10.2a8 8 0 1 0 0 11.6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
            <path d="m15.6 16 2.6 2.6 5-5.8" fill="none" stroke="#9fb7ff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          CiteCheck
        </span>
      </div>
      <div className="relative max-w-md">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight">{t("auth.pitch.title")}</h2>
        <p className="mt-3 text-md text-white/70">{t("auth.pitch.desc")}</p>
        <ul className="mt-8 flex list-none flex-col gap-3 p-0">
          {points.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-white/85">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10">
                <Icon size={16} />
              </span>
              {text}
            </li>
          ))}
        </ul>
        <div className="mt-10 rounded-lg border border-solid border-white/10 bg-white/5 p-4 font-mono text-xs leading-6 text-white/75">
          <div>
            PDF → <span className="text-[#9fb7ff]">section chunks</span> → plan → BM25 + embedding → RRF
          </div>
          <div>
            draft → <span className="text-[#9fb7ff]">verify each sentence</span> → cited answer
          </div>
        </div>
      </div>
      <p className="relative text-xs text-white/45">COMP5511 · Artificial Intelligence Concepts</p>
    </div>
  );
}

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const setUser = useAuth((state) => state.setUser);
  const locale = usePrefs((state) => state.locale);
  const setLocale = usePrefs((state) => state.setLocale);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const register = mode === "register";
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const submit = async (values: FormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      const user = register
        ? await api.auth.register(values.email, values.password, values.display_name ?? "", locale)
        : await api.auth.login(values.email, values.password);
      setUser(user);
      navigate(from, { replace: true });
    } catch (caught) {
      setError(errorText(caught, t, "auth"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid h-full grid-cols-1 bg-surface lg:grid-cols-[minmax(420px,5fr)_7fr]">
      <Pitch />
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center justify-between px-6">
          <span className="lg:invisible">
            <Logo />
          </span>
          <Segmented
            size="small"
            value={locale}
            onChange={(value) => setLocale(value as Locale)}
            options={[
              { label: "中", value: "zh" },
              { label: "EN", value: "en" },
            ]}
          />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-[380px] animate-fade-up">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              {register ? t("auth.registerTitle") : t("auth.loginTitle")}
            </h1>
            <p className="mt-1.5 text-sm text-ink-3">{register ? t("auth.registerSubtitle") : t("auth.loginSubtitle")}</p>
            {error && <Alert className="!mt-5" type="error" showIcon message={error} />}
            <Form<FormValues> layout="vertical" requiredMark={false} className="!mt-6" onFinish={submit} key={mode}>
              {register && (
                <Form.Item name="display_name" label={t("auth.displayName")} rules={[{ max: 40 }]}>
                  <Input autoComplete="nickname" size="large" />
                </Form.Item>
              )}
              <Form.Item
                name="email"
                label={t("auth.email")}
                rules={[{ required: true, type: "email", message: t("auth.err.invalid_email") }]}
              >
                <Input autoComplete="email" size="large" placeholder="you@example.com" />
              </Form.Item>
              <Form.Item
                name="password"
                label={t("auth.password")}
                extra={register ? t("auth.passwordHint") : undefined}
                rules={[{ required: true, min: register ? 8 : 1, message: t("auth.err.weak_password") }]}
              >
                <Input.Password autoComplete={register ? "new-password" : "current-password"} size="large" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block size="large" loading={submitting} className="!mt-2">
                {register ? t("auth.register") : t("auth.login")}
              </Button>
            </Form>
            <p className="mt-6 text-center text-sm text-ink-3">
              {register ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
              <Link to={register ? "/login" : "/register"} state={location.state} className="font-medium !text-brand-600 hover:underline">
                {register ? t("auth.toLogin") : t("auth.toRegister")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
