import { useCallback, useEffect, useRef, useState } from "react";

/** Pembungkus kecil untuk memuat data: { data, error, loading, reload }. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    const id = ++seq.current;
    try {
      const r = await fn();
      if (id === seq.current) { setData(r); setError(null); }
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, deps);

  useEffect(() => { setLoading(true); void load(); }, [load]);
  return { data, error, loading, reload: load };
}
