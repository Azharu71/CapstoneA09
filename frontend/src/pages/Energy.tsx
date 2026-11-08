import { FormEvent, useMemo, useState } from "react";
import { CustomTimeRange, EnergyPeriod, fetchEnergy } from "../data/energy";
import { fetchRoomLatest } from "../data/latest";
import { useNow } from "../hooks/useNow";
import { useQuery } from "../hooks/useQuery";
import { useRealtime } from "../hooks/useRealtime";
import { useRoom } from "../hooks/useRoom";
import { CONFIG } from "../lib/config";
import { addDays, agoText, customBucketRange, hourRange, monthLabel, todayLocal, weekRange } from "../lib/time";
import type { EnergyBucket } from "../types/database";

// >>> UBAH MANUAL: batas frekuensi yang dianggap "Stabil" (Hz). Prototipe menampilkan 49,9 sampai 50,1 sebagai stabil.
const FREQ_OK = { min: 49.5, max: 50.5 };

const periodLabel = (p: EnergyPeriod, r: EnergyBucket, i: number) =>
  p === "hour"
    ? hourRange(r.bucket_local)
    : p === "week"
    ? weekRange(r.bucket_local)
    : p === "month"
    ? monthLabel(r.bucket_local) + (i === 0 ? " (Berjalan)" : "")
    : customBucketRange(r.bucket_local);

