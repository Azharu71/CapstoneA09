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
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">C</div>
        <div><strong>CLASS</strong><small>ENERGY MONITOR</small></div>
      </div>
      <div className="menulabel">MENU UTAMA</div>
      <nav className="nav">
        {TABS.map((t) => (
          <button key={t.path} className={pathname === t.path ? "active" : ""} onClick={() => nav(t.path)}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>
      <div className="status">
        <div className="menulabel" style={{ padding: "0 0 12px" }}>STATUS APLIKASI</div>
        <p><span className="dot" />Website aktif</p>
        {NODE_GROUPS.map((g) => {
          const s = stateOf(health.data ?? [], g.ids);
          return (
            <p key={g.label}><span className="dot" style={{ background: COLORS[s] }} />{g.label} : {TEXT[s]}</p>
          );
        })}
      </div>
      <div className="sim">Data langsung • {room.room_code}</div>
    </aside>
  );
}
