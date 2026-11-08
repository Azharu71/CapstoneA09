// Pilihan hari pada formulir jadwal (sama dengan prototipe) dan pemetaannya ke kolom days_of_week.
// >>> UBAH MANUAL bila ingin pilihan hari lain; nilai 1 = Senin ... 7 = Minggu.
export const DAY_OPTIONS = [
  { label: "Senin - Jumat", days: [1, 2, 3, 4, 5] },
  { label: "Sabtu", days: [6] },
  { label: "Minggu", days: [7] },
];

// Harus sama dengan enum pouch_item di 0001_schema.sql.
export const POUCH_ITEMS = ["Spidol", "Penghapus", "Remote TV", "Kabel VGA"] as const;

const NAMES = ["", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export function daysLabel(days: number[]): string {
  const key = [...days].sort().join(",");
  const hit = DAY_OPTIONS.find((o) => o.days.join(",") === key);
  return hit ? hit.label : days.map((d) => NAMES[d]).join(", ");
}

/** "08:00:00" -> "08:00" */
export const hhmm = (t: string) => t.slice(0, 5);
