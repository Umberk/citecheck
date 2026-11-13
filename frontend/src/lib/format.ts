import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import type { Locale } from "../api/types";

dayjs.extend(relativeTime);

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function localized(value: string, locale: Locale) {
  return dayjs(value).locale(locale === "zh" ? "zh-cn" : "en");
}

export function fromNow(value: string, locale: Locale): string {
  return localized(value, locale).fromNow();
}

export function formatDate(value: string, locale: Locale, withTime = false): string {
  const format = locale === "zh" ? (withTime ? "YYYY年M月D日 HH:mm" : "YYYY年M月D日") : withTime ? "MMM D, YYYY HH:mm" : "MMM D, YYYY";
  return localized(value, locale).format(format);
}

export function percent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function fixed(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

export function compactNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", { notation: "compact" }).format(value);
}
