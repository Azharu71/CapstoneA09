import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/** Halaman login (tidak ada di prototipe; memakai kelas dan warna prototipe agar serasi). */
export default function Login() {
  const { session, profile, notice, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session && profile) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(await signIn(email.trim(), password));
    setBusy(false);
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={onSubmit}>
        <div className="brand">
          <div className="logo">C</div>
          <div><strong>SIRENA</strong><small>Sistem Integrasi Ruang dan Energi Berkelanjutan</small></div>
        </div>
        <div className="sectiontitle">Masuk</div>
        <div className="muted" style={{ marginBottom: 16 }}>Gunakan akun yang diberikan Administrator.</div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Kata sandi</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {(error || notice) && <div className="notice" role="alert">{error ?? notice}</div>}
        <button className="btn primary" type="submit" disabled={busy} style={{ width: "100%", marginTop: 6 }}>
          {busy ? "Memeriksa…" : "Masuk"}
        </button>
      </form>
    </div>
  );
}
