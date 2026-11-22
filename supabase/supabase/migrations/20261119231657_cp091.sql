-- =====================================================================
-- 0001_init_schema.sql
-- Skema Terpadu Sistem Kelas Terintegrasi (CPE103) - Database Baru
-- Mencakup: Schema dasar, RLS, Views, Mata Kuliah, Pengaturan AC per Ruang,
--           serta Optimasi Pengurangan Log Ingestion (Realtime & Deduplikasi).
-- =====================================================================

-- ---------- Ekstensi ----------
create extension if not exists btree_gist;

-- ---------- Tipe enum ----------
create type public.user_role      as enum ('admin', 'operator');
create type public.command_type   as enum ('door', 'light', 'ac', 'schedule', 'ac_config');
create type public.command_status as enum ('pending', 'sent', 'done', 'failed');
create type public.pouch_item     as enum ('Spidol', 'Penghapus', 'Remote TV', 'Kabel VGA');

-- ---------- Fungsi umum ----------
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Pengguna ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  role        public.user_role not null default 'operator',
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.bridge_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Master Ruang & Model CV ----------
create table public.rooms (
  room_id       int generated always as identity primary key,
  room_code     text not null unique check (room_code ~ '^[A-Za-z0-9][A-Za-z0-9-]*$'),
  room_name     text not null,
  capacity      int  not null check (capacity > 0),
  ac_on_time    time         not null default '07:00',
  ac_off_time   time         not null default '17:00',
  ac_setpoint_c numeric(3,1) not null default 24 check (ac_setpoint_c between 16 and 30),
  ac_days       smallint[]   not null default '{1,2,3,4,5,6}',
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now(),
  constraint rooms_ac_interval_ok check (ac_on_time < ac_off_time),
  constraint rooms_ac_days_ok check (cardinality(ac_days) > 0
                                     and ac_days <@ array[1,2,3,4,5,6,7]::smallint[])
);

create trigger rooms_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

create table public.cv_models (
  model_id              int generated always as identity primary key,
  model_name            text not null,
  model_version         text not null,
  confidence_threshold  real not null check (confidence_threshold between 0 and 1),
  input_size            text not null default '640x640',
  deployed_at           timestamptz not null default now(),
  is_active             boolean not null default true,
  unique (model_name, model_version)
);

-- ---------- Mata Kuliah & Jadwal ----------
create table public.courses (
  course_id    int generated always as identity primary key,
  course_code  text,
  course_name  text not null check (length(trim(course_name)) > 0),
  created_at   timestamptz not null default now()
);

create unique index courses_name_uq on public.courses (lower(trim(course_name)));
create unique index courses_code_uq on public.courses (lower(trim(course_code)))
  where course_code is not null and trim(course_code) <> '';

create table public.schedules (
  schedule_id  int generated always as identity primary key,
  room_id      int      not null references public.rooms (room_id) on delete cascade,
  course_id    int      not null references public.courses (course_id) on delete restrict,
  day_of_week  smallint not null check (day_of_week between 1 and 7),
  start_time   time     not null,
  end_time     time     not null,
  start_min    int generated always as
                 (extract(hour from start_time)::int * 60 + extract(minute from start_time)::int) stored,
  end_min      int generated always as
                 (extract(hour from end_time)::int * 60 + extract(minute from end_time)::int) stored,
  pouch        public.pouch_item[] not null default '{}',
  is_active    boolean     not null default true,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (start_time < end_time),
  constraint schedules_no_overlap exclude using gist (
    room_id with =, day_of_week with =, int4range(start_min, end_min) with &&
  ) where (is_active)
);

create index schedules_room_day_idx on public.schedules (room_id, day_of_week, start_time);

create trigger schedules_updated_at
  before update on public.schedules
  for each row execute function public.set_updated_at();

