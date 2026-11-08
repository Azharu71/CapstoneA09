import { useState } from "react";
import { fetchHistory } from "../data/history";
import { useAuth } from "../hooks/useAuth";
import { useQuery } from "../hooks/useQuery";
import { useRoom } from "../hooks/useRoom";
import { fmtClock } from "../lib/time";

export default function History() {
  const { room } = useRoom();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const q = useQuery(() => fetchHistory(room.room_id, room.room_code, isAdmin), [room.room_id, isAdmin]);

  const [type, setType] = useState("all");     // nilai pada pilihan
  const [applied, setApplied] = useState("all"); // nilai yang sudah diterapkan (tombol "Terapkan filter", seperti prototipe)
  const rows = (q.data ?? []).filter((r) => applied === "all" || r.type === applied);

  return (
    <section id="history" className="tabscreen active">
      <div className="rowhead">
        <div>
          <h2>Riwayat & laporan</h2>
          <div className="muted">Catatan terbaru dari database untuk {room.room_name}</div>
        </div>
        <div className="toolbar">
          <select id="historyType" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">Semua jenis</option>
            <option value="cv">Computer Vision</option>
            <option value="energy">Energi</option>
            <option value="schedule">Jadwal</option>
            {isAdmin && <option value="audit">Audit (Administrator)</option>}
          </select>
          <button className="btn" id="filterHistory" onClick={() => setApplied(type)}>Terapkan filter</button>
        </div>
      </div>
      {q.error && <div className="notice">Gagal memuat riwayat: {q.error}</div>}
      <div className="card">
        <div className="tablewrap">
          <table id="historyTable">
            <thead><tr><th>Waktu</th><th>Jenis</th><th>Aktivitas</th><th>Detail</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.type}-${r.time}-${i}`}>
                  <td>{fmtClock(r.time)}</td><td>{r.typeLabel}</td><td>{r.activity}</td><td>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!q.loading && rows.length === 0 && <div id="historyEmpty" className="empty">Tidak ada data untuk filter tersebut.</div>}
      </div>
    </section>
  );
}
