import { CONFIG } from "./config";

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const MONTHS_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Tanggal hari ini pada zona waktu CONFIG.timeZone, format YYYY-MM-DD. */
export function todayLocal(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CONFIG.timeZone }).format(now);
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Hari ISO untuk tanggal YYYY-MM-DD (1 = Senin ... 7 = Minggu). */
export function isoDow(dateStr: string): number {
  const g = new Date(dateStr + "T00:00:00Z").getUTCDay();
  return g === 0 ? 7 : g;
}

/** Menit sejak 00:00 pada zona waktu CONFIG.timeZone. */
export function minutesNow(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: CONFIG.timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** Jam HH:mm:ss dari timestamp ISO (zona CONFIG.timeZone), gaya prototipe "10:42:18". */
export function fmtClock(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: CONFIG.timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso));
}

/** Tanggal pendek + jam dari timestamp ISO, mis. "05 Nov 10:42". */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: CONFIG.timeZone }).format(d);
  const [, mo, da] = date.split("-").map(Number);
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: CONFIG.timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${pad(da)} ${MONTHS_SHORT[mo - 1]} ${hm}`;
}

/** Tanggal panjang gaya prototipe: "Minggu, 11 Oktober 2026". */
export function fmtDateLong(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: CONFIG.timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
}

/** Memecah "2026-11-05T10:00:00" (timestamp tanpa zona dari view SQL) tanpa konversi zona waktu. */
export function parseLocal(s: string) {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return { y: 0, mo: 1, d: 1, h: 0, mi: 0 };
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] };
}

export const dateOf = (s: string) => s.slice(0, 10);

/** "10:00 – 11:00" dari bucket jam. */
export function hourRange(bucket: string): string {
  const { h } = parseLocal(bucket);
  return `${pad(h)}:00 – ${pad((h + 1) % 24)}:00`;
}

/** Nomor minggu ISO. */
function isoWeek(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** "Minggu 45 (02-08 Nov 2026)" dari bucket minggu (hari Senin). */
export function weekRange(bucket: string): string {
  const start = dateOf(bucket);
  const end = addDays(start, 6);
  const a = parseLocal(start + "T00:00:00");
  const b = parseLocal(end + "T00:00:00");
  const span = a.mo === b.mo
    ? `${pad(a.d)}-${pad(b.d)} ${MONTHS_SHORT[b.mo - 1]} ${b.y}`
    : `${pad(a.d)} ${MONTHS_SHORT[a.mo - 1]} - ${pad(b.d)} ${MONTHS_SHORT[b.mo - 1]} ${b.y}`;
  return `Minggu ${isoWeek(start)} (${span})`;
}

/** "Oktober 2026" dari bucket bulan. */
export function monthLabel(bucket: string): string {
  const { y, mo } = parseLocal(bucket);
  return `${MONTHS_FULL[mo - 1]} ${y}`;
}

/** "08 Nov 2026, 14:00 – 15:00" dari bucket jam untuk rentang kustom. */
export function customBucketRange(bucket: string): string {
  const { y, mo, d, h } = parseLocal(bucket);
  return `${pad(d)} ${MONTHS_SHORT[mo - 1]} ${y}, ${pad(h)}:00 – ${pad((h + 1) % 24)}:00`;
}

/** "baru saja", "12 dtk lalu", "3 mnt lalu", "2 jam lalu". */
export function agoText(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "belum ada data";
  const s = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (s < 5) return "baru saja";
  if (s < 60) return `${s} dtk lalu`;
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  return `${Math.floor(s / 3600)} jam lalu`;
}
