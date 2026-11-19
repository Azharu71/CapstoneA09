import { CONFIG } from "../lib/config";
import { supabase, unwrap } from "../lib/supabase";
import { todayLocal } from "../lib/time";
import type { EnergyBucket, EnergyReadRow } from "../types/database";

export type EnergyPeriod = "hour" | "week" | "month";

// >>> UBAH MANUAL: nama view agregasi (0003_views.sql) dan jumlah baris yang ditampilkan per periode.
const SOURCE: Record<EnergyPeriod, { view: string; limit: number }> = {
  hour: { view: "energy_hourly", limit: 24 },
  week: { view: "energy_weekly", limit: 4 },
  month: { view: "energy_monthly", limit: 4 },
};

/** Riwayat energi per jam (hari ini), minggu, atau bulan; terbaru lebih dulu. */
export async function fetchEnergy(roomId: number, period: EnergyPeriod): Promise<EnergyBucket[]> {
  const { view, limit } = SOURCE[period];
  let q = supabase.from(view).select("*").eq("room_id", roomId);
  if (period === "hour") q = q.gte("bucket_local", `${todayLocal()}T00:00:00`); // hanya hari ini (zona CONFIG.timeZone)
  return unwrap(await q.order("bucket_local", { ascending: false }).limit(limit));
}

/** Pembacaan realtime langsung dari tabel energy_read (setiap 10 detik dari Node 3); terbaru lebih dulu. */
export async function fetchEnergyRealtime(roomId: number, limit = 50): Promise<EnergyReadRow[]> {
  return unwrap(
    await supabase
      .from("energy_read")
      .select("reading_id,room_id,measured_at,voltage_v,current_a,frequency_hz,active_power_w,energy_kwh,power_factor")
      .eq("room_id", roomId)
      .order("measured_at", { ascending: false })
      .limit(limit),
  );
}

/** Grafik tren Dashboard: kWh per jam hari ini untuk jam CONFIG.chartHours.from..to. */
export async function fetchEnergyChart(roomId: number): Promise<{ hour: number; kwh: number | null }[]> {
  const rows = await fetchEnergy(roomId, "hour");
  const byHour = new Map(rows.map((r) => [Number(r.bucket_local.slice(11, 13)), r.energy_kwh]));
  const out: { hour: number; kwh: number | null }[] = [];
  for (let h = CONFIG.chartHours.from; h <= CONFIG.chartHours.to; h++) out.push({ hour: h, kwh: byHour.get(h) ?? null });
  return out;
}
