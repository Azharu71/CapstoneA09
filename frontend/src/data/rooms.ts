import { supabase, unwrap } from "../lib/supabase";
import type { Room } from "../types/database";

/** Daftar ruang untuk pilihan ruang. Tabel: rooms. */
export async function fetchRooms(): Promise<Room[]> {
  // >>> UBAH MANUAL: nama tabel/kolom harus sama dengan 0001_schema.sql.
  return unwrap(await supabase.from("rooms").select("room_id,room_code,room_name,capacity").order("room_code"));
}
