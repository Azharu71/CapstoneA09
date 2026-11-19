import { supabase, unwrap } from "../lib/supabase";
import type { NewRoomInput, Room, RoomAcInput } from "../types/database";

// >>> UBAH MANUAL: nama tabel/kolom harus sama dengan 0001_schema.sql dan 0005_courses_rooms_ac.sql.
const COLS = "room_id,room_code,room_name,capacity,ac_on_time,ac_off_time,ac_setpoint_c,ac_days";

/** Daftar ruang beserta pengaturan AC-nya. Tabel: rooms. */
export async function fetchRooms(): Promise<Room[]> {
  return unwrap(await supabase.from("rooms").select(COLS).order("room_code"));
}

/**
 * Tambah ruang (Administrator dan Operator). Kode ruang dipakai sebagai bagian topik MQTT
 * (classroom/<kode>/...), jadi hanya huruf, angka, dan tanda hubung. Pengaturan AC memakai nilai bawaan database.
 * CATATAN: menambah ruang di sini hanya membuat catatan di database. Perangkat Node ruang itu (akun broker,
 * ACL, bridge) harus disiapkan terpisah.
 */
export async function addRoom(input: NewRoomInput): Promise<Room> {
  return unwrap(await supabase.from("rooms").insert(input).select(COLS).single());
}

/** Simpan pengaturan AC satu ruang. Trigger database mengirimkannya ke Node 1 IR (perintah ac_config). */
export async function saveRoomAc(roomId: number, input: RoomAcInput): Promise<void> {
  unwrap(await supabase.from("rooms").update(input).eq("room_id", roomId).select("room_id"));
}
