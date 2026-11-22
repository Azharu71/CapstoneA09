# Frontend SIRENA: Sistem Integrasi Ruang dan Energi Berkelanjutan

Dashboard web SIRENA (Sistem Integrasi Ruang dan Energi Berkelanjutan) (CPE103): React + Vite + TypeScript + Tailwind + Recharts, data dari Supabase.
Tampilan mengikuti `Prototipe_Dashboard_CPE103_Revisi.html`; datanya kini nyata (bukan simulasi).

> **Status:** kode ditulis lengkap, sintaks seluruh 32 berkas TS/TSX sudah diperiksa, dan semua kelas CSS yang dipakai terdefinisi.
> Namun **belum pernah dijalankan** (`npm install`, `npm run build`, dan tampilan di browser belum diuji karena tidak ada koneksi internet saat dibuat). Lakukan "Uji pertama" (bagian 6) sebelum mengandalkannya.

---

## 1. Prasyarat
- Node.js 20 LTS atau lebih baru dan npm (`node -v`).
- Database Supabase sudah disiapkan dengan migrasi `0001`, `0002`, `0003` dan `seed.sql` (dari paket `sirena-kit` / `smart-classroom-kit`).
- Tiga akun Supabase Auth: admin, operator, bridge (lihat bagian 3).

## 2. Setup lokal
```bash
unzip frontend.zip && cd frontend
npm install
cp .env.example .env        # lalu isi dua nilai di bawah
npm run dev                 # buka http://localhost:5173
```
Isi `.env` dari **Supabase > Project Settings > API**:
```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<anon / publishable key>
```
Hanya anon key. **Jangan** memasukkan `service_role` key ke frontend; keamanan data dijaga oleh RLS di database.

Perintah lain: `npm run typecheck` (periksa tipe), `npm run build` (hasil di `dist/`), `npm run preview`.
Jika `npm install` mengeluh soal versi paket, jalankan `npm install --legacy-peer-deps` dan kabari saya pesan errornya.

## 3. Prasyarat di Supabase (sekali saja)
1. Jalankan migrasi (`0001` sampai `0005`) dan seed: `npx supabase db push`, lalu `seed.sql` di SQL Editor. Migrasi `0005` mengubah ruang U-203 menjadi **U-203**, menambah tabel mata kuliah, memindahkan pengaturan AC ke tabel ruang, dan **menghapus jadwal lama** (data uji).
2. Authentication > Providers: matikan signup publik. Buat user (admin, operator, bridge) di Authentication > Users.
3. Aktifkan profil di SQL Editor (profil dibuat otomatis dengan `is_active = false`; tanpa ini login ditolak dengan pesan "Akun belum diaktifkan"):
```sql
update public.profiles set role = 'admin',    is_active = true where id = (select id from auth.users where email = 'admin@contoh.ac.id');
update public.profiles set role = 'operator', is_active = true where id = (select id from auth.users where email = 'operator@contoh.ac.id');
```
4. Authentication > URL Configuration: isi **Site URL** dengan alamat Netlify (setelah deploy) dan tambahkan `http://localhost:5173` pada Redirect URLs untuk pengembangan.
5. Realtime: sudah diaktifkan oleh migrasi `0001` untuk `occupancy, energy_read, env_read, device_state, node_status, commands`. Cek di Database > Replication bila dashboard tidak memperbarui diri.

## 4. Struktur folder
```
frontend/
├── .env.example            # isi menjadi .env
├── netlify.toml            # build + redirect SPA
├── index.html, vite.config.ts, tsconfig.json, package.json
└── src/
    ├── main.tsx, App.tsx   # rute: /login, /, /okupansi, /energi, /jadwal, /riwayat
    ├── styles/
    │   ├── prototype.css   # CSS prototipe, disalin apa adanya (JANGAN diubah)
    │   ├── extra.css       # tambahan kecil (login, error, daftar jadwal)
    │   └── index.css       # Tailwind tanpa preflight + impor dua berkas di atas
    ├── lib/                # config.ts (konstanta), supabase.ts, time.ts, schedule.ts, activeSchedule.ts
    ├── types/database.ts   # tipe baris tabel/view
    ├── data/               # SEMUA panggilan Supabase (rooms, latest, energy, occupancy, schedules, commands, history)
    ├── hooks/              # useAuth, useRoom, useQuery, useRealtime, useNow
    ├── components/         # Shell, Layout, Sidebar, Topbar, EnergyTrendChart
    └── pages/              # Login, Dashboard, Occupancy, Energy, Schedule, History
```

