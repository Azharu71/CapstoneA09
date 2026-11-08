import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { RoomProvider } from "../hooks/useRoom";
import Layout from "./Layout";

/** Penjaga rute: wajib login dan profil aktif; lalu menyediakan pilihan ruang. */
export default function Shell() {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="empty">Memuat…</div>;
  if (!session || !profile) return <Navigate to="/login" replace />;
  return (
    <RoomProvider>
      <Layout />
    </RoomProvider>
  );
}
