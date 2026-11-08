import { useState } from "react";
import { fetchActiveModelName, fetchLatestOccupancy, fetchOccupancyHourly, PERIOD_DAYS } from "../data/occupancy";
import { useNow } from "../hooks/useNow";
import { useQuery } from "../hooks/useQuery";
import { useRealtime } from "../hooks/useRealtime";
import { useRoom } from "../hooks/useRoom";
import { CONFIG } from "../lib/config";
import { MONTHS_SHORT, parseLocal } from "../lib/time";

export default function Occupancy() {
  const { rooms, room, setRoomId } = useRoom();
  const [period, setPeriod] = useState("Hari ini");
  const now = useNow(5000);
  const days = PERIOD_DAYS[period];

  const latest = useQuery(() => fetchLatestOccupancy(room.room_id), [room.room_id]);
  const hourly = useQuery(() => fetchOccupancyHourly(room.room_id, days), [room.room_id, days]);
  const model = useQuery(fetchActiveModelName, []);
  useRealtime(["occupancy"], room.room_id, () => { void latest.reload(); void hourly.reload(); });

  const L = latest.data;
  const stale = !L || (now - Date.parse(L.detected_at)) / 1000 > CONFIG.staleSeconds;
  const err = latest.error ?? hourly.error;
  const rows = hourly.data ?? [];
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <section id="occupancy" className="tabscreen active">
      <div className="rowhead">
        <div>
          <h2>Analisis okupansi</h2>
          <div className="muted">Hasil deteksi Computer Vision berdasarkan waktu</div>
        </div>
        <div className="toolbar">
          <select id="occRoom" value={room.room_id} onChange={(e) => setRoomId(Number(e.target.value))}>
            {rooms.map((r) => <option key={r.room_id} value={r.room_id}>{r.room_name}</option>)}
          </select>
          <select id="occPeriod" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {Object.keys(PERIOD_DAYS).map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      {err && <div className="notice">Gagal memuat data: {err}</div>}

      <div className="cards">
        <div className="card"><div className="cardlabel">JUMLAH TERBARU</div><div className="big">{L ? `${L.person_count} orang` : "—"}</div></div>
        <div className="card"><div className="cardlabel">STATUS RUANG</div><div className="big">{!L ? "—" : stale ? "Kedaluwarsa" : L.occupied ? "Terisi" : "Kosong"}</div></div>
        <div className="card"><div className="cardlabel">FPS</div><div className="big">{L?.inference_fps != null ? L.inference_fps.toFixed(1) : "—"}</div></div>
        <div className="card"><div className="cardlabel">LATENSI FRAME</div><div className="big">{L?.processing_ms != null ? `${Math.round(L.processing_ms)} ms` : "—"}</div></div>
      </div>

      <div className="card">
        <div className="sectiontitle">Riwayat deteksi terbaru</div>
        <div className="tablewrap" style={{ marginTop: 13 }}>
          <table>
            <thead>
              <tr><th>Waktu</th><th>Ruang</th><th>Jumlah orang</th><th>Okupansi</th><th>FPS</th><th>Model</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = parseLocal(r.bucket_local);
                // Hari ini: tampil jam saja; 7/30 hari: tampil tanggal + jam.
                const waktu = days === 1 ? `${pad(p.h)}:${pad(p.mi)}:00` : `${pad(p.d)} ${MONTHS_SHORT[p.mo - 1]} ${pad(p.h)}:${pad(p.mi)}`;
                return (
                  <tr key={r.bucket_local}>
                    <td>{waktu}</td>
                    <td>{room.room_code}</td>
                    <td>{Math.round(r.avg_count)}</td>
                    <td>{r.occupied ? "Terisi" : "Kosong"}</td>
                    <td>{r.avg_fps != null ? r.avg_fps.toFixed(1) : "—"}</td>
                    <td>{model.data ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!hourly.loading && rows.length === 0 && <div className="empty">Belum ada data deteksi pada periode ini.</div>}
      </div>
    </section>
  );
}
