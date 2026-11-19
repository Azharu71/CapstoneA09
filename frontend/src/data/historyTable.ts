import { hariLabel, hhmm } from "../lib/schedule";
import { supabase, unwrap } from "../lib/supabase";
import {
  addDays,
  fmtDateTime,
  hourRange,
  MONTHS_SHORT,
  parseLocal,
} from "../lib/time";

export type HistoryTab = "occupancy" | "energy" | "schedule" | "audit";
export type Resolution = "hour" | "day" | "raw";

/** Hasil satu halaman tabel: judul kolom, baris yang sudah diformat, dan total baris di database. */
export interface HistoryPage {
  head: string[];
  rows: string[][];
  total: number;
}

export interface HistorySummary {
  energyKwh: number;
  peakPowerW: number | null;
  maxPeople: number;
  occupiedHours: number;
}

export const PAGE_SIZE = 50;
/** Rentang maksimum (hari). Ringkasan memakai view per jam: 31 hari x 24 = 744 baris < batas 1000 PostgREST. */
export const MAX_RANGE_DAYS = 31;
/** Batas baris untuk ekspor CSV. */
export const EXPORT_LIMIT = 20000;
const CHUNK = 1000; // batas baris per permintaan PostgREST

export interface HistoryQuery {
  roomId: number;
  roomCode: string;
  tab: HistoryTab;
  resolution: Resolution;
  from: string; // YYYY-MM-DD (WIB)
  to: string; // YYYY-MM-DD (WIB), inklusif
}

/** Resolusi yang tersedia per tab. Okupansi tidak punya view harian. */
export const RESOLUTIONS: Record<HistoryTab, Resolution[]> = {
  occupancy: ["hour", "raw"],
  energy: ["hour", "day", "raw"],
  schedule: [],
  audit: [],
};

export function rangeDays(from: string, to: string): number {
  return (
    Math.round(
      (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) /
        86400000,
    ) + 1
  );
}

/** Mengembalikan pesan kesalahan bila rentang tidak valid, atau null bila valid. */
export function validateRange(from: string, to: string): string | null {
  if (!from || !to) return "Tanggal awal dan akhir harus diisi.";
  if (from > to) return "Tanggal awal tidak boleh setelah tanggal akhir.";
  if (rangeDays(from, to) > MAX_RANGE_DAYS)
    return `Rentang maksimal ${MAX_RANGE_DAYS} hari.`;
  return null;
}

// Batas waktu untuk kolom timestamptz (tabel mentah) dan timestamp tanpa zona (view bucket_local).
// >>> UBAH MANUAL: offset +07:00 harus sama dengan CONFIG.timeZone (WIB).
const tzStart = (d: string) => `${d}T00:00:00+07:00`;
const tzEnd = (d: string) => `${addDays(d, 1)}T00:00:00+07:00`;
const localStart = (d: string) => `${d}T00:00:00`;
const localEnd = (d: string) => `${addDays(d, 1)}T00:00:00`;

const pad = (n: number) => String(n).padStart(2, "0");
const dateLabel = (bucket: string) => {
  const { y, mo, d } = parseLocal(bucket);
  return `${pad(d)} ${MONTHS_SHORT[mo - 1]} ${y}`;
};
const num = (v: unknown, digits: number) =>
  v == null ? "—" : Number(v).toFixed(digits);

type Row = Record<string, unknown>;
/** Bentuk minimal query Supabase yang dipakai di sini (cukup .range()). */
interface Ranged {
  range(
    from: number,
    to: number,
  ): PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
    count: number | null;
  }>;
}
interface Plan {
  head: string[];
  /** Menyusun query dasar (select + filter + urut). Penomoran halaman ditambahkan oleh pemanggil. */
  build: () => Ranged;
  format: (r: Row) => string[];
}

