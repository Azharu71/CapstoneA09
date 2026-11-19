import type { Schedule } from "../types/database";
import { toMin } from "./schedule";
import { isoDow, minutesNow, todayLocal } from "./time";

/** Kelas hari ini: yang sedang berlangsung, yang berikutnya, dan seluruh jadwal aktif hari ini. */
export function kelasHariIni(list: Schedule[], now: Date = new Date()) {
  const dow = isoDow(todayLocal(now));
  const m = minutesNow(now);
  const hariIni = list
    .filter((s) => s.is_active && s.day_of_week === dow)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const sedang = hariIni.find((s) => m >= toMin(s.start_time) && m < toMin(s.end_time)) ?? null;
  const berikut = hariIni.find((s) => toMin(s.start_time) > m) ?? null;
  return { hariIni, sedang, berikut };
}
