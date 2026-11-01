-- =====================================================================
-- 0001_schema.sql
-- Skema database Sistem Kelas Terintegrasi (CPE103)
-- Target  : Supabase (Postgres 15+)
-- Konvensi: waktu = timestamptz (UTC). Kolom bertipe `time` pada schedules
--           = waktu lokal WIB. Satuan dicantumkan pada nama kolom
--           (voltage_v, current_a, active_power_w, energy_kwh, ...).
-- =====================================================================

-- ---------- Tipe enum ----------
create type public.user_role      as enum ('admin', 'operator');
create type public.command_type   as enum ('door', 'light', 'ac', 'schedule');
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
-- Pengganti tabel USER + ROLE pada ERD. Kredensial dikelola Supabase Auth.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  role        public.user_role not null default 'operator',
  is_active   boolean not null default false,        -- diaktifkan oleh admin
  created_at  timestamptz not null default now()
);

-- Akun layanan bridge. Bukan peran pengguna, jadi tidak masuk user_role.
create table public.bridge_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Profil dibuat otomatis (nonaktif) saat akun Auth dibuat.
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

-- ---------- Master ----------
create table public.rooms (
  room_id    int generated always as identity primary key,
  room_code  text not null unique,                   -- = ROOM_ID pada topik MQTT, mis. 'A-203'
  room_name  text not null,
  capacity   int  not null check (capacity > 0)
);

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

-- ---------- Jadwal ----------
create table public.schedules (
  schedule_id   int generated always as identity primary key,
  room_id       int  not null references public.rooms (room_id) on delete cascade,
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  days_of_week  smallint[] not null
                check (cardinality(days_of_week) > 0
                       and days_of_week <@ array[1,2,3,4,5,6,7]::smallint[]),   -- ISO: 1 = Senin
  start_time    time not null,
  end_time      time not null,
  ac_on_time    time not null,
  ac_off_time   time not null,
  setpoint_c    numeric(3,1) not null check (setpoint_c between 16 and 30),
  pouch         public.pouch_item[] not null default '{}',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (start_time < end_time),
  check (ac_on_time < ac_off_time)
);

create trigger schedules_updated_at
  before update on public.schedules
  for each row execute function public.set_updated_at();

-- ---------- Data telemetri (ditulis bridge) ----------
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
  unique (room_id, detected_at),                      -- idempotensi (restart bridge)
  check (occupied = (person_count > 0))
);

create table public.energy_read (
  reading_id      bigint generated always as identity primary key,
  room_id         int not null references public.rooms (room_id) on delete cascade,
  measured_at     timestamptz not null,               -- ts dari perangkat (NTP)
  voltage_v       real not null check (voltage_v between 0 and 300),
  current_a       real not null check (current_a >= 0),
  active_power_w  real not null check (active_power_w >= 0),
  energy_kwh      double precision not null check (energy_kwh >= 0),   -- kumulatif PZEM
  frequency_hz    real not null check (frequency_hz between 40 and 70),
  power_factor    real check (power_factor between 0 and 1),
  unique (room_id, measured_at)                       -- data backlog tidak terduplikasi
);

create table public.env_read (
  reading_id     bigint generated always as identity primary key,
  room_id        int not null references public.rooms (room_id) on delete cascade,
  measured_at    timestamptz not null,
  temperature_c  real not null check (temperature_c between -40 and 125),
  humidity_rh    real check (humidity_rh between 0 and 100),
  unique (room_id, measured_at)
);

-- ---------- Status terkini ----------
-- Status perangkat (pintu, lampu, AC) berupa satu baris per kunci.
create table public.device_state (
  room_id     int  not null references public.rooms (room_id) on delete cascade,
  key         text not null check (key in ('door', 'light', 'ac')),
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (room_id, key)
);

-- Status Node dari LWT dan heartbeat.
create table public.node_status (
  room_id    int  not null references public.rooms (room_id) on delete cascade,
  node       text not null check (node in ('node1cv', 'node1ir', 'node2', 'node3')),
  online     boolean not null default false,
  last_seen  timestamptz,
  primary key (room_id, node)
);

-- ---------- Perintah dan audit ----------
create table public.commands (
  id          bigint generated always as identity primary key,   -- = cmd_id pada payload MQTT
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

-- ---------- Trigger: perintah jadwal otomatis ----------
-- Setiap perubahan pada schedules membuat satu perintah 'schedule' berisi
-- SELURUH jadwal aktif ruang tersebut. Bridge mem-publish-nya (retained).
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
               'days',     s.days_of_week,
               'start',    left(s.start_time::text, 5),
               'end',      left(s.end_time::text, 5),
               'ac_on',    left(s.ac_on_time::text, 5),
               'ac_off',   left(s.ac_off_time::text, 5),
               'setpoint', s.setpoint_c
             ) order by s.start_time), '[]'::jsonb)),
           auth.uid()
    from public.schedules s
    where s.room_id = v_room and s.is_active;
  end loop;
  return null;
end $$;

create trigger schedules_queue_command
  after insert or update or delete on public.schedules
  for each row execute function public.queue_schedule_command();

-- ---------- Trigger: audit log di sisi server ----------
-- Dipasang di database agar pencatatan tidak bisa dilewati dari frontend.
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

create function public.audit_commands() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type <> 'schedule' then            -- perintah jadwal sudah dicatat oleh audit_schedules
    insert into public.audit_log (user_id, room_id, action, detail, status)
    values (new.created_by, new.room_id, 'command.' || new.type::text,
            jsonb_build_object('command_id', new.id, 'payload', new.payload), 'success');
  end if;
  return null;
end $$;

create trigger commands_audit
  after insert on public.commands
  for each row execute function public.audit_commands();

-- ---------- Realtime ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.occupancy, public.energy_read, public.env_read,
      public.device_state, public.node_status, public.commands;
  end if;
end $$;
