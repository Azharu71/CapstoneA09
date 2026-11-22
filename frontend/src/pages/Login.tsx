import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/** Halaman login SIRENA: Sistem Integrasi Ruang dan Energi Berkelanjutan */
export default function Login() {
  const { session, profile, loading, notice, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Jika notice muncul dari useAuth (mis. akun belum diaktifkan), hentikan status busy
  useEffect(() => {
    if (notice) setBusy(false);
  }, [notice]);

  // Jika sudah memiliki sesi dan profil aktif, langsung arahkan ke Dashboard
  if (session && profile) return <Navigate to="/" replace />;

  // Jika sedang memeriksa sesi tersimpan awal, tampilkan indikator memuat agar tidak berkedip
  if (loading && !session && !notice) {
    return (
      <div className="min-h-screen grid place-items-center bg-bg text-muted text-xs">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-blue border-t-transparent rounded-full animate-spin" />
          <span>Memuat sesi…</span>
        </div>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setError(null);
    setBusy(true);

    const err = await signIn(email.trim(), password);
    if (err) {
      setError(err);
      setBusy(false);
    }
    // Jika kredensial benar, busy tetap true sampai profil selesai dimuat
    // dan komponen otomatis redirect ke Dashboard (atau notice muncul jika akun nonaktif).
  }

  async function handleDemoLogin() {
    setEmail("admin1@gmail.com");
    setPassword("admin123");
    setError(null);
    setBusy(true);

    const err = await signIn("admin1@gmail.com", "admin123");
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  const activeMessage = error ?? notice;
  const isErrorMessage = Boolean(error);

  return (
    <div className="min-h-screen grid place-items-center bg-bg p-5">
      <form
        className="w-full max-w-[380px] bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]"
        onSubmit={onSubmit}
        noValidate
      >
        <div className="flex gap-3 items-center pt-[3px] px-0 pb-[22px]">
          <div className="bg-blue text-white text-[22px] font-extrabold rounded-[10px] w-[42px] h-[42px] grid place-items-center shrink-0">
            S
          </div>
          <div>
            <strong className="text-navy text-lg font-bold tracking-wide">
              SIRENA
            </strong>
            <small className="block text-[8px] leading-[11px] tracking-[0.5px] text-muted mt-[2px]">
              SISTEM INTEGRASI RUANG DAN ENERGI BERKELANJUTAN
            </small>
          </div>
        </div>

        <div className="text-base font-bold text-ink mb-[6px]">Masuk</div>
        <div className="text-xs text-muted mb-4">
          Gunakan akun yang diberikan Administrator.
        </div>

        <div className="mb-[14px]">
          <label htmlFor="email" className="block text-xs text-muted mb-[6px]">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            disabled={busy}
            placeholder="nama@contoh.ac.id"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            className="w-full p-[11px] border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue disabled:bg-[#f2f6fb] disabled:cursor-not-allowed transition-colors"
          />
        </div>

        <div className="mb-[14px]">
          <div className="flex justify-between items-center mb-[6px]">
            <label htmlFor="password" className="block text-xs text-muted">
              Kata sandi
            </label>
          </div>
          <div className="relative flex items-center">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              disabled={busy}
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              className="w-full p-[11px] pr-10 border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue disabled:bg-[#f2f6fb] disabled:cursor-not-allowed transition-colors"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={
                showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
              }
              className="absolute right-2.5 p-1 text-muted hover:text-ink focus:outline-none cursor-pointer disabled:cursor-not-allowed"
              disabled={busy}
            >
              {showPassword ? (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        {activeMessage && (
          <div
            className={`p-[12px_14px] rounded-[10px] text-xs my-3 border ${
              isErrorMessage
                ? "bg-[#fef2f2] text-[#991b1b] border-[#fecaca]"
                : "bg-[#fffbeb] text-[#92400e] border-[#fde68a]"
            }`}
            role="alert"
          >
            {activeMessage}
          </div>
        )}

        <button
          className="w-full mt-[6px] py-[10px] px-[11px] bg-blue border border-blue text-white rounded-lg font-bold text-xs cursor-pointer hover:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          type="submit"
          disabled={busy || !email.trim() || !password}
        >
          {busy && (
            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
          )}
          {busy ? "Memeriksa…" : "Masuk"}
        </button>

        <div className="relative flex py-3 items-center">
          <div className="flex-grow border-t border-line"></div>
          <span className="flex-shrink mx-2 text-[10px] text-muted uppercase tracking-wider font-semibold">
            atau
          </span>
          <div className="flex-grow border-t border-line"></div>
        </div>

        <button
          type="button"
          onClick={handleDemoLogin}
          disabled={busy}
          className="w-full py-[9px] px-[11px] bg-[#f2f6fb] border border-[#ccd6e3] text-navy rounded-lg font-bold text-xs cursor-pointer hover:bg-[#e4ecf7] disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          <span>Gunakan akun demo</span>
        </button>
      </form>
    </div>
  );
}
