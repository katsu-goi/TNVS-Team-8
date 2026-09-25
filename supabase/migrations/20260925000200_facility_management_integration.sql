-- Application sessions are verified by the Edge API, not Supabase Auth.
alter table public.facilities add column if not exists floor_plan_url text;

-- Direct browser writes would bypass the application's role/session checks.
drop policy if exists "facility_pins_manage_authenticated" on public.facility_pins;
revoke insert, update, delete on public.facility_pins from anon, authenticated;
grant all on public.facility_pins to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('facility-floorplans', 'facility-floorplans', true, 5242880,
  array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
