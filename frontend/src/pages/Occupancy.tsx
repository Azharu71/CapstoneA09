import { useEffect } from "react";
import { fetchActiveModelName, fetchLatestOccupancy, fetchOccupancyHistory } from "../data/occupancy";
import { useNow } from "../hooks/useNow";
import { useQuery } from "../hooks/useQuery";
import { useRealtime } from "../hooks/useRealtime";
import { useRoom } from "../hooks/useRoom";
import { CONFIG } from "../lib/config";
import { fmtDateTime } from "../lib/time";

const MAX_ROWS = 30;

export default function Occupancy() {
  const { rooms, room, setRoomId } = useRoom();
  const now = useNow(5000);

  const latest = useQuery(() => fetchLatestOccupancy(room.room_id), [room.room_id]);
  const history = useQuery(() => fetchOccupancyHistory(room.room_id, MAX_ROWS), [room.room_id]);
  const model = useQuery(fetchActiveModelName, []);

  const reloadAll = () => {
    void latest.reload();
    void history.reload();
  };

  useRealtime(["occupancy"], room.room_id, reloadAll);

  // Polling otomatis setiap 30 detik untuk riwayat deteksi okupansi
  useEffect(() => {
    const id = window.setInterval(reloadAll, 30000);
    return () => window.clearInterval(id);
  }, [room.room_id]);

  const L = latest.data;
  const stale = !L || (now - Date.parse(L.detected_at)) / 1000 > CONFIG.staleSeconds;
  const err = latest.error ?? history.error;
  const rows = history.data ?? [];

  return (
    <section id="occupancy" className="block">
      <div className="flex flex-wrap justify-between items-end gap-[14px] mb-4">
        <div>
          <h2 className="text-[19px] font-bold text-ink m-0 mb-[5px]">Analisis okupansi</h2>
          <div className="text-xs text-muted">Monitoring realtime setiap 30 detik dari subsistem Computer Vision (Node 1)</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            id="occRoom"
            value={room.room_id}
            onChange={(e) => setRoomId(Number(e.target.value))}
            className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink cursor-pointer"
          >
            {rooms.map((r) => <option key={r.room_id} value={r.room_id}>{r.room_name}</option>)}
          </select>
          <button
            className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 transition-all"
            id="occRefresh"
            onClick={reloadAll}
          >
            Muat ulang
          </button>
        </div>
      </div>
      {err && <div className="bg-[#fff5e5] text-[#815414] p-[12px_14px] rounded-[10px] text-xs my-3">Gagal memuat data: {err}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px] mb-4">
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-[10px] font-extrabold text-muted tracking-[0.5px] uppercase">JUMLAH TERBARU</div>
          <div className="text-2xl md:text-[29px] font-extrabold my-[12px] mb-[7px] text-ink">{L ? `${L.person_count} orang` : "—"}</div>
        </div>
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-[10px] font-extrabold text-muted tracking-[0.5px] uppercase">STATUS RUANG</div>
          <div className="text-2xl md:text-[29px] font-extrabold my-[12px] mb-[7px] text-ink">{!L ? "—" : stale ? "Kedaluwarsa" : L.occupied ? "Terisi" : "Kosong"}</div>
        </div>
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-[10px] font-extrabold text-muted tracking-[0.5px] uppercase">FPS</div>
          <div className="text-2xl md:text-[29px] font-extrabold my-[12px] mb-[7px] text-ink">{L?.inference_fps != null ? L.inference_fps.toFixed(1) : "—"}</div>
        </div>
        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-[10px] font-extrabold text-muted tracking-[0.5px] uppercase">LATENSI FRAME</div>
          <div className="text-2xl md:text-[29px] font-extrabold my-[12px] mb-[7px] text-ink">{L?.processing_ms != null ? `${Math.round(L.processing_ms)} ms` : "—"}</div>
        </div>
      </div>

      <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
        <div className="text-base font-bold text-ink mb-[6px]">Riwayat deteksi terbaru</div>
        <div className="text-xs text-muted mb-3">
          {MAX_ROWS} data deteksi terbaru • diperbarui otomatis setiap 30 detik
        </div>
        <div className="overflow-x-auto rounded-xl border border-line bg-white mt-3">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[#f7f9fc]">
                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left whitespace-nowrap text-[10px] text-muted uppercase tracking-[0.4px]">Waktu</th>
                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left whitespace-nowrap text-[10px] text-muted uppercase tracking-[0.4px]">Ruang</th>
                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left whitespace-nowrap text-[10px] text-muted uppercase tracking-[0.4px]">Jumlah orang</th>
                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left whitespace-nowrap text-[10px] text-muted uppercase tracking-[0.4px]">Okupansi</th>
                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left whitespace-nowrap text-[10px] text-muted uppercase tracking-[0.4px]">FPS</th>
                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left whitespace-nowrap text-[10px] text-muted uppercase tracking-[0.4px]">Latensi</th>
                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left whitespace-nowrap text-[10px] text-muted uppercase tracking-[0.4px]">Model</th>
              </tr>
            </thead>
            <tbody id="occupancyTable">
              {rows.map((r) => (
                <tr key={r.detected_at} className="hover:bg-[#f8fafd] transition-colors border-b border-[#edf1f6] last:border-b-0">
                  <td className="py-3 px-[13px] whitespace-nowrap">{fmtDateTime(r.detected_at)}</td>
                  <td className="py-3 px-[13px] whitespace-nowrap">{room.room_code}</td>
                  <td className="py-3 px-[13px] whitespace-nowrap">{r.person_count}</td>
                  <td className="py-3 px-[13px] whitespace-nowrap">
                    <span
                      className="inline-block py-0.5 px-2 rounded-md font-bold text-[11px]"
                      style={r.occupied
                        ? { background: "#e8f7f0", color: "#168873" }
                        : { background: "#f1f5f9", color: "#64748b" }}
                    >
                      {r.occupied ? "Terisi" : "Kosong"}
                    </span>
                  </td>
                  <td className="py-3 px-[13px] whitespace-nowrap">{r.inference_fps != null ? r.inference_fps.toFixed(1) : "—"}</td>
                  <td className="py-3 px-[13px] whitespace-nowrap">{r.processing_ms != null ? `${Math.round(r.processing_ms)} ms` : "—"}</td>
                  <td className="py-3 px-[13px] whitespace-nowrap">{model.data ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!history.loading && rows.length === 0 && (
          <div className="p-[35px] text-center text-muted text-[13px]">Belum ada data deteksi untuk ruang ini.</div>
        )}
      </div>
    </section>
  );
}
