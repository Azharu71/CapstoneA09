import { useEffect, useState } from "react";
import {
  downloadCsv,
  EXPORT_LIMIT,
  fetchHistoryAll,
  fetchHistoryPage,
  fetchHistorySummary,
  HistoryQuery,
  HistoryTab,
  PAGE_SIZE,
  RESOLUTIONS,
  Resolution,
  validateRange,
} from "../data/historyTable";
import { useAuth } from "../hooks/useAuth";
import { useQuery } from "../hooks/useQuery";
import { useRealtime } from "../hooks/useRealtime";
import { useRoom } from "../hooks/useRoom";
import { addDays, todayLocal } from "../lib/time";

const TABS: { value: HistoryTab; label: string; adminOnly?: boolean }[] = [
  { value: "occupancy", label: "Okupansi" },
  { value: "energy", label: "Energi" },
  { value: "schedule", label: "Jadwal" },
  { value: "audit", label: "Audit", adminOnly: true },
];
const RES_LABEL: Record<Resolution, string> = {
  hour: "Per jam",
  day: "Per hari",
  raw: "Data mentah",
};
const REALTIME_TABLES: Record<HistoryTab, string[]> = {
  occupancy: ["occupancy"],
  energy: ["energy_read"],
  schedule: ["schedules"],
  audit: [],
};

