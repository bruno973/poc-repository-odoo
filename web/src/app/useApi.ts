// app/useApi.ts — Chargement d'une ressource de l'API, annulable, rechargeable.

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api-client.js";

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload(): void;
}

export function useApi<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): ApiState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    load(controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error: unknown) => {
        if ((error as Error).name === "AbortError") return;
        setState({ data: null, error: error instanceof ApiError ? error.message : "Erreur inattendue.", loading: false });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
