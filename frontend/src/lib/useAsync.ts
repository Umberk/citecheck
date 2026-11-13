import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";

export interface AsyncState<T> {
  data: T | undefined;
  error: ApiError | Error | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (updater: T | ((previous: T | undefined) => T)) => void;
}

/** Load data on mount and whenever `deps` change; `reload` refetches without clearing data. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const generation = useRef(0);

  const run = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const result = await loaderRef.current();
      if (current === generation.current) {
        setDataState(result);
        setError(null);
      }
    } catch (caught) {
      if (current === generation.current) {
        setError(caught as Error);
      }
    } finally {
      if (current === generation.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData = useCallback((updater: T | ((previous: T | undefined) => T)) => {
    setDataState((previous) =>
      typeof updater === "function" ? (updater as (previous: T | undefined) => T)(previous) : updater,
    );
  }, []);

  return { data, error, loading, reload: run, setData };
}

export function useInterval(callback: () => void, delay: number | null) {
  const saved = useRef(callback);
  saved.current = callback;
  useEffect(() => {
    if (delay === null) return undefined;
    const id = window.setInterval(() => saved.current(), delay);
    return () => window.clearInterval(id);
  }, [delay]);
}
