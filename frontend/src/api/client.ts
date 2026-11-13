export class ApiError extends Error {
  status: number;
  code: string;
  detail: string | null;

  constructor(status: number, code: string, detail: string | null) {
    super(detail || code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

async function parseError(response: Response): Promise<ApiError> {
  let code = `http_${response.status}`;
  let detail: string | null = null;
  try {
    const body = await response.json();
    const raw = body?.detail;
    if (typeof raw === "string") {
      code = raw;
    } else if (raw && typeof raw === "object") {
      code = raw.code ?? code;
      detail = raw.message ?? null;
    }
  } catch {
    detail = response.statusText || null;
  }
  return new ApiError(response.status, code, detail);
}

export async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown; skipAuthEvent?: boolean } = {},
): Promise<T> {
  const { json, skipAuthEvent, headers, ...rest } = init;
  const response = await fetch(path, {
    credentials: "same-origin",
    ...rest,
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!response.ok) {
    const error = await parseError(response);
    if (response.status === 401 && !skipAuthEvent) {
      unauthorizedListeners.forEach((listener) => listener());
    }
    throw error;
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** Upload with progress, since fetch has no upload progress events. */
export function uploadForm<T>(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.withCredentials = true;
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as T);
        return;
      }
      const raw = xhr.response?.detail;
      const code = typeof raw === "string" ? raw : (raw?.code ?? `http_${xhr.status}`);
      const detail = typeof raw === "object" ? (raw?.message ?? null) : null;
      if (xhr.status === 401) {
        unauthorizedListeners.forEach((listener) => listener());
      }
      reject(new ApiError(xhr.status, code, detail));
    };
    xhr.onerror = () => reject(new ApiError(0, "network", null));
    xhr.send(form);
  });
}
