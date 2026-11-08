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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) { setProfile(null); setLoading(false); } });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Muat profil (role, is_active) setiap sesi berubah. Tabel: profiles (policy: baca milik sendiri).
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles").select("id,name,role,is_active").eq("id", session.user.id).maybeSingle();
      if (cancelled) return;
      if (error || !data || !data.is_active) {
        // >>> UBAH MANUAL: pesan ini tampil jika admin belum mengaktifkan akun (lihat seed.sql, bagian bootstrap).
        setNotice(error ? `Gagal memuat profil: ${error.message}` : "Akun belum diaktifkan oleh Administrator.");
        await supabase.auth.signOut();
        setProfile(null);
      } else {
        setProfile(data as Profile);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session]);

  const signIn = useCallback(async (email: string, password: string) => {
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? "Email atau kata sandi salah." : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();   // sesi JWT dihapus di Supabase dan penyimpanan lokal
    setProfile(null);
  }, []);

  const value = useMemo(() => ({ session, profile, loading, notice, signIn, signOut }), [session, profile, loading, notice, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth harus dipakai di dalam AuthProvider");
  return v;
}
