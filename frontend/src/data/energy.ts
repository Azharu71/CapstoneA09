import { CONFIG } from "../lib/config";
import { supabase, unwrap } from "../lib/supabase";
import {
  MONTHS_SHORT,
  monthLabel,
  monthsAgo,
  parseLocal,
  todayLocal,
  weekRange,
} from "../lib/time";
import type { EnergyBucket, EnergyReadRow } from "../types/database";

export type EnergyPeriod = "hour" | "week" | "month";
export type DashboardEnergyPeriod = "day" | "week" | "month";

export interface EnergyTrendPoint {
  label: string;
  hour?: number;
  kwh: number | null;
  tooltipLabel?: string;
}

// >>> UBAH MANUAL: nama view agregasi (0003_views.sql) dan batas jumlah data per periode.
const SOURCE: Record<EnergyPeriod, { view: string; limit: number }> = {
  hour: { view: "energy_hourly", limit: 24 },
  week: { view: "energy_weekly", limit: 16 }, // ~3-4 bulan (maksimal 16 minggu)
  month: { view: "energy_monthly", limit: 12 }, // maksimal 12 bulan (1 tahun)
};

/**
 * Riwayat energi per jam (hari ini), minggu (hanya 3 bulan sebelumnya),
 * atau bulan (maksimal 1 tahun lalu / sejak tanggal implementasi); terbaru lebih dulu.
 */
export async function fetchEnergy(roomId: number, period: EnergyPeriod): Promise<EnergyBucket[]> {
  const { view, limit } = SOURCE[period];
  let q = supabase.from(view).select("*").eq("room_id", roomId);

  if (period === "hour") {
    q = q.gte("bucket_local", `${todayLocal()}T00:00:00`); // hanya hari ini
  } else if (period === "week") {
    const cutoffWeek = monthsAgo(CONFIG.energyHistory.weeklyMonthsBack);
    q = q.gte("bucket_local", `${cutoffWeek}T00:00:00`); // minggu dari 3 bulan sebelumnya
  } else if (period === "month") {
    let cutoffMonth = monthsAgo(CONFIG.energyHistory.monthlyMonthsBack);
    if (CONFIG.energyHistory.implementationStartDate) {
      if (CONFIG.energyHistory.implementationStartDate > cutoffMonth) {
        cutoffMonth = CONFIG.energyHistory.implementationStartDate;
      }
    }
    q = q.gte("bucket_local", `${cutoffMonth}T00:00:00`); // bulan dari 1 tahun sebelumnya atau sejak implementasi
  }

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

/** Grafik tren Dashboard: per hari (per jam hari ini), per minggu (3 bulan lalu), atau per bulan (1 tahun lalu). */
export async function fetchDashboardTrend(
  roomId: number,
  period: DashboardEnergyPeriod,
): Promise<EnergyTrendPoint[]> {
  if (period === "day") {
    const rows = await fetchEnergy(roomId, "hour");
    const byHour = new Map(rows.map((r) => [Number(r.bucket_local.slice(11, 13)), r.energy_kwh]));
    const out: EnergyTrendPoint[] = [];
    for (let h = CONFIG.chartHours.from; h <= CONFIG.chartHours.to; h++) {
      out.push({
        label: `${String(h).padStart(2, "0")}:00`,
        hour: h,
        kwh: byHour.get(h) ?? null,
        tooltipLabel: `Jam ${String(h).padStart(2, "0")}:00`,
      });
    }
    return out;
  }

  if (period === "week") {
    // Tampilkan data minggu hanya minggu dari 3 bulan sebelumnya
    const cutoffWeek = monthsAgo(CONFIG.energyHistory.weeklyMonthsBack);
    const res = await supabase
      .from("energy_weekly")
      .select("bucket_local,energy_kwh")
      .eq("room_id", roomId)
      .gte("bucket_local", `${cutoffWeek}T00:00:00`)
      .order("bucket_local", { ascending: false })
      .limit(16);
    const rows = (unwrap(res) as { bucket_local: string; energy_kwh: number }[]).reverse();
    if (rows.length === 0) return [];
    return rows.map((r) => {
      const fullLabel = weekRange(r.bucket_local);
      const match = fullLabel.match(/Minggu\s+(\d+)/);
      const shortLabel = match ? `M-${match[1]}` : r.bucket_local.slice(5, 10);
      return {
        label: shortLabel,
        kwh: Number(r.energy_kwh) || 0,
        tooltipLabel: fullLabel,
      };
    });
  }

  if (period === "month") {
    // Tampilkan data bulan maksimal dari 1 tahun lalu atau sejak tanggal implementasi
    let cutoffMonth = monthsAgo(CONFIG.energyHistory.monthlyMonthsBack);
    if (CONFIG.energyHistory.implementationStartDate) {
      if (CONFIG.energyHistory.implementationStartDate > cutoffMonth) {
        cutoffMonth = CONFIG.energyHistory.implementationStartDate;
      }
    }
    const res = await supabase
      .from("energy_monthly")
      .select("bucket_local,energy_kwh")
      .eq("room_id", roomId)
      .gte("bucket_local", `${cutoffMonth}T00:00:00`)
      .order("bucket_local", { ascending: false })
      .limit(12);
    const rows = (unwrap(res) as { bucket_local: string; energy_kwh: number }[]).reverse();
    if (rows.length === 0) return [];
    return rows.map((r) => {
      const { mo, y } = parseLocal(r.bucket_local);
      return {
        label: `${MONTHS_SHORT[mo - 1]} '${String(y).slice(2)}`,
        kwh: Number(r.energy_kwh) || 0,
        tooltipLabel: monthLabel(r.bucket_local),
      };
    });
  }

  return [];
}

/** Kompatibilitas fungsi lama: kWh per jam hari ini. */
export async function fetchEnergyChart(roomId: number): Promise<EnergyTrendPoint[]> {
  return fetchDashboardTrend(roomId, "day");
}