## 5. Titik yang perlu Anda ubah manual
Semua ditandai komentar `>>> UBAH MANUAL` di kodenya. Daftar lengkap:

| # | Lokasi | Yang diubah | Kapan |
|---|---|---|---|
| 1 | `.env` dan Netlify > Environment variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | **Wajib** |
| 2 | Supabase > Auth > URL Configuration | Site URL = alamat Netlify | Wajib sebelum deploy |
| 3 | `src/lib/config.ts` | `timeZone`, `staleSeconds` (samakan dengan 90 detik di view `node_health`), `comfortRange` (22,8-25,8 °C), `setpointRange` (16-30), `chartHours`/`chartTicks`, `commandTimeoutMs`, `historyLimit` | Sesuai keputusan tim |
| 4 | `src/data/*.ts` | Nama tabel, view, dan kolom (`rooms`, `room_latest`, `node_health`, `energy_hourly/weekly/monthly`, `occupancy_hourly`, `occupancy`, `cv_models`, `schedules`, `commands`, `audit_log`, `energy_read`) | Hanya bila skema SQL diubah |
| 5 | `src/types/database.ts` | Tipe baris; opsional ganti dengan `npx supabase gen types typescript --linked` | Bila skema berubah |
| 6 | `src/data/commands.ts` | Payload perintah (`{action: "lock" \| "unlock"}`); tambahkan tipe `light`/`ac` bila dipakai | Bila kontrak MQTT berubah |
| 7 | `src/data/occupancy.ts` | Teks nama model pada tabel Okupansi (kini `model_name` dari `cv_models`) | Opsional |
| 8 | `src/lib/schedule.ts` | `HARI` (Senin sampai Sabtu; tambah Minggu bila perlu) dan `POUCH_ITEMS` (**harus sama** dengan enum `pouch_item`) | Bila pilihan berubah |
| 9 | `src/components/Sidebar.tsx` | `TABS` (menu) dan `NODE_GROUPS` (Node 1 = node1cv + node1ir) | Bila menu/Node berubah |
| 10 | `src/pages/Energy.tsx` | `FREQ_OK` (batas frekuensi "Stabil") | Opsional |
| 11 | `src/hooks/useAuth.tsx` | Pesan akun belum aktif | Opsional |
| 12 | `netlify.toml` / pengaturan Netlify | Base directory = `frontend` | Saat deploy |

## 6. Uji pertama (urutan disarankan)
1. `npm run typecheck` dan `npm run dev` tanpa error.
2. Buka `/login`: kredensial salah menampilkan pesan; akun admin masuk ke Dashboard.
3. Tanpa data, halaman menampilkan "—"/"Belum ada data", bukan error.
4. Isi data uji lewat SQL Editor (menggantikan Node untuk sementara):
```sql
insert into node_status (room_id,node,online,last_seen)
  select r.room_id, n, true, now() from rooms r, unnest(array['node1cv','node1ir','node2','node3']) n
  where r.room_code='U-203' on conflict (room_id,node) do update set online=true, last_seen=now();
insert into occupancy (room_id,model_id,detected_at,person_count,occupied,inference_fps,processing_ms)
  select r.room_id,(select model_id from cv_models limit 1),now(),24,true,9.5,105 from rooms r where r.room_code='U-203';
insert into env_read (room_id,measured_at,temperature_c,humidity_rh)
  select room_id, now(), 24.2, 60 from rooms where room_code='U-203';
insert into energy_read (room_id,measured_at,voltage_v,current_a,active_power_w,energy_kwh,frequency_hz,power_factor)
  select room_id, now(), 220, 5.7, 1250, 12.3, 50, 0.98 from rooms where room_code='U-203';
insert into device_state (room_id,key,value)
  select room_id,'door','{"locked":true,"door_closed":true}'::jsonb from rooms where room_code='U-203'
  on conflict (room_id,key) do update set value=excluded.value, updated_at=now();
```
   Kartu Dashboard terisi. Energi per jam baru bermakna bila ada minimal dua pembacaan (selisih kumulatif).
