-- =====================================================================
-- 0002_rls.sql
-- Row Level Security. Dua peran pengguna: admin dan operator.
-- Akun bridge dikenali lewat tabel bridge_accounts (bukan peran pengguna).
-- =====================================================================

-- ---------- Fungsi bantu ----------
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

-- ---------- Hak akses tingkat tabel ----------
-- anon tidak boleh menyentuh apa pun; RLS membatasi baris untuk authenticated.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on public.bridge_accounts from authenticated;

-- ---------- Aktifkan RLS ----------
alter table public.profiles        enable row level security;
alter table public.bridge_accounts enable row level security;   -- tanpa policy: tertutup
alter table public.rooms           enable row level security;
alter table public.cv_models       enable row level security;
alter table public.schedules       enable row level security;
alter table public.occupancy       enable row level security;
alter table public.energy_read     enable row level security;
alter table public.env_read        enable row level security;
alter table public.device_state    enable row level security;
alter table public.node_status     enable row level security;
alter table public.commands        enable row level security;
alter table public.audit_log       enable row level security;

-- ---------- profiles ----------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.current_app_role() = 'admin');
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

-- ---------- rooms dan cv_models: baca staf/bridge, ubah admin ----------
create policy rooms_select on public.rooms for select to authenticated
  using (public.is_staff() or public.is_bridge());
create policy rooms_admin_write on public.rooms for all to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

create policy cv_models_select on public.cv_models for select to authenticated
  using (public.is_staff() or public.is_bridge());
create policy cv_models_admin_write on public.cv_models for all to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

-- ---------- schedules ----------
-- Admin dan operator boleh menambah dan mengubah; hapus hanya admin
-- (operator menonaktifkan lewat is_active).
create policy schedules_select on public.schedules for select to authenticated
  using (public.is_staff() or public.is_bridge());
create policy schedules_insert on public.schedules for insert to authenticated
  with check (public.is_staff() and created_by = (select auth.uid()));
create policy schedules_update on public.schedules for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());
create policy schedules_delete on public.schedules for delete to authenticated
  using (public.current_app_role() = 'admin');

-- ---------- Data telemetri: staf baca, bridge tulis ----------
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

-- ---------- Status terkini: staf baca, bridge upsert ----------
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

-- ---------- commands ----------
-- Staf hanya boleh membuat perintah pintu/lampu/AC berstatus pending atas namanya.
-- Perintah 'schedule' hanya dibuat oleh trigger (security definer).
create policy commands_select on public.commands for select to authenticated
  using (public.is_staff() or public.is_bridge());
create policy commands_insert on public.commands for insert to authenticated
  with check (public.is_staff()
              and created_by = (select auth.uid())
              and type <> 'schedule'
              and status = 'pending');
create policy commands_bridge_update on public.commands for update to authenticated
  using (public.is_bridge()) with check (public.is_bridge());

-- ---------- audit_log: baca admin, tulis bridge (trigger menulis sebagai owner) ----------
create policy audit_select on public.audit_log for select to authenticated
  using (public.current_app_role() = 'admin');
create policy audit_bridge_insert on public.audit_log for insert to authenticated
  with check (public.is_bridge());