export default function Energy() {
  const { room } = useRoom();
  const [period, setPeriod] = useState<EnergyPeriod>("hour");

  const today = todayLocal();
  const [startDate, setStartDate] = useState(() => addDays(today, -6));
  const [startTime, setStartTime] = useState("00:00");
  const [endDate, setEndDate] = useState(() => today);
  const [endTime, setEndTime] = useState("23:59");
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);

  const [appliedCustomRange, setAppliedCustomRange] = useState<CustomTimeRange>(() => ({
    start: `${addDays(today, -6)}T00:00:00`,
    end: `${today}T23:59:59`,
  }));

  const activeRange = useMemo(
    () => (period === "custom" ? appliedCustomRange : undefined),
    [period, appliedCustomRange]
  );

  const now = useNow(5000);
  const rows = useQuery(
    () => fetchEnergy(room.room_id, period, activeRange),
    [room.room_id, period, activeRange?.start, activeRange?.end]
  );
  const latest = useQuery(() => fetchRoomLatest(room.room_id), [room.room_id]);
  const reloadAll = () => { void rows.reload(); void latest.reload(); };
  useRealtime(["energy_read"], room.room_id, reloadAll);

  function handleApplyCustom(e?: FormEvent) {
    if (e) e.preventDefault();
    setCustomRangeError(null);

    if (!startDate || !endDate) {
      setCustomRangeError("Tanggal mulai dan tanggal selesai wajib diisi.");
      return;
    }

    const startIso = `${startDate}T${startTime ? startTime + ":00" : "00:00:00"}`;
    const endIso = `${endDate}T${endTime ? endTime + ":59" : "23:59:59"}`;

    if (startIso > endIso) {
      setCustomRangeError("Waktu mulai tidak boleh melebihi waktu selesai.");
      return;
    }

    setAppliedCustomRange({ start: startIso, end: endIso });
  }

  const data = rows.data ?? [];
  const first = data[0];
  const L = latest.data;
  const fresh = !!L?.power_at && (now - Date.parse(L.power_at)) / 1000 <= CONFIG.staleSeconds;

  // Kartu ringkasan menyesuaikan periode (teks label mengikuti prototipe).
  let totalLabel = "TOTAL ENERGI HARI INI", totalVal = "—", totalSub = "Akumulasi per jam hari ini";
  let powerLabel = "DAYA AKTIF TERAKHIR", powerVal = "—", powerSub = "belum ada data";
  if (period === "hour") {
    const sum = data.reduce((a, r) => a + Number(r.energy_kwh), 0);
    totalVal = data.length ? `${sum.toFixed(1)} kWh` : "—";
    powerVal = L?.active_power_w != null ? `${(L.active_power_w / 1000).toFixed(2)} kW` : "—";
    powerSub = first ? `pada jam ${hourRange(first.bucket_local)}` : "belum ada data";
  } else if (period === "custom") {
    totalLabel = "TOTAL ENERGI (KUSTOM)";
    const sum = data.reduce((a, r) => a + Number(r.energy_kwh), 0);
    totalVal = data.length ? `${sum.toFixed(1)} kWh` : "—";
    totalSub = data.length ? `Akumulasi rentang kustom (${data.length} data)` : "belum ada data";
    powerLabel = "RATA-RATA DAYA AKTIF";
    const avgPower = data.length ? data.reduce((a, r) => a + Number(r.active_power_w), 0) / data.length : null;
    powerVal = avgPower != null ? `${(avgPower / 1000).toFixed(2)} kW` : "—";
    powerSub = data.length ? "Rata-rata pada rentang waktu terpilih" : "belum ada data";
  } else {
    totalLabel = period === "week" ? "TOTAL ENERGI MINGGUAN" : "TOTAL ENERGI BULANAN";
    totalVal = first ? `${Number(first.energy_kwh).toFixed(1)} kWh` : "—";
    totalSub = period === "week" ? "Minggu berjalan" : "Bulan berjalan";
    powerLabel = "RATA-RATA DAYA AKTIF";
    powerVal = first ? `${(Number(first.active_power_w) / 1000).toFixed(2)} kW` : "—";
    powerSub = "Rata-rata pada periode berjalan";
  }
  const freq = first ? Number(first.frequency_hz) : null;
  const freqOk = freq != null && freq >= FREQ_OK.min && freq <= FREQ_OK.max;

  return (
    <section id="energy" className="tabscreen active">
      <div className="rowhead">
        <div>
          <h2>Konsumsi energi</h2>
          <div className="muted">Data energi diterima dari subsistem monitoring (Node 3) melalui bridge</div>
        </div>
        <div className="toolbar">
          <label className="muted" style={{ fontSize: 11, fontWeight: 600 }}>Opsi Riwayat:</label>
          <select
            id="energyPeriodSelect"
            aria-label="Filter Opsi Riwayat Pengukuran"
            value={period}
            onChange={(e) => {
              const next = e.target.value as EnergyPeriod;
              setPeriod(next);
              setCustomRangeError(null);
            }}
          >
            <option value="hour">Hari ini</option>
            <option value="week">Minggu ini</option>
            <option value="month">Bulan ini</option>
            <option value="custom">Rentang kustom</option>
          </select>
          <button className="btn" id="energyRefresh" onClick={reloadAll}>Muat ulang</button>
        </div>
      </div>

      {period === "custom" && (
        <form
          className="card"
          onSubmit={handleApplyCustom}
          style={{
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Dari:</span>
            <input
              type="date"
              aria-label="Tanggal mulai"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <input
              type="time"
              aria-label="Jam mulai"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Sampai:</span>
            <input
              type="date"
              aria-label="Tanggal selesai"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
            <input
              type="time"
              aria-label="Jam selesai"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
          <button type="submit" className="btn primary" id="energyApplyCustom">
            Terapkan
          </button>
        </form>
      )}

      {(rows.error || latest.error || customRangeError) && (
        <div className="notice">{customRangeError ?? rows.error ?? latest.error}</div>
      )}

      <div className="cards">
        <div className="card"><div className="cardlabel">{totalLabel}</div><div className="big">{totalVal}</div><div className="sub">{totalSub}</div></div>
        <div className="card"><div className="cardlabel">{powerLabel}</div><div className="big">{powerVal}</div><div className="sub">{powerSub}</div></div>
        <div className="card">
          <div className="cardlabel">FREKUENSI LISTRIK</div>
          <div className="big" style={{ color: freq == null || freqOk ? "var(--teal)" : "#c98420" }}>{freq != null ? `${freq.toFixed(1)} Hz` : "—"}</div>
          <div className="sub">{freq == null ? "belum ada data" : `Grid PLN • ${freqOk ? "Stabil" : "Di luar rentang"}`}</div>
        </div>
        <div className="card">
          <div className="cardlabel">KUALITAS DATA</div>
          <div className="big" style={{ fontSize: 22 }}>{!L?.power_at ? "Belum ada data" : fresh ? "Valid" : "Kedaluwarsa"}</div>
          <div className="sub">terakhir diterima {agoText(L?.power_at, now)}</div>
        </div>
      </div>

      <div className="card">
        <div className="sectiontitle">Riwayat pengukuran</div>
        <div className="tablewrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr><th id="thEnergyPeriod">Waktu / Periode</th><th>Tegangan</th><th>Arus</th><th>Frekuensi</th><th>Daya aktif</th><th>Energi</th></tr>
            </thead>
            <tbody id="energyTableBody">
              {data.map((r, i) => (
                <tr key={r.bucket_local}>
                  <td>{periodLabel(period, r, i)}</td>
                  <td>{Math.round(Number(r.voltage_v))} V</td>
                  <td>{Number(r.current_a).toFixed(1)} A</td>
                  <td><span className="strong" style={{ color: "var(--teal)" }}>{Number(r.frequency_hz).toFixed(1)} Hz</span></td>
                  <td>{(Number(r.active_power_w) / 1000).toFixed(2)} kW</td>
                  <td>{Number(r.energy_kwh).toFixed(2)} kWh</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.loading && data.length === 0 && (
          <div className="empty">
            {period === "custom"
              ? "Belum ada data energi pada rentang waktu ini."
              : "Belum ada data energi pada periode ini."}
          </div>
        )}
      </div>
    </section>
  );
}
