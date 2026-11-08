import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Shell from "./components/Shell";
import { AuthProvider } from "./hooks/useAuth";
import Dashboard from "./pages/Dashboard";
import Energy from "./pages/Energy";
import History from "./pages/History";
import Login from "./pages/Login";
import Occupancy from "./pages/Occupancy";
import Schedule from "./pages/Schedule";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Shell />}>
            <Route index element={<Dashboard />} />
            <Route path="okupansi" element={<Occupancy />} />
            <Route path="energi" element={<Energy />} />
            <Route path="jadwal" element={<Schedule />} />
            <Route path="riwayat" element={<History />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
