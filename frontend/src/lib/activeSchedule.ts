import type { Schedule } from "../types/database";
import { isoDow, minutesNow, todayLocal } from "./time";

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Jadwal aktif untuk hari ini: yang sedang berlangsung, atau yang pertama hari ini; null bila tidak ada. */
export function pickActiveSchedule(list: Schedule[], now: Date = new Date()): Schedule | null {
  const dow = isoDow(todayLocal(now));
  const today = list
    .filter((s) => s.is_active && s.days_of_week.includes(dow))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  if (!today.length) return null;
  const m = minutesNow(now);
  return today.find((s) => m >= toMin(s.start_time) && m <= toMin(s.end_time)) ?? today[0];
}
