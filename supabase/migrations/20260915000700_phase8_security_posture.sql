-- Phase 8 production security-posture diagnostic. The result contains schema
-- metadata only and is callable exclusively by the Edge service role.

create or replace function public.phase8_security_posture()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, storage, extensions
stable
as $$
  with public_tables as (
    select c.oid, c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  ), functions as (
    select p.oid, p.proname, p.prosecdef, p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  ), fk_without_index as (
    select con.conname, tbl.relname as table_name
    from pg_constraint con
    join pg_class tbl on tbl.oid = con.conrelid
    join pg_namespace ns on ns.oid = tbl.relnamespace
    where ns.nspname = 'public'
      and con.contype = 'f'
      and not exists (
        select 1
        from pg_index idx
        where idx.indrelid = con.conrelid
          and idx.indisvalid
          and (idx.indkey::smallint[])[0:cardinality(con.conkey)-1] = con.conkey
      )
  )
  select jsonb_build_object(
    'publicTableCount', (select count(*) from public_tables),
    'rlsEnabledCount', (select count(*) from public_tables where relrowsecurity),
    'tablesWithoutRls', coalesce((select jsonb_agg(relname order by relname) from public_tables where not relrowsecurity), '[]'::jsonb),
    'browserBusinessTablePrivileges', (
      select count(*) from public_tables
      where relname <> 'realtime_events'
        and (has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          or has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    ),
    'browserFunctionExecutePrivileges', (
      select count(*) from functions
      where has_function_privilege('anon', oid, 'EXECUTE')
         or has_function_privilege('authenticated', oid, 'EXECUTE')
    ),
    'securityDefinerCount', (select count(*) from functions where prosecdef),
    'securityDefinerMissingSearchPath', coalesce((
      select jsonb_agg(proname order by proname)
      from functions
      where prosecdef and not coalesce(proconfig, '{}'::text[]) @> array['search_path=pg_catalog, public']
        and not exists (
          select 1 from unnest(coalesce(proconfig, '{}'::text[])) setting
          where setting like 'search_path=%'
        )
    ), '[]'::jsonb),
    'realtimePublishedTables', coalesce((
      select jsonb_agg(tablename order by tablename)
      from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
    ), '[]'::jsonb),
    'realtimeMarkerColumns', coalesce((
      select jsonb_agg(column_name order by ordinal_position)
      from information_schema.columns
      where table_schema = 'public' and table_name = 'realtime_events'
    ), '[]'::jsonb),
    'storageBuckets', coalesce((
      select jsonb_agg(jsonb_build_object('name', id, 'public', public) order by id)
      from storage.buckets
    ), '[]'::jsonb),
    'activeRefreshNonDigestCount', (
      select count(*) from public.refresh_tokens
      where not is_revoked and (length(token) <> 64 or token !~ '^[0-9a-f]{64}$')
    ),
    'foreignKeyCount', (select count(*) from pg_constraint con join pg_namespace ns on ns.oid = con.connamespace where ns.nspname = 'public' and con.contype = 'f'),
    'foreignKeysWithoutLeadingIndex', coalesce((select jsonb_agg(jsonb_build_object('table', table_name, 'constraint', conname) order by table_name, conname) from fk_without_index), '[]'::jsonb)
  );
$$;

revoke all on function public.phase8_security_posture() from public, anon, authenticated;
grant execute on function public.phase8_security_posture() to service_role;

comment on function public.phase8_security_posture() is
  'Service-only, non-secret schema and privilege posture used for Phase 8 verification and operational diagnostics.';

