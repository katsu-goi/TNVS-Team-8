-- Sanitized Realtime change markers.
-- Browsers subscribe only to this metadata stream and refetch protected data
-- through authenticated Edge Function endpoints.

create table if not exists public.realtime_events (
  id bigserial primary key,
  source_table text not null,
  operation text not null,
  created_at timestamptz not null default now()
);

create index if not exists realtime_events_created_at_idx
  on public.realtime_events (created_at desc);

alter table public.realtime_events replica identity full;
alter table public.realtime_events enable row level security;

grant select on public.realtime_events to anon, authenticated;
drop policy if exists "anon_select_realtime_events" on public.realtime_events;
create policy "anon_select_realtime_events"
  on public.realtime_events for select
  to anon using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'realtime_events'
  ) then
    alter publication supabase_realtime add table public.realtime_events;
  end if;
end $$;

create or replace function public.emit_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.realtime_events(source_table, operation)
  values (tg_table_name, tg_op);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.emit_realtime_event() from public;
grant execute on function public.emit_realtime_event() to postgres, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'reservations', 'visitors', 'documents', 'security_alerts',
    'security_logs', 'active_sessions', 'employee_notifications',
    'user_activity_events', 'online_users'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop trigger if exists emit_realtime_event on public.%I', table_name);
      execute format(
        'create trigger emit_realtime_event after insert or update or delete on public.%I for each row execute function public.emit_realtime_event()',
        table_name
      );
    end if;
  end loop;
end $$;

-- Remove legacy public CDC access. The browser must not receive raw sessions,
-- telemetry, visitors, documents, alerts, or business records.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'facilities', 'rooms', 'visitors', 'documents', 'contracts',
    'legal_cases', 'security_logs', 'active_sessions', 'blocked_ips',
    'security_alerts', 'ip_threats', 'maintenance_schedules',
    'reservations', 'employee_notifications', 'user_activity_events',
    'online_users'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists %I on public.%I', 'Allow all for anon', table_name);
      execute format('drop policy if exists %I on public.%I', 'anon_select_' || table_name, table_name);
      execute format('drop policy if exists %I on public.%I', 'anon_select_realtime_' || table_name, table_name);
    end if;
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', table_name);
    end if;
  end loop;
end $$;
