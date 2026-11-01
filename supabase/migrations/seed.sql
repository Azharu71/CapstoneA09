-- =====================================================================
-- seed.sql
-- Data awal untuk satu ruangan demo (A-203). `supabase db reset` menjalankan
-- berkas ini otomatis di lingkungan lokal; di project cloud, jalankan lewat
-- SQL Editor setelah `supabase db push`.
-- =====================================================================

insert into public.rooms (room_code, room_name, capacity)
values ('A-203', 'Kelas A-203', 40)          -- sesuaikan kapasitas sebenarnya
on conflict (room_code) do nothing;

insert into public.cv_models (model_name, model_version, confidence_threshold, input_size)
values ('yolo26n', 'v1', 0.5, '640x640')      -- model_name harus sama dengan field `model` pada payload okupansi
on conflict (model_name, model_version) do nothing;

insert into public.node_status (room_id, node, online)
select r.room_id, n, false
from public.rooms r
cross join unnest(array['node1cv', 'node1ir', 'node2', 'node3']) as n
where r.room_code = 'A-203'
on conflict (room_id, node) do nothing;

-- =====================================================================
-- BOOTSTRAP AKUN (jalankan manual, ganti email)
-- Langkah: buat user di Authentication > Users (signup publik dimatikan),
-- profil terbentuk otomatis dengan is_active = false, lalu aktifkan:
-- =====================================================================
-- update public.profiles
--    set role = 'admin', is_active = true, name = 'Nama Admin'
--  where id = (select id from auth.users where email = 'admin@contoh.ac.id');
--
-- update public.profiles
--    set role = 'operator', is_active = true, name = 'Nama Operator'
--  where id = (select id from auth.users where email = 'operator@contoh.ac.id');
--
-- -- Akun bridge: tidak diaktifkan sebagai pengguna, hanya didaftarkan.
-- insert into public.bridge_accounts (user_id)
-- select id from auth.users where email = 'bridge@contoh.ac.id';
