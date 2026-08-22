-- =============================================================
-- Add active_sessions to Supabase Realtime publication
-- so that LOGIN events broadcast CDC events to the dashboard.
-- =============================================================

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'active_sessions') then
    alter publication supabase_realtime add table public.active_sessions;
  end if;
end $$;
