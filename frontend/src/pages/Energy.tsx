import { useEffect, useState } from "react";
import { EnergyPeriod, fetchEnergy, fetchEnergyRealtime } from "../data/energy";
import { fetchRoomLatest } from "../data/latest";
import { useNow } from "../hooks/useNow";
import { useQuery } from "../hooks/useQuery";
import { useRealtime } from "../hooks/useRealtime";
import { useRoom } from "../hooks/useRoom";
import { CONFIG } from "../lib/config";
import { agoText, fmtClock, hourRange, monthLabel, weekRange } from "../lib/time";
import type { EnergyBucket } from "../types/database";

// >>> UBAH MANUAL: batas frekuensi dan tegangan yang dianggap "Stabil/Normal".
const FREQ_OK = { min: 49.5, max: 50.5 };
const VOLT_OK = { min: 198, max: 242 };

type ViewPeriod = "realtime" | EnergyPeriod;

const periodLabel = (p: EnergyPeriod, r: EnergyBucket, i: number) =>
  p === "hour" ? hourRange(r.bucket_local) : p === "week" ? weekRange(r.bucket_local) : monthLabel(r.bucket_local) + (i === 0 ? " (Berjalan)" : "");

export default function Energy() {
  const { room } = useRoom();
  const [period, setPeriod] = useState<ViewPeriod>("realtime");
  const now = useNow(10000);
  const bucketPeriod: EnergyPeriod = period === "realtime" ? "hour" : period;
  const rows = useQuery(() => fetchEnergy(room.room_id, bucketPeriod), [room.room_id, bucketPeriod]);
  const realtime = useQuery(() => fetchEnergyRealtime(room.room_id, 50), [room.room_id]);
  const latest = useQuery(() => fetchRoomLatest(room.room_id), [room.room_id]);
  const reloadAll = () => { void realtime.reload(); void rows.reload(); void latest.reload(); };
  useRealtime(["energy_read"], room.room_id, reloadAll);

  // Polling otomatis setiap 10 detik untuk monitoring realtime daya, tegangan, arus, dan frekuensi
  useEffect(() => {
    const id = window.setInterval(reloadAll, 10000);
    return () => window.clearInterval(id);
  }, [room.room_id, bucketPeriod]);

  const data = rows.data ?? [];
  const rtRows = realtime.data ?? [];
  const latestRead = rtRows[0];
  const first = data[0];
  const L = latest.data;
  const latestTime = latestRead?.measured_at ?? L?.power_at ?? null;
  const fresh = !latestTime ? false : (now - Date.parse(latestTime)) / 1000 <= CONFIG.staleSeconds;

  // Kartu ringkasan menyesuaikan periode, dengan pembacaan realtime setiap 10 detik untuk daya, tegangan, arus, dan frekuensi.
  let totalLabel = "TOTAL ENERGI HARI INI", totalVal = "—", totalSub = "Akumulasi energi hari ini";
  let powerLabel = "DAYA AKTIF REALTIME", powerVal = "—", powerSub = "belum ada data";
  if (period === "realtime" || period === "hour") {
    const sum = data.reduce((a, r) => a + Number(r.energy_kwh), 0);
    totalVal = data.length ? `${sum.toFixed(2)} kWh` : latestRead ? `${Number(latestRead.energy_kwh).toFixed(2)} kWh` : "—";
    const activeW = latestRead?.active_power_w ?? L?.active_power_w ?? null;
    powerVal = activeW != null ? `${(Number(activeW) / 1000).toFixed(2)} kW` : "—";
    powerSub = activeW != null
      ? `${Math.round(Number(activeW))} W • ${latestTime ? fmtClock(latestTime) : "Realtime 10 dtk"}`
      : "belum ada data";
  } else {
    totalLabel = period === "week" ? "TOTAL ENERGI MINGGUAN" : "TOTAL ENERGI BULANAN";
    totalVal = first ? `${Number(first.energy_kwh).toFixed(1)} kWh` : "—";
    totalSub = period === "week" ? "Minggu berjalan" : "Bulan berjalan";
    powerLabel = "RATA-RATA DAYA AKTIF";
    powerVal = first ? `${(Number(first.active_power_w) / 1000).toFixed(2)} kW` : "—";
    powerSub = "Rata-rata pada periode berjalan";
  }

  const voltage = latestRead ? Number(latestRead.voltage_v) : first ? Number(first.voltage_v) : null;
  const voltageOk = voltage != null && voltage >= VOLT_OK.min && voltage <= VOLT_OK.max;
  const current = latestRead ? Number(latestRead.current_a) : first ? Number(first.current_a) : null;
  const freq = latestRead ? Number(latestRead.frequency_hz) : first ? Number(first.frequency_hz) : null;
  const freqOk = freq != null && freq >= FREQ_OK.min && freq <= FREQ_OK.max;

  return (
    <section id="energy" className="block">
      <div className="flex flex-wrap justify-between items-end gap-[14px] mb-4">
        <div>
          <h2 className="text-[19px] font-bold text-ink m-0 mb-[5px]">Konsumsi energi</h2>
          <div className="text-xs text-muted">Monitoring realtime setiap 10 detik dari subsistem energi (Node 3) melalui bridge</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[11px] font-semibold text-muted">Opsi Riwayat:</label>
          <select id="energyPeriodSelect" aria-label="Filter Opsi Riwayat Pengukuran" value={period} onChange={(e) => setPeriod(e.target.value as ViewPeriod)} className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink cursor-pointer">
            <option value="realtime">Realtime (per 10 detik)</option>
            <option value="hour">Hari ini (per jam)</option>
            <option value="week">Minggu ini</option>
            <option value="month">Bulan ini</option>
          </select>
          <button className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 transition-all" id="energyRefresh" onClick={reloadAll}>Muat ulang</button>
        </div>
      </div>
      {(rows.error || realtime.error || latest.error) && (
        <div className="bg-[#fff5e5] text-[#815414] p-[12px_14px] rounded-[10px] text-xs my-3">Gagal memuat data: {rows.error ?? realtime.error ?? latest.error}</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-[14px] mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]"><div className="text-[10px] font-extrabold text-muted tracking-[0.5px] uppercase">{totalLabel}</div><div className="text-2xl md:text-[29px] font-extrabold my-[12px] mb-[7px] text-ink">{totalVal}</div><div className="text-[11px] text-muted">{totalSub}</div></div>
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]"><div className="text-[10px] font-extrabold text-muted tracking-[0.5px] uppercase">{powerLabel}</div><div className="text-2xl md:text-[29px] font-extrabold my-[12px] mb-[7px] text-ink">{powerVal}</div><div className="text-[11px] text-muted">{powerSub}</div></div>
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-[10px] font-extrabold text-muted tracking-[0.5px] uppercase">TEGANGAN LISTRIK</div>
          <div className="text-2xl md:text-[29px] font-extrabold my-[12px] mb-[7px]" style={{ color: voltage == null || voltageOk ? "var(--ink)" : "#c98420" }}>
            {voltage != null ? `${voltage.toFixed(1)} V` : "—"}
          </div>
          <div className="text-[11px] text-muted">{voltage == null ? "belum ada data" : `Tiap 10 dtk • ${voltageOk ? "Normal" : "Di luar rentang"}`}</div>
        </div>
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-[10px] font-extrabold text-muted tracking-[0.5px] uppercase">PENGGUNAAN ARUS</div>
          <div className="text-2xl md:text-[29px] font-extrabold my-[12px] mb-[7px] text-blue">
            {current != null ? `${current.toFixed(2)} A` : "—"}
          </div>
          <div className="text-[11px] text-muted">{current == null ? "belum ada data" : `Tiap 10 dtk • ${agoText(latestTime, now)}`}</div>
        </div>
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-[10px] font-extrabold text-muted tracking-[0.5px] uppercase">FREKUENSI LISTRIK</div>
          <div className="text-2xl md:text-[29px] font-extrabold my-[12px] mb-[7px]" style={{ color: freq == null || freqOk ? "var(--teal)" : "#c98420" }}>{freq != null ? `${freq.toFixed(1)} Hz` : "—"}</div>
          <div className="text-[11px] text-muted">{freq == null ? "belum ada data" : `Tiap 10 dtk • ${freqOk ? "Stabil" : "Di luar rentang"}`}</div>
        </div>
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-[10px] font-extrabold text-muted tracking-[0.5px] uppercase">KUALITAS DATA</div>
          <div className="text-[22px] font-extrabold my-[12px] mb-[7px] text-ink">{!latestTime ? "Belum ada data" : fresh ? "Valid" : "Kedaluwarsa"}</div>
          <div className="text-[11px] text-muted">terakhir diterima {agoText(latestTime, now)}</div>
        </div>
      </div>

      <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
        <div className="text-base font-bold text-ink mb-[6px]">
          {period === "realtime" ? "Tabel pengukuran realtime (per 10 detik)" : "Riwayat pengukuran"}
        </div>
        <div className="overflow-x-auto rounded-xl border border-line bg-white mt-3">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[#f7f9fc]">
                <th id="thEnergyPeriod" className="py-3 px-[13px] border-b border-[#edf1f6] text-left whitespace-nowrap text-[10px] text-muted uppercase tracking-[0.4px]">Waktu / Periode</th>
                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left whitespace-nowrap text-[10px] text-muted uppercase tracking-[0.4px]">Tegangan</th>
                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left whitespace-nowrap text-[10px] text-muted uppercase tracking-[0.4px]">Arus</th>
                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left whitespace-nowrap text-[10px] text-muted uppercase tracking-[0.4px]">Frekuensi</th>
                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left whitespace-nowrap text-[10px] text-muted uppercase tracking-[0.4px]">Daya aktif</th>
                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left whitespace-nowrap text-[10px] text-muted uppercase tracking-[0.4px]">Energi</th>
              </tr>
            </thead>
            <tbody id="energyTableBody">
              {period === "realtime"
                ? rtRows.slice(0, 50).map((r, i) => (
                    <tr key={r.reading_id ?? `${r.measured_at}-${i}`} className="hover:bg-[#f8fafd] transition-colors border-b border-[#edf1f6] last:border-b-0">
                      <td className="py-3 px-[13px] whitespace-nowrap">{fmtClock(r.measured_at)}</td>
                      <td className="py-3 px-[13px] whitespace-nowrap">{Number(r.voltage_v).toFixed(1)} V</td>
                      <td className="py-3 px-[13px] whitespace-nowrap">{Number(r.current_a).toFixed(2)} A</td>
                      <td className="py-3 px-[13px] whitespace-nowrap"><span className="font-bold text-teal">{Number(r.frequency_hz).toFixed(1)} Hz</span></td>
                      <td className="py-3 px-[13px] whitespace-nowrap">{(Number(r.active_power_w) / 1000).toFixed(2)} kW ({Math.round(Number(r.active_power_w))} W)</td>
                      <td className="py-3 px-[13px] whitespace-nowrap">{Number(r.energy_kwh).toFixed(3)} kWh</td>
                    </tr>
                  ))
                : data.slice(0, 50).map((r, i) => (
                    <tr key={r.bucket_local} className="hover:bg-[#f8fafd] transition-colors border-b border-[#edf1f6] last:border-b-0">
                      <td className="py-3 px-[13px] whitespace-nowrap">{periodLabel(bucketPeriod, r, i)}</td>
                      <td className="py-3 px-[13px] whitespace-nowrap">{Math.round(Number(r.voltage_v))} V</td>
                      <td className="py-3 px-[13px] whitespace-nowrap">{Number(r.current_a).toFixed(1)} A</td>
                      <td className="py-3 px-[13px] whitespace-nowrap"><span className="font-bold text-teal">{Number(r.frequency_hz).toFixed(1)} Hz</span></td>
                      <td className="py-3 px-[13px] whitespace-nowrap">{(Number(r.active_power_w) / 1000).toFixed(2)} kW</td>
                      <td className="py-3 px-[13px] whitespace-nowrap">{Number(r.energy_kwh).toFixed(2)} kWh</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {period === "realtime" && !realtime.loading && rtRows.length === 0 && (
          <div className="p-[35px] text-center text-muted text-[13px]">Belum ada data energi realtime.</div>
        )}
        {period !== "realtime" && !rows.loading && data.length === 0 && (
          <div className="p-[35px] text-center text-muted text-[13px]">Belum ada data energi pada periode ini.</div>
        )}
      </div>
    </section>
  );
}
