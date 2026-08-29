-- =============================================================
-- Photonic Omega — Realtime transport tables
--
-- Browsers use authenticated Edge APIs for snapshots and a sanitized
-- change-marker stream for refresh notifications. Sensitive rows are never
-- exposed to the publishable key.
-- =============================================================

-- These transport tables are created here so the ordered migration chain is
-- valid on a clean database. The standalone supabase/realtime.sql file is
-- retained for existing installations and manual recovery.
create table if not exists public.user_activity_events (
  id bigserial primary key,
  event_type text not null,
  user_id text,
  username text not null,
  full_name text,
  email text,
  role text,
  action text,
  ip text,
  device text,
  browser text,
  created_at timestamptz not null default now()
);

create index if not exists user_activity_events_created_at_idx
  on public.user_activity_events (created_at desc);

create table if not exists public.online_users (
  id bigserial primary key,
  username text unique not null,
  user_id text,
  full_name text,
  role text,
  ip text,
  device text,
  browser text,
  last_activity timestamptz not null default now()
);

alter table public.user_activity_events replica identity full;
alter table public.online_users replica identity full;
alter table public.user_activity_events enable row level security;
alter table public.online_users enable row level security;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_activity_events') then
    alter publication supabase_realtime add table public.user_activity_events;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'online_users') then
    alter publication supabase_realtime add table public.online_users;
  end if;
end $$;
