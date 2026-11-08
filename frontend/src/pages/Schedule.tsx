import { FormEvent, useState } from "react";
import { deleteSchedule, fetchSchedules, saveSchedule, setScheduleActive } from "../data/schedules";
import { useAuth } from "../hooks/useAuth";
import { useQuery } from "../hooks/useQuery";
import { useRoom } from "../hooks/useRoom";
import { CONFIG } from "../lib/config";
import { DAY_OPTIONS, daysLabel, hhmm, POUCH_ITEMS } from "../lib/schedule";
import type { Schedule as ScheduleRow } from "../types/database";

export default function Schedule() {
  const { rooms, room, setRoomId } = useRoom();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const list = useQuery(() => fetchSchedules(room.room_id), [room.room_id]);

  // Nilai awal formulir sama dengan prototipe.
  const [dayLabel, setDayLabel] = useState(DAY_OPTIONS[0].label);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("16:00");
  const [on, setOn] = useState("07:00");
  const [off, setOff] = useState("17:00");
  const [temp, setTemp] = useState("24");
  const [pouch, setPouch] = useState<string[]>([...POUCH_ITEMS]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  function loadIntoForm(s: ScheduleRow) {
    setEditingId(s.schedule_id);
    setDayLabel(daysLabel(s.days_of_week));
    setStart(hhmm(s.start_time)); setEnd(hhmm(s.end_time));
    setOn(hhmm(s.ac_on_time)); setOff(hhmm(s.ac_off_time));
    setTemp(String(Number(s.setpoint_c))); setPouch(s.pouch);
    setMsg({ text: "Mengubah jadwal yang dipilih. Tekan Simpan untuk menerapkan.", ok: true });
    window.scrollTo(0, 0);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = Number(temp);
    // Validasi sama dengan prototipe + satu aturan tambahan yang diminta database (ON < OFF).
    if (!start || !end || start >= end) return setMsg({ text: "Gagal: jam selesai harus setelah jam mulai.", ok: false });
    if (Number.isNaN(t) || t < CONFIG.setpointRange.min || t > CONFIG.setpointRange.max)
      return setMsg({ text: `Gagal: setpoint harus ${CONFIG.setpointRange.min}–${CONFIG.setpointRange.max} °C.`, ok: false });
    if (!on || !off || on >= off) return setMsg({ text: "Gagal: jadwal OFF harus setelah jadwal ON.", ok: false });

    const days = DAY_OPTIONS.find((o) => o.label === dayLabel)?.days ?? DAY_OPTIONS[0].days;
    setBusy(true);
    try {
      await saveSchedule(
        { room_id: room.room_id, days_of_week: days, start_time: `${start}:00`, end_time: `${end}:00`, ac_on_time: `${on}:00`, ac_off_time: `${off}:00`, setpoint_c: t, pouch },
        editingId ?? undefined,
      );
      setMsg({ text: "Jadwal tersimpan di database. Bridge meneruskannya ke Node 1 IR dan Node 2 secara otomatis.", ok: true });
      setEditingId(null);
      await list.reload();
    } catch (err) {
      setMsg({ text: `Gagal: ${err instanceof Error ? err.message : String(err)}`, ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<void>) {
    try { await fn(); await list.reload(); } catch (err) { setMsg({ text: `Gagal: ${err instanceof Error ? err.message : String(err)}`, ok: false }); }
  }

  const togglePouch = (v: string) => setPouch((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  return (
    <section id="schedule" className="tabscreen active">
      <div className="rowhead">
        <div>
          <h2>Konfigurasi jadwal kelas</h2>
          <div className="muted">Jadwal disimpan di database dan diteruskan ke perangkat oleh bridge.</div>
        </div>
        <span className="badge">Tersambung ke database</span>
      </div>
      {list.error && <div className="notice">Gagal memuat jadwal: {list.error}</div>}

      <div className="grid2">
        <form id="scheduleForm" className="card" onSubmit={onSubmit}>
          <div className="sectiontitle">{editingId ? "Ubah jadwal" : "Detail jadwal"}</div>
          <div className="fieldgrid" style={{ marginTop: 15 }}>
            <div className="field">
              <label>Ruang</label>
              <select id="sRoom" value={room.room_id} onChange={(e) => setRoomId(Number(e.target.value))}>
                {rooms.map((r) => <option key={r.room_id} value={r.room_id}>{r.room_name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Hari</label>
              <select id="sDay" value={dayLabel} onChange={(e) => setDayLabel(e.target.value)}>
                {DAY_OPTIONS.map((o) => <option key={o.label}>{o.label}</option>)}
              </select>
            </div>
            <div className="field"><label>Jam mulai kelas</label><input id="sStart" type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></div>
            <div className="field"><label>Jam selesai kelas</label><input id="sEnd" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></div>
            <div className="field"><label>Jadwal ON</label><input id="sOn" type="time" value={on} onChange={(e) => setOn(e.target.value)} required /></div>
            <div className="field"><label>Jadwal OFF</label><input id="sOff" type="time" value={off} onChange={(e) => setOff(e.target.value)} required /></div>
            <div className="field">
              <label>Setpoint suhu (°C)</label>
              <input id="sTemp" type="number" min={CONFIG.setpointRange.min} max={CONFIG.setpointRange.max} value={temp} onChange={(e) => setTemp(e.target.value)} required />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1", marginTop: 6 }}>
              <label style={{ fontWeight: 600, color: "var(--ink)" }}>Kelengkapan Pouch Kelas</label>
              <div className="pouch-grid">
                {POUCH_ITEMS.map((p) => (
                  <label className="pouch-item" key={p}>
                    <input type="checkbox" value={p} checked={pouch.includes(p)} onChange={() => togglePouch(p)} />
                    <span>{p}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="notice">
            Validasi: jam selesai harus setelah jam mulai, jadwal OFF setelah jadwal ON, dan setpoint berada pada rentang {CONFIG.setpointRange.min}–{CONFIG.setpointRange.max} °C (sesuai batasan database).
          </div>
          <div className="toolbar">
            <button className="btn primary" type="submit" disabled={busy}>{busy ? "Menyimpan…" : editingId ? "Simpan perubahan" : "Simpan jadwal"}</button>
            {editingId && <button className="btn" type="button" onClick={() => { setEditingId(null); setMsg(null); }}>Batal ubah</button>}
          </div>
          <div id="scheduleMessage" className="footer-note" aria-live="polite" style={{ color: msg ? (msg.ok ? "#168873" : "#b54747") : undefined }}>{msg?.text}</div>
        </form>

        <div className="card">
          <div className="sectiontitle">Jadwal tersimpan</div>
          {(list.data ?? []).length === 0 && !list.loading && <div className="empty">Belum ada jadwal untuk ruang ini.</div>}
          {(list.data ?? []).map((s) => (
            <div key={s.schedule_id} className={"sched-item" + (s.is_active ? "" : " inactive")}>
              <div className="rowline"><span>Ruang</span><span className="strong">{room.room_name}</span></div>
              <div className="rowline"><span>Hari</span><span className="strong">{daysLabel(s.days_of_week)}</span></div>
              <div className="rowline"><span>Jam kelas</span><span className="strong">{hhmm(s.start_time)}–{hhmm(s.end_time)}</span></div>
              <div className="rowline"><span>ON / OFF terjadwal</span><span className="strong">{hhmm(s.ac_on_time)} / {hhmm(s.ac_off_time)}</span></div>
              <div className="rowline"><span>Setpoint</span><span className="strong">{Number(s.setpoint_c)} °C</span></div>
              <div className="rowline"><span>Kelengkapan Pouch</span><span className="strong">{s.pouch.length ? s.pouch.join(", ") : "Tidak ada (Kosong)"}</span></div>
              <div className="row-actions">
                <button className="btn" type="button" onClick={() => loadIntoForm(s)}>Ubah</button>
                <button className="btn" type="button" onClick={() => void act(() => setScheduleActive(s.schedule_id, !s.is_active))}>{s.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
                {isAdmin && <button className="btn" type="button" onClick={() => { if (window.confirm("Hapus jadwal ini?")) void act(() => deleteSchedule(s.schedule_id)); }}>Hapus</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
