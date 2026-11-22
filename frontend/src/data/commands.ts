import { CONFIG } from "../lib/config";
import { supabase, unwrap } from "../lib/supabase";
import type { CommandRow } from "../types/database";

export type DoorAction = "lock" | "unlock";

/**
 * Kirim perintah pintu: hanya menulis ke tabel commands (RLS memeriksa role dan created_by).
 * Bridge mengambilnya (pending), mem-publish ke MQTT topik cmd/door, dan Node 2 mengirim ack.
 * >>> UBAH MANUAL: bentuk payload harus sama dengan kontrak MQTT (docs/mqtt-contract.md):
 *     {action: "lock" | "unlock"}. Tipe lain yang tersedia: 'light', 'ac'.
 */
export async function sendDoorCommand(
  roomId: number,
  action: DoorAction,
): Promise<number> {
  const row = unwrap(
    await supabase
      .from("commands")
      .insert({ room_id: roomId, type: "door", payload: { action } })
      .select("id")
      .single(),
  ) as { id: number };
  return row.id;
}

/**
 * Menunggu perintah selesai (done) atau gagal (failed) dengan polling 1 detik.
 * Mengembalikan baris perintah terakhir. Dapat diganti dengan Realtime pada tabel commands.
 */
export async function waitCommand(id: number): Promise<CommandRow> {
  const t0 = Date.now();
  for (;;) {
    const row = unwrap(
      await supabase
        .from("commands")
        .select("id,status,error")
        .eq("id", id)
        .single(),
    ) as CommandRow;
    if (row.status === "done" || row.status === "failed") return row;
    if (Date.now() - t0 > CONFIG.commandTimeoutMs)
      return {
        ...row,
        status: "failed",
        error: "Tidak ada konfirmasi dari Node",
      };
    await new Promise((r) => setTimeout(r, 1000));
  }
}
