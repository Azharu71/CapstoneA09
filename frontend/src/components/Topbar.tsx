import { useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

// Judul halaman sama dengan prototipe.
const TITLES: Record<string, string> = {
  "/": "Dashboard Monitoring",
  "/okupansi": "Analisis Okupansi",
  "/energi": "Konsumsi Energi",
  "/jadwal": "Jadwal Kelas",
  "/riwayat": "Riwayat & Laporan",
};

export default function Topbar() {
  const { pathname } = useLocation();
  const { profile, session, signOut } = useAuth();
  return (
    <header className="topbar">
      <div>
        <h1 id="pageTitle">{TITLES[pathname] ?? "Dashboard Monitoring"}</h1>
        <div className="subtitle">Sistem kelas terintegrasi • Fakultas Teknik</div>
      </div>
      <div className="toolbar">
        <span className="pill">{session?.user.email} • {profile?.role === "admin" ? "Administrator" : "Operator"}</span>
        <button className="btn" onClick={() => void signOut()}>Keluar</button>
      </div>
    </header>
  );
}
