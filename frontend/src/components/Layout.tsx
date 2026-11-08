import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <Topbar />
        <div className="content">
          <Outlet />
          <div className="footer-note">Sistem Kelas Terintegrasi • Fakultas Teknik</div>
        </div>
      </main>
    </div>
  );
}
