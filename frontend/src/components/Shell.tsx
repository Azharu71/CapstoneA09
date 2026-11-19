import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { RoomProvider } from "../hooks/useRoom";
import Layout from "./Layout";

/** Penjaga rute: wajib login dan profil aktif; lalu menyediakan pilihan ruang. */
export default function Shell() {
  const { session, profile, loading } = useAuth();
  if (loading && !profile) return <div className="p-[35px] text-center text-muted text-[13px]">Memuat…</div>;
  if (!session || !profile) return <Navigate to="/login" replace />;
  return (
    <RoomProvider>
      <Layout />
    </RoomProvider>
  );
}