-- ---------- Data Telemetri (Ditulis Bridge) ----------
create table public.occupancy (
  detection_id    bigint generated always as identity primary key,
  room_id         int not null references public.rooms (room_id) on delete cascade,
  model_id        int not null references public.cv_models (model_id),
  detected_at     timestamptz not null,
  person_count    int  not null check (person_count >= 0),
  occupied        boolean not null,
  avg_confidence  real check (avg_confidence between 0 and 1),
  inference_fps   real check (inference_fps >= 0),
  processing_ms   real check (processing_ms >= 0),
  unique (room_id, detected_at),
  check (occupied = (person_count > 0))
);

create table public.energy_read (
  reading_id      bigint generated always as identity primary key,
  room_id         int not null references public.rooms (room_id) on delete cascade,
  measured_at     timestamptz not null,
  voltage_v       real not null check (voltage_v between 0 and 300),
  current_a       real not null check (current_a >= 0),
  active_power_w  real not null check (active_power_w >= 0),
  energy_kwh      double precision not null check (energy_kwh >= 0),
  frequency_hz    real not null check (frequency_hz between 40 and 70),
  power_factor    real check (power_factor between 0 and 1),
  unique (room_id, measured_at)
);

create table public.env_read (
  reading_id     bigint generated always as identity primary key,
  room_id        int not null references public.rooms (room_id) on delete cascade,
  measured_at    timestamptz not null,
  temperature_c  real not null check (temperature_c between -40 and 125),
  humidity_rh    real check (humidity_rh between 0 and 100),
  unique (room_id, measured_at)
);

-- ---------- Status Terkini (Dengan Anti-Redundant Update) ----------
create table public.device_state (
  room_id     int  not null references public.rooms (room_id) on delete cascade,
  key         text not null check (key in ('door', 'light', 'ac')),
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (room_id, key)
);

create function public.skip_redundant_device_state() returns trigger
language plpgsql as $$
begin
  -- Abaikan penulisan WAL & broadcast Realtime jika payload tanpa 'ts' identik
  if (new.value - 'ts') is not distinct from (old.value - 'ts') then
    return null;
  end if;
  return new;
end $$;

create trigger device_state_skip_redundant
  before update on public.device_state
  for each row execute function public.skip_redundant_device_state();

create table public.node_status (
  room_id    int  not null references public.rooms (room_id) on delete cascade,
  node       text not null check (node in ('node1cv', 'node1ir', 'node2', 'node3')),
  online     boolean not null default false,
  last_seen  timestamptz,
  primary key (room_id, node)
);

create function public.skip_redundant_node_status() returns trigger
language plpgsql as $$
begin
  -- Abaikan update berulang jika status online/offline tidak berubah
  if new.online is not distinct from old.online then
    return null;
  end if;
  return new;
end $$;

create trigger node_status_skip_redundant
  before update on public.node_status
  for each row execute function public.skip_redundant_node_status();

-- ---------- Perintah dan Audit ----------
create table public.commands (
  id          bigint generated always as identity primary key,
  room_id     int not null references public.rooms (room_id) on delete cascade,
  type        public.command_type not null,
  payload     jsonb not null default '{}',
  status      public.command_status not null default 'pending',
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  acked_at    timestamptz,
  error       text,
  constraint commands_payload_ok check (
        (type <> 'door'  or payload ->> 'action' in ('lock', 'unlock'))
    and (type <> 'ac'    or payload ?| array['power', 'setpoint'])
    and (type <> 'light' or payload ?| array['front', 'back'])
  )
);

create index commands_pending_idx on public.commands (created_at) where status = 'pending';

create table public.audit_log (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  room_id     int  references public.rooms (room_id) on delete set null,
  action      text not null,
  detail      jsonb not null default '{}',
  status      text not null default 'success' check (status in ('success', 'rejected', 'failed')),
  created_at  timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);

