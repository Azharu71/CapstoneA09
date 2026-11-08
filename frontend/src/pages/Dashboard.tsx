import { useState } from "react";
import { useNavigate } from "react-router-dom";
import EnergyTrendChart from "../components/EnergyTrendChart";
import { sendDoorCommand, waitCommand } from "../data/commands";
import { fetchEnergyChart } from "../data/energy";
import { fetchHistory } from "../data/history";
import { fetchRoomLatest } from "../data/latest";
import { fetchSchedules } from "../data/schedules";
import { useAuth } from "../hooks/useAuth";
import { useNow } from "../hooks/useNow";
import { useQuery } from "../hooks/useQuery";
import { useRealtime } from "../hooks/useRealtime";
import { useRoom } from "../hooks/useRoom";
import { pickActiveSchedule } from "../lib/activeSchedule";
import { CONFIG } from "../lib/config";
import { hhmm } from "../lib/schedule";
import { agoText, fmtClock, fmtDateLong } from "../lib/time";

const AMBER = "#c98420";
const GREY = "#6d7d91";

export default function Dashboard() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { rooms, room, setRoomId } = useRoom();
  const now = useNow(5000);

  const latest = useQuery(() => fetchRoomLatest(room.room_id), [room.room_id]);
  const chart = useQuery(() => fetchEnergyChart(room.room_id), [room.room_id]);
  const sched = useQuery(() => fetchSchedules(room.room_id), [room.room_id]);
  const recent = useQuery(() => fetchHistory(room.room_id, room.room_code, false), [room.room_id]);
  useRealtime(["occupancy", "energy_read", "env_read", "device_state"], room.room_id, () => {
    void latest.reload(); void chart.reload(); void recent.reload();
  });

  const [pending, setPending] = useState(false);
  const [cmdError, setCmdError] = useState<string | null>(null);

  const L = latest.data;
  const stale = (iso?: string | null) => !iso || (now - Date.parse(iso)) / 1000 > CONFIG.staleSeconds;
  const active = pickActiveSchedule(sched.data ?? []);

  // ---- Okupansi ----
  const occStale = stale(L?.occupancy_at);
  const occText = L?.person_count == null ? "—" : `${L.person_count} orang`;
  const occStatus = L?.occupancy_at == null ? "Belum ada data" : occStale ? "Data kedaluwarsa" : L.occupied ? "Terisi" : "Kosong";
  const occColor = occStatus === "Terisi" ? "var(--teal)" : occStatus === "Data kedaluwarsa" ? AMBER : GREY;
  const occSub = L?.occupancy_at ? `deteksi terakhir ${fmtClock(L.occupancy_at)}` : "menunggu deteksi dari Node 1 CV";

  // ---- Suhu ----
  const t = L?.temperature_c ?? null;
  const envStale = stale(L?.env_at);
  const comfy = t != null && t >= CONFIG.comfortRange.min && t <= CONFIG.comfortRange.max;
  const tempText = t == null ? "—" : `${t.toFixed(1)} °C`;
  const tempStatus = t == null ? "Belum ada data" : envStale ? "Data kedaluwarsa" : comfy ? "Optimal" : t > CONFIG.comfortRange.max ? "Di atas zona nyaman" : "Di bawah zona nyaman";
  const tempColor = tempStatus === "Optimal" ? "var(--teal)" : tempStatus === "Belum ada data" ? GREY : AMBER;
  const setpointText = active ? `${Number(active.setpoint_c).toFixed(1)} °C` : "—";

  // ---- Daya ----
  const powerText = L?.active_power_w == null ? "—" : `${(L.active_power_w / 1000).toFixed(2)} kW`;
  const powerStatus = stale(L?.power_at) ? (L?.power_at ? "Data kedaluwarsa" : "Belum ada data") : "Pembacaan terakhir";

  // ---- Pintu ----
  const door = L?.door_state ?? null;
  const locked = door ? door.locked : null;
  const doorText = locked == null ? "Tidak diketahui" : locked ? "Terkunci" : "Terbuka";
  const doorColor = locked == null ? GREY : locked ? "#168873" : AMBER;
  const doorSub = door ? `Smart Door Lock • ${door.door_closed ? "Pintu tertutup" : "Pintu terbuka"}` : "Smart Door Lock • status belum diterima";

  async function toggleDoor() {
    setCmdError(null);
    setPending(true);
    try {
      // locked === false berarti sedang terbuka -> kirim 'lock'; selain itu kirim 'unlock'.
      const id = await sendDoorCommand(room.room_id, locked === false ? "lock" : "unlock");
      const res = await waitCommand(id);
      if (res.status === "failed") setCmdError(`Perintah gagal: ${res.error ?? "tidak diketahui"}`);
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
  const feedText: Record<string, string> = { cv: "Hasil deteksi baru disimpan", energy: "Data energi diterima backend", schedule: "Jadwal ruang diperbarui" };

  const err = latest.error ?? chart.error ?? sched.error ?? recent.error;

  return (
    <section id="dashboard" className="tabscreen active">
      <div className="rowhead">
        <div>
          <h2>Ringkasan kondisi ruang</h2>
          <div className="muted">Ruang: <span id="dashRoomLabel">{room.room_name}</span> • {fmtDateLong(new Date(now))}</div>
        </div>
        <div className="toolbar">
          <select id="dashRoom" aria-label="Pilih Ruangan Kelas" value={room.room_id} onChange={(e) => setRoomId(Number(e.target.value))}>
            {rooms.map((r) => <option key={r.room_id} value={r.room_id}>{r.room_name}</option>)}
          </select>
        </div>
      </div>
      {err && <div className="notice">Gagal memuat sebagian data: {err}</div>}

      <div className="cards">
        <div className="card">
          <div className="cardlabel">OKUPANSI</div>
          <div className="big">{occText}</div>
          <div className="strong" style={{ color: occColor }}>{occStatus}</div>
          <div className="sub">{occSub}</div>
        </div>
        <div className="card">
          <div className="cardlabel">SUHU RUANGAN</div>
          <div className="big">{tempText}</div>
          <div className="strong" style={{ color: tempColor }}>{tempStatus}</div>
          <div className="sub">Setpoint {setpointText}</div>
        </div>
        <div className="card">
          <div className="cardlabel">DAYA AKTIF</div>
          <div className="big">{powerText}</div>
          <div style={{ color: "#7962cc" }} className="strong">{powerStatus}</div>
          <div className="sub">Subsistem energi • {agoText(L?.power_at, now)}</div>
        </div>
        <div className="card">
          <div className="cardlabel">STATUS PINTU</div>
          <div className="big" style={{ color: doorColor }}>{doorText}</div>
          <div className="sub">{doorSub}</div>
          <button
            className={"btn" + (locked === false ? "" : " primary")}
            type="button" disabled={pending} onClick={() => void toggleDoor()}
            style={{
              marginTop: 10, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 700,
              ...(locked === false ? { background: "#fff", borderColor: AMBER, color: "#815414" } : { background: "var(--blue)", borderColor: "var(--blue)", color: "#fff" }),
            }}
          >
            <span>{pending ? "Mengirim perintah…" : locked === false ? "Kunci Pintu" : "Buka Pintu"}</span>
          </button>
          {cmdError && <div className="sub err" style={{ marginTop: 8 }}>{cmdError}</div>}
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="sectiontitle">Tren konsumsi energi</div>
          <div className="muted">Pemakaian per jam hari ini • kWh</div>
          <EnergyTrendChart data={chart.data ?? []} />
        </div>
        <div className="card">
          <div className="sectiontitle">Status Suhu & Akses Pintu</div>
          <div className="rowline"><span className="muted">Suhu Ruang Saat Ini</span><span className="strong">{tempText}</span></div>
          <div className="rowline"><span className="muted">Setpoint Suhu</span><span className="strong">{setpointText}</span></div>
          <div className="rowline"><span className="muted">Smart Door Lock</span><span className="strong" style={{ color: doorColor }}>{doorText}</span></div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="sectiontitle">Jadwal ruang</div>
          <div className="rowline"><span>Aktivitas kelas</span><span className="strong">{active ? `${hhmm(active.start_time).replace(":", ".")} – ${hhmm(active.end_time).replace(":", ".")}` : "Belum ada jadwal"}</span></div>
          <div className="rowline"><span>Jadwal ON/OFF terkonfigurasi</span><span className="strong">{active ? `${hhmm(active.ac_on_time).replace(":", ".")} / ${hhmm(active.ac_off_time).replace(":", ".")}` : "—"}</span></div>
          <div className="rowline"><span>Setpoint terjadwal</span><span className="strong">{active ? `${Number(active.setpoint_c)} °C` : "—"}</span></div>
          <button className="btn" onClick={() => nav("/jadwal")}>Buka pengaturan jadwal</button>
        </div>
        <div className="card">
          <div className="sectiontitle">Aktivitas terbaru</div>
          {feed.length === 0 && <div className="rowline"><span className="muted">Belum ada aktivitas</span></div>}
          {feed.map((r) => (
            <div className="rowline" key={r.type}><span className="muted">{fmtClock(r.time)}</span><span>{feedText[r.type]}</span></div>
          ))}
        </div>
      </div>
      {/* profile dipakai agar peran terlihat di React DevTools saat debugging */}
      <span hidden>{profile?.role}</span>
    </section>
  );
}
