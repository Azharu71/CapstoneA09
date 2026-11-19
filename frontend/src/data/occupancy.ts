import { supabase, unwrap } from "../lib/supabase";
import { addDays, todayLocal } from "../lib/time";
import type { OccupancyBucket, OccupancyRow } from "../types/database";

/** Periode halaman Okupansi: jumlah hari ke belakang (1 = hari ini). */
export const PERIOD_DAYS: Record<string, number> = { "Hari ini": 1, "7 hari": 7, "30 hari": 30 };

/** Riwayat per jam. View: occupancy_hourly. Interval 1 jam sesuai desain. */
export async function fetchOccupancyHourly(roomId: number, days: number): Promise<OccupancyBucket[]> {
  const from = addDays(todayLocal(), -(days - 1));
  return unwrap(
    await supabase.from("occupancy_hourly").select("*").eq("room_id", roomId)
      .gte("bucket_local", `${from}T00:00:00`).order("bucket_local", { ascending: false }).limit(720),
  );
}

/** Deteksi terbaru (untuk kartu jumlah, status, FPS, latensi). Tabel: occupancy. */
export async function fetchLatestOccupancy(roomId: number): Promise<OccupancyRow | null> {
  return unwrap(
    await supabase.from("occupancy").select("detected_at,person_count,occupied,inference_fps,processing_ms")
      .eq("room_id", roomId).order("detected_at", { ascending: false }).limit(1).maybeSingle(),
  );
}

/** Riwayat deteksi langsung dari tabel occupancy (setiap 30 detik dari Node 1 CV); terbaru lebih dulu. */
export async function fetchOccupancyHistory(roomId: number, limit = 50): Promise<OccupancyRow[]> {
  return unwrap(
    await supabase
      .from("occupancy")
      .select("detected_at,person_count,occupied,inference_fps,processing_ms")
      .eq("room_id", roomId)
      .order("detected_at", { ascending: false })
      .limit(limit),
  );
}

/** Nama model aktif untuk kolom Model pada tabel. Tabel: cv_models. */
export async function fetchActiveModelName(): Promise<string> {
  const rows = unwrap(
    await supabase.from("cv_models").select("model_name,model_version").eq("is_active", true)
      .order("deployed_at", { ascending: false }).limit(1),
  ) as { model_name: string; model_version: string }[];
  // >>> UBAH MANUAL: tampilan nama model. Prototipe menulis "YOLOv26-Nano"; di sini memakai model_name dari database.
  return rows[0] ? rows[0].model_name : "-";
}
