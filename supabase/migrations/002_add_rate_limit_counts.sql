-- 002_add_rate_limit_counts.sql
-- Additive migration: DB-backed sliding-window rate limiting for Edge Functions.
-- Replaces in-memory bucket4j (which is per-instance and lost on cold start).
-- No data impact; new table only.

create table if not exists public.rate_limit_counts (
    id            bigint generated always as identity primary key,
    -- Bucket key: <ip>:<path> mirrors the Spring RateLimitingFilter limitKey.
    limit_key     text not null,
    -- Window anchor: fixed-size window start (epoch seconds). New window every
    -- `window_seconds`; a row older than the window is simply a fresh bucket.
    window_start  bigint not null,
    -- Requests consumed in the current window.
    request_count integer not null default 0,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create unique index if not exists idx_rate_limit_counts_key_window
    on public.rate_limit_counts (limit_key, window_start);

-- PgTAP-friendly name check (used by verification scripts / future tests).
comment on table public.rate_limit_counts is
    'DB-backed sliding window rate limit counters for Edge Functions (replaces in-memory bucket4j).';

-- RLS: this table is only written by Edge Functions (service_role bypasses RLS).
-- We still enable RLS so the anon/authenticated PostgREST roles cannot read or
-- mutate counters through the REST API.
alter table public.rate_limit_counts enable row level security;

-- No policies: deny-by-default (consistent with every other table in this DB).

-- Atomically consumes one token. Serializes on the (limit_key, window_start)
-- row via an advisory lock so concurrent Edge Function instances cannot
-- overshoot the window capacity. Returns true if within capacity.
create or replace function public.consume_rate_limit_token(
    p_key text,
    p_window_start bigint,
    p_window_seconds integer,
    p_capacity integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    perform pg_advisory_xact_lock(hashtext(p_key || ':' || p_window_start));

    -- Discard any stale window row (older than current window).
    delete from public.rate_limit_counts
    where limit_key = p_key
      and window_start < p_window_start;

    -- Upsert the current window counter.
    insert into public.rate_limit_counts (limit_key, window_start, request_count)
    values (p_key, p_window_start, 1)
    on conflict (limit_key, window_start)
    do update set request_count = public.rate_limit_counts.request_count + 1,
                  updated_at = now()
    returning request_count into v_count;

    return v_count <= p_capacity;
end;
$$;

revoke execute on function public.consume_rate_limit_token(text, bigint, integer, integer)
    from public, anon, authenticated;