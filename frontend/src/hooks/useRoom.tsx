import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { fetchRooms } from "../data/rooms";
import type { Room } from "../types/database";
import { useQuery } from "./useQuery";

interface RoomState { rooms: Room[]; room: Room; setRoomId: (id: number) => void }
const Ctx = createContext<RoomState | null>(null);

/** Menyimpan ruang yang dipilih; dipakai bersama oleh semua halaman. Children hanya dirender bila ada ruang. */
export function RoomProvider({ children }: { children: ReactNode }) {
  const q = useQuery(fetchRooms, []);
  const [selected, setSelected] = useState<number | null>(null);
  const rooms = q.data ?? [];
  const room = rooms.find((r) => r.room_id === selected) ?? rooms[0];
  const value = useMemo(() => (room ? { rooms, room, setRoomId: setSelected } : null), [rooms, room]);

  if (q.loading) return <div className="empty">Memuat ruang…</div>;
  if (q.error) return <div className="notice">Gagal memuat ruang: {q.error}</div>;
  if (!value) return <div className="notice">Belum ada ruang. Jalankan seed.sql pada Supabase.</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRoom(): RoomState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRoom harus dipakai di dalam RoomProvider");
  return v;
}
