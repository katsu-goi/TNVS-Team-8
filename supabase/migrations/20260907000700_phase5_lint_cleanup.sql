-- Phase 5 lint cleanup: the room validation/locking is performed by
-- phase5_room_blocker, so the submit function does not need an unused row value.
create or replace function public.phase5_submit_reservation(
  p_room_id uuid,
  p_user_id uuid,
  p_title text,
  p_purpose text,
  p_description text,
  p_start timestamptz,
  p_end timestamptz,
  p_attendees integer,
  p_actor_email text,
  p_actor_role text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_blocker jsonb;
begin
  if nullif(trim(p_title), '') is null or nullif(trim(coalesce(p_purpose, p_description)), '') is null then
    return jsonb_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR', 'message', 'Reservation title and purpose are required.');
  end if;
  if p_start < timezone('UTC', now()) then
    return jsonb_build_object('ok', false, 'errorCode', 'PAST_TIME', 'message', 'Reservation cannot be in the past.');
  end if;
  v_blocker := public.phase5_room_blocker(p_room_id, p_start, p_end, p_attendees, null);
  if v_blocker is not null and v_blocker->>'code' <> 'RESERVATION_CONFLICT' then
    return jsonb_build_object('ok', false, 'errorCode', v_blocker->>'code', 'message', v_blocker->>'message');
  end if;
  if exists (
    select 1 from public.reservations r
    where r.user_id = p_user_id and r.room_id = p_room_id
      and r.start_time = p_start and r.end_time = p_end
      and r.status not in ('REJECTED', 'CANCELLED', 'COMPLETED') and r.is_deleted = false
  ) then
    return jsonb_build_object('ok', false, 'errorCode', 'DUPLICATE_RESERVATION', 'message', 'An equivalent active reservation request already exists.');
  end if;

  insert into public.reservations (
    room_id, user_id, title, purpose, description, start_time, end_time,
    expected_attendees, status, approval_status, created_by, updated_by, updated_at
  ) values (
    p_room_id, p_user_id, trim(p_title), coalesce(nullif(trim(p_purpose), ''), trim(p_description)),
    p_description, p_start, p_end, p_attendees, 'PENDING', 'PENDING',
    left(p_actor_email, 255), left(p_actor_email, 255), timezone('UTC', now())
  ) returning * into v_reservation;

  perform public.phase5_record_reservation_action(v_reservation.id, p_user_id, p_actor_email,
    p_actor_role, 'SUBMIT', 'SUBMITTED', null, 'PENDING', 'Reservation request submitted.', 1);
  perform public.phase5_audit(p_user_id, p_actor_email, 'SUBMIT_RESERVATION', 'FACILITIES', 'Reservation',
    v_reservation.id, 'Reservation request submitted for operational review.');
  perform public.phase5_notify_roles(array['FACILITIES_OFFICER'], 'phase5:reservation:' || v_reservation.id || ':submitted',
    'Reservation requires operational review', 'A new reservation request is ready for availability and capacity review.',
    'RESERVATION_SUBMITTED', 'Reservation', v_reservation.id::text);
  return jsonb_build_object('ok', true, 'data', to_jsonb(v_reservation));
end;
$$;

revoke all on function public.phase5_submit_reservation(uuid, uuid, text, text, text, timestamptz, timestamptz, integer, text, text) from public, anon, authenticated;
grant execute on function public.phase5_submit_reservation(uuid, uuid, text, text, text, timestamptz, timestamptz, integer, text, text) to service_role;