5. Dengan bridge + broker berjalan, data yang sama bisa dikirim lewat `mosquitto_pub` (lihat panduan Pi) dan dashboard ikut berubah tanpa refresh (Realtime).
6. Tombol **Buka Pintu** membuat baris di `commands`. Tanpa bridge/Node 2, tombol menunggu lalu menampilkan "Perintah gagal: …" (bridge menandai `tanpa ack` setelah 15 detik; frontend berhenti menunggu pada `commandTimeoutMs`).
7. Ruang dan jadwal: tambah ruang (mis. U-204); atur AC ruang (ON/OFF, setpoint, hari); tambah dua mata kuliah pada hari yang sama dengan jam berurutan, lalu coba satu yang bentrok (harus ditolak). Cek `select type, status from commands order by id desc limit 5;` (perintah `schedule` dan `ac_config` dibuat oleh trigger) dan `audit_log` (admin).
8. Login sebagai operator: menu **Audit** tidak muncul pada Riwayat dan tombol **Hapus** jadwal tidak ada.

## 7. Deploy ke Netlify
1. Push repo ke GitHub. Netlify > Add new site > Import from Git.
2. **Base directory:** `frontend`. Build command `npm run build`, publish directory `dist` (sudah di `netlify.toml`).
3. Site settings > Environment variables: isi dua variabel `VITE_...`.
4. Deploy, lalu isi **Site URL** Supabase dengan alamat Netlify (bagian 3 butir 4). Setelah deploy pertama, pastikan path publish benar (jika halaman kosong, periksa Base directory).
5. Redirect SPA (`/* -> /index.html`) sudah ada, jadi refresh pada `/energi` tidak 404.

## 8. Fungsi tiap berkas
| Berkas | Fungsi |
|---|---|
| `lib/supabase.ts` | `supabase` (klien), `unwrap()` mengubah respons menjadi data atau Error |
| `lib/time.ts` | `todayLocal`, `addDays`, `isoDow`, `minutesNow`, `fmtClock`, `fmtDateLong`, `parseLocal`, `hourRange`, `weekRange`, `monthLabel`, `agoText` (semua memakai zona `CONFIG.timeZone`) |
| `lib/activeSchedule.ts` | `kelasHariIni()` mata kuliah yang sedang berlangsung, berikutnya, dan seluruh jadwal hari ini (kartu "Jadwal ruang") |
| `data/rooms.ts` | `fetchRooms()` (termasuk pengaturan AC), `addRoom()` (operator boleh menambah ruang), `saveRoomAc()` |
| `data/courses.ts` | `fetchCourses()`, `ensureCourse()` (membuat mata kuliah bila belum ada) |
| `data/latest.ts` | `fetchRoomLatest()` (kartu Dashboard), `fetchNodeHealth()` (sidebar) |
| `data/energy.ts` | `fetchEnergy(room, period)`, `fetchEnergyChart(room)` |
| `data/occupancy.ts` | `fetchOccupancyHourly`, `fetchLatestOccupancy`, `fetchActiveModelName` |
| `data/schedules.ts` | `fetchSchedules` (dengan nama mata kuliah), `saveSchedule` (insert/update; pesan bentrok dibuat ramah), `setScheduleActive`, `deleteSchedule` (admin) |
| `data/commands.ts` | `sendDoorCommand()` menulis ke `commands`; `waitCommand()` polling status sampai selesai/gagal |
| `data/history.ts` | `fetchHistory()` menggabungkan occupancy, energy_read, schedules, dan audit_log (admin) |
| `hooks/useAuth.tsx` | Login/logout, muat profil dan role, blokir akun nonaktif |
| `hooks/useRoom.tsx` | Daftar dan pilihan ruang yang dipakai semua halaman |
| `hooks/useQuery.ts` | Memuat data: `{data, error, loading, reload}` |
| `hooks/useRealtime.ts` | Memuat ulang data saat tabel berubah (Supabase Realtime) |
| `hooks/useNow.ts` | Jam berjalan untuk "x detik lalu" dan penanda data kedaluwarsa |
| `components/Shell.tsx` | Penjaga rute (harus login dan profil aktif) |
| `components/Sidebar.tsx` | Menu dan status ONLINE/OFFLINE Node (dinamis) |
| `components/EnergyTrendChart.tsx` | Grafik tren energi (Recharts) |
| `pages/*` | Lima halaman sesuai prototipe, plus Login |

