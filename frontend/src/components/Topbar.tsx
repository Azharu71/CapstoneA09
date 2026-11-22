import { useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

// Judul halaman sama dengan prototipe.
const TITLES: Record<string, string> = {
  "/": "Dashboard Monitoring",
  "/okupansi": "Analisis Okupansi",
  "/energi": "Konsumsi Energi",
  "/jadwal": "Jadwal Perkuliahan",
  "/riwayat": "Riwayat & Laporan",
  "/pengguna": "Manajemen Pengguna",
};

export default function Topbar() {
  const { pathname } = useLocation();
  const { profile, session, signOut } = useAuth();
  return (
    <header className="bg-white border-b border-line p-[15px] md:py-5 md:px-7 flex items-center justify-between gap-5">
      <div>
        <h1
          id="pageTitle"
          className="text-[19px] md:text-[23px] font-bold m-0 text-ink"
        >
          {TITLES[pathname] ?? "Dashboard Monitoring"}
        </h1>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="hidden md:inline-flex items-center gap-[7px] py-2 px-3 bg-[#f2f6fb] border border-line rounded-full text-muted text-[11px]">
          {session?.user.email} •{" "}
          {profile?.role === "admin" ? "Administrator" : "Operator"}
        </span>
        <button
          className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 transition-all"
          onClick={() => void signOut()}
        >
          Keluar
        </button>
      </div>
    </header>
  );
}
