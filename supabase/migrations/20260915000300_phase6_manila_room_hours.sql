-- Phase 6 date/time consistency: room operating hours are business-local
-- Asia/Manila values while reservation timestamps are stored as timestamptz.

create or replace function public.phase5_room_blocker(
  p_room_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_attendees integer,
  p_exclude_reservation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_local_start time;
  v_local_end time;
begin
  select * into v_room from public.rooms where id = p_room_id and is_deleted = false;
  if not found then return jsonb_build_object('code', 'ROOM_NOT_FOUND', 'message', 'Room was not found.'); end if;
  if v_room.active is distinct from true then return jsonb_build_object('code', 'ROOM_INACTIVE', 'message', 'Room is inactive.'); end if;
  if upper(coalesce(v_room.status, '')) in ('MAINTENANCE', 'OUT_OF_SERVICE', 'CLOSED')
     or upper(coalesce(v_room.maintenance_status, '')) in ('MAINTENANCE', 'OUT_OF_SERVICE', 'IN_PROGRESS') then
    return jsonb_build_object('code', 'UNDER_MAINTENANCE', 'message', 'Room is unavailable because of maintenance or service status.');
  end if;
  if p_start is null or p_end is null or p_start >= p_end then
    return jsonb_build_object('code', 'INVALID_RANGE', 'message', 'End time must be after start time.');
  end if;
  if p_attendees is null or p_attendees < 1 then
    return jsonb_build_object('code', 'CAPACITY_REQUIRED', 'message', 'Expected attendees must be at least one.');
  end if;
  if v_room.capacity is not null and p_attendees > v_room.capacity then
    return jsonb_build_object('code', 'CAPACITY_EXCEEDED', 'message', 'Expected attendees exceed room capacity.');
  end if;

  v_local_start := (p_start at time zone 'Asia/Manila')::time;
  v_local_end := (p_end at time zone 'Asia/Manila')::time;
  if v_room.open_time is not null and v_room.close_time is not null
     and (v_local_start < v_room.open_time or v_local_end > v_room.close_time) then
    return jsonb_build_object('code', 'OUTSIDE_OPERATING_HOURS', 'message', 'Requested time is outside room operating hours.');
  end if;
  if exists (
    select 1 from public.maintenance_schedules m
    where m.room_id = p_room_id and coalesce(m.is_deleted, false) = false
      and upper(coalesce(m.status, 'SCHEDULED')) in ('SCHEDULED', 'IN_PROGRESS')
      and m.start_time < p_end and m.end_time > p_start
  ) then
    return jsonb_build_object('code', 'UNDER_MAINTENANCE', 'message', 'A maintenance block overlaps the requested time.');
  end if;
  if exists (
    select 1 from public.reservations r
    where r.room_id = p_room_id and r.is_deleted = false
      and r.status in ('APPROVED', 'CONFIRMED', 'CHECKED_IN')
      and (p_exclude_reservation_id is null or r.id <> p_exclude_reservation_id)
      and r.start_time < p_end and r.end_time > p_start
  ) then
    return jsonb_build_object('code', 'RESERVATION_CONFLICT', 'message', 'Another active reservation overlaps the requested time.');
  end if;
  return null;
end;
$$;

revoke all on function public.phase5_room_blocker(uuid, timestamptz, timestamptz, integer, uuid) from public, anon, authenticated;
grant execute on function public.phase5_room_blocker(uuid, timestamptz, timestamptz, integer, uuid) to postgres, service_role;

comment on function public.phase5_room_blocker(uuid, timestamptz, timestamptz, integer, uuid) is
  'Validates UTC reservation timestamps against Asia/Manila room operating hours and authoritative conflict/maintenance state.';
