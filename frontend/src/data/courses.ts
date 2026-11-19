import { supabase, unwrap } from "../lib/supabase";
import type { Course } from "../types/database";

/** Daftar mata kuliah (untuk saran pada isian). Tabel: courses. */
export async function fetchCourses(): Promise<Course[]> {
  return unwrap(await supabase.from("courses").select("course_id,course_code,course_name").order("course_name"));
}

/**
 * Mengembalikan course_id untuk nama mata kuliah; membuat mata kuliah baru bila belum ada.
 * Nama dibandingkan tanpa membedakan huruf besar/kecil (database juga menjaganya unik).
 */
export async function ensureCourse(nama: string, kode: string, known: Course[]): Promise<number> {
  const name = nama.trim().replace(/\s+/g, " ");
  const hit = known.find((c) => c.course_name.toLowerCase() === name.toLowerCase());
  if (hit) return hit.course_id;

  const res = await supabase.from("courses").insert({ course_name: name, course_code: kode.trim() || null }).select("course_id").single();
  if (res.error) {
    // Kemungkinan baru dibuat orang lain (nama unik): cari ulang sebelum menyerah.
    const again = (await supabase.from("courses").select("course_id,course_name")).data ?? [];
    const found = again.find((c: { course_name: string }) => c.course_name.toLowerCase() === name.toLowerCase());
    if (found) return (found as { course_id: number }).course_id;
    throw new Error(res.error.message);
  }
  return (res.data as { course_id: number }).course_id;
}