function plan(q: HistoryQuery, isAdmin: boolean): Plan {
  const { roomId, roomCode, tab, resolution, from, to } = q;

  if (tab === "occupancy" && resolution === "raw") {
    return {
      head: ["Waktu", "Ruang", "Jumlah orang", "Status", "FPS", "Latensi (ms)"],
      build: () =>
        supabase
          .from("occupancy")
          .select(
            "detected_at,person_count,occupied,inference_fps,processing_ms",
            { count: "exact" },
          )
          .eq("room_id", roomId)
          .gte("detected_at", tzStart(from))
          .lt("detected_at", tzEnd(to))
          .order("detected_at", { ascending: false }),
      format: (r) => [
        fmtDateTime(r.detected_at as string),
        roomCode,
        String(r.person_count),
        r.occupied ? "Terisi" : "Kosong",
        num(r.inference_fps, 1),
        r.processing_ms == null
          ? "—"
          : String(Math.round(Number(r.processing_ms))),
      ],
    };
  }
  if (tab === "occupancy") {
    return {
      head: [
        "Periode",
        "Ruang",
        "Rata-rata orang",
        "Maks. orang",
        "Status",
        "FPS rata-rata",
        "Sampel",
      ],
      build: () =>
        supabase
          .from("occupancy_hourly")
          .select("*", { count: "exact" })
          .eq("room_id", roomId)
          .gte("bucket_local", localStart(from))
          .lt("bucket_local", localEnd(to))
          .order("bucket_local", { ascending: false }),
      format: (r) => [
        `${dateLabel(r.bucket_local as string)} ${hourRange(r.bucket_local as string)}`,
        roomCode,
        num(r.avg_count, 1),
        String(r.max_count),
        r.occupied ? "Terisi" : "Kosong",
        num(r.avg_fps, 1),
        String(r.samples),
      ],
    };
  }
  if (tab === "energy" && resolution === "raw") {
    return {
      head: [
        "Waktu",
        "Tegangan (V)",
        "Arus (A)",
        "Frekuensi (Hz)",
        "Daya aktif (W)",
        "Energi kumulatif (kWh)",
      ],
      build: () =>
        supabase
          .from("energy_read")
          .select(
            "measured_at,voltage_v,current_a,frequency_hz,active_power_w,energy_kwh",
            { count: "exact" },
          )
          .eq("room_id", roomId)
          .gte("measured_at", tzStart(from))
          .lt("measured_at", tzEnd(to))
          .order("measured_at", { ascending: false }),
      format: (r) => [
        fmtDateTime(r.measured_at as string),
        num(r.voltage_v, 1),
        num(r.current_a, 2),
        num(r.frequency_hz, 1),
        num(r.active_power_w, 0),
        num(r.energy_kwh, 3),
      ],
    };
  }
  if (tab === "energy") {
    const view = resolution === "day" ? "energy_daily" : "energy_hourly";
    return {
      head: [
        "Periode",
        "Tegangan (V)",
        "Arus (A)",
        "Frekuensi (Hz)",
        "Daya aktif rata-rata (W)",
        "Energi (kWh)",
        "Sampel",
      ],
      build: () =>
        supabase
          .from(view)
          .select("*", { count: "exact" })
          .eq("room_id", roomId)
          .gte("bucket_local", localStart(from))
          .lt("bucket_local", localEnd(to))
          .order("bucket_local", { ascending: false }),
      format: (r) => {
        const b = r.bucket_local as string;
        return [
          resolution === "day"
            ? dateLabel(b)
            : `${dateLabel(b)} ${hourRange(b)}`,
          num(r.voltage_v, 1),
          num(r.current_a, 2),
          num(r.frequency_hz, 1),
          num(r.active_power_w, 1),
          num(r.energy_kwh, 3),
          String(r.samples),
        ];
      },
    };
  }
  if (tab === "schedule") {
    return {
      head: ["Diubah", "Mata kuliah", "Hari", "Jam", "Status"],
      build: () =>
        supabase
          .from("schedules")
          .select(
            "updated_at,day_of_week,start_time,end_time,is_active,courses(course_name)",
            { count: "exact" },
          )
          .eq("room_id", roomId)
          .gte("updated_at", tzStart(from))
          .lt("updated_at", tzEnd(to))
          .order("updated_at", { ascending: false }),
      format: (r) => {
        const c = r.courses as { course_name: string } | null;
        return [
          fmtDateTime(r.updated_at as string),
          c?.course_name ?? "Mata kuliah",
          hariLabel(Number(r.day_of_week)),
          `${hhmm(r.start_time as string)}–${hhmm(r.end_time as string)}`,
          r.is_active ? "Aktif" : "Nonaktif",
        ];
      },
    };
  }
  // audit: hanya Administrator (RLS di database juga membatasi).
  if (!isAdmin) throw new Error("Log audit hanya untuk Administrator.");
  return {
    head: ["Waktu", "Aksi", "Status", "Detail"],
    build: () =>
      supabase
        .from("audit_log")
        .select("created_at,action,detail,status", { count: "exact" })
        .eq("room_id", roomId)
        .gte("created_at", tzStart(from))
        .lt("created_at", tzEnd(to))
        .order("created_at", { ascending: false }),
    format: (r) => {
      const d = JSON.stringify(r.detail ?? {});
      return [
        fmtDateTime(r.created_at as string),
        String(r.action),
        String(r.status),
        d.length > 80 ? d.slice(0, 80) + "…" : d,
      ];
    },
  };
}