Sesi aplikasi dibatasi maksimal 2 jam sejak login dan batas ini tidak diperpanjang oleh refresh access token. Batas disimpan di browser agar tetap diperiksa setelah browser dibuka kembali. Sesi lama yang belum memiliki batas ini akan diminta login ulang. Ini adalah batas sisi aplikasi pada Supabase Free; access token yang sudah terbit tetap berlaku sampai JWT kedaluwarsa.

## 9. Kesetiaan terhadap prototipe dan perbedaannya
**Dijaga sama:** seluruh CSS prototipe disalin apa adanya ke `prototype.css`; kelas, struktur markup, label, urutan kartu, warna, dan nilai awal formulir mengikuti HTML. Tailwind dipasang **tanpa preflight** supaya reset bawaannya tidak mengubah tampilan.
**Belum diverifikasi:** saya tidak dapat merender aplikasi di sini. Bandingkan berdampingan dengan file prototipe di browser; selisih yang paling mungkin ada pada grafik karena SVG statis diganti Recharts (warna, garis, titik, dan label sumbu disamakan).

Perbedaan yang disengaja (karena data kini nyata):
- Halaman **Login** dan tombol **Keluar** di topbar (memakai kelas `.pill` dan `.btn` yang sudah ada). Ruang dipilih dari database dan dibagi antar-halaman.
- Teks "simulasi" diganti: label sidebar, badge Jadwal ("Tersambung ke database"), tombol "Muat ulang", catatan kaki, dan catatan validasi.
- Status Node di sidebar dinamis; Node 1 dianggap ONLINE bila Node 1 CV dan Node 1 IR hidup (SEBAGIAN bila hanya satu).
- Tombol pintu mengirim perintah ke Node dan berubah setelah Node mengonfirmasi (bukan beralih seketika).
- Halaman **Jadwal Kelas** disusun ulang menjadi tiga bagian: pilih atau tambah ruang, pengaturan AC ruang (sekali per ruang), dan jadwal mata kuliah per hari (dropdown Senin sampai Sabtu; beberapa mata kuliah per hari selama tidak bentrok). Isian yang diminta adalah **nama mata kuliah**, bukan nama ruang.
- Riwayat: pilihan **Audit** khusus Administrator. Data prototipe ruang B-105 dan sensor DHT22 dihapus (sensor yang dipakai SHT31).
- Data lebih tua dari 90 detik ditandai "Data kedaluwarsa" dan tidak ditampilkan sebagai kondisi terbaru (WEB-BB-06).

## 10. Pemecahan masalah
| Gejala | Penyebab umum |
|---|---|
| Layar putih, error "VITE_SUPABASE_URL ... belum diisi" | `.env` belum dibuat atau server dev belum di-restart |
| Login berhasil lalu kembali ke login, pesan "Akun belum diaktifkan" | `profiles.is_active` masih false (bagian 3 butir 3) |
| Semua data kosong padahal tabel terisi | Akun tidak aktif atau RLS menolak; periksa `profiles` dan jalankan `0002_rls.sql` |
| Error "relation ... does not exist" atau "column ... does not exist" | Migrasi belum di-push atau nama kolom di `src/data` berbeda dengan skema |
| Dashboard tidak memperbarui sendiri | Realtime belum aktif untuk tabel (bagian 3 butir 5) |
| Node selalu OFFLINE | Bridge belum berjalan atau Node belum mengirim heartbeat 30 detik |
| Refresh pada `/energi` 404 di Netlify | `netlify.toml` tidak terbaca; periksa Base directory |
| Jadwal tersimpan tetapi Node tidak menerima | Bridge belum berjalan (perintah `schedule` menunggu di tabel `commands`) |
