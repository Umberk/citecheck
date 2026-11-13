import { useCallback } from "react";
import { usePrefs } from "../stores/prefs";
import type { Locale } from "../api/types";
import { en } from "./en";
import { zh, type MessageKey } from "./zh";

const dictionaries: Record<Locale, Record<MessageKey, string>> = { zh, en };

export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = dictionaries[locale][key] ?? zh[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] === undefined ? `{${name}}` : String(vars[name]),
  );
}

export function useT(): TFunction {
  const locale = usePrefs((state) => state.locale);
  return useCallback((key, vars) => translate(locale, key, vars), [locale]);
}

export function hasKey(key: string): key is MessageKey {
  return key in zh;
}

export type { MessageKey };
