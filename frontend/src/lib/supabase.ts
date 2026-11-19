import { createClient } from "@supabase/supabase-js";

// >>> UBAH MANUAL (wajib): isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY pada berkas .env
// (lokal) dan di Netlify > Site settings > Environment variables. Lihat .env.example.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum diisi. Salin .env.example menjadi .env.");
}

// Hanya anon key. Keamanan data ditegakkan oleh Row Level Security di database (0002_rls.sql).
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Mengubah respons PostgREST menjadi data, atau melempar Error berisi pesan dari database. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
