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
    <div className="min-h-screen grid place-items-center bg-bg p-5">
      <form className="w-full max-w-[380px] bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]" onSubmit={onSubmit}>
        <div className="flex gap-3 items-center pt-[3px] px-0 pb-[22px]">
          <div className="bg-blue text-white text-[22px] font-extrabold rounded-[10px] w-[42px] h-[42px] grid place-items-center">C</div>
          <div><strong className="text-navy text-lg font-bold">CLASS</strong><small className="block text-[10px] tracking-[1px] text-muted mt-[3px]">ENERGY MONITOR</small></div>
        </div>
        <div className="text-base font-bold text-ink mb-[6px]">Masuk</div>
        <div className="text-xs text-muted mb-4">Gunakan akun yang diberikan Administrator.</div>
        <div className="mb-[14px]">
          <label htmlFor="email" className="block text-xs text-muted mb-[6px]">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-[11px] border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
          />
        </div>
        <div className="mb-[14px]">
          <label htmlFor="password" className="block text-xs text-muted mb-[6px]">Kata sandi</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-[11px] border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
          />
        </div>
        {(error || notice) && <div className="bg-[#fff5e5] text-[#815414] p-[12px_14px] rounded-[10px] text-xs my-3" role="alert">{error ?? notice}</div>}
        <button
          className="w-full mt-[6px] py-[9px] px-[11px] bg-blue border border-blue text-white rounded-lg font-bold text-xs cursor-pointer hover:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          type="submit"
          disabled={busy}
        >
          {busy ? "Memeriksa…" : "Masuk"}
        </button>
      </form>
    </div>
  );
}
