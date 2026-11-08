import { useEffect, useState } from "react";

/** Waktu sekarang (ms) yang diperbarui berkala; dipakai untuk "x detik lalu" dan penanda data kedaluwarsa. */
export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
