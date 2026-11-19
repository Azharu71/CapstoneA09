import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchNodeHealth } from "../data/latest";
import { useQuery } from "../hooks/useQuery";
import { useRealtime } from "../hooks/useRealtime";
import { useRoom } from "../hooks/useRoom";
import type { NodeHealth } from "../types/database";

// >>> UBAH MANUAL: menu sidebar (path harus sama dengan rute di App.tsx).
const TABS = [
  { path: "/", icon: "▦", label: "Dashboard" },
  { path: "/okupansi", icon: "◉", label: "Okupansi" },
  { path: "/energi", icon: "▤", label: "Konsumsi Energi" },
  { path: "/jadwal", icon: "◷", label: "Jadwal Kelas" },
  { path: "/riwayat", icon: "☷", label: "Riwayat & Laporan" },
];

// >>> UBAH MANUAL: pengelompokan Node pada sidebar. Node 1 dianggap ONLINE bila Node 1 CV dan Node 1 IR hidup.
const NODE_GROUPS = [
  { label: "Node 1", ids: ["node1cv", "node1ir"] },
  { label: "Node 2", ids: ["node2"] },
  { label: "Node 3", ids: ["node3"] },
];

const COLORS = { online: "#39c58a", partial: "#c98420", offline: "#c0564b" } as const;
const TEXT = { online: "ONLINE", partial: "SEBAGIAN", offline: "OFFLINE" } as const;

function stateOf(health: NodeHealth[], ids: string[]): keyof typeof COLORS {
  const alive = ids.map((id) => health.find((h) => h.node === id)?.is_alive ?? false);
  if (alive.every(Boolean)) return "online";
  return alive.some(Boolean) ? "partial" : "offline";
}

export default function Sidebar() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const { room } = useRoom();
  const health = useQuery(() => fetchNodeHealth(room.room_id), [room.room_id]);
  useRealtime(["node_status"], room.room_id, health.reload);
  // is_alive dihitung saat query; muat ulang berkala agar Node yang berhenti mengirim terdeteksi OFFLINE.
  useEffect(() => {
    const t = window.setInterval(() => void health.reload(), 30000);
    return () => window.clearInterval(t);
  }, [health.reload]);

  return (
    <aside className="bg-navy text-[#d7e2ef] p-[10px] md:py-6 md:px-[15px] flex flex-col">
      <div className="flex gap-3 items-center p-[6px] md:pt-[3px] md:px-[10px] md:pb-7">
        <div className="bg-blue text-white text-[22px] font-extrabold rounded-[10px] w-[42px] h-[42px] grid place-items-center shrink-0">C</div>
        <div>
          <strong className="text-white text-lg font-bold">CLASS</strong>
          <small className="block text-[10px] tracking-[1px] text-[#9db0c8] mt-[3px]">ENERGY MONITOR</small>
        </div>
      </div>
      <div className="text-[10px] tracking-[1px] text-[#8499b4] py-2 px-[11px] hidden md:block">MENU UTAMA</div>
      <nav className="flex overflow-x-auto md:grid gap-[5px]">
        {TABS.map((t) => (
          <button
            key={t.path}
            className={`border-0 text-left rounded-[9px] p-[10px] md:py-[13px] md:px-3 text-sm cursor-pointer whitespace-nowrap md:whitespace-normal transition-colors flex items-center ${
              pathname === t.path ? "bg-[#253c59] text-white font-medium" : "bg-transparent text-[#c3d0df] hover:bg-[#253c59] hover:text-white"
            }`}
            onClick={() => nav(t.path)}
          >
            <span className="inline-block w-7 text-[#afc0d4]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="hidden md:block mt-[30px] border-t border-[#344860] pt-5 px-[11px] text-[13px]">
        <div className="text-[10px] tracking-[1px] text-[#8499b4] pb-3">STATUS APLIKASI</div>
        <p className="my-2 flex items-center text-xs"><span className="inline-block w-2 h-2 rounded-full mr-[9px] bg-[#39c58a]" />Website aktif</p>
        {NODE_GROUPS.map((g) => {
          const s = stateOf(health.data ?? [], g.ids);
          return (
            <p key={g.label} className="my-2 flex items-center text-xs">
              <span className="inline-block w-2 h-2 rounded-full mr-[9px]" style={{ background: COLORS[s] }} />
              {g.label} : {TEXT[s]}
            </p>
          );
        })}
      </div>
      <div className="hidden md:block mt-auto text-[#8499b4] text-[11px] p-3">Data langsung • {room.room_code}</div>
    </aside>
  );
}