/** Satu halaman data (paginasi di server). page dimulai dari 1. */
export async function fetchHistoryPage(
  q: HistoryQuery,
  isAdmin: boolean,
  page: number,
): Promise<HistoryPage> {
  const p = plan(q, isAdmin);
  const start = (page - 1) * PAGE_SIZE;
  const res = await p.build().range(start, start + PAGE_SIZE - 1);
  if (res.error) throw new Error(res.error.message);
  return {
    head: p.head,
    rows: ((res.data ?? []) as unknown as Row[]).map(p.format),
    total: res.count ?? 0,
  };
}

/** Semua baris pada rentang (maks. EXPORT_LIMIT) untuk CSV. truncated = true bila data lebih banyak dari batas. */
export async function fetchHistoryAll(
  q: HistoryQuery,
  isAdmin: boolean,
): Promise<{ head: string[]; rows: string[][]; truncated: boolean }> {
  const p = plan(q, isAdmin);
  const rows: string[][] = [];
  let total = Infinity;
  for (let start = 0; start < Math.min(total, EXPORT_LIMIT); start += CHUNK) {
    const res = await p.build().range(start, start + CHUNK - 1);
    if (res.error) throw new Error(res.error.message);
    total = res.count ?? 0;
    const data = (res.data ?? []) as unknown as Row[];
    data.forEach((r) => rows.push(p.format(r)));
    if (data.length < CHUNK) break;
  }
  return {
    head: p.head,
    rows: rows.slice(0, EXPORT_LIMIT),
    truncated: total > EXPORT_LIMIT,
  };
}

/** Ringkasan rentang waktu dari view per jam (energi dan okupansi). */
export async function fetchHistorySummary(
  roomId: number,
  from: string,
  to: string,
): Promise<HistorySummary> {
  const [eng, occ] = await Promise.all([
    supabase
      .from("energy_hourly")
      .select("active_power_w,energy_kwh")
      .eq("room_id", roomId)
      .gte("bucket_local", localStart(from))
      .lt("bucket_local", localEnd(to))
      .limit(1000),
    supabase
      .from("occupancy_hourly")
      .select("max_count,occupied")
      .eq("room_id", roomId)
      .gte("bucket_local", localStart(from))
      .lt("bucket_local", localEnd(to))
      .limit(1000),
  ]);
  const e = unwrap(eng) as { active_power_w: number; energy_kwh: number }[];
  const o = unwrap(occ) as { max_count: number; occupied: boolean }[];
  return {
    energyKwh: e.reduce((s, r) => s + Number(r.energy_kwh), 0),
    peakPowerW: e.length
      ? Math.max(...e.map((r) => Number(r.active_power_w)))
      : null,
    maxPeople: o.reduce((m, r) => Math.max(m, Number(r.max_count)), 0),
    occupiedHours: o.filter((r) => r.occupied).length,
  };
}

/** Membuat berkas CSV (dengan BOM agar Excel membaca UTF-8) lalu mengunduhnya. */
export function downloadCsv(
  filename: string,
  head: string[],
  rows: string[][],
) {
  const esc = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const csv = [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
