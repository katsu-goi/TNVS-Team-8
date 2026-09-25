-- Ensure operating-window days stay date-typed before conversion from Manila
-- business-local timestamps to UTC timestamptz values.

create or replace function public.phase6_facility_utilization(
  p_from timestamptz,
  p_to timestamptz,
  p_timezone text default 'Asia/Manila'
) returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with local_days as (
    select (p_from at time zone p_timezone)::date + offsets.value as day
    from generate_series(
      0,
      ((p_to - interval '1 microsecond') at time zone p_timezone)::date
        - (p_from at time zone p_timezone)::date
    ) as offsets(value)
  ),
  operating_windows as (
    select
      r.id as room_id,
      greatest(p_from, ((d.day + r.open_time) at time zone p_timezone)) as window_start,
      least(p_to, ((d.day + r.close_time) at time zone p_timezone)) as window_end
    from public.rooms r
    cross join local_days d
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

revoke all on function public.phase6_facility_utilization(timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.phase6_facility_utilization(timestamptz, timestamptz, text) to postgres, service_role;
