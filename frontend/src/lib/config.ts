/**
 * Semua nilai yang mungkin perlu Anda sesuaikan berada di sini.
 * Setiap butir diberi tanda ">>> UBAH MANUAL" bila bergantung pada keputusan tim atau lokasi.
 */
export const CONFIG = {
  // >>> UBAH MANUAL: nama aplikasi pada sidebar tidak dipakai (teks brand mengikuti prototipe).
  timeZone: "Asia/Jakarta", // >>> UBAH MANUAL bila lokasi bukan WIB (harus sama dengan view SQL 0003_views.sql)

  // Data dianggap kedaluwarsa bila lebih tua dari ini (detik).
  // >>> UBAH MANUAL: samakan dengan ambang pada view node_health (90 detik = 3x heartbeat 30 detik).
  staleSeconds: 90,

  // Zona nyaman suhu (SNI 03-6572-2001, daerah tropis). >>> UBAH MANUAL bila acuan tim berbeda.
  comfortRange: { min: 22.8, max: 25.8 },

  // Rentang setpoint AC yang diterima formulir jadwal (prototipe: 16-30).
  // >>> UBAH MANUAL: harus sama dengan CHECK pada kolom schedules.setpoint_c di database.
  setpointRange: { min: 16, max: 30 },

  // Jam yang tampil pada grafik tren energi di Dashboard (prototipe: 06 sampai 17).
  chartHours: { from: 6, to: 17 },
  chartTicks: [6, 8, 10, 12, 14, 16, 17],

  // Batas waktu menunggu konfirmasi (ack) perintah pintu, milidetik.
  // >>> UBAH MANUAL: sebaiknya sedikit di atas ACK_TIMEOUT_S bridge (15 detik).
  commandTimeoutMs: 20000,

  // Jumlah baris pada tabel Riwayat.
  historyLimit: 15,
};
