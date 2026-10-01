-- Persistent, provider/capability-scoped circuit breaker for external AI calls.
-- All mutations are service-role-only RPCs so custom application auth remains
-- enforced by Edge Functions and HALF_OPEN probe acquisition is atomic.

alter table public.ai_providers
  add column if not exists circuit_failure_threshold smallint not null default 3,
  add column if not exists circuit_open_cooldown_seconds integer not null default 60,
  add column if not exists request_timeout_ms integer not null default 20000,
  add column if not exists max_retries smallint not null default 2,
  add column if not exists retry_base_delay_ms integer not null default 250;

alter table public.ai_providers drop constraint if exists ck_ai_provider_circuit_failure_threshold;
alter table public.ai_providers add constraint ck_ai_provider_circuit_failure_threshold
  check (circuit_failure_threshold between 1 and 20);
alter table public.ai_providers drop constraint if exists ck_ai_provider_circuit_cooldown;
alter table public.ai_providers add constraint ck_ai_provider_circuit_cooldown
  check (circuit_open_cooldown_seconds between 5 and 3600);
alter table public.ai_providers drop constraint if exists ck_ai_provider_request_timeout;
alter table public.ai_providers add constraint ck_ai_provider_request_timeout
  check (request_timeout_ms between 1000 and 120000);
alter table public.ai_providers drop constraint if exists ck_ai_provider_max_retries;
alter table public.ai_providers add constraint ck_ai_provider_max_retries
  check (max_retries between 0 and 5);
alter table public.ai_providers drop constraint if exists ck_ai_provider_retry_base_delay;
alter table public.ai_providers add constraint ck_ai_provider_retry_base_delay
  check (retry_base_delay_ms between 50 and 5000);