export default function History() {
  const { room } = useRoom();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const today = todayLocal();

  const [tab, setTab] = useState<HistoryTab>("occupancy");
  const [resolution, setResolution] = useState<Resolution>("hour");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);
  const [newData, setNewData] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const rangeError = validateRange(from, to);
  const resOptions = RESOLUTIONS[tab];
  const query: HistoryQuery = {
    roomId: room.room_id,
    roomCode: room.room_code,
    tab,
    resolution,
    from,
    to,
  };

  const table = useQuery(
    async () =>
      rangeError
        ? { head: [], rows: [], total: 0 }
        : fetchHistoryPage(query, isAdmin, page),
    [room.room_id, isAdmin, tab, resolution, from, to, page],
  );
  const summary = useQuery(
    async () =>
      rangeError ? null : fetchHistorySummary(room.room_id, from, to),
    [room.room_id, from, to],
  );

  // Ganti ruang/tab/rentang: kembali ke halaman 1 dan hapus penanda data baru.
  useEffect(() => {
    setPage(1);
    setNewData(false);
  }, [room.room_id, tab, resolution, from, to]);

  // Realtime hanya menandai ada data baru (tanpa memuat ulang) agar baris tidak bergeser saat dibaca.
  const tables = REALTIME_TABLES[tab];
  useRealtime(tables, tables.length ? room.room_id : undefined, () => {
    if (to >= today) setNewData(true);
  });

  const setPreset = (days: number) => {
    setFrom(addDays(today, -(days - 1)));
    setTo(today);
  };
  const changeTab = (t: HistoryTab) => {
    setTab(t);
    const opts = RESOLUTIONS[t];
    if (opts.length && !opts.includes(resolution)) setResolution(opts[0]);
  };
  const reload = () => {
    setNewData(false);
    void table.reload();
    void summary.reload();
  };

  const total = table.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const rows = table.data?.rows ?? [];
  const head = table.data?.head ?? [];
  const S = summary.data;

  async function exportCsv() {
    setExporting(true);
    setExportMsg(null);
    try {
      const all = await fetchHistoryAll(query, isAdmin);
      downloadCsv(
        `riwayat-${tab}-${room.room_code}-${from}_${to}.csv`,
        all.head,
        all.rows,
      );
      setExportMsg(
        all.truncated
          ? `CSV dipotong pada ${EXPORT_LIMIT.toLocaleString("id-ID")} baris. Persempit rentang atau pilih resolusi yang lebih besar.`
          : `${all.rows.length} baris diekspor.`,
      );
    } catch (e) {
      setExportMsg(
        `Gagal ekspor: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <section id="history" className="block">
      <div className="flex flex-wrap justify-between items-end gap-[14px] mb-4">
        <div>
          <h2 className="text-[19px] font-bold text-ink m-0 mb-[5px]">
            Riwayat &amp; laporan
          </h2>
          <div className="text-xs text-muted">
            Catatan dari database untuk {room.room_name} •{" "}
            {from === to ? from : `${from} s/d ${to}`}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 transition-all"
            onClick={() => setPreset(1)}
          >
            Hari ini
          </button>
          <button
            type="button"
            className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 transition-all"
            onClick={() => setPreset(7)}
          >
            7 hari
          </button>
          <button
            type="button"
            className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 transition-all"
            onClick={() => setPreset(30)}
          >
            30 hari
          </button>
          <input
            type="date"
            aria-label="Tanggal awal"
            value={from}
            max={to || today}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink"
          />
          <span className="text-xs text-muted">s/d</span>
          <input
            type="date"
            aria-label="Tanggal akhir"
            value={to}
            min={from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink"
          />
        </div>
      </div>

      {rangeError && (
        <div className="bg-[#fff5e5] text-[#815414] p-[12px_14px] rounded-[10px] text-xs my-3">
          {rangeError}
        </div>
      )}
      {(table.error || summary.error) && (
        <div className="bg-[#fff5e5] text-[#815414] p-[12px_14px] rounded-[10px] text-xs my-3">
          Gagal memuat riwayat: {table.error ?? summary.error}
        </div>
      )}

      <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
        <div
          className="flex gap-1 border-b border-line overflow-x-auto"
          role="tablist"
        >
          {TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              className={`border-0 bg-transparent py-[10px] px-4 text-[13px] font-bold cursor-pointer border-b-2 -mb-px whitespace-nowrap transition-colors ${
                tab === t.value
                  ? "text-blue border-b-blue"
                  : "text-muted border-b-transparent hover:text-ink"
              }`}
              onClick={() => changeTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          className="flex items-center gap-2 flex-wrap my-3.5 mb-3"
          style={{ margin: "14px 0 12px" }}
        >
          {resOptions.length > 0 && (
            <select
              aria-label="Resolusi data"
              value={resolution}
              onChange={(e) => setResolution(e.target.value as Resolution)}
              className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink cursor-pointer"
            >
              {resOptions.map((r) => (
                <option key={r} value={r}>
                  {RES_LABEL[r]}
                </option>
              ))}
            </select>
          )}
          {newData && (
            <button
              type="button"
              className="py-[9px] px-[11px] bg-blue border border-blue text-white rounded-lg font-bold text-xs cursor-pointer hover:brightness-95 transition-all"
              onClick={reload}
            >
              Ada data baru • Muat ulang
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            disabled={exporting || !!rangeError || total === 0}
            onClick={() => void exportCsv()}
          >
            {exporting ? "Mengekspor…" : "Ekspor CSV"}
          </button>
        </div>
        {exportMsg && (
          <div
            className="text-xs text-muted mb-2.5"
            style={{ marginBottom: 10 }}
            aria-live="polite"
          >
            {exportMsg}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table id="historyTable" className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[#f7f9fc]">
                {head.map((h) => (
                  <th
                    key={h}
                    className="py-3 px-[13px] border-b border-[#edf1f6] text-left whitespace-nowrap text-[10px] text-muted uppercase tracking-[0.4px]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${startIdx + i}-${r[0]}`}
                  className="hover:bg-[#f8fafd] transition-colors border-b border-[#edf1f6] last:border-b-0"
                >
                  {r.map((c, j) => (
                    <td key={j} className="py-3 px-[13px] whitespace-nowrap">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!table.loading && !rangeError && rows.length === 0 && (
          <div
            id="historyEmpty"
            className="p-[35px] text-center text-muted text-[13px]"
          >
            Tidak ada data untuk filter tersebut.
          </div>
        )}

        {total > 0 && (
          <div className="flex justify-between items-center gap-3 flex-wrap pt-[14px] text-xs text-muted">
            <span>
              Menampilkan{" "}
              <strong className="text-ink">
                {startIdx + 1}–{startIdx + rows.length}
              </strong>{" "}
              dari <strong className="text-ink">{total}</strong> data
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                ← Sebelumnya
              </button>
              <span>
                Halaman <strong className="text-ink">{currentPage}</strong> /{" "}
                {totalPages}
              </span>
              <button
                type="button"
                className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                Berikutnya →
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
