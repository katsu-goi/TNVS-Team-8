-- Qualify circuit-state column references that overlap with RETURNS TABLE
-- output names. This keeps the service-only RPC behavior unchanged while
-- preventing PL/pgSQL from treating next_attempt_at as an ambiguous variable.

create or replace function public.record_ai_provider_circuit_failure(
  p_provider_id varchar,
  p_capability varchar,
  p_lease_version bigint,
  p_countable boolean,
  p_error_code varchar,
  p_error_message_safe varchar,
  p_failure_threshold integer,
  p_cooldown_seconds integer,
  p_latency_ms integer default null
)
returns table (circuit_state text, failure_count integer, transitioned boolean, next_attempt_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.ai_provider_circuit_breakers%rowtype;
  v_now timestamptz := clock_timestamp();
  v_failures integer;
  v_open boolean;
  v_transition boolean;
  v_threshold integer := least(greatest(coalesce(p_failure_threshold, 3), 1), 20);
  v_cooldown integer := least(greatest(coalesce(p_cooldown_seconds, 60), 5), 3600);
begin
  insert into public.ai_provider_circuit_breakers(provider_id, capability)
  values (p_provider_id, lower(trim(p_capability)))
  on conflict (provider_id, capability) do nothing;

  select cb.* into v_row
  from public.ai_provider_circuit_breakers as cb
  where cb.provider_id = p_provider_id
    and cb.capability = lower(trim(p_capability))
  for update;

  if not coalesce(p_countable, false) then
    -- A HALF_OPEN probe that reaches the provider but is rejected must not
    -- leave the circuit stuck in HALF_OPEN. It does not increase the outage
    -- counter, but it does return the dependency to OPEN for a fresh cooldown.
    update public.ai_provider_circuit_breakers as cb set
      state = case when v_row.state = 'HALF_OPEN' then 'OPEN' else cb.state end,
      opened_at = case when v_row.state = 'HALF_OPEN' then v_now else cb.opened_at end,
      next_attempt_at = case when v_row.state = 'HALF_OPEN'
        then v_now + make_interval(secs => v_cooldown) else cb.next_attempt_at end,
      last_error_code = left(p_error_code, 80),
      last_error_message_safe = left(p_error_message_safe, 300),
      last_failure_at = v_now,
      last_failure_version = greatest(cb.last_failure_version, coalesce(p_lease_version, cb.request_version)),
      half_open_probe_at = case when v_row.state = 'HALF_OPEN' then null else cb.half_open_probe_at end,
      half_open_lock_until = case when v_row.state = 'HALF_OPEN' then null else cb.half_open_lock_until end,
      last_latency_ms = greatest(coalesce(p_latency_ms, 0), 0),
      updated_at = v_now
    where cb.id = v_row.id;

    if v_row.state = 'HALF_OPEN' then
      update public.ai_providers as provider
      set status = 'DEGRADED', updated_at = v_now
      where provider.id = p_provider_id;
    end if;

    return query select
      case when v_row.state = 'HALF_OPEN' then 'OPEN' else v_row.state::text end,
      v_row.consecutive_failure_count,
      v_row.state = 'HALF_OPEN',
      case when v_row.state = 'HALF_OPEN'
        then v_now + make_interval(secs => v_cooldown)
        else v_row.next_attempt_at
      end;
    return;
  end if;

  v_failures := v_row.consecutive_failure_count + 1;
  v_open := v_row.state in ('OPEN', 'HALF_OPEN') or v_failures >= v_threshold;
  v_transition := v_open and v_row.state <> 'OPEN';

  update public.ai_provider_circuit_breakers as cb set
    state = case when v_open then 'OPEN' else 'CLOSED' end,
    consecutive_failure_count = v_failures,
    total_failure_count = cb.total_failure_count + 1,
    opened_at = case when v_open then v_now else cb.opened_at end,
    next_attempt_at = case when v_open then v_now + make_interval(secs => v_cooldown) else null end,
    last_failure_at = v_now,
    last_error_code = left(p_error_code, 80),
    last_error_message_safe = left(p_error_message_safe, 300),
    last_failure_version = greatest(cb.last_failure_version, coalesce(p_lease_version, cb.request_version)),
    half_open_probe_at = case when v_open then null else cb.half_open_probe_at end,
    half_open_lock_until = null,
    last_latency_ms = greatest(coalesce(p_latency_ms, 0), 0),
    updated_at = v_now
  where cb.id = v_row.id;

  -- A countable provider failure is operational degradation even before the
  -- open threshold is reached. A later successful call restores CONNECTED.
  update public.ai_providers as provider
  set status = 'DEGRADED', updated_at = v_now
  where provider.id = p_provider_id;

  return query select
    case when v_open then 'OPEN' else 'CLOSED' end,
    v_failures,
    v_transition,
    case when v_open then v_now + make_interval(secs => v_cooldown) else null end;
end;
$$;

revoke all on function public.record_ai_provider_circuit_failure(
  varchar, varchar, bigint, boolean, varchar, varchar, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.record_ai_provider_circuit_failure(
  varchar, varchar, bigint, boolean, varchar, varchar, integer, integer, integer
) to service_role;
