import { hariLabel, hhmm } from "../lib/schedule";
import { supabase, unwrap } from "../lib/supabase";
import { addDays, todayLocal } from "../lib/time";
import type { HistoryItem } from "../types/database";

export type HistoryRange = "day" | "week" | "month";

/** Hitung timestamp awal dari rentang waktu yang dipilih (dalam WIB). */
function rangeStart(range: HistoryRange): string {
  const today = todayLocal();
  if (range === "day") return `${today}T00:00:00+07:00`;
  if (range === "week") return `${addDays(today, -6)}T00:00:00+07:00`;
  // month: awal bulan ini
  return `${today.slice(0, 7)}-01T00:00:00+07:00`;
}

/**
 * Menggabungkan catatan dari beberapa tabel menjadi satu daftar (terbaru lebih dulu).
 * Jenis: cv (occupancy), energy (energy_read), schedule (schedules), audit (audit_log, hanya Administrator).
 * Filter berdasarkan rentang waktu: day (hari ini), week (7 hari terakhir), month (bulan ini).
 * >>> UBAH MANUAL: tambah sumber baru dengan menambah satu query dan satu pemetaan di bawah.
 */
export async function fetchHistory(
  roomId: number,
  roomCode: string,
  isAdmin: boolean,
  range: HistoryRange = "day",
): Promise<HistoryItem[]> {
  const from = rangeStart(range);
  // CV & Energi dibatasi 200 baris per rentang waktu (cukup untuk paginasi 50/hal x 4 hal)
  // Jadwal & Audit tidak difilter waktu karena volumenya kecil
  const n = 200;
  const [occ, eng, sch, aud] = await Promise.all([
    supabase
      .from("occupancy")
      .select("detected_at,person_count")
      .eq("room_id", roomId)
      .gte("detected_at", from)
      .order("detected_at", { ascending: false })
      .limit(n),
    supabase
      .from("energy_read")
      .select("measured_at,voltage_v,current_a,frequency_hz,active_power_w")
      .eq("room_id", roomId)
      .gte("measured_at", from)
      .order("measured_at", { ascending: false })
      .limit(n),
    supabase
      .from("schedules")
      .select("updated_at,day_of_week,start_time,end_time,is_active,courses(course_name)")
      .eq("room_id", roomId)
      .order("updated_at", { ascending: false })
      .limit(50),
    isAdmin
      ? supabase
          .from("audit_log")
          .select("created_at,action,detail,status")
          .eq("room_id", roomId)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const items: HistoryItem[] = [];
  (unwrap(occ) as { detected_at: string; person_count: number }[]).forEach((r) =>
    items.push({ time: r.detected_at, type: "cv", typeLabel: "Computer Vision", activity: "Deteksi disimpan", detail: `${r.person_count} orang • ${roomCode}` }));
  (unwrap(eng) as { measured_at: string; voltage_v: number; current_a: number; frequency_hz: number; active_power_w: number }[]).forEach((r) =>
    items.push({
      time: r.measured_at,
      type: "energy",
      typeLabel: "Energi",
      activity: "Telemetri diterima",
      detail: `${(Number(r.active_power_w) / 1000).toFixed(2)} kW (${Math.round(Number(r.active_power_w))} W) • ${Number(r.voltage_v).toFixed(1)} V • ${Number(r.current_a).toFixed(2)} A • ${Number(r.frequency_hz).toFixed(1)} Hz • ${roomCode}`,
    }));
  (unwrap(sch) as unknown as { updated_at: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean; courses: { course_name: string } | null }[]).forEach((r) =>
    items.push({
      time: r.updated_at,
      type: "schedule",
      typeLabel: "Jadwal",
      activity: r.is_active ? "Jadwal diperbarui" : "Jadwal dinonaktifkan",
      detail: `${r.courses?.course_name ?? "Mata kuliah"} • ${hariLabel(r.day_of_week)} ${hhmm(r.start_time)}–${hhmm(r.end_time)}`,
    }));
  if (isAdmin) {
    (unwrap(aud as never) as { created_at: string; action: string; status: string }[]).forEach((r) =>
      items.push({ time: r.created_at, type: "audit", typeLabel: "Audit", activity: r.action, detail: r.status }));
  }
  return items.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}
