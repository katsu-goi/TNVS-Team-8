-- Progressive, temporary-only login restrictions.
--
-- Registered accounts continue to use users.failed_login_attempts,
-- users.last_failed_attempt_at, and users.locked_until. Unknown identifiers use
-- privacy-preserving HMAC references in the existing rate_limit_counts table so
-- their externally visible failure sequence matches a registered account
-- without creating a second account-attempt table.

create table if not exists public.rate_limit_counts (
    id            bigint generated always as identity primary key,
    limit_key     text not null,
    window_start  bigint not null,
    request_count integer not null default 0,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create unique index if not exists idx_rate_limit_counts_key_window
    on public.rate_limit_counts (limit_key, window_start);

alter table public.rate_limit_counts enable row level security;

create or replace function public.login_lock_seconds(p_attempt integer)
returns integer
language sql
immutable
strict
as $$
    select case
        when p_attempt <= 2 then 0
        when p_attempt = 3 then 30
        when p_attempt = 4 then 60
        when p_attempt = 5 then 300
        when p_attempt = 6 then 900
        when p_attempt = 7 then 1800
        else 3600
    end;
$$;

create or replace function public.get_login_restriction(
    p_email text,
    p_identifier_hash text
)
returns table (
    account_exists boolean,
    failed_attempts integer,
    locked_until timestamptz,
    counted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_now_utc timestamp := clock_timestamp() at time zone 'UTC';
    v_user public.users%rowtype;
    v_key text := 'auth-unknown:' || coalesce(nullif(p_identifier_hash, ''), 'missing');
    v_count integer := 0;
    v_updated_at timestamptz;
    v_duration integer;
    v_retry_at timestamptz;
begin
    select * into v_user
      from public.users
     where lower(email) = lower(trim(p_email))
       and is_deleted = false
     limit 1;

    if found then
        return query select
            true,
            v_user.failed_login_attempts,
            case
                when v_user.locked_until is not null and v_user.locked_until > v_now_utc
                    then v_user.locked_until at time zone 'UTC'
                else null::timestamptz
            end,
            false;
        return;
    end if;

    select request_count, updated_at
      into v_count, v_updated_at
      from public.rate_limit_counts
     where limit_key = v_key and window_start = 0;

    if not found or v_updated_at < v_now - interval '24 hours' then
        return query select false, 0, null::timestamptz, false;
        return;
    end if;

    v_duration := public.login_lock_seconds(v_count);
    if v_duration > 0 then
        v_retry_at := v_updated_at + make_interval(secs => v_duration);
    end if;

    return query select
        false,
        v_count,
        case when v_retry_at > v_now then v_retry_at else null::timestamptz end,
        false;
end;
$$;

create or replace function public.record_login_failure(
    p_email text,
    p_identifier_hash text
)
returns table (
    account_exists boolean,
    failed_attempts integer,
    locked_until timestamptz,
    counted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_now_utc timestamp := clock_timestamp() at time zone 'UTC';
    v_user public.users%rowtype;
    v_key text := 'auth-unknown:' || coalesce(nullif(p_identifier_hash, ''), 'missing');
    v_count integer := 0;
    v_updated_at timestamptz;
    v_duration integer;
    v_retry_at timestamptz;
    v_retry_naive timestamp;
begin
    perform pg_advisory_xact_lock(hashtext('login:' || lower(trim(coalesce(p_email, '')))));

    select * into v_user
      from public.users
     where lower(email) = lower(trim(p_email))
       and is_deleted = false
     limit 1
     for update;

    if found then
        if v_user.locked_until is not null and v_user.locked_until > v_now_utc then
            return query select
                true,
                v_user.failed_login_attempts,
                v_user.locked_until at time zone 'UTC',
                false;
            return;
        end if;

        v_count := v_user.failed_login_attempts + 1;
        v_duration := public.login_lock_seconds(v_count);
        v_retry_at := case when v_duration > 0
            then v_now + make_interval(secs => v_duration)
            else null end;
        v_retry_naive := case when v_retry_at is not null
            then v_retry_at at time zone 'UTC'
            else null end;

        update public.users
           set failed_login_attempts = v_count,
               last_failed_attempt_at = v_now_utc,
               locked_until = v_retry_naive,
               updated_at = v_now_utc
         where id = v_user.id;

        return query select true, v_count, v_retry_at, true;
        return;
    end if;

    perform pg_advisory_xact_lock(hashtext(v_key));

    select request_count, updated_at
      into v_count, v_updated_at
      from public.rate_limit_counts
     where limit_key = v_key and window_start = 0
     for update;

    if not found then
        v_count := 0;
        v_updated_at := null;
    elsif v_updated_at < v_now - interval '24 hours' then
        v_count := 0;
        v_updated_at := null;
    end if;

    v_duration := public.login_lock_seconds(v_count);
    if v_duration > 0 and v_updated_at is not null then
        v_retry_at := v_updated_at + make_interval(secs => v_duration);
        if v_retry_at > v_now then
            return query select false, v_count, v_retry_at, false;
            return;
        end if;
    end if;

    v_count := v_count + 1;
    v_duration := public.login_lock_seconds(v_count);
    v_retry_at := case when v_duration > 0
        then v_now + make_interval(secs => v_duration)
        else null end;

    insert into public.rate_limit_counts (
        limit_key, window_start, request_count, created_at, updated_at
    ) values (
        v_key, 0, v_count, v_now, v_now
    )
    on conflict (limit_key, window_start)
    do update set request_count = excluded.request_count,
                  updated_at = excluded.updated_at;

    return query select false, v_count, v_retry_at, true;
end;
$$;

create or replace function public.finalize_login_success(
    p_email text,
    p_ip text
)
returns table (
    allowed boolean,
    failed_attempts integer,
    locked_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_now_utc timestamp := clock_timestamp() at time zone 'UTC';
    v_user public.users%rowtype;
begin
    perform pg_advisory_xact_lock(hashtext('login:' || lower(trim(coalesce(p_email, '')))));

    select * into v_user
      from public.users
     where lower(email) = lower(trim(p_email))
       and is_deleted = false
     limit 1
     for update;

    if not found then
        return query select false, 0, null::timestamptz;
        return;
    end if;

    if v_user.locked_until is not null and v_user.locked_until > v_now_utc then
        return query select false, v_user.failed_login_attempts,
            v_user.locked_until at time zone 'UTC';
        return;
    end if;

    update public.users
       set last_login_at = v_now_utc,
           last_login_ip = p_ip,
           failed_login_attempts = 0,
           locked_until = null,
           last_failed_attempt_at = null,
           updated_at = v_now_utc
     where id = v_user.id;

    return query select true, 0, null::timestamptz;
end;
$$;

-- The Edge Functions call these through PostgREST with the service-role key.
revoke execute on function public.get_login_restriction(text, text)
    from public, anon, authenticated;
revoke execute on function public.record_login_failure(text, text)
    from public, anon, authenticated;
revoke execute on function public.finalize_login_success(text, text)
    from public, anon, authenticated;
revoke execute on function public.consume_rate_limit_token(text, bigint, integer, integer)
    from public, anon, authenticated;

grant execute on function public.get_login_restriction(text, text) to service_role;
grant execute on function public.record_login_failure(text, text) to service_role;
grant execute on function public.finalize_login_success(text, text) to service_role;
grant execute on function public.consume_rate_limit_token(text, bigint, integer, integer) to service_role;
