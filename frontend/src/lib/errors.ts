import { ApiError } from "../api/client";
import { hasKey, type TFunction } from "../i18n";

/** Map an API error to a readable message; prefer a known code, then the server text. */
export function errorText(error: unknown, t: TFunction, scope?: "auth" | "lib"): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return t("common.networkError");
    if (scope) {
      const key = `${scope}.err.${error.code}`;
      if (hasKey(key)) return t(key);
    }
    if (error.detail) return error.detail;
    return error.code;
  }
  if (error instanceof Error) return error.message;
  return t("common.errorDesc");
}
