import { supabase, unwrap } from "../lib/supabase";
import type { Schedule, ScheduleInput } from "../types/database";

/** Jadwal satu ruang. Tabel: schedules (RLS: admin dan operator boleh baca). */
export async function fetchSchedules(roomId: number): Promise<Schedule[]> {
  return unwrap(await supabase.from("schedules").select("*").eq("room_id", roomId).order("start_time"));
}

/**
 * Tambah atau ubah jadwal. created_by diisi otomatis oleh database (auth.uid()).
 * Setelah tersimpan, TRIGGER database membuat perintah 'schedule' yang diteruskan bridge ke Node
 * (frontend tidak perlu mengirim apa pun ke MQTT).
 */
export async function saveSchedule(input: ScheduleInput, id?: number): Promise<void> {
  if (id) unwrap(await supabase.from("schedules").update(input).eq("schedule_id", id).select("schedule_id"));
  else unwrap(await supabase.from("schedules").insert({ ...input, is_active: true }).select("schedule_id"));
}

/** Aktif/nonaktifkan jadwal (operator tidak boleh menghapus, hanya menonaktifkan). */
export async function setScheduleActive(id: number, active: boolean): Promise<void> {
  unwrap(await supabase.from("schedules").update({ is_active: active }).eq("schedule_id", id).select("schedule_id"));
}

/** Hapus jadwal. Hanya Administrator (policy schedules_delete). */
export async function deleteSchedule(id: number): Promise<void> {
  unwrap(await supabase.from("schedules").delete().eq("schedule_id", id).select("schedule_id"));
}
