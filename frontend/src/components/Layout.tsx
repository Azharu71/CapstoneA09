import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className="min-h-screen block md:grid md:grid-cols-[210px_1fr] lg:grid-cols-[245px_1fr] bg-bg text-ink">
      <Sidebar />
      <main className="min-w-0 flex flex-col">
        <Topbar />
        <div className="p-[15px] sm:p-[18px] lg:px-7 lg:pt-[23px] lg:pb-[34px] max-w-[1500px] w-full mx-auto">
          <Outlet />
          <div className="text-[11px] text-muted mt-[18px]">Sistem Kelas Terintegrasi • Fakultas Teknik</div>
        </div>
      </main>
    </div>
  );
}
