import { CONFIG } from "../lib/config";
import { hhmm } from "../lib/schedule";
import { supabase, unwrap } from "../lib/supabase";
import type { HistoryItem } from "../types/database";

/**
 * Menggabungkan catatan dari beberapa tabel menjadi satu daftar (terbaru lebih dulu).
 * Jenis: cv (occupancy), energy (energy_read), schedule (schedules), audit (audit_log, hanya Administrator).
 * >>> UBAH MANUAL: tambah sumber baru dengan menambah satu query dan satu pemetaan di bawah.
 */
export async function fetchHistory(roomId: number, roomCode: string, isAdmin: boolean): Promise<HistoryItem[]> {
  const n = CONFIG.historyLimit;
  const [occ, eng, sch, aud] = await Promise.all([
    supabase.from("occupancy").select("detected_at,person_count").eq("room_id", roomId).order("detected_at", { ascending: false }).limit(n),
    supabase.from("energy_read").select("measured_at,active_power_w").eq("room_id", roomId).order("measured_at", { ascending: false }).limit(n),
    supabase.from("schedules").select("updated_at,start_time,end_time,is_active").eq("room_id", roomId).order("updated_at", { ascending: false }).limit(n),
    isAdmin
      ? supabase.from("audit_log").select("created_at,action,detail,status").eq("room_id", roomId).order("created_at", { ascending: false }).limit(n)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const items: HistoryItem[] = [];
  (unwrap(occ) as { detected_at: string; person_count: number }[]).forEach((r) =>
    items.push({ time: r.detected_at, type: "cv", typeLabel: "Computer Vision", activity: "Deteksi disimpan", detail: `${r.person_count} orang • ${roomCode}` }));
  (unwrap(eng) as { measured_at: string; active_power_w: number }[]).forEach((r) =>
    items.push({ time: r.measured_at, type: "energy", typeLabel: "Energi", activity: "Telemetri diterima", detail: `${(r.active_power_w / 1000).toFixed(2)} kW • ${roomCode}` }));
  (unwrap(sch) as { updated_at: string; start_time: string; end_time: string; is_active: boolean }[]).forEach((r) =>
    items.push({ time: r.updated_at, type: "schedule", typeLabel: "Jadwal", activity: r.is_active ? "Jadwal diperbarui" : "Jadwal dinonaktifkan", detail: `${hhmm(r.start_time)}–${hhmm(r.end_time)}` }));
  if (isAdmin) {
    (unwrap(aud as never) as { created_at: string; action: string; status: string }[]).forEach((r) =>
      items.push({ time: r.created_at, type: "audit", typeLabel: "Audit", activity: r.action, detail: r.status }));
  }
  return items.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}
