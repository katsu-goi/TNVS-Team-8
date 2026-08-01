-- =============================================================
-- Photonic Omega — Supabase Realtime schema
-- Project: dunijfrvfozwlykpkfhy
--
-- HOW TO RUN: Open the Supabase Dashboard -> SQL Editor -> New query,
-- paste this whole file, and click "Run".
--
-- What this does:
--   1. Creates `user_activity_events` — every login / logout / user
--      event inserted by the backend, streamed to browsers via Realtime.
--   2. Creates `online_users` — current online sessions upserted by the
--      backend every few seconds, streamed to browsers via Realtime.
--   3. Adds both tables to the `supabase_realtime` publication so
--      `postgres_changes` WebSocket subscriptions fire.
--
-- NOTE: New tables have RLS disabled by default, so the publishable
-- (anon) key can insert/select/delete through PostgREST and Realtime
-- broadcast works out of the box. For production, enable RLS and scope
-- grants appropriately.
-- =============================================================

-- 1. Activity feed events
create table if not exists public.user_activity_events (
  id bigserial primary key,
  event_type text not null,             -- USER_ONLINE | USER_ACTIVE | USER_OFFLINE
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

-- 2. Current online users (one row per user, upserted by backend)
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

-- 3. Enable Realtime for both tables
alter table public.user_activity_events replica identity full;
alter table public.online_users replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_activity_events'
  ) then
    alter publication supabase_realtime add table public.user_activity_events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'online_users'
  ) then
    alter publication supabase_realtime add table public.online_users;
  end if;
end $$;
