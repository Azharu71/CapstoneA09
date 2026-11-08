import { supabase, unwrap } from "../lib/supabase";
import type { NodeHealth, RoomLatest } from "../types/database";

/** Nilai terbaru satu ruang untuk kartu Dashboard. View: room_latest (0003_views.sql). */
export async function fetchRoomLatest(roomId: number): Promise<RoomLatest | null> {
  return unwrap(await supabase.from("room_latest").select("*").eq("room_id", roomId).maybeSingle());
}

/** Status ONLINE/OFFLINE tiap Node untuk sidebar. View: node_health (ambang 90 detik ada di view). */
export async function fetchNodeHealth(roomId: number): Promise<NodeHealth[]> {
  return unwrap(await supabase.from("node_health").select("*").eq("room_id", roomId));
}
