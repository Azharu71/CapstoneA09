import { FormEvent, useEffect, useState } from "react";
import { fetchCourses, ensureCourse } from "../data/courses";
import { addRoom, saveRoomAc } from "../data/rooms";
import {
  deleteSchedule,
  fetchSchedules,
  saveSchedule,
  setScheduleActive,
} from "../data/schedules";
import { useAuth } from "../hooks/useAuth";
import { useQuery } from "../hooks/useQuery";
import { useRoom } from "../hooks/useRoom";
import { CONFIG } from "../lib/config";
import { kelasHariIni } from "../lib/activeSchedule";
import { daysLabel, HARI, hhmm, POUCH_ITEMS, toMin } from "../lib/schedule";
import type { Schedule as ScheduleRow } from "../types/database";

type Pesan = { text: string; ok: boolean } | null;
const gagal = (e: unknown) =>
  `Gagal: ${e instanceof Error ? e.message : String(e)}`;
const Notif = ({ m }: { m: Pesan }) => (
  <div
    className="text-[11px] text-muted mt-[18px]"
    aria-live="polite"
    style={{ color: m ? (m.ok ? "#168873" : "#b54747") : undefined }}
  >
    {m?.text}
  </div>
);

/**
 * Halaman Jadwal Kelas. Tiga bagian:
 *  1. Ruang        : pilih ruang, atau tambah ruang baru (U-204, U-205, ...)
 *  2. AC ruang     : jam ON/OFF dan suhu, ditetapkan SEKALI per ruang (bukan per mata kuliah)
 *  3. Mata kuliah  : jadwal perkuliahan per hari; beberapa mata kuliah per hari selama tidak bentrok
 */
