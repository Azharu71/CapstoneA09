import { supabase, unwrap } from "../lib/supabase";
import type { Schedule, ScheduleInput } from "../types/database";

/** Jadwal kuliah satu ruang beserta nama mata kuliahnya, urut hari lalu jam. Tabel: schedules + courses. */
export async function fetchSchedules(roomId: number): Promise<Schedule[]> {
  return unwrap(
    await supabase.from("schedules").select("*, courses(course_id,course_code,course_name)")
      .eq("room_id", roomId).order("day_of_week").order("start_time"),
  );
}

/** Mengubah pesan database menjadi kalimat yang jelas bagi pengguna. */
function ramah(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("schedules_no_overlap")) return new Error("Jadwal bentrok dengan jadwal lain pada ruang dan hari yang sama.");
  return new Error(msg);
}

/**
 * Tambah atau ubah jadwal mata kuliah. Setelah tersimpan, TRIGGER database membuat perintah 'schedule'
 * yang diteruskan bridge ke Node 2 (frontend tidak perlu mengirim apa pun ke MQTT).
 */
export async function saveSchedule(input: ScheduleInput, id?: number): Promise<void> {
  try {
    if (id) unwrap(await supabase.from("schedules").update(input).eq("schedule_id", id).select("schedule_id"));
    else unwrap(await supabase.from("schedules").insert({ ...input, is_active: true }).select("schedule_id"));
  } catch (e) {
    throw ramah(e);
  }
}

/** Aktif/nonaktifkan jadwal. Mengaktifkan kembali dapat ditolak bila bentrok dengan jadwal lain. */
export async function setScheduleActive(id: number, active: boolean): Promise<void> {
  try {
    unwrap(await supabase.from("schedules").update({ is_active: active }).eq("schedule_id", id).select("schedule_id"));
  } catch (e) {
    throw ramah(e);
  }
}

/** Hapus jadwal. Hanya Administrator (policy schedules_delete). */
export async function deleteSchedule(id: number): Promise<void> {
  unwrap(await supabase.from("schedules").delete().eq("schedule_id", id).select("schedule_id"));
}
