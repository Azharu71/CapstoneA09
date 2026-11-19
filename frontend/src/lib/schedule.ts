// Pilihan hari pada formulir jadwal: Senin sampai Sabtu (nilai ISO: 1 = Senin ... 6 = Sabtu).
// >>> UBAH MANUAL: tambahkan { iso: 7, label: "Minggu" } bila perkuliahan hari Minggu diperlukan
// (database sudah menerima 1 sampai 7).
export const HARI = [
  { iso: 1, label: "Senin" },
  { iso: 2, label: "Selasa" },
  { iso: 3, label: "Rabu" },
  { iso: 4, label: "Kamis" },
  { iso: 5, label: "Jumat" },
  { iso: 6, label: "Sabtu" },
];

// Harus sama dengan enum pouch_item di 0001_schema.sql.
export const POUCH_ITEMS = ["Spidol", "Penghapus", "Remote TV", "Kabel VGA"] as const;

export const hariLabel = (d: number) => HARI.find((h) => h.iso === d)?.label ?? (d === 7 ? "Minggu" : String(d));

/** [1,2,3,4,5,6] -> "Senin - Sabtu"; [1,3] -> "Senin, Rabu". */
export function daysLabel(days: number[]): string {
  const s = [...days].sort((a, b) => a - b);
  const berurutan = s.every((d, i) => i === 0 || d === s[i - 1] + 1);
  if (s.length > 2 && berurutan) return `${hariLabel(s[0])} - ${hariLabel(s[s.length - 1])}`;
  return s.map(hariLabel).join(", ");
}

/** "08:00:00" -> "08:00" */
export const hhmm = (t: string) => t.slice(0, 5);

/** "08:30" -> 510 (menit sejak 00:00) */
export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
