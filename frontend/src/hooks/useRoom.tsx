import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchRooms } from "../data/rooms";
import type { Room } from "../types/database";
import { useQuery } from "./useQuery";

interface RoomState { rooms: Room[]; room: Room; setRoomId: (id: number) => void; reloadRooms: () => Promise<void> }
const Ctx = createContext<RoomState | null>(null);

const CACHE_KEY_ROOMS = "cem_cached_rooms";
const CACHE_KEY_SELECTED_ROOM = "cem_selected_room_id";

/** Menyimpan ruang yang dipilih; dipakai bersama oleh semua halaman. Children hanya dirender bila ada ruang. */
export function RoomProvider({ children }: { children: ReactNode }) {
  const q = useQuery(fetchRooms, []);

  // Baca daftar ruang tersimpan dari cache agar langsung dapat dirender saat refresh
  const [cachedRooms, setCachedRooms] = useState<Room[]>(() => {
    try {
      const s = localStorage.getItem(CACHE_KEY_ROOMS);
      return s ? (JSON.parse(s) as Room[]) : [];
    } catch {
      return [];
    }
  });

  const [selected, setSelected] = useState<number | null>(() => {
    try {
      const s = localStorage.getItem(CACHE_KEY_SELECTED_ROOM);
      return s ? Number(s) : null;
    } catch {
      return null;
    }
  });

  // Sinkronkan cache ruang bila data baru tiba dari database
  useEffect(() => {
    if (q.data && q.data.length > 0) {
      setCachedRooms(q.data);
      try {
        localStorage.setItem(CACHE_KEY_ROOMS, JSON.stringify(q.data));
      } catch {}
    }
  }, [q.data]);

  const setRoomId = useCallback((id: number) => {
    setSelected(id);
    try {
      localStorage.setItem(CACHE_KEY_SELECTED_ROOM, String(id));
    } catch {}
  }, []);

  const rooms = q.data ?? cachedRooms;
  const room = rooms.find((r) => r.room_id === selected) ?? rooms[0];
  const value = useMemo(() => (room ? { rooms, room, setRoomId, reloadRooms: q.reload } : null), [rooms, room, setRoomId, q.reload]);

  // Hanya tampilkan pesan memuat ruang jika belum ada data sama sekali (baik dari query maupun dari cache)
  if (q.loading && rooms.length === 0) return <div className="empty">Memuat ruang…</div>;
  if (q.error && rooms.length === 0) return <div className="notice">Gagal memuat ruang: {q.error}</div>;
  if (!value) return <div className="notice">Belum ada ruang. Jalankan seed.sql pada Supabase.</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRoom(): RoomState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRoom harus dipakai di dalam RoomProvider");
  return v;
}