create table if not exists public.ai_provider_circuit_breakers (
  id uuid primary key default gen_random_uuid(),
  provider_id varchar(100) not null references public.ai_providers(id) on delete cascade,
  capability varchar(80) not null,
  state varchar(16) not null default 'CLOSED' check (state in ('CLOSED', 'OPEN', 'HALF_OPEN')),
  consecutive_failure_count integer not null default 0 check (consecutive_failure_count >= 0),
  total_failure_count bigint not null default 0 check (total_failure_count >= 0),
  opened_at timestamptz,
  next_attempt_at timestamptz,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  last_error_code varchar(80),
  last_error_message_safe varchar(300),
  half_open_probe_at timestamptz,
  half_open_lock_until timestamptz,
  request_version bigint not null default 0,
  last_failure_version bigint not null default 0,
  last_latency_ms integer check (last_latency_ms is null or last_latency_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_ai_provider_circuit unique (provider_id, capability),
  constraint ck_ai_provider_capability check (capability ~ '^[a-z][a-z0-9-]{1,79}$')
);

create index if not exists idx_ai_provider_circuit_state_retry
  on public.ai_provider_circuit_breakers(state, next_attempt_at);
create index if not exists idx_ai_provider_circuit_provider
  on public.ai_provider_circuit_breakers(provider_id, capability);

alter table public.ai_provider_circuit_breakers enable row level security;
revoke all on public.ai_provider_circuit_breakers from public, anon, authenticated;
grant select, insert, update on public.ai_provider_circuit_breakers to service_role;

create or replace function public.acquire_ai_provider_circuit(
  p_provider_id varchar,
  p_capability varchar,
  p_probe_lock_seconds integer default 30
)
returns table (
  allowed boolean,
  permission_code text,
  circuit_state text,
  lease_version bigint,
  retry_after_seconds integer,
  transitioned boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.ai_provider_circuit_breakers%rowtype;
  v_now timestamptz := clock_timestamp();
  v_lock_seconds integer := least(greatest(coalesce(p_probe_lock_seconds, 30), 5), 900);
begin
  insert into public.ai_provider_circuit_breakers(provider_id, capability)
  values (p_provider_id, lower(trim(p_capability)))
  on conflict (provider_id, capability) do nothing;

  select * into v_row from public.ai_provider_circuit_breakers
  where provider_id = p_provider_id and capability = lower(trim(p_capability))
  for update;

  if v_row.state = 'OPEN' and v_row.next_attempt_at is not null and v_row.next_attempt_at > v_now then
    return query select false, 'CIRCUIT_OPEN', 'OPEN', v_row.request_version,
      greatest(1, ceil(extract(epoch from (v_row.next_attempt_at - v_now)))::integer), false;
    return;
  end if;

  if v_row.state = 'OPEN' then
    update public.ai_provider_circuit_breakers set
      state = 'HALF_OPEN', request_version = request_version + 1,
      half_open_probe_at = v_now,
      half_open_lock_until = v_now + make_interval(secs => v_lock_seconds),
      updated_at = v_now
    where id = v_row.id
    returning request_version into v_row.request_version;
    return query select true, 'HALF_OPEN_PROBE', 'HALF_OPEN', v_row.request_version, 0, true;
    return;
  end if;

  if v_row.state = 'HALF_OPEN' then
    if v_row.half_open_lock_until is not null and v_row.half_open_lock_until > v_now then
      return query select false, 'PROBE_ALREADY_IN_PROGRESS', 'HALF_OPEN', v_row.request_version,
        greatest(1, ceil(extract(epoch from (v_row.half_open_lock_until - v_now)))::integer), false;
      return;
    end if;
    update public.ai_provider_circuit_breakers set
      request_version = request_version + 1,
      half_open_probe_at = v_now,
      half_open_lock_until = v_now + make_interval(secs => v_lock_seconds),
      updated_at = v_now
    where id = v_row.id
    returning request_version into v_row.request_version;
    return query select true, 'HALF_OPEN_PROBE', 'HALF_OPEN', v_row.request_version, 0, false;
    return;
  end if;

  update public.ai_provider_circuit_breakers set
    request_version = request_version + 1, updated_at = v_now
  where id = v_row.id
  returning request_version into v_row.request_version;
  return query select true, 'REQUEST_ALLOWED', 'CLOSED', v_row.request_version, 0, false;
end;
$$;

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
  select * into v_row from public.ai_provider_circuit_breakers
  where provider_id = p_provider_id and capability = lower(trim(p_capability)) for update;

  if not coalesce(p_countable, false) then
    -- A HALF_OPEN probe that reaches the provider but is rejected must not
    -- leave the circuit stuck in HALF_OPEN. It does not increase the outage
    -- counter, but it does return the dependency to OPEN for a fresh cooldown.
    update public.ai_provider_circuit_breakers set
      state = case when v_row.state = 'HALF_OPEN' then 'OPEN' else state end,
      opened_at = case when v_row.state = 'HALF_OPEN' then v_now else opened_at end,
      next_attempt_at = case when v_row.state = 'HALF_OPEN'
        then v_now + make_interval(secs => v_cooldown) else next_attempt_at end,
      last_error_code = left(p_error_code, 80),
      last_error_message_safe = left(p_error_message_safe, 300),
      last_failure_at = v_now,
      last_failure_version = greatest(last_failure_version, coalesce(p_lease_version, request_version)),
      half_open_probe_at = case when v_row.state = 'HALF_OPEN' then null else half_open_probe_at end,
      half_open_lock_until = case when v_row.state = 'HALF_OPEN' then null else half_open_lock_until end,
      last_latency_ms = greatest(coalesce(p_latency_ms, 0), 0), updated_at = v_now
    where id = v_row.id;
    if v_row.state = 'HALF_OPEN' then
      update public.ai_providers set status = 'DEGRADED', updated_at = v_now where id = p_provider_id;
    end if;
    return query select case when v_row.state = 'HALF_OPEN' then 'OPEN' else v_row.state::text end,
      v_row.consecutive_failure_count, v_row.state = 'HALF_OPEN',
      case when v_row.state = 'HALF_OPEN' then v_now + make_interval(secs => v_cooldown) else v_row.next_attempt_at end;
    return;
  end if;

  v_failures := v_row.consecutive_failure_count + 1;
  v_open := v_row.state in ('OPEN', 'HALF_OPEN') or v_failures >= v_threshold;
  v_transition := v_open and v_row.state <> 'OPEN';
  update public.ai_provider_circuit_breakers set
    state = case when v_open then 'OPEN' else 'CLOSED' end,
    consecutive_failure_count = v_failures,
    total_failure_count = total_failure_count + 1,
    opened_at = case when v_open then v_now else opened_at end,
    next_attempt_at = case when v_open then v_now + make_interval(secs => v_cooldown) else null end,
    last_failure_at = v_now,
    last_error_code = left(p_error_code, 80),
    last_error_message_safe = left(p_error_message_safe, 300),
    last_failure_version = greatest(last_failure_version, coalesce(p_lease_version, request_version)),
    half_open_probe_at = case when v_open then null else half_open_probe_at end,
    half_open_lock_until = null,
    last_latency_ms = greatest(coalesce(p_latency_ms, 0), 0), updated_at = v_now
  where id = v_row.id;
  -- A countable provider failure is operational degradation even before the
  -- open threshold is reached. A later successful call restores CONNECTED.
  update public.ai_providers set status = 'DEGRADED', updated_at = v_now where id = p_provider_id;
  return query select case when v_open then 'OPEN' else 'CLOSED' end, v_failures, v_transition,
    case when v_open then v_now + make_interval(secs => v_cooldown) else null end;
end;
$$;

create or replace function public.record_ai_provider_circuit_success(
  p_provider_id varchar,
  p_capability varchar,
  p_lease_version bigint,
  p_latency_ms integer default null
)
returns table (circuit_state text, applied boolean, transitioned boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.ai_provider_circuit_breakers%rowtype;
  v_now timestamptz := clock_timestamp();
  v_apply boolean;
  v_transition boolean;
begin
  select * into v_row from public.ai_provider_circuit_breakers
  where provider_id = p_provider_id and capability = lower(trim(p_capability)) for update;
  if not found then return query select 'CLOSED', false, false; return; end if;
  v_apply := coalesce(p_lease_version, 0) >= v_row.last_failure_version;
  v_transition := v_apply and v_row.state <> 'CLOSED';
  if v_apply then
    update public.ai_provider_circuit_breakers set
      state = 'CLOSED', consecutive_failure_count = 0, opened_at = null, next_attempt_at = null,
      last_success_at = v_now, last_error_code = null, last_error_message_safe = null,
      half_open_probe_at = null, half_open_lock_until = null,
      last_latency_ms = greatest(coalesce(p_latency_ms, 0), 0), updated_at = v_now
    where id = v_row.id;
    update public.ai_providers set
      status = case when exists (
        select 1 from public.ai_provider_circuit_breakers cb
        where cb.provider_id = p_provider_id and cb.state <> 'CLOSED'
      ) then 'DEGRADED' else 'CONNECTED' end,
      last_verified_at = v_now, updated_at = v_now
    where id = p_provider_id and enabled = true and is_deleted = false;
  end if;
  return query select case when v_apply then 'CLOSED' else v_row.state::text end, v_apply, v_transition;
end;
$$;

create or replace function public.reset_ai_provider_circuit(p_provider_id varchar, p_capability varchar default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_count integer;
begin
  update public.ai_provider_circuit_breakers set
    state = 'CLOSED', consecutive_failure_count = 0, opened_at = null, next_attempt_at = null,
    last_error_code = null, last_error_message_safe = null, half_open_probe_at = null,
    half_open_lock_until = null, updated_at = clock_timestamp()
  where provider_id = p_provider_id and (p_capability is null or capability = lower(trim(p_capability)));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.acquire_ai_provider_circuit(varchar, varchar, integer) from public, anon, authenticated;
revoke all on function public.record_ai_provider_circuit_failure(varchar, varchar, bigint, boolean, varchar, varchar, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.record_ai_provider_circuit_success(varchar, varchar, bigint, integer) from public, anon, authenticated;
revoke all on function public.reset_ai_provider_circuit(varchar, varchar) from public, anon, authenticated;
grant execute on function public.acquire_ai_provider_circuit(varchar, varchar, integer) to service_role;
grant execute on function public.record_ai_provider_circuit_failure(varchar, varchar, bigint, boolean, varchar, varchar, integer, integer, integer) to service_role;
grant execute on function public.record_ai_provider_circuit_success(varchar, varchar, bigint, integer) to service_role;
grant execute on function public.reset_ai_provider_circuit(varchar, varchar) to service_role;

comment on table public.ai_provider_circuit_breakers is
  'Current server-authoritative circuit state per configured AI provider and capability. Contains no prompts, document content, or credentials.';
