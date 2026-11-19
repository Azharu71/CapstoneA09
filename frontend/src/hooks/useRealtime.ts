import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

/**
 * Memanggil onChange (dengan jeda 500 ms) setiap ada perubahan pada tabel yang dipantau untuk satu ruang.
 * Syarat: tabel sudah masuk publication supabase_realtime (dilakukan oleh 0001_schema.sql).
 * >>> UBAH MANUAL: bila Realtime tidak aktif, dashboard tetap bekerja tetapi harus di-refresh manual.
 */
export function useRealtime(tables: string[], onChange: () => void): void;
export function useRealtime(tables: string[], roomId: number | undefined, onChange: () => void): void;
export function useRealtime(
  tables: string[],
  roomIdOrCb?: number | (() => void),
  maybeChange?: () => void,
) {
  const onChange = typeof roomIdOrCb === "function" ? roomIdOrCb : (maybeChange ?? (() => {}));
  const roomId = typeof roomIdOrCb === "number" ? roomIdOrCb : undefined;
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = tables.join(",");

  useEffect(() => {
    let timer: number | undefined;
    const fire = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => cb.current(), 500);
    };
    const ch = supabase.channel(`rt-${key}-${roomId ?? "all"}-${Math.random().toString(36).slice(2)}`);
    tables.forEach((t) => {
      if (roomId) {
        ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `room_id=eq.${roomId}` }, fire);
      } else {
        ch.on("postgres_changes", { event: "*", schema: "public", table: t }, fire);
      }
    });
    ch.subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, key]);
}
