import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EnergyTrendChart from "../components/EnergyTrendChart";
import { sendDoorCommand, waitCommand } from "../data/commands";
import { DashboardEnergyPeriod, fetchDashboardTrend } from "../data/energy";
import { fetchHistory } from "../data/history";
import { fetchRoomLatest } from "../data/latest";
import { fetchSchedules } from "../data/schedules";
import { useAuth } from "../hooks/useAuth";
import { useNow } from "../hooks/useNow";
import { useQuery } from "../hooks/useQuery";
import { useRealtime } from "../hooks/useRealtime";
import { useRoom } from "../hooks/useRoom";
import { kelasHariIni } from "../lib/activeSchedule";
import { CONFIG } from "../lib/config";
import { daysLabel, hhmm, toMin } from "../lib/schedule";
import { agoText, fmtClock, fmtDateLong, isoDow, minutesNow, todayLocal } from "../lib/time";

const AMBER = "#c98420";
const GREY = "#6d7d91";

export default function Dashboard() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { rooms, room, setRoomId } = useRoom();
  const roomId = room.room_id;
  const now = useNow(5000);

  const [energyPeriod, setEnergyPeriod] = useState<DashboardEnergyPeriod>("day");

  const latest = useQuery(() => fetchRoomLatest(roomId), [roomId]);
  const chart = useQuery(() => fetchDashboardTrend(roomId, energyPeriod), [roomId, energyPeriod]);
  const sched = useQuery(() => fetchSchedules(roomId), [roomId]);
  const recent = useQuery(
    () => fetchHistory(roomId, room.room_code, false),
    [roomId],
  );

  // Hanya subscribe ke tabel yang benar-benar butuh respons instan (< 2 detik)
  useRealtime(["device_state", "node_status", "commands"], roomId, () => {
    void latest.reload();
  });

  // Untuk grafik/angka sensor (occupancy, suhu, daya), cukup fetch ulang tiap 20 detik
  useEffect(() => {
    const interval = setInterval(() => {
      void latest.reload();
      void chart.reload();
    }, 20000);
    return () => clearInterval(interval);
  }, [roomId, energyPeriod]);

  const [pending, setPending] = useState(false);
  const [cmdError, setCmdError] = useState<string | null>(null);

  const L = latest.data;
  const stale = (iso?: string | null) =>
    !iso || (now - Date.parse(iso)) / 1000 > CONFIG.staleSeconds;
  const kelas = kelasHariIni(sched.data ?? []);

  // ---- Status Jadwal AC ----
  const dow = isoDow(todayLocal());
  const curMin = minutesNow();
  const acOnMin = toMin(hhmm(room.ac_on_time || "07:00"));
  const acOffMin = toMin(hhmm(room.ac_off_time || "17:00"));
  const isAcDay = (room.ac_days ?? []).includes(dow);
  const isAcScheduledOn = isAcDay && curMin >= acOnMin && curMin < acOffMin;

  // ---- Okupansi ----
  const occStale = stale(L?.occupancy_at);
  const occText = L?.person_count == null ? "—" : `${L.person_count} orang`;
  const occStatus =
    L?.occupancy_at == null
      ? "Belum ada data"
      : occStale
        ? "Data kedaluwarsa"
        : L.occupied
          ? "Terisi"
          : "Kosong";
  const occColor =
    occStatus === "Terisi"
      ? "var(--teal)"
      : occStatus === "Data kedaluwarsa"
        ? AMBER
        : GREY;
  const occSub = L?.occupancy_at
    ? `deteksi terakhir ${fmtClock(L.occupancy_at)}`
    : "menunggu deteksi dari Node 1 CV";

  // ---- Suhu ----
  const t = L?.temperature_c ?? null;
  const envStale = stale(L?.env_at);
  const comfy =
    t != null && t >= CONFIG.comfortRange.min && t <= CONFIG.comfortRange.max;
  const tempText = t == null ? "—" : `${t.toFixed(1)} °C`;
  const tempStatus =
    t == null
      ? "Belum ada data"
      : envStale
        ? "Data kedaluwarsa"
        : comfy
          ? "Optimal"
          : t > CONFIG.comfortRange.max
            ? "Di atas zona nyaman"
            : "Di bawah zona nyaman";
  const tempColor =
    tempStatus === "Optimal"
      ? "var(--teal)"
      : tempStatus === "Belum ada data"
        ? GREY
        : AMBER;
  const setpointText = `${Number(room.ac_setpoint_c).toFixed(1)} °C`; // pengaturan AC ruang (sekali per ruang)

  // ---- Daya ----
  const powerText =
    L?.active_power_w == null
      ? "—"
      : `${(L.active_power_w / 1000).toFixed(2)} kW`;
  const powerStatus = stale(L?.power_at)
    ? L?.power_at
      ? "Data kedaluwarsa"
      : "Belum ada data"
    : "Pembacaan terakhir";

  // ---- Pintu ----
  const door = L?.door_state ?? null;
  const locked = door ? door.locked : null;
  const doorText =
    locked == null ? "Tidak diketahui" : locked ? "Terkunci" : "Terbuka";
  const doorColor = locked == null ? GREY : locked ? "#168873" : AMBER;
  const doorSub = door
    ? `${door.door_closed ? "Pintu tertutup" : "Pintu terbuka"}`
    : "status belum diterima";

  async function toggleDoor() {
    setCmdError(null);
    setPending(true);
    try {
      // locked === false berarti sedang terbuka -> kirim 'lock'; selain itu kirim 'unlock'.
      const id = await sendDoorCommand(
        room.room_id,
        locked === false ? "lock" : "unlock",
      );
      const res = await waitCommand(id);
      if (res.status === "failed")
        setCmdError(`Perintah gagal: ${res.error ?? "tidak diketahui"}`);
      await latest.reload();
    } catch (e) {
      setCmdError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  // ---- Aktivitas terbaru: satu catatan terbaru per jenis ----
  const feed = (["cv", "energy", "schedule"] as const)
    .map((ty) => (recent.data ?? []).find((r) => r.type === ty))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  const feedText: Record<string, string> = {
    cv: "Hasil deteksi baru disimpan",
    energy: "Data energi diterima backend",
    schedule: "Jadwal ruang diperbarui",
  };

  const err = latest.error ?? chart.error ?? sched.error ?? recent.error;

  return (
    <section id="dashboard" className="block">
      <div className="flex flex-wrap justify-between items-end gap-[14px] mb-4">
        <div>
          <h2 className="text-[19px] font-bold text-ink m-0 mb-[5px]">
            Ringkasan kondisi ruang
          </h2>
          <div className="text-xs text-blue">{fmtDateLong(new Date(now))}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            id="dashRoom"
            aria-label="Pilih Ruangan Kelas"
            value={room.room_id}
            onChange={(e) => setRoomId(Number(e.target.value))}
            className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink cursor-pointer"
          >
            {rooms.map((r) => (
              <option key={r.room_id} value={r.room_id}>
                {r.room_name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {err && (
        <div className="bg-[#fff5e5] text-[#815414] p-[12px_14px] rounded-[10px] text-xs my-3">
          Gagal memuat sebagian data: {err}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px] mb-4">
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-[10px] font-extrabold text-muted tracking-[0.5px] uppercase">
            OKUPANSI
          </div>
          <div className="text-2xl md:text-[29px] font-extrabold my-[12px] mb-[7px] text-ink">
            {occText}
          </div>
          <div className="font-bold text-xs" style={{ color: occColor }}>
            {occStatus}
          </div>
          <div className="text-[11px] text-muted mt-1">{occSub}</div>
        </div>
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-[10px] font-extrabold text-muted tracking-[0.5px] uppercase">
            SUHU RUANGAN
          </div>
          <div className="text-2xl md:text-[29px] font-extrabold my-[12px] mb-[7px] text-ink">
            {tempText}
          </div>
          <div className="font-bold text-xs" style={{ color: tempColor }}>
            {tempStatus}
          </div>
          <div className="text-[11px] text-muted mt-1">
            Setpoint {setpointText}
          </div>
        </div>
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-[10px] font-extrabold text-muted tracking-[0.5px] uppercase">
            DAYA AKTIF
          </div>
          <div className="text-2xl md:text-[29px] font-extrabold my-[12px] mb-[7px] text-ink">
            {powerText}
          </div>
          <div style={{ color: "#7962cc" }} className="font-bold text-xs">
            {powerStatus}
          </div>
          <div className="text-[11px] text-muted mt-1">
            {agoText(L?.power_at, now)}
          </div>
        </div>
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-[10px] font-extrabold text-muted tracking-[0.5px] uppercase">
            STATUS PINTU
          </div>
          <div
            className="text-2xl md:text-[29px] font-extrabold my-[12px] mb-[7px]"
            style={{ color: doorColor }}
          >
            {doorText}
          </div>
          <div className="text-[11px] text-muted mb-2">{doorSub}</div>
          <button
            className={`w-full mt-2.5 py-[9px] px-[11px] rounded-lg font-bold text-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all ${
              locked === false
                ? "bg-white border border-[#c98420] text-[#815414]"
                : "bg-blue border border-blue text-white"
            }`}
            type="button"
            disabled={pending}
            onClick={() => void toggleDoor()}
            style={{
              marginTop: 10,
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontWeight: 700,
              ...(locked === false
                ? { background: "#fff", borderColor: AMBER, color: "#815414" }
                : {
                    background: "var(--blue)",
                    borderColor: "var(--blue)",
                    color: "#fff",
                  }),
            }}
          >
            <span>
              {pending
                ? "Mengirim perintah…"
                : locked === false
                  ? "Kunci Pintu"
                  : "Buka Pintu"}
            </span>
          </button>
          {cmdError && (
            <div
              className="text-[11px] text-[#b54747] mt-2"
              style={{ marginTop: 8 }}
            >
              {cmdError}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.8fr)] gap-4">
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-[6px]">
            <div>
              <div className="text-base font-bold text-ink">
                Tren konsumsi energi
              </div>
              <div className="text-xs text-muted">
                {energyPeriod === "day"
                  ? "Pemakaian per jam hari ini • kWh"
                  : energyPeriod === "week"
                    ? "Pemakaian per minggu (3 bulan terakhir) • kWh"
                    : "Pemakaian per bulan (maksimal 1 tahun terakhir) • kWh"}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor="dashboardEnergyPeriod" className="text-[11px] font-semibold text-muted">
                Periode:
              </label>
              <select
                id="dashboardEnergyPeriod"
                aria-label="Filter Periode Tren Energi"
                value={energyPeriod}
                onChange={(e) => setEnergyPeriod(e.target.value as DashboardEnergyPeriod)}
                className="border border-[#ccd6e3] bg-white rounded-lg py-1 px-2.5 text-xs text-ink cursor-pointer focus:outline-none focus:border-blue font-medium"
              >
                <option value="day">Per Hari</option>
                <option value="week">Per Minggu</option>
                <option value="month">Per Bulan</option>
              </select>
            </div>
          </div>
          <EnergyTrendChart data={chart.data ?? []} period={energyPeriod} />
        </div>
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="flex justify-between items-center mb-[6px]">
            <div className="text-base font-bold text-ink">
              Status Jadwal AC
            </div>
            <span
              className="inline-block py-0.5 px-2.5 rounded-full font-bold text-[11px]"
              style={{
                backgroundColor: isAcScheduledOn ? "#e8f7f0" : "#f1f5f9",
                color: isAcScheduledOn ? "#168873" : "#64748b",
              }}
            >
              {isAcScheduledOn ? "Terjadwal ON" : "Terjadwal OFF"}
            </span>
          </div>
          <div className="text-xs text-muted mb-3">
            Otomatisasi AC berdasarkan jadwal aktif &amp; pembacaan sensor SHT31
          </div>
          <div className="flex justify-between gap-3 py-[11px] border-b border-[#eef2f7] text-xs">
            <span className="text-muted">Suhu Ruang Saat Ini</span>
            <span className="font-bold">{tempText}</span>
          </div>
          <div className="flex justify-between gap-3 py-[11px] border-b border-[#eef2f7] text-xs">
            <span className="text-muted">Target Suhu (Setpoint)</span>
            <span className="font-bold">{setpointText}</span>
          </div>
          <div className="flex justify-between gap-3 py-[11px] border-b border-[#eef2f7] text-xs">
            <span className="text-muted">Jam Operasional Terjadwal</span>
            <span className="font-bold">
              {hhmm(room.ac_on_time)} – {hhmm(room.ac_off_time)}
            </span>
          </div>
          <div className="flex justify-between gap-3 py-[11px] text-xs">
            <span className="text-muted">Hari Operasional</span>
            <span className="font-bold">{daysLabel(room.ac_days ?? [])}</span>
          </div>
        </div>
      </div>

      <div
        className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.8fr)] gap-4 mt-4"
        style={{ marginTop: 16 }}
      >
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-base font-bold text-ink mb-[6px]">
            Jadwal ruang
          </div>
          <div className="flex justify-between gap-3 py-[13px] border-b border-[#eef2f7] text-xs">
            <span>Mata kuliah saat ini</span>
            <span className="font-bold text-right">
              {kelas.sedang
                ? `${kelas.sedang.courses?.course_name ?? "-"} (${hhmm(kelas.sedang.start_time).replace(":", ".")} – ${hhmm(kelas.sedang.end_time).replace(":", ".")})`
                : "Tidak ada kelas"}
            </span>
          </div>
          <div className="flex justify-between gap-3 py-[13px] border-b border-[#eef2f7] text-xs">
            <span>Kelas berikutnya</span>
            <span className="font-bold">
              {kelas.berikut
                ? `${kelas.berikut.courses?.course_name ?? "-"} • ${hhmm(kelas.berikut.start_time).replace(":", ".")}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-3 py-[13px] border-b border-[#eef2f7] text-xs">
            <span>Jadwal AC ON/OFF</span>
            <span className="font-bold">
              {hhmm(room.ac_on_time).replace(":", ".")} /{" "}
              {hhmm(room.ac_off_time).replace(":", ".")}
            </span>
          </div>
          <div className="flex justify-between gap-3 py-[13px] text-xs">
            <span>Setpoint AC</span>
            <span className="font-bold">{Number(room.ac_setpoint_c)} °C</span>
          </div>
          <button
            className="mt-3 border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 transition-all"
            onClick={() => nav("/jadwal")}
          >
            Buka pengaturan jadwal
          </button>
        </div>
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-base font-bold text-ink mb-[6px]">
            Aktivitas terbaru
          </div>
          {feed.length === 0 && (
            <div className="flex justify-between gap-3 py-[13px] text-xs">
              <span className="text-muted">Belum ada aktivitas</span>
            </div>
          )}
          {feed.map((r) => (
            <div
              className="flex justify-between gap-3 py-[13px] border-b border-[#eef2f7] text-xs last:border-b-0"
              key={r.type}
            >
              <span className="text-muted">{fmtClock(r.time)}</span>
              <span>{feedText[r.type]}</span>
            </div>
          ))}
        </div>
      </div>
      {/* profile dipakai agar peran terlihat di React DevTools saat debugging */}
      <span hidden>{profile?.role}</span>
    </section>
  );
}
