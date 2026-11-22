import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types/database";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Pesan untuk halaman login (mis. akun belum diaktifkan). */
  notice: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

const CACHE_KEY_PROFILE = "cem_cached_profile";
const CACHE_KEY_USER = "cem_cached_user";
const CACHE_KEY_SESSION_DEADLINE = "cem_app_session_deadline";
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function readSessionDeadline(): number | null {
  try {
    const value = localStorage.getItem(CACHE_KEY_SESSION_DEADLINE);
    if (!value) return null;
    const deadline = Number(value);
    return Number.isFinite(deadline) ? deadline : null;
  } catch {
    return null;
  }
}

function startSessionDeadline(): number | null {
  const deadline = Date.now() + SESSION_MAX_AGE_MS;
  try {
    localStorage.setItem(CACHE_KEY_SESSION_DEADLINE, String(deadline));
    return deadline;
  } catch (error) {
    console.error("Gagal menyimpan batas waktu sesi.", error);
    return null;
  }
}

function isSessionExpired(): boolean {
  const deadline = readSessionDeadline();
  return deadline === null || Date.now() >= deadline;
}

function clearAuthCache() {
  try {
    localStorage.removeItem(CACHE_KEY_PROFILE);
    localStorage.removeItem(CACHE_KEY_USER);
    localStorage.removeItem(CACHE_KEY_SESSION_DEADLINE);
    localStorage.removeItem("cem_cached_expires_at");
    localStorage.removeItem("cem_cached_rooms");
    localStorage.removeItem("cem_selected_room_id");
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const expired = isSessionExpired();
  if (expired) {
    clearAuthCache();
  }

  const [profile, setProfile] = useState<Profile | null>(() => {
    if (expired) return null;
    try {
      const s = localStorage.getItem(CACHE_KEY_PROFILE);
      return s ? (JSON.parse(s) as Profile) : null;
    } catch {
      return null;
    }
  });

  const [session, setSession] = useState<Session | null>(() => {
    if (expired) return null;
    try {
      const s = localStorage.getItem(CACHE_KEY_USER);
      return s ? ({ user: JSON.parse(s) } as unknown as Session) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState<boolean>(() => {
    if (expired) return true;
    try {
      return !localStorage.getItem(CACHE_KEY_PROFILE);
    } catch {
      return true;
    }
  });

  const [notice, setNotice] = useState<string | null>(null);
  const [sessionDeadline, setSessionDeadline] = useState<number | null>(() => readSessionDeadline());
  const sessionEnding = useRef(false);

  const expireSession = useCallback(async () => {
    if (sessionEnding.current) return;
    sessionEnding.current = true;
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) console.error("Gagal mencabut refresh token sesi yang kedaluwarsa.", error);
    } catch (error) {
      console.error("Gagal mencabut refresh token sesi yang kedaluwarsa.", error);
    } finally {
      setSession(null);
      setProfile(null);
      setLoading(false);
      setSessionDeadline(null);
      clearAuthCache();
    }
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!s || event === "SIGNED_OUT") {
        setSession(null);
        setProfile(null);
        setLoading(false);
        setSessionDeadline(null);
        clearAuthCache();
        return;
      }

      let deadline = readSessionDeadline();
      if (event === "SIGNED_IN" && (deadline === null || Date.now() >= deadline)) {
        deadline = startSessionDeadline();
      }

      if (deadline === null) {
        setSession(null);
        setProfile(null);
        if (event === "SIGNED_IN") setLoading(false);
        return;
      }

      setSessionDeadline(deadline);
      setSession(s);
    });

    let cancelled = false;
    const initializeSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) {
        console.error("Gagal memeriksa sesi Supabase.", error);
        setLoading(false);
        return;
      }

      if (!data.session) {
        setSession(null);
        setProfile(null);
        setLoading(false);
        clearAuthCache();
        return;
      }

      const deadline = readSessionDeadline();
      if (deadline === null || Date.now() >= deadline) {
        await expireSession();
        return;
      }

      setSessionDeadline(deadline);
      setSession(data.session);
    };

    void initializeSession().catch((error: unknown) => {
      console.error("Gagal menginisialisasi sesi.", error);
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [expireSession]);

  useEffect(() => {
    if (!session?.user?.id) return;

    const checkDeadline = () => {
      const deadline = readSessionDeadline();
      if (deadline === null || Date.now() >= deadline) void expireSession();
    };
    const deadline = sessionDeadline ?? readSessionDeadline();
    if (deadline === null || Date.now() >= deadline) {
      void expireSession();
      return;
    }

    const timer = window.setTimeout(checkDeadline, deadline - Date.now());
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") checkDeadline();
    };
    window.addEventListener("focus", checkDeadline);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", checkDeadline);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [session?.user?.id, sessionDeadline, expireSession]);

  // Muat profil (role, is_active) setiap sesi berubah. Tabel: profiles (policy: baca milik sendiri).
  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    (async () => {
      if (!profile) setLoading(true);
      const { data, error } = await supabase
        .from("profiles").select("id,name,role,is_active").eq("id", session.user.id).maybeSingle();
      if (cancelled) return;
      if (error || !data || !data.is_active) {
        // >>> UBAH MANUAL: pesan ini tampil jika admin belum mengaktifkan akun (lihat seed.sql, bagian bootstrap).
        setNotice(error ? `Gagal memuat profil: ${error.message}` : "Akun belum diaktifkan oleh Administrator.");
        await supabase.auth.signOut();
        setProfile(null);
        clearAuthCache();
      } else {
        const p = data as Profile;
        setProfile(p);
        try {
          localStorage.setItem(CACHE_KEY_PROFILE, JSON.stringify(p));
          if (session.user.email) {
            localStorage.setItem(CACHE_KEY_USER, JSON.stringify({ id: session.user.id, email: session.user.email }));
          }
        } catch {}
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const signIn = useCallback(async (email: string, password: string) => {
    setNotice(null);
    sessionEnding.current = false;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return "Email atau kata sandi salah.";
    if (!data.session) return "Sesi login tidak berhasil dibuat.";

    let deadline = readSessionDeadline();
    if (deadline === null || Date.now() >= deadline) deadline = startSessionDeadline();
    if (deadline === null) {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) console.error("Gagal membatalkan login tanpa batas waktu sesi.", signOutError);
      return "Tidak dapat menyimpan batas waktu sesi. Periksa penyimpanan browser lalu coba lagi.";
    }

    setSessionDeadline(deadline);
    return null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut(); // sesi JWT dihapus di Supabase dan penyimpanan lokal
    setProfile(null);
    setSession(null);
    setSessionDeadline(null);
    sessionEnding.current = false;
    clearAuthCache();
  }, []);

  const value = useMemo(() => ({ session, profile, loading, notice, signIn, signOut }), [session, profile, loading, notice, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth harus dipakai di dalam AuthProvider");
  return v;
}
