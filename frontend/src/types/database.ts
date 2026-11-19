// Tipe tulisan tangan yang mencerminkan skema di supabase/migrations.
// >>> UBAH MANUAL (opsional): ganti dengan hasil `npx supabase gen types typescript --linked`
// bila ingin tipe otomatis. Nama kolom di sini HARUS sama dengan skema database.

export type UserRole = "admin" | "operator";

export interface Profile { id: string; name: string; role: UserRole; is_active: boolean }
export interface Room {
  room_id: number; room_code: string; room_name: string; capacity: number;
  // Pengaturan AC: ditetapkan SEKALI per ruang (bukan per jadwal)
  ac_on_time: string; ac_off_time: string; ac_setpoint_c: number; ac_days: number[];
}
export interface NewRoomInput { room_code: string; room_name: string; capacity: number }
export interface RoomAcInput { ac_on_time: string; ac_off_time: string; ac_setpoint_c: number; ac_days: number[] }

export interface Course { course_id: number; course_code: string | null; course_name: string }

export interface DoorState { ts?: string; locked: boolean; door_closed: boolean }

export interface RoomLatest {
  room_id: number; room_code: string; room_name: string;
  person_count: number | null; occupied: boolean | null; occupancy_at: string | null;
  temperature_c: number | null; humidity_rh: number | null; env_at: string | null;
  active_power_w: number | null; energy_kwh: number | null; power_at: string | null;
  door_state: DoorState | null; light_state: unknown; ac_state: unknown;
}

export interface NodeHealth { room_id: number; node: string; online: boolean; last_seen: string | null; is_alive: boolean }

export interface EnergyBucket {
  room_id: number; bucket_local: string;
  voltage_v: number; current_a: number; frequency_hz: number; active_power_w: number; energy_kwh: number; samples: number;
}

export interface EnergyReadRow {
  reading_id: number; room_id: number; measured_at: string;
  voltage_v: number; current_a: number; frequency_hz: number; active_power_w: number; energy_kwh: number; power_factor: number | null;
}

export interface OccupancyBucket {
  room_id: number; bucket_local: string;
  avg_count: number; max_count: number; occupied: boolean; avg_fps: number | null; samples: number;
}

export interface OccupancyRow {
  detected_at: string; person_count: number; occupied: boolean;
  inference_fps: number | null; processing_ms: number | null;
}

// Satu baris = satu mata kuliah pada satu hari di satu ruang.
export interface Schedule {
  schedule_id: number; room_id: number; course_id: number; day_of_week: number;
  start_time: string; end_time: string; pouch: string[]; is_active: boolean;
  created_by: string | null; created_at: string; updated_at: string;
  courses: Course | null;
}

export interface ScheduleInput {
  room_id: number; course_id: number; day_of_week: number;
  start_time: string; end_time: string; pouch: string[];
}

export type CommandStatus = "pending" | "sent" | "done" | "failed";
export interface CommandRow { id: number; status: CommandStatus; error: string | null }

export type HistoryType = "cv" | "energy" | "schedule" | "audit";
export interface HistoryItem { time: string; type: HistoryType; typeLabel: string; activity: string; detail: string }
