-- Correct Phase 6 utilization to use the actual overlap between approved
-- reservations and each active room's modeled operating window. p_to remains
-- exclusive, so a one-day range contributes exactly one operating day.

create or replace function public.phase6_facility_utilization(
  p_from timestamptz,
  p_to timestamptz,
  p_timezone text default 'Asia/Manila'
) returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with operating_windows as (
    select
      r.id as room_id,
      greatest(
        p_from,
        ((d.day + r.open_time) at time zone p_timezone)
      ) as window_start,
      least(
        p_to,
        ((d.day + r.close_time) at time zone p_timezone)
      ) as window_end
    from public.rooms r
    cross join lateral generate_series(
      (p_from at time zone p_timezone)::date,
      ((p_to - interval '1 microsecond') at time zone p_timezone)::date,
      interval '1 day'
    ) as d(day)
    where r.is_deleted = false
      and r.active = true
      and r.open_time is not null
      and r.close_time is not null
      and r.close_time > r.open_time
  ),
  available as (
    select coalesce(sum(
      extract(epoch from greatest(interval '0 seconds', window_end - window_start)) / 60
    ), 0)::numeric as minutes
    from operating_windows
  ),
  occupied as (
    select coalesce(sum(
      extract(epoch from greatest(
        interval '0 seconds',
        least(res.end_time, ow.window_end) - greatest(res.start_time, ow.window_start)
      )) / 60
    ), 0)::numeric as minutes
    from operating_windows ow
    join public.reservations res
      on res.room_id = ow.room_id
     and res.is_deleted = false
     and res.status in ('APPROVED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED')
     and res.start_time < ow.window_end
     and res.end_time > ow.window_start
  )
  select jsonb_build_object(
    'occupiedMinutes', round(occupied.minutes, 1),
    'availableOperatingMinutes', round(available.minutes, 1),
    'utilizationPercent', case
      when available.minutes <= 0 then null
      else round(least(100, occupied.minutes * 100 / available.minutes), 1)
    end
  )
  from occupied cross join available;
$$;

do $$
begin
  if to_regprocedure('public.phase6_analytics_snapshot_v1(text,uuid,text,timestamp with time zone,timestamp with time zone,text)') is null then
    alter function public.phase6_analytics_snapshot(text, uuid, text, timestamptz, timestamptz, text)
      rename to phase6_analytics_snapshot_v1;
  end if;
end;
$$;

create or replace function public.phase6_analytics_snapshot(
  p_role text,
  p_user_id uuid,
  p_user_email text,
  p_from timestamptz,
  p_to timestamptz,
  p_timezone text default 'Asia/Manila'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_utilization jsonb;
begin
  v_result := public.phase6_analytics_snapshot_v1(
    p_role, p_user_id, p_user_email, p_from, p_to, p_timezone
  );

  if upper(trim(coalesce(p_role, ''))) in ('FACILITIES_MANAGER', 'FACILITIES_OFFICER') then
    v_utilization := public.phase6_facility_utilization(p_from, p_to, p_timezone);
    v_result := jsonb_set(
      v_result,
      '{facilities}',
      coalesce(v_result->'facilities', '{}'::jsonb) || v_utilization,
      true
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.phase6_facility_utilization(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.phase6_analytics_snapshot_v1(text, uuid, text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.phase6_analytics_snapshot(text, uuid, text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.phase6_facility_utilization(timestamptz, timestamptz, text) to postgres, service_role;
grant execute on function public.phase6_analytics_snapshot_v1(text, uuid, text, timestamptz, timestamptz, text) to postgres, service_role;
grant execute on function public.phase6_analytics_snapshot(text, uuid, text, timestamptz, timestamptz, text) to postgres, service_role;

comment on function public.phase6_facility_utilization(timestamptz, timestamptz, text) is
  'Approved occupied minutes within active-room operating windows divided by total active-room operating minutes.';