-- ---------- Trigger Otomatisasi Perintah ke Node ----------
create function public.queue_schedule_command() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_room int;
begin
  for v_room in
    select distinct r from unnest(array[old.room_id, new.room_id]) as r where r is not null
  loop
    insert into public.commands (room_id, type, payload, created_by)
    select v_room,
           'schedule'::public.command_type,
           jsonb_build_object('items', coalesce(jsonb_agg(
             jsonb_build_object(
               'days',   jsonb_build_array(s.day_of_week),
               'start',  left(s.start_time::text, 5),
               'end',    left(s.end_time::text, 5),
               'course', c.course_name
             ) order by s.day_of_week, s.start_time), '[]'::jsonb)),
           auth.uid()
    from public.schedules s
    join public.courses c on c.course_id = s.course_id
    where s.room_id = v_room and s.is_active;
  end loop;
  return null;
end $$;

create trigger schedules_queue_command
  after insert or update or delete on public.schedules
  for each row execute function public.queue_schedule_command();

create function public.queue_ac_config_command() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.commands (room_id, type, payload, created_by)
  values (new.room_id, 'ac_config'::public.command_type,
          jsonb_build_object('days', to_jsonb(new.ac_days),
                             'on', left(new.ac_on_time::text, 5),
                             'off', left(new.ac_off_time::text, 5),
                             'setpoint', new.ac_setpoint_c),
          auth.uid());
  return null;
end $$;

create trigger rooms_queue_ac_config
  after insert or update of ac_on_time, ac_off_time, ac_setpoint_c, ac_days on public.rooms
  for each row execute function public.queue_ac_config_command();

-- ---------- Trigger Audit Log ----------
create function public.audit_schedules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (user_id, room_id, action, detail, status)
  values (
    auth.uid(),
    case when tg_op = 'DELETE' then old.room_id else new.room_id end,
    'schedule.' || lower(tg_op),
    to_jsonb(case when tg_op = 'DELETE' then old else new end),
    'success'
  );
  return null;
end $$;

create trigger schedules_audit
  after insert or update or delete on public.schedules
  for each row execute function public.audit_schedules();

create function public.audit_rooms() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (user_id, room_id, action, detail, status)
  values (
    auth.uid(),
    case when tg_op = 'DELETE' then null else new.room_id end,
    'room.' || lower(tg_op),
    to_jsonb(case when tg_op = 'DELETE' then old else new end),
    'success'
  );
  return null;
end $$;

create trigger rooms_audit
  after insert or update or delete on public.rooms
  for each row execute function public.audit_rooms();

create function public.audit_courses() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (user_id, action, detail, status)
  values (
    auth.uid(),
    'course.' || lower(tg_op),
    to_jsonb(case when tg_op = 'DELETE' then old else new end),
    'success'
  );
  return null;
end $$;

create trigger courses_audit
  after insert or update or delete on public.courses
  for each row execute function public.audit_courses();

create function public.audit_commands() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type not in ('schedule', 'ac_config') then
    insert into public.audit_log (user_id, room_id, action, detail, status)
    values (new.created_by, new.room_id, 'command.' || new.type::text,
            jsonb_build_object('command_id', new.id, 'payload', new.payload), 'success');
  end if;
  return null;
end $$;

create trigger commands_audit
  after insert on public.commands
  for each row execute function public.audit_commands();

-- ---------- Row Level Security (RLS) ----------
create function public.current_app_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles
  where id = (select auth.uid()) and is_active
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = (select auth.uid()) and is_active)
$$;

create function public.is_bridge() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bridge_accounts
                 where user_id = (select auth.uid()))
$$;

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on public.bridge_accounts from authenticated;

alter table public.profiles        enable row level security;
alter table public.bridge_accounts enable row level security;
alter table public.rooms           enable row level security;
alter table public.cv_models       enable row level security;
alter table public.courses         enable row level security;
alter table public.schedules       enable row level security;
alter table public.occupancy       enable row level security;
alter table public.energy_read     enable row level security;
alter table public.env_read        enable row level security;
alter table public.device_state    enable row level security;
alter table public.node_status     enable row level security;
alter table public.commands        enable row level security;
alter table public.audit_log       enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.current_app_role() = 'admin');
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

-- rooms
create policy rooms_select on public.rooms for select to authenticated
  using (public.is_staff() or public.is_bridge());
create policy rooms_staff_insert on public.rooms for insert to authenticated
  with check (public.is_staff());
