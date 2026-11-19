import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
const CACHE_KEY_EXPIRES_AT = "cem_cached_expires_at";

function isCacheExpired(): boolean {
  try {
    const exp = localStorage.getItem(CACHE_KEY_EXPIRES_AT);
    if (!exp) return true;
    return Date.now() >= Number(exp) * 1000;
  } catch {
    return true;
  }
}

function clearAuthCache() {
  try {
    localStorage.removeItem(CACHE_KEY_PROFILE);
    localStorage.removeItem(CACHE_KEY_USER);
    localStorage.removeItem(CACHE_KEY_EXPIRES_AT);
    localStorage.removeItem("cem_cached_rooms");
    localStorage.removeItem("cem_selected_room_id");
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const expired = isCacheExpired();
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
    if (expired) return false;
    try {
      return !localStorage.getItem(CACHE_KEY_PROFILE);
    } catch {
      return false;
    }
  });

  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        // Bila token/sesi sudah melewati batas waktu kedaluwarsa (3600 detik)
        if (data.session.expires_at && data.session.expires_at * 1000 <= Date.now()) {
          setSession(null);
          setProfile(null);
          setLoading(false);
          clearAuthCache();
          return;
        }
        setSession(data.session);
        try {
          if (data.session.expires_at) {
            localStorage.setItem(CACHE_KEY_EXPIRES_AT, String(data.session.expires_at));
          }
        } catch {}
      } else {
        // Sesi di Supabase habis atau tidak ada
        setSession(null);
        setProfile(null);
        setLoading(false);
        clearAuthCache();
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!s || event === "SIGNED_OUT") {
        setSession(null);
        setProfile(null);
        setLoading(false);
        clearAuthCache();
      } else {
        setSession(s);
        try {
          if (s.expires_at) {
            localStorage.setItem(CACHE_KEY_EXPIRES_AT, String(s.expires_at));
          }
        } catch {}
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Timer otomatis keluar saat batas session 3600 detik (expires_at) tercapai
  useEffect(() => {
    if (!session?.expires_at) return;
    const timeLeftMs = session.expires_at * 1000 - Date.now();
    if (timeLeftMs <= 0) {
      void supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      clearAuthCache();
      return;
    }

    const timer = window.setTimeout(() => {
      void supabase.auth.getSession().then(({ data }) => {
        if (!data?.session || (data.session.expires_at && data.session.expires_at * 1000 <= Date.now())) {
          void supabase.auth.signOut();
          setSession(null);
          setProfile(null);
          clearAuthCache();
        }
      });
    }, timeLeftMs);

    return () => window.clearTimeout(timer);
  }, [session?.expires_at]);

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
          if (session.expires_at) {
            localStorage.setItem(CACHE_KEY_EXPIRES_AT, String(session.expires_at));
          }
        } catch {}
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const signIn = useCallback(async (email: string, password: string) => {
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? "Email atau kata sandi salah." : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut(); // sesi JWT dihapus di Supabase dan penyimpanan lokal
    setProfile(null);
    setSession(null);
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