export default function Schedule() {
  const { rooms, room, setRoomId, reloadRooms } = useRoom();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const list = useQuery(() => fetchSchedules(room.room_id), [room.room_id]);
  const courses = useQuery(fetchCourses, []);

  // ---------------- 1. Tambah ruang ----------------
  const [tampilRuang, setTampilRuang] = useState(false);
  const [kodeRuang, setKodeRuang] = useState("");
  const [namaRuang, setNamaRuang] = useState("");
  const [kapasitas, setKapasitas] = useState("40");
  const [pesanRuang, setPesanRuang] = useState<Pesan>(null);

  async function onTambahRuang(e: FormEvent) {
    e.preventDefault();
    const kode = kodeRuang.trim().toUpperCase();
    // Kode dipakai sebagai bagian topik MQTT: hanya huruf, angka, tanda hubung (sama dengan CHECK di database).
    if (!/^[A-Z0-9][A-Z0-9-]*$/.test(kode))
      return setPesanRuang({
        text: "Gagal: kode ruang hanya huruf, angka, dan tanda hubung (contoh: U-204).",
        ok: false,
      });
    const cap = Number(kapasitas);
    if (!Number.isInteger(cap) || cap <= 0)
      return setPesanRuang({
        text: "Gagal: kapasitas harus bilangan bulat positif.",
        ok: false,
      });
    try {
      const baru = await addRoom({
        room_code: kode,
        room_name: namaRuang.trim() || `Kelas ${kode}`,
        capacity: cap,
      });
      await reloadRooms();
      setRoomId(baru.room_id);
      setKodeRuang("");
      setNamaRuang("");
      setPesanRuang({
        text: `Ruang ${kode} ditambahkan. Perangkat Node untuk ruang ini perlu disiapkan terpisah (akun broker, ACL, bridge).`,
        ok: true,
      });
      setTampilRuang(false);
    } catch (err) {
      setPesanRuang({
        text: gagal(err).includes("duplicate")
          ? `Gagal: kode ruang ${kode} sudah ada.`
          : gagal(err),
        ok: false,
      });
    }
  }

  // ---------------- 2. Pengaturan AC ruang ----------------
  const [acOn, setAcOn] = useState("07:00");
  const [acOff, setAcOff] = useState("17:00");
  const [acTemp, setAcTemp] = useState("24");
  const [acDays, setAcDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [pesanAc, setPesanAc] = useState<Pesan>(null);
  useEffect(() => {
    // isi formulir dari pengaturan ruang yang dipilih
    setAcOn(hhmm(room.ac_on_time));
    setAcOff(hhmm(room.ac_off_time));
    setAcTemp(String(Number(room.ac_setpoint_c)));
    setAcDays(room.ac_days);
    setPesanAc(null);
  }, [
    room.room_id,
    room.ac_on_time,
    room.ac_off_time,
    room.ac_setpoint_c,
    room.ac_days,
  ]);

  async function onSimpanAc(e: FormEvent) {
    e.preventDefault();
    const t = Number(acTemp);
    if (!acOn || !acOff || acOn >= acOff)
      return setPesanAc({
        text: "Gagal: jadwal OFF harus setelah jadwal ON.",
        ok: false,
      });
    if (
      Number.isNaN(t) ||
      t < CONFIG.setpointRange.min ||
      t > CONFIG.setpointRange.max
    )
      return setPesanAc({
        text: `Gagal: setpoint harus ${CONFIG.setpointRange.min}–${CONFIG.setpointRange.max} °C.`,
        ok: false,
      });
    if (acDays.length === 0)
      return setPesanAc({
        text: "Gagal: pilih minimal satu hari AC aktif.",
        ok: false,
      });
    try {
      await saveRoomAc(room.room_id, {
        ac_on_time: `${acOn}:00`,
        ac_off_time: `${acOff}:00`,
        ac_setpoint_c: t,
        ac_days: [...acDays].sort(),
      });
      await reloadRooms();
      setPesanAc({
        text: "Pengaturan AC ruang tersimpan. Bridge meneruskannya ke Node 1 IR secara otomatis.",
        ok: true,
      });
    } catch (err) {
      setPesanAc({ text: gagal(err), ok: false });
    }
  }
  const toggleAcDay = (d: number) =>
    setAcDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  // ---------------- 3. Jadwal mata kuliah ----------------
  const [matkul, setMatkul] = useState("");
  const [kode, setKode] = useState("");
  const [hari, setHari] = useState(1);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("10:00");
  const [pouch, setPouch] = useState<string[]>([...POUCH_ITEMS]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pesan, setPesan] = useState<Pesan>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setEditingId(null);
    setMatkul("");
    setKode("");
  }

  function ubah(s: ScheduleRow) {
    setEditingId(s.schedule_id);
    setMatkul(s.courses?.course_name ?? "");
    setKode(s.courses?.course_code ?? "");
    setHari(s.day_of_week);
    setStart(hhmm(s.start_time));
    setEnd(hhmm(s.end_time));
    setPouch(s.pouch);
    setPesan({
      text: "Mengubah jadwal yang dipilih. Tekan Simpan untuk menerapkan.",
      ok: true,
    });
    window.scrollTo(0, 0);
  }

  async function onSimpan(e: FormEvent) {
    e.preventDefault();
    const nama = matkul.trim();
    if (!nama)
      return setPesan({
        text: "Gagal: nama mata kuliah wajib diisi.",
        ok: false,
      });
    if (!start || !end || start >= end)
      return setPesan({
        text: "Gagal: jam selesai harus setelah jam mulai.",
        ok: false,
      });
    // Pemeriksaan bentrok di sisi layar (database tetap menjaganya juga)
    const bentrok = (list.data ?? []).find(
      (s) =>
        s.is_active &&
        s.schedule_id !== editingId &&
        s.day_of_week === hari &&
        toMin(start) < toMin(s.end_time) &&
        toMin(end) > toMin(s.start_time),
    );
    if (bentrok)
      return setPesan({
        text: `Gagal: bentrok dengan ${bentrok.courses?.course_name ?? "jadwal lain"} (${hhmm(bentrok.start_time)}–${hhmm(bentrok.end_time)}) pada hari yang sama.`,
        ok: false,
      });

    setBusy(true);
    try {
      const courseId = await ensureCourse(nama, kode, courses.data ?? []);
      await saveSchedule(
        {
          room_id: room.room_id,
          course_id: courseId,
          day_of_week: hari,
          start_time: `${start}:00`,
          end_time: `${end}:00`,
          pouch,
        },
        editingId ?? undefined,
      );
      setPesan({
        text: "Jadwal tersimpan. Bridge meneruskannya ke Node 2 secara otomatis.",
        ok: true,
      });
      reset();
      await Promise.all([list.reload(), courses.reload()]);
    } catch (err) {
      setPesan({ text: gagal(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function aksi(fn: () => Promise<void>) {
    try {
      await fn();
      await list.reload();
    } catch (err) {
      setPesan({ text: gagal(err), ok: false });
    }
  }
  const togglePouch = (v: string) =>
    setPouch((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  const kelas = kelasHariIni(list.data ?? []);

  return (
    <section id="schedule" className="block">
      <div className="flex flex-wrap justify-between items-end gap-[14px] mb-4">
        <div>
          <h2 className="text-[19px] font-bold text-ink m-0 mb-[5px]">
            Konfigurasi jadwal kelas
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            id="sRoom"
            value={room.room_id}
            onChange={(e) => setRoomId(Number(e.target.value))}
            aria-label="Pilih ruang"
            className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink cursor-pointer"
          >
            {rooms.map((r) => (
              <option key={r.room_id} value={r.room_id}>
                {r.room_name}
              </option>
            ))}
          </select>
          <button
            className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 transition-all"
            type="button"
            onClick={() => setTampilRuang((v) => !v)}
          >
            {tampilRuang ? "Batal tambah ruang" : "Tambah ruang"}
          </button>
        </div>
      </div>
      {(list.error || courses.error) && (
        <div className="bg-[#fff5e5] text-[#815414] p-[12px_14px] rounded-[10px] text-xs my-3">
          Gagal memuat data: {list.error ?? courses.error}
        </div>
      )}
      <Notif m={pesanRuang} />

      {tampilRuang && (
        <form
          className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a] mb-4"
          onSubmit={onTambahRuang}
          style={{ marginBottom: 16 }}
        >
          <div className="text-base font-bold text-ink mb-[6px]">
            Tambah ruang
          </div>
          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-[14px] mt-4"
            style={{ marginTop: 15 }}
          >
            <div className="mb-[14px]">
              <label className="block text-xs text-muted mb-[6px]">
                Kode ruang
              </label>
              <input
                value={kodeRuang}
                onChange={(e) => setKodeRuang(e.target.value)}
                placeholder="U-204"
                required
                className="w-full p-[11px] border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
              />
            </div>
            <div className="mb-[14px]">
              <label className="block text-xs text-muted mb-[6px]">
                Nama ruang (opsional)
              </label>
              <input
                value={namaRuang}
                onChange={(e) => setNamaRuang(e.target.value)}
                placeholder="Kelas U-204"
                className="w-full p-[11px] border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
              />
            </div>
            <div className="mb-[14px]">
              <label className="block text-xs text-muted mb-[6px]">
                Kapasitas
              </label>
              <input
                type="number"
                min={1}
                value={kapasitas}
                onChange={(e) => setKapasitas(e.target.value)}
                required
                className="w-full p-[11px] border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
              />
            </div>
          </div>
          <div className="bg-[#fff5e5] text-[#815414] p-[12px_14px] rounded-[10px] text-xs my-3">
            Kode ruang dipakai pada topik MQTT (classroom/&lt;kode&gt;/...).
            Perangkat Node ruang baru perlu disiapkan terpisah.
          </div>
          <button
            className="py-[9px] px-[11px] bg-blue border border-blue text-white rounded-lg font-bold text-xs cursor-pointer hover:brightness-95 transition-all"
            type="submit"
          >
            Simpan ruang
          </button>
        </form>
      )}

      <div
        className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.8fr)] gap-4 mb-4"
        style={{ marginBottom: 16 }}
      >
        <form
          className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]"
          onSubmit={onSimpanAc}
        >
          <div className="text-base font-bold text-ink mb-[6px]">
            Pengaturan AC • {room.room_name}
          </div>
          <div className="text-xs text-muted">
            Ditetapkan sekali untuk ruang ini. AC menyala dan mati pada jam di
            bawah, tidak mengikuti tiap mata kuliah.
          </div>
          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-[14px] mt-4"
            style={{ marginTop: 15 }}
          >
            <div className="mb-[14px]">
              <label className="block text-xs text-muted mb-[6px]">
                Jadwal ON
              </label>
              <input
                type="time"
                value={acOn}
                onChange={(e) => setAcOn(e.target.value)}
                required
                className="w-full p-[11px] border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
              />
            </div>
            <div className="mb-[14px]">
              <label className="block text-xs text-muted mb-[6px]">
                Jadwal OFF
              </label>
              <input
                type="time"
                value={acOff}
                onChange={(e) => setAcOff(e.target.value)}
                required
                className="w-full p-[11px] border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
              />
            </div>
            <div className="mb-[14px]">
              <label className="block text-xs text-muted mb-[6px]">
                Setpoint suhu (°C)
              </label>
              <input
                type="number"
                min={CONFIG.setpointRange.min}
                max={CONFIG.setpointRange.max}
                value={acTemp}
                onChange={(e) => setAcTemp(e.target.value)}
                required
                className="w-full p-[11px] border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
              />
            </div>
            <div className="mb-[14px]">
              <label className="block text-xs mb-[6px] font-semibold text-ink">
                Hari AC aktif
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-1.5">
                {HARI.map((h) => (
                  <label
                    className="flex items-center gap-2 bg-[#f8fafc] border border-line rounded-lg py-[9px] px-3 text-xs cursor-pointer select-none hover:bg-[#eef4fb] hover:border-[#bcd0ea] transition-all"
                    key={h.iso}
                  >
                    <input
                      type="checkbox"
                      checked={acDays.includes(h.iso)}
                      onChange={() => toggleAcDay(h.iso)}
                      className="m-0 w-4 h-4 cursor-pointer accent-[var(--blue)]"
                    />
                    <span>{h.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <button
            className="mt-3.5 py-[9px] px-[11px] bg-blue border border-blue text-white rounded-lg font-bold text-xs cursor-pointer hover:brightness-95 transition-all"
            type="submit"
            style={{ marginTop: 14 }}
          >
            Simpan pengaturan AC
          </button>
          <Notif m={pesanAc} />
        </form>

        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-base font-bold text-ink mb-[6px]">
            Informasi pengaturan AC • {room.room_name}
          </div>
          <div className="flex justify-between gap-3 py-[13px] border-b border-[#eef2f7] text-xs">
            <span>Ruang kelas</span>
            <span className="font-bold">
              {room.room_name} ({room.room_code})
            </span>
          </div>
          <div className="flex justify-between gap-3 py-[13px] border-b border-[#eef2f7] text-xs">
            <span>Hari AC aktif</span>
            <span className="font-bold">{daysLabel(room.ac_days)}</span>
          </div>
          <div className="flex justify-between gap-3 py-[13px] border-b border-[#eef2f7] text-xs">
            <span>Jadwal AC ON/OFF</span>
            <span className="font-bold">
              {hhmm(room.ac_on_time).replace(":", ".")} /{" "}
              {hhmm(room.ac_off_time).replace(":", ".")}
            </span>
          </div>
          <div className="flex justify-between gap-3 py-[13px] border-b border-[#eef2f7] text-xs">
            <span>Setpoint AC</span>
            <span className="font-bold">{Number(room.ac_setpoint_c)} °C</span>
          </div>
          <div className="flex justify-between gap-3 py-[13px] border-b border-[#eef2f7] text-xs">
            <span>Mata kuliah saat ini</span>
            <span className="font-bold">
              {kelas.sedang
                ? `${kelas.sedang.courses?.course_name ?? "-"} (${hhmm(kelas.sedang.start_time).replace(":", ".")} – ${hhmm(kelas.sedang.end_time).replace(":", ".")})`
                : "Tidak ada kelas"}
            </span>
          </div>
          <div className="flex justify-between gap-3 py-[13px] text-xs">
            <span>Kelas berikutnya</span>
            <span className="font-bold">
              {kelas.berikut
                ? `${kelas.berikut.courses?.course_name ?? "-"} • ${hhmm(kelas.berikut.start_time).replace(":", ".")}`
                : "—"}
            </span>
          </div>
          <div className="p-[13px] rounded-[10px] bg-[#e8f7f0] text-teal mt-[17px] text-xs">
            AC ruang {room.room_name} aktif otomatis setiap{" "}
            <strong>{daysLabel(room.ac_days)}</strong> pukul{" "}
            <strong>
              {hhmm(room.ac_on_time).replace(":", ".")} –{" "}
              {hhmm(room.ac_off_time).replace(":", ".")}
            </strong>{" "}
            dengan suhu setpoint{" "}
            <strong>{Number(room.ac_setpoint_c)} °C</strong>.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.8fr)] gap-4">
        <form
          id="scheduleForm"
          className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]"
          onSubmit={onSimpan}
        >
          <div className="text-base font-bold text-ink mb-[6px]">
            {editingId
              ? "Ubah jadwal mata kuliah"
              : "Tambah jadwal mata kuliah"}
          </div>
          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-[14px] mt-4"
            style={{ marginTop: 15 }}
          >
            <div className="mb-[14px]" style={{ gridColumn: "1 / -1" }}>
              <label className="block text-xs text-muted mb-[6px]">
                Mata kuliah
              </label>
              <input
                list="daftarMatkul"
                value={matkul}
                onChange={(e) => setMatkul(e.target.value)}
                placeholder="Nama mata kuliah"
                required
                className="w-full p-[11px] border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
              />
              <datalist id="daftarMatkul">
                {(courses.data ?? []).map((c) => (
                  <option key={c.course_id} value={c.course_name} />
                ))}
              </datalist>
            </div>
            <div className="mb-[14px]">
              <label className="block text-xs text-muted mb-[6px]">
                Kode mata kuliah (opsional)
              </label>
              <input
                value={kode}
                onChange={(e) => setKode(e.target.value)}
                placeholder="EL3101"
                className="w-full p-[11px] border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
              />
            </div>
            <div className="mb-[14px]">
              <label className="block text-xs text-muted mb-[6px]">Hari</label>
              <select
                id="sDay"
                value={hari}
                onChange={(e) => setHari(Number(e.target.value))}
                className="w-full p-[11px] border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue cursor-pointer"
              >
                {HARI.map((h) => (
                  <option key={h.iso} value={h.iso}>
                    {h.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-[14px]">
              <label className="block text-xs text-muted mb-[6px]">
                Jam mulai
              </label>
              <input
                id="sStart"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
                className="w-full p-[11px] border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
              />
            </div>
            <div className="mb-[14px]">
              <label className="block text-xs text-muted mb-[6px]">
                Jam selesai
              </label>
              <input
                id="sEnd"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
                className="w-full p-[11px] border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
              />
            </div>
            <div
              className="mb-[14px] mt-1.5"
              style={{ gridColumn: "1 / -1", marginTop: 6 }}
            >
              <label className="block text-xs mb-[6px] font-semibold text-ink">
                Kelengkapan Pouch Kelas
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 mt-1.5">
                {POUCH_ITEMS.map((p) => (
                  <label
                    className="flex items-center gap-2 bg-[#f8fafc] border border-line rounded-lg py-[9px] px-3 text-xs cursor-pointer select-none hover:bg-[#eef4fb] hover:border-[#bcd0ea] transition-all"
                    key={p}
                  >
                    <input
                      type="checkbox"
                      value={p}
                      checked={pouch.includes(p)}
                      onChange={() => togglePouch(p)}
                      className="m-0 w-4 h-4 cursor-pointer accent-[var(--blue)]"
                    />
                    <span>{p}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-[#fff5e5] text-[#815414] p-[12px_14px] rounded-[10px] text-xs my-3">
            Beberapa mata kuliah dapat dijadwalkan pada hari yang sama di ruang
            yang sama selama jamnya tidak bentrok. Pintu terbuka saat kuliah
            mulai dan terkunci saat selesai.
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="py-[9px] px-[11px] bg-blue border border-blue text-white rounded-lg font-bold text-xs cursor-pointer hover:brightness-95 disabled:opacity-60 transition-all"
              type="submit"
              disabled={busy}
            >
              {busy
                ? "Menyimpan…"
                : editingId
                  ? "Simpan perubahan"
                  : "Simpan jadwal"}
            </button>
            {editingId && (
              <button
                className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 transition-all"
                type="button"
                onClick={() => {
                  reset();
                  setPesan(null);
                }}
              >
                Batal ubah
              </button>
            )}
          </div>
          <div id="scheduleMessage">
            <Notif m={pesan} />
          </div>
        </form>

        <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
          <div className="text-base font-bold text-ink mb-[6px]">
            Jadwal mata kuliah • {room.room_name}
          </div>
          <div className="flex justify-between gap-3 py-[13px] border-b border-[#eef2f7] text-xs">
            <span>Jadwal AC ON/OFF</span>
            <span className="font-bold">
              {hhmm(room.ac_on_time).replace(":", ".")} /{" "}
              {hhmm(room.ac_off_time).replace(":", ".")}
            </span>
          </div>
          <div className="flex justify-between gap-3 py-[13px] border-b border-[#eef2f7] text-xs">
            <span>Setpoint AC</span>
            <span className="font-bold">
              {Number(room.ac_setpoint_c)} °C ({daysLabel(room.ac_days)})
            </span>
          </div>
          {(list.data ?? []).length === 0 && !list.loading && (
            <div className="p-[35px] text-center text-muted text-[13px]">
              Belum ada jadwal untuk ruang ini.
            </div>
          )}
          {HARI.map((h) => {
            const hariIni = (list.data ?? []).filter(
              (s) => s.day_of_week === h.iso,
            );
            if (hariIni.length === 0) return null;
            return (
              <div key={h.iso}>
                <div className="text-xs font-extrabold text-muted tracking-[0.5px] uppercase mt-3.5 mb-1">
                  {h.label}
                </div>
                {hariIni.map((s) => (
                  <div
                    key={s.schedule_id}
                    className={
                      "py-3 border-b border-[#eef2f7] last:border-b-0" +
                      (s.is_active ? "" : " opacity-55")
                    }
                  >
                    <div className="flex justify-between gap-3 py-[13px] border-b border-[#eef2f7] text-xs">
                      <span>Mata kuliah</span>
                      <span className="font-bold">
                        {s.courses?.course_name ?? "-"}
                        {s.courses?.course_code
                          ? ` (${s.courses.course_code})`
                          : ""}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3 py-[13px] border-b border-[#eef2f7] text-xs">
                      <span>Jam kuliah</span>
                      <span className="font-bold">
                        {hhmm(s.start_time)}–{hhmm(s.end_time)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3 py-[13px] border-b border-[#eef2f7] text-xs">
                      <span>Kelengkapan Pouch</span>
                      <span className="font-bold">
                        {s.pouch.length
                          ? s.pouch.join(", ")
                          : "Tidak ada (Kosong)"}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <button
                        className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 transition-all"
                        type="button"
                        onClick={() => ubah(s)}
                      >
                        Ubah
                      </button>
                      <button
                        className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 transition-all"
                        type="button"
                        onClick={() =>
                          void aksi(() =>
                            setScheduleActive(s.schedule_id, !s.is_active),
                          )
                        }
                      >
                        {s.is_active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                      {isAdmin && (
                        <button
                          className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 transition-all"
                          type="button"
                          onClick={() => {
                            if (window.confirm("Hapus jadwal ini?"))
                              void aksi(() => deleteSchedule(s.schedule_id));
                          }}
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
