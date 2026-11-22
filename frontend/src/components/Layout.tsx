import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="min-h-screen block md:flex bg-bg text-ink">
      <Sidebar />
      <main className="min-w-0 flex-1 flex flex-col md:ml-[210px] lg:ml-[245px]">
        <Topbar />
        <div className="p-[15px] sm:p-[18px] lg:px-7 lg:pt-[23px] lg:pb-[34px] max-w-[1500px] w-full mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
