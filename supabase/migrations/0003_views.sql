-- =====================================================================
-- 0003_views.sql
-- View untuk dashboard. Semua memakai security_invoker sehingga RLS tabel
-- dasar tetap berlaku untuk pengguna yang memanggil. Bucket waktu memakai
-- zona Asia/Jakarta (kolom bucket_local bertipe timestamp tanpa zona).
-- =====================================================================

-- ---------- Selisih energi per pembacaan ----------
-- PZEM menyimpan energi kumulatif. Selisih antar pembacaan lebih akurat daripada
-- max - min per jam. Jika nilai turun (counter di-reset), selisih = nilai baru.
create view public.energy_delta with (security_invoker = true) as
select room_id,
       measured_at,
       voltage_v,
       current_a,
       frequency_hz,
       active_power_w,
       case
         when prev_kwh is null     then 0
         when energy_kwh >= prev_kwh then energy_kwh - prev_kwh
         else energy_kwh
       end as delta_kwh
from (
  select e.*,
         lag(e.energy_kwh) over (partition by e.room_id order by e.measured_at) as prev_kwh
  from public.energy_read e
) t;

-- ---------- Halaman Konsumsi Energi ----------
create view public.energy_hourly with (security_invoker = true) as
select room_id,
       date_trunc('hour', measured_at at time zone 'Asia/Jakarta') as bucket_local,
       round(avg(voltage_v)::numeric, 1)       as voltage_v,
       round(avg(current_a)::numeric, 2)       as current_a,
       round(avg(frequency_hz)::numeric, 1)    as frequency_hz,
       round(avg(active_power_w)::numeric, 1)  as active_power_w,
       round(sum(delta_kwh)::numeric, 3)       as energy_kwh,
       count(*)                                as samples
from public.energy_delta
group by room_id, 2;

create view public.energy_daily with (security_invoker = true) as
select room_id,
       date_trunc('day', measured_at at time zone 'Asia/Jakarta') as bucket_local,
       round(avg(voltage_v)::numeric, 1)       as voltage_v,
       round(avg(current_a)::numeric, 2)       as current_a,
       round(avg(frequency_hz)::numeric, 1)    as frequency_hz,
       round(avg(active_power_w)::numeric, 1)  as active_power_w,
       round(sum(delta_kwh)::numeric, 3)       as energy_kwh,
       count(*)                                as samples
from public.energy_delta
group by room_id, 2;

-- Minggu dimulai hari Senin.
create view public.energy_weekly with (security_invoker = true) as
select room_id,
       date_trunc('week', measured_at at time zone 'Asia/Jakarta') as bucket_local,
       round(avg(voltage_v)::numeric, 1)       as voltage_v,
       round(avg(current_a)::numeric, 2)       as current_a,
       round(avg(frequency_hz)::numeric, 1)    as frequency_hz,
       round(avg(active_power_w)::numeric, 1)  as active_power_w,
       round(sum(delta_kwh)::numeric, 3)       as energy_kwh,
       count(*)                                as samples
from public.energy_delta
group by room_id, 2;

create view public.energy_monthly with (security_invoker = true) as
select room_id,
       date_trunc('month', measured_at at time zone 'Asia/Jakarta') as bucket_local,
       round(avg(voltage_v)::numeric, 1)       as voltage_v,
       round(avg(current_a)::numeric, 2)       as current_a,
       round(avg(frequency_hz)::numeric, 1)    as frequency_hz,
       round(avg(active_power_w)::numeric, 1)  as active_power_w,
       round(sum(delta_kwh)::numeric, 3)       as energy_kwh,
       count(*)                                as samples
from public.energy_delta
group by room_id, 2;

-- ---------- Halaman Okupansi (interval 1 jam) ----------
create view public.occupancy_hourly with (security_invoker = true) as
select room_id,
       date_trunc('hour', detected_at at time zone 'Asia/Jakarta') as bucket_local,
       round(avg(person_count)::numeric, 1)   as avg_count,
       max(person_count)                      as max_count,
       bool_or(occupied)                      as occupied,
       round(avg(inference_fps)::numeric, 1)  as avg_fps,
       count(*)                               as samples
from public.occupancy
group by room_id, 2;

-- ---------- Indikator ONLINE/OFFLINE di sidebar ----------
-- Node dianggap hidup jika online dan terakhir terlihat < 90 detik lalu
-- (3 kali heartbeat 30 detik). Ubah ambang di sini bila interval berubah.
create view public.node_health with (security_invoker = true) as
select room_id,
       node,
       online,
       last_seen,
       coalesce(online and last_seen > now() - interval '90 seconds', false) as is_alive
from public.node_status;

-- ---------- Kartu ringkasan dashboard ----------
-- Satu baris per ruang berisi nilai terbaru. Frontend membandingkan *_at
-- dengan jam sekarang untuk menandai data kedaluwarsa (WEB-BB-06).
create view public.room_latest with (security_invoker = true) as
select r.room_id,
       r.room_code,
       r.room_name,
       o.person_count,
       o.occupied,
       o.detected_at    as occupancy_at,
       e.temperature_c,
       e.humidity_rh,
       e.measured_at    as env_at,
       p.active_power_w,
       p.energy_kwh,
       p.measured_at    as power_at,
       (select value from public.device_state d where d.room_id = r.room_id and d.key = 'door')  as door_state,
       (select value from public.device_state d where d.room_id = r.room_id and d.key = 'light') as light_state,
       (select value from public.device_state d where d.room_id = r.room_id and d.key = 'ac')    as ac_state
from public.rooms r
left join lateral (select * from public.occupancy  where room_id = r.room_id order by detected_at  desc limit 1) o on true
left join lateral (select * from public.env_read    where room_id = r.room_id order by measured_at  desc limit 1) e on true
left join lateral (select * from public.energy_read where room_id = r.room_id order by measured_at  desc limit 1) p on true;

-- ---------- Hak akses view ----------
do $$
declare
  v text;
begin
  foreach v in array array[
    'energy_delta', 'energy_hourly', 'energy_daily', 'energy_weekly',
    'energy_monthly', 'occupancy_hourly', 'node_health', 'room_latest'
  ] loop
    execute format('revoke all on public.%I from anon', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;