create policy rooms_staff_update on public.rooms for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy rooms_admin_delete on public.rooms for delete to authenticated
  using (public.current_app_role() = 'admin');

-- cv_models
create policy cv_models_select on public.cv_models for select to authenticated
  using (public.is_staff() or public.is_bridge());
create policy cv_models_admin_write on public.cv_models for all to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

-- courses
create policy courses_select on public.courses for select to authenticated
  using (public.is_staff() or public.is_bridge());
create policy courses_insert on public.courses for insert to authenticated
  with check (public.is_staff());
create policy courses_update on public.courses for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy courses_delete on public.courses for delete to authenticated
  using (public.current_app_role() = 'admin');

-- schedules
create policy schedules_select on public.schedules for select to authenticated
  using (public.is_staff() or public.is_bridge());
create policy schedules_insert on public.schedules for insert to authenticated
  with check (public.is_staff() and created_by = (select auth.uid()));
create policy schedules_update on public.schedules for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy schedules_delete on public.schedules for delete to authenticated
  using (public.current_app_role() = 'admin');

-- Telemetri
create policy occupancy_select on public.occupancy for select to authenticated
  using (public.is_staff() or public.is_bridge());
create policy occupancy_insert on public.occupancy for insert to authenticated
  with check (public.is_bridge());

create policy energy_read_select on public.energy_read for select to authenticated
  using (public.is_staff() or public.is_bridge());
create policy energy_read_insert on public.energy_read for insert to authenticated
  with check (public.is_bridge());

create policy env_read_select on public.env_read for select to authenticated
  using (public.is_staff() or public.is_bridge());
create policy env_read_insert on public.env_read for insert to authenticated
  with check (public.is_bridge());

-- Status terkini
create policy device_state_select on public.device_state for select to authenticated
  using (public.is_staff() or public.is_bridge());
create policy device_state_insert on public.device_state for insert to authenticated
  with check (public.is_bridge());
create policy device_state_update on public.device_state for update to authenticated
  using (public.is_bridge()) with check (public.is_bridge());

create policy node_status_select on public.node_status for select to authenticated
  using (public.is_staff() or public.is_bridge());
create policy node_status_insert on public.node_status for insert to authenticated
  with check (public.is_bridge());
create policy node_status_update on public.node_status for update to authenticated
  using (public.is_bridge()) with check (public.is_bridge());

-- commands
create policy commands_select on public.commands for select to authenticated
  using (public.is_staff() or public.is_bridge());
create policy commands_insert on public.commands for insert to authenticated
  with check (public.is_staff()
              and created_by = (select auth.uid())
              and type not in ('schedule', 'ac_config')
              and status = 'pending');
create policy commands_bridge_update on public.commands for update to authenticated
  using (public.is_bridge()) with check (public.is_bridge());

-- audit_log
create policy audit_select on public.audit_log for select to authenticated
  using (public.current_app_role() = 'admin');
create policy audit_bridge_insert on public.audit_log for insert to authenticated
  with check (public.is_bridge());

-- ---------- Views Dashboard (security_invoker = true) ----------
create view public.energy_delta with (security_invoker = true) as
select room_id,
       measured_at,
       voltage_v,
       current_a,
       frequency_hz,
       active_power_w,
       case
         when prev_kwh is null       then 0
         when energy_kwh >= prev_kwh then energy_kwh - prev_kwh
         else energy_kwh
       end as delta_kwh
from (
  select e.*,
         lag(e.energy_kwh) over (partition by e.room_id order by e.measured_at) as prev_kwh
  from public.energy_read e
) t;

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

-- Mengandalkan status online dari MQTT LWT agar tidak butuh heartbeat update ke DB
create view public.node_health with (security_invoker = true) as
select room_id,
       node,
       online,
       last_seen,
       coalesce(online, false) as is_alive
from public.node_status;

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

-- ---------- Realtime (Hanya tabel status & kendali untuk hemat Log Ingestion) ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.device_state, public.node_status, public.commands;
  end if;
end $$;