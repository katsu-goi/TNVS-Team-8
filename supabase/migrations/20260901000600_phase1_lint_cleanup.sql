-- Phase 1.6: remove non-runtime PL/pgSQL lint warnings without changing valid-call behavior.

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
    -- Retain the established RPC signature and validate the window contract used
    -- by every Edge Function caller. All existing callers provide a positive value.
    if p_window_seconds <= 0 then
        raise exception 'p_window_seconds must be positive' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtext(p_key || ':' || p_window_start));

    delete from public.rate_limit_counts
    where limit_key = p_key
      and window_start < p_window_start;

    insert into public.rate_limit_counts (limit_key, window_start, request_count)
    values (p_key, p_window_start, 1)
    on conflict (limit_key, window_start)
    do update set request_count = public.rate_limit_counts.request_count + 1,
                  updated_at = now()
    returning request_count into v_count;

    return v_count <= p_capacity;
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

revoke execute on function public.consume_rate_limit_token(text, bigint, integer, integer)
    from public, anon, authenticated;
revoke execute on function public.finalize_login_success(text, text)
    from public, anon, authenticated;

grant execute on function public.consume_rate_limit_token(text, bigint, integer, integer) to service_role;
grant execute on function public.finalize_login_success(text, text) to service_role;
