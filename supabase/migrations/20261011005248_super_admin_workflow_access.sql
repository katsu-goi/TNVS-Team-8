-- Direct Super Admin actor authority. Workflow states, locking, validation and audits are preserved.

begin;

create or replace function public.phase5_review_visitor(
  p_visitor_id uuid,
  p_verification_id uuid,
  p_decision text,
  p_notes text,
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_verification public.visitor_verifications%rowtype;
  v_decision text := upper(coalesce(p_decision, ''));
  v_clearance text;
begin
  if p_actor_role not in ('FACILITIES_OFFICER', 'SUPER_ADMIN') then
    return jsonb_build_object('ok', false, 'errorCode', 'ACCESS_DENIED', 'message', 'Only a Facilities Officer may decide visitor clearance reviews.');
  end if;
  if v_decision not in ('CLEAR', 'BLOCK') or nullif(trim(p_notes), '') is null then
    return jsonb_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR', 'message', 'A CLEAR or BLOCK decision and review notes are required.');
  end if;

  select * into v_verification from public.visitor_verifications
  where id = p_verification_id and visitor_id = p_visitor_id and is_deleted = false
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_VERIFICATION_REQUIRED', 'message', 'The verification record was not found.');
  end if;
  if v_verification.automated_clearance <> 'REVIEW_REQUIRED'
     or v_verification.clearance_state <> 'REVIEW_REQUIRED' then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_REVIEW_NOT_ALLOWED', 'message', 'This verification is not awaiting manual review.');
  end if;

  v_clearance := case when v_decision = 'CLEAR' then 'CLEAR' else 'BLOCKED' end;
  insert into public.visitor_clearance_reviews (
    visitor_id, verification_id, original_clearance, decision,
    reviewer_id, reviewer_email, reviewer_role, notes
  ) values (
    p_visitor_id, p_verification_id, v_verification.automated_clearance, v_decision,
    p_actor_id, left(p_actor_email, 255), p_actor_role, p_notes
  );

  update public.visitor_verifications
  set clearance_state = v_clearance,
      reviewed_by = p_actor_id,
      reviewed_at = timezone('UTC', now()),
      review_notes = p_notes,
      updated_at = timezone('UTC', now()),
      updated_by = left(p_actor_email, 255)
  where id = p_verification_id
  returning * into v_verification;

  update public.visitors
  set current_verification_id = p_verification_id,
      updated_at = timezone('UTC', now()),
      updated_by = left(p_actor_email, 255)
  where id = p_visitor_id;

  insert into public.visitor_workflow_events (
    visitor_id, verification_id, event_type, actor_id, actor_email, actor_role, details
  ) values (
    p_visitor_id, p_verification_id, 'MANUAL_CLEARANCE_DECISION',
    p_actor_id, left(p_actor_email, 255), p_actor_role,
    jsonb_build_object('originalClearance', v_verification.automated_clearance, 'decision', v_decision, 'effectiveClearance', v_clearance)
  );
  perform public.phase5_audit(p_actor_id, p_actor_email, 'REVIEW_VISITOR_CLEARANCE', 'VISITOR', 'Visitor',
    p_visitor_id, 'Manual visitor clearance decision recorded as ' || v_clearance || '.');
  return jsonb_build_object('ok', true, 'data', to_jsonb(v_verification));
end;
$$;

revoke all on function public.phase5_review_visitor(uuid,uuid,text,text,uuid,text,text) from public, anon, authenticated;

grant execute on function public.phase5_review_visitor(uuid,uuid,text,text,uuid,text,text) to postgres, service_role;

create or replace function public.phase5_check_in_visitor(
  p_visitor_id uuid,
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visitor public.visitors%rowtype;
  v_verification public.visitor_verifications%rowtype;
  v_watchlist public.visitor_watchlist%rowtype;
  v_normalized_id text;
  v_normalized_name text;
begin
  if p_actor_role not in ('FACILITIES_OFFICER', 'SUPER_ADMIN') then
    return jsonb_build_object('ok', false, 'errorCode', 'ACCESS_DENIED', 'message', 'Only a Facilities Officer may check in visitors.');
  end if;
  select * into v_visitor from public.visitors
  where id = p_visitor_id and is_deleted = false
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_NOT_FOUND', 'message', 'Visitor was not found.');
  end if;
  if v_visitor.status = 'CHECKED_IN' then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_ALREADY_CHECKED_IN', 'message', 'Visitor is already checked in.');
  end if;
  if v_visitor.status <> 'REGISTERED' then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_INVALID_STATUS', 'message', 'This visit cannot be checked in from its current status.');
  end if;
  if v_visitor.host_id is null or not exists (
    select 1 from public.users u where u.id = v_visitor.host_id and u.status = 'ACTIVE' and u.is_deleted = false
  ) then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_HOST_REQUIRED', 'message', 'A valid active host is required before check-in.');
  end if;
  if v_visitor.expected_arrival is not null and (
    p_occurred_at < v_visitor.expected_arrival - interval '4 hours'
    or p_occurred_at > v_visitor.expected_arrival + interval '24 hours'
  ) then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_OUTSIDE_VISIT_WINDOW', 'message', 'Check-in is outside the allowed visit window.');
  end if;
  if v_visitor.current_verification_id is null then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_VERIFICATION_REQUIRED', 'message', 'Visitor verification is required before check-in.');
  end if;
  select * into v_verification from public.visitor_verifications
  where id = v_visitor.current_verification_id and visitor_id = v_visitor.id
    and is_deleted = false and verification_status = 'VERIFIED';
  if not found then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_VERIFICATION_REQUIRED', 'message', 'A valid visitor verification is required before check-in.');
  end if;
  if v_verification.clearance_state = 'REVIEW_REQUIRED' then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_REVIEW_REQUIRED', 'message', 'Visitor requires authorized manual review before check-in.');
  elsif v_verification.clearance_state = 'BLOCKED' then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_BLOCKED', 'message', 'Visitor is blocked from check-in.');
  elsif v_verification.clearance_state <> 'CLEAR' then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_VERIFICATION_REQUIRED', 'message', 'Visitor clearance is not valid.');
  end if;

  -- Re-screen exact active entries at entry time. New watchlist information may
  -- not be bypassed by relying on an older clearance.
  v_normalized_id := upper(regexp_replace(coalesce(v_visitor.id_number, v_verification.id_number, ''), '[^A-Za-z0-9]', '', 'g'));
  v_normalized_name := lower(regexp_replace(trim(v_visitor.full_name), '\s+', ' ', 'g'));
  select * into v_watchlist from public.visitor_watchlist
  where status = 'ACTIVE' and is_deleted = false
    and v_normalized_id <> ''
    and upper(regexp_replace(coalesce(id_number, ''), '[^A-Za-z0-9]', '', 'g')) = v_normalized_id
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_BLOCKED', 'message', 'An active watchlist block prevents check-in.');
  end if;
  select * into v_watchlist from public.visitor_watchlist
  where status = 'ACTIVE' and is_deleted = false
    and lower(regexp_replace(trim(full_name), '\s+', ' ', 'g')) = v_normalized_name
  order by created_at desc limit 1;
  if found and not (
    v_verification.matched_watchlist_entry_id = v_watchlist.id
    and v_verification.automated_clearance = 'REVIEW_REQUIRED'
    and v_verification.clearance_state = 'CLEAR'
    and v_verification.reviewed_at is not null
  ) then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_REVIEW_REQUIRED', 'message', 'A current watchlist signal requires review before check-in.');
  end if;

  update public.visitors
  set status = 'CHECKED_IN', actual_arrival = p_occurred_at,
      updated_at = timezone('UTC', now()), updated_by = left(p_actor_email, 255)
  where id = p_visitor_id
  returning * into v_visitor;
  insert into public.visitor_workflow_events (
    visitor_id, verification_id, event_type, from_status, to_status,
    actor_id, actor_email, actor_role
  ) values (
    p_visitor_id, v_verification.id, 'CHECK_IN', 'REGISTERED', 'CHECKED_IN',
    p_actor_id, left(p_actor_email, 255), p_actor_role
  );
  perform public.phase5_audit(p_actor_id, p_actor_email, 'CHECK_IN_VISITOR', 'VISITOR', 'Visitor',
    p_visitor_id, 'Cleared visitor checked in.');
  return jsonb_build_object('ok', true, 'data', to_jsonb(v_visitor));
end;
$$;

revoke all on function public.phase5_check_in_visitor(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;

grant execute on function public.phase5_check_in_visitor(uuid,uuid,text,text,timestamptz) to postgres, service_role;

create or replace function public.phase5_check_out_visitor(
  p_visitor_id uuid,
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visitor public.visitors%rowtype;
begin
  if p_actor_role not in ('FACILITIES_OFFICER', 'SUPER_ADMIN') then
    return jsonb_build_object('ok', false, 'errorCode', 'ACCESS_DENIED', 'message', 'Only a Facilities Officer may check out visitors.');
  end if;
  select * into v_visitor from public.visitors
  where id = p_visitor_id and is_deleted = false
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_NOT_FOUND', 'message', 'Visitor was not found.');
  end if;
  if v_visitor.status <> 'CHECKED_IN' or v_visitor.actual_arrival is null then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_NOT_CHECKED_IN', 'message', 'Visitor must be checked in before check-out.');
  end if;
  update public.visitors
  set status = 'CHECKED_OUT', actual_departure = p_occurred_at,
      updated_at = timezone('UTC', now()), updated_by = left(p_actor_email, 255)
  where id = p_visitor_id
  returning * into v_visitor;
  insert into public.visitor_workflow_events (
    visitor_id, verification_id, event_type, from_status, to_status,
    actor_id, actor_email, actor_role
  ) values (
    p_visitor_id, v_visitor.current_verification_id, 'CHECK_OUT', 'CHECKED_IN', 'CHECKED_OUT',
    p_actor_id, left(p_actor_email, 255), p_actor_role
  );
  perform public.phase5_audit(p_actor_id, p_actor_email, 'CHECK_OUT_VISITOR', 'VISITOR', 'Visitor',
    p_visitor_id, 'Visitor departure recorded.');
  return jsonb_build_object('ok', true, 'data', to_jsonb(v_visitor));
end;
$$;

revoke all on function public.phase5_check_out_visitor(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;

grant execute on function public.phase5_check_out_visitor(uuid,uuid,text,text,timestamptz) to postgres, service_role;

create or replace function public.phase5_officer_review_reservation(
  p_reservation_id uuid,
  p_notes text,
  p_actor_id uuid,
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
  if p_actor_role not in ('FACILITIES_OFFICER', 'SUPER_ADMIN') then
    return jsonb_build_object('ok', false, 'errorCode', 'ACCESS_DENIED', 'message', 'Only a Facilities Officer may perform operational review.');
  end if;
  if nullif(trim(p_notes), '') is null then
    return jsonb_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR', 'message', 'Operational review notes are required.');
  end if;
  select * into v_reservation from public.reservations
  where id = p_reservation_id and is_deleted = false for update;
  if not found then return jsonb_build_object('ok', false, 'errorCode', 'RESERVATION_NOT_FOUND', 'message', 'Reservation was not found.'); end if;
  if v_reservation.status <> 'PENDING' then
    return jsonb_build_object('ok', false, 'errorCode', 'RESERVATION_INVALID_STATUS', 'message', 'Only submitted reservations can enter operational review.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_reservation.room_id::text, 0));
  v_blocker := public.phase5_room_blocker(v_reservation.room_id, v_reservation.start_time, v_reservation.end_time,
    v_reservation.expected_attendees, v_reservation.id);
  if v_blocker is not null then
    return jsonb_build_object('ok', false, 'errorCode', v_blocker->>'code', 'message', v_blocker->>'message');
  end if;
  update public.reservations
  set status = 'PENDING_MANAGER_APPROVAL', approval_status = 'PENDING',
      officer_reviewed_by = p_actor_id, officer_reviewed_at = timezone('UTC', now()),
      officer_review_notes = p_notes, officer_reviewed_schedule_revision = schedule_revision,
      updated_by = left(p_actor_email, 255), updated_at = timezone('UTC', now())
  where id = p_reservation_id returning * into v_reservation;
  perform public.phase5_record_reservation_action(v_reservation.id, p_actor_id, p_actor_email, p_actor_role,
    'OFFICER_REVIEW', 'FORWARDED', 'PENDING', 'PENDING_MANAGER_APPROVAL', p_notes, v_reservation.schedule_revision);
  perform public.phase5_audit(p_actor_id, p_actor_email, 'REVIEW_RESERVATION', 'FACILITIES', 'Reservation',
    v_reservation.id, 'Operational review completed and reservation forwarded for final approval.');
  perform public.phase5_notify_roles(array['FACILITIES_MANAGER'], 'phase5:reservation:' || v_reservation.id || ':manager-ready:' || v_reservation.schedule_revision,
    'Reservation ready for final approval', 'Operational review passed. Recheck availability and decide the reservation.',
    'RESERVATION_READY_FOR_APPROVAL', 'Reservation', v_reservation.id::text);
  return jsonb_build_object('ok', true, 'data', to_jsonb(v_reservation));
end;
$$;

revoke all on function public.phase5_officer_review_reservation(uuid,text,uuid,text,text) from public, anon, authenticated;

grant execute on function public.phase5_officer_review_reservation(uuid,text,uuid,text,text) to postgres, service_role;

create or replace function public.phase5_manager_decide_reservation(
  p_reservation_id uuid,
  p_decision text,
  p_notes text,
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_decision text := upper(coalesce(p_decision, ''));
  v_blocker jsonb;
  v_next text;
begin
  if p_actor_role not in ('FACILITIES_MANAGER', 'SUPER_ADMIN') then
    return jsonb_build_object('ok', false, 'errorCode', 'ACCESS_DENIED', 'message', 'Only a Facilities Manager may make the final reservation decision.');
  end if;
  if v_decision not in ('APPROVE', 'REJECT') then
    return jsonb_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR', 'message', 'Decision must be APPROVE or REJECT.');
  end if;
  if v_decision = 'REJECT' and nullif(trim(p_notes), '') is null then
    return jsonb_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR', 'message', 'A rejection reason is required.');
  end if;
  select * into v_reservation from public.reservations
  where id = p_reservation_id and is_deleted = false for update;
  if not found then return jsonb_build_object('ok', false, 'errorCode', 'RESERVATION_NOT_FOUND', 'message', 'Reservation was not found.'); end if;
  if v_reservation.status <> 'PENDING_MANAGER_APPROVAL' then
    return jsonb_build_object('ok', false, 'errorCode', 'RESERVATION_INVALID_STATUS', 'message', 'Reservation is not awaiting manager approval.');
  end if;
  if v_reservation.officer_reviewed_schedule_revision is distinct from v_reservation.schedule_revision then
    return jsonb_build_object('ok', false, 'errorCode', 'RESERVATION_REVIEW_STALE', 'message', 'The schedule changed after operational review and must be reviewed again.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_reservation.room_id::text, 0));
  if v_decision = 'APPROVE' then
    v_blocker := public.phase5_room_blocker(v_reservation.room_id, v_reservation.start_time, v_reservation.end_time,
      v_reservation.expected_attendees, v_reservation.id);
    if v_blocker is not null then
      return jsonb_build_object('ok', false, 'errorCode', v_blocker->>'code', 'message', v_blocker->>'message');
    end if;
    v_next := 'APPROVED';
    begin
      update public.reservations
      set status = v_next, approval_status = 'APPROVED', approved_by = left(p_actor_email, 255),
          approved_at = timezone('UTC', now()), manager_decided_by = p_actor_id,
          manager_decided_at = timezone('UTC', now()), rejection_reason = null,
          updated_by = left(p_actor_email, 255), updated_at = timezone('UTC', now())
      where id = p_reservation_id returning * into v_reservation;
    exception when exclusion_violation then
      return jsonb_build_object('ok', false, 'errorCode', 'RESERVATION_CONFLICT', 'message', 'Another reservation acquired this slot before approval completed.');
    end;
  else
    v_next := 'REJECTED';
    update public.reservations
    set status = v_next, approval_status = 'REJECTED', rejection_reason = p_notes,
        manager_decided_by = p_actor_id, manager_decided_at = timezone('UTC', now()),
        updated_by = left(p_actor_email, 255), updated_at = timezone('UTC', now())
    where id = p_reservation_id returning * into v_reservation;
  end if;

  perform public.phase5_record_reservation_action(v_reservation.id, p_actor_id, p_actor_email, p_actor_role,
    'MANAGER_DECISION', v_decision, 'PENDING_MANAGER_APPROVAL', v_next, p_notes, v_reservation.schedule_revision);
  perform public.phase5_audit(p_actor_id, p_actor_email,
    case when v_decision = 'APPROVE' then 'APPROVE_RESERVATION' else 'REJECT_RESERVATION' end,
    'FACILITIES', 'Reservation', v_reservation.id, 'Facilities Manager final decision recorded as ' || v_next || '.');
  perform public.phase5_notify_user(v_reservation.user_id,
    'phase5:reservation:' || v_reservation.id || ':manager-decision:' || v_reservation.schedule_revision,
    case when v_decision = 'APPROVE' then 'Reservation approved' else 'Reservation rejected' end,
    case when v_decision = 'APPROVE' then 'Your reservation was approved after operational and final review.'
         else 'Your reservation was rejected. Review the recorded decision reason.' end,
    case when v_decision = 'APPROVE' then 'RESERVATION_APPROVED' else 'RESERVATION_REJECTED' end,
    'Reservation', v_reservation.id::text);
  return jsonb_build_object('ok', true, 'data', to_jsonb(v_reservation));
end;
$$;

revoke all on function public.phase5_manager_decide_reservation(uuid,text,text,uuid,text,text) from public, anon, authenticated;

grant execute on function public.phase5_manager_decide_reservation(uuid,text,text,uuid,text,text) to postgres, service_role;

create or replace function public.phase5_reschedule_reservation(
  p_reservation_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_attendees integer,
  p_reason text,
  p_actor_id uuid,
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
  v_old_status text;
begin
  if p_actor_role not in ('EMPLOYEE', 'FACILITIES_OFFICER', 'FACILITIES_MANAGER', 'SUPER_ADMIN') then
    return jsonb_build_object('ok', false, 'errorCode', 'ACCESS_DENIED', 'message', 'Role may not reschedule reservations.');
  end if;
  if nullif(trim(p_reason), '') is null then
    return jsonb_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR', 'message', 'A reschedule reason is required.');
  end if;
  select * into v_reservation from public.reservations
  where id = p_reservation_id and is_deleted = false for update;
  if not found then return jsonb_build_object('ok', false, 'errorCode', 'RESERVATION_NOT_FOUND', 'message', 'Reservation was not found.'); end if;
  if p_actor_role = 'EMPLOYEE' and (v_reservation.user_id <> p_actor_id or v_reservation.status <> 'PENDING') then
    return jsonb_build_object('ok', false, 'errorCode', 'ACCESS_DENIED', 'message', 'Employees may reschedule only their own submitted reservation.');
  end if;
  if p_actor_role <> 'EMPLOYEE' and v_reservation.status not in ('PENDING', 'PENDING_MANAGER_APPROVAL', 'APPROVED', 'CONFIRMED') then
    return jsonb_build_object('ok', false, 'errorCode', 'RESERVATION_INVALID_STATUS', 'message', 'Reservation cannot be rescheduled from its current status.');
  end if;
  if p_start < timezone('UTC', now()) then
    return jsonb_build_object('ok', false, 'errorCode', 'PAST_TIME', 'message', 'Reservation cannot be moved into the past.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_reservation.room_id::text, 0));
  v_blocker := public.phase5_room_blocker(v_reservation.room_id, p_start, p_end, p_attendees, v_reservation.id);
  if v_blocker is not null then
    return jsonb_build_object('ok', false, 'errorCode', v_blocker->>'code', 'message', v_blocker->>'message');
  end if;
  v_old_status := v_reservation.status;
  update public.reservations
  set start_time = p_start, end_time = p_end, expected_attendees = p_attendees,
      status = 'PENDING', approval_status = 'PENDING', schedule_revision = schedule_revision + 1,
      officer_reviewed_by = null, officer_reviewed_at = null, officer_review_notes = null,
      officer_reviewed_schedule_revision = null, manager_decided_by = null, manager_decided_at = null,
      approved_by = null, approved_at = null, confirmed_at = null,
      reschedule_reason = p_reason, rescheduled_by = p_actor_id, rescheduled_at = timezone('UTC', now()),
      updated_by = left(p_actor_email, 255), updated_at = timezone('UTC', now())
  where id = p_reservation_id returning * into v_reservation;
  perform public.phase5_record_reservation_action(v_reservation.id, p_actor_id, p_actor_email, p_actor_role,
    'RESCHEDULE', 'RESCHEDULED', v_old_status, 'PENDING', p_reason, v_reservation.schedule_revision);
  perform public.phase5_audit(p_actor_id, p_actor_email, 'RESCHEDULE_RESERVATION', 'FACILITIES', 'Reservation',
    v_reservation.id, 'Reservation schedule changed; operational and manager approval were reset.');
  perform public.phase5_notify_user(v_reservation.user_id,
    'phase5:reservation:' || v_reservation.id || ':rescheduled:' || v_reservation.schedule_revision,
    'Reservation rescheduled', 'The reservation schedule changed and must pass operational and final review again.',
    'RESERVATION_RESCHEDULED', 'Reservation', v_reservation.id::text);
  return jsonb_build_object('ok', true, 'data', to_jsonb(v_reservation));
end;
$$;

revoke all on function public.phase5_reschedule_reservation(uuid,timestamptz,timestamptz,integer,text,uuid,text,text) from public, anon, authenticated;

grant execute on function public.phase5_reschedule_reservation(uuid,timestamptz,timestamptz,integer,text,uuid,text,text) to postgres, service_role;

create or replace function public.phase5_cancel_reservation(
  p_reservation_id uuid,
  p_reason text,
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_old_status text;
begin
  select * into v_reservation from public.reservations
  where id = p_reservation_id and is_deleted = false for update;
  if not found then return jsonb_build_object('ok', false, 'errorCode', 'RESERVATION_NOT_FOUND', 'message', 'Reservation was not found.'); end if;
  if p_actor_role = 'EMPLOYEE' and v_reservation.user_id <> p_actor_id then
    return jsonb_build_object('ok', false, 'errorCode', 'ACCESS_DENIED', 'message', 'Employees may cancel only their own reservation.');
  end if;
  if p_actor_role not in ('EMPLOYEE', 'FACILITIES_OFFICER', 'FACILITIES_MANAGER', 'SUPER_ADMIN') then
    return jsonb_build_object('ok', false, 'errorCode', 'ACCESS_DENIED', 'message', 'Role may not cancel reservations.');
  end if;
  if v_reservation.status in ('COMPLETED', 'REJECTED', 'CANCELLED') then
    return jsonb_build_object('ok', false, 'errorCode', 'RESERVATION_INVALID_STATUS', 'message', 'Reservation cannot be cancelled from its current status.');
  end if;
  v_old_status := v_reservation.status;
  update public.reservations
  set status = 'CANCELLED', approval_status = 'CANCELLED', cancellation_reason = coalesce(nullif(trim(p_reason), ''), 'Cancelled by authorized actor.'),
      cancelled_by = p_actor_id, cancelled_at = timezone('UTC', now()),
      updated_by = left(p_actor_email, 255), updated_at = timezone('UTC', now())
  where id = p_reservation_id returning * into v_reservation;
  perform public.phase5_record_reservation_action(v_reservation.id, p_actor_id, p_actor_email, p_actor_role,
    'CANCEL', 'CANCELLED', v_old_status, 'CANCELLED', v_reservation.cancellation_reason, v_reservation.schedule_revision);
  perform public.phase5_audit(p_actor_id, p_actor_email, 'CANCEL_RESERVATION', 'FACILITIES', 'Reservation',
    v_reservation.id, 'Reservation cancelled and its slot released.');
  perform public.phase5_notify_user(v_reservation.user_id,
    'phase5:reservation:' || v_reservation.id || ':cancelled',
    'Reservation cancelled', 'The reservation was cancelled and the time slot was released.',
    'RESERVATION_CANCELLED', 'Reservation', v_reservation.id::text);
  return jsonb_build_object('ok', true, 'data', to_jsonb(v_reservation));
end;
$$;

revoke all on function public.phase5_cancel_reservation(uuid,text,uuid,text,text) from public, anon, authenticated;

grant execute on function public.phase5_cancel_reservation(uuid,text,uuid,text,text) to postgres, service_role;

create or replace function public.phase5_confirm_reservation(
  p_reservation_id uuid,
  p_actor_id uuid,
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
  if p_actor_role not in ('FACILITIES_OFFICER', 'SUPER_ADMIN') then
    return jsonb_build_object('ok', false, 'errorCode', 'ACCESS_DENIED', 'message', 'Only a Facilities Officer may confirm approved reservation logistics.');
  end if;
  select * into v_reservation from public.reservations where id = p_reservation_id and is_deleted = false for update;
  if not found then return jsonb_build_object('ok', false, 'errorCode', 'RESERVATION_NOT_FOUND', 'message', 'Reservation was not found.'); end if;
  if v_reservation.status <> 'APPROVED' then
    return jsonb_build_object('ok', false, 'errorCode', 'RESERVATION_INVALID_STATUS', 'message', 'Only an approved reservation can be confirmed.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_reservation.room_id::text, 0));
  v_blocker := public.phase5_room_blocker(v_reservation.room_id, v_reservation.start_time, v_reservation.end_time,
    v_reservation.expected_attendees, v_reservation.id);
  if v_blocker is not null then return jsonb_build_object('ok', false, 'errorCode', v_blocker->>'code', 'message', v_blocker->>'message'); end if;
  update public.reservations set status = 'CONFIRMED', confirmed_at = timezone('UTC', now()),
    updated_by = left(p_actor_email, 255), updated_at = timezone('UTC', now())
  where id = p_reservation_id returning * into v_reservation;
  perform public.phase5_record_reservation_action(v_reservation.id, p_actor_id, p_actor_email, p_actor_role,
    'CONFIRM', 'CONFIRMED', 'APPROVED', 'CONFIRMED', 'Operational confirmation completed.', v_reservation.schedule_revision);
  perform public.phase5_notify_user(v_reservation.user_id,
    'phase5:reservation:' || v_reservation.id || ':confirmed:' || v_reservation.schedule_revision,
    'Reservation confirmed', 'Your approved reservation is confirmed for facility use.',
    'RESERVATION_CONFIRMED', 'Reservation', v_reservation.id::text);
  return jsonb_build_object('ok', true, 'data', to_jsonb(v_reservation));
end;
$$;

revoke all on function public.phase5_confirm_reservation(uuid,uuid,text,text) from public, anon, authenticated;

grant execute on function public.phase5_confirm_reservation(uuid,uuid,text,text) to postgres, service_role;

create or replace function public.phase5_complete_reservation(
  p_reservation_id uuid,
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text,
  p_completed_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
begin
  if p_actor_role not in ('FACILITIES_OFFICER', 'FACILITIES_MANAGER', 'SUPER_ADMIN') then
    return jsonb_build_object('ok', false, 'errorCode', 'ACCESS_DENIED', 'message', 'Role may not complete reservations.');
  end if;
  select * into v_reservation from public.reservations where id = p_reservation_id and is_deleted = false for update;
  if not found then return jsonb_build_object('ok', false, 'errorCode', 'RESERVATION_NOT_FOUND', 'message', 'Reservation was not found.'); end if;
  if v_reservation.status not in ('APPROVED', 'CONFIRMED') or p_completed_at < v_reservation.end_time then
    return jsonb_build_object('ok', false, 'errorCode', 'RESERVATION_NOT_COMPLETABLE', 'message', 'Reservation can be completed only after its scheduled end.');
  end if;
  update public.reservations set status = 'COMPLETED', completed_at = p_completed_at,
    updated_by = left(p_actor_email, 255), updated_at = timezone('UTC', now())
  where id = p_reservation_id returning * into v_reservation;
  perform public.phase5_record_reservation_action(v_reservation.id, p_actor_id, p_actor_email, p_actor_role,
    'COMPLETE', 'COMPLETED', 'CONFIRMED', 'COMPLETED', 'Facility usage completed.', v_reservation.schedule_revision);
  perform public.phase5_audit(p_actor_id, p_actor_email, 'COMPLETE_RESERVATION', 'FACILITIES', 'Reservation',
    v_reservation.id, 'Reservation marked completed after its scheduled end.');
  return jsonb_build_object('ok', true, 'data', to_jsonb(v_reservation));
end;
$$;

revoke all on function public.phase5_complete_reservation(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;

grant execute on function public.phase5_complete_reservation(uuid,uuid,text,text,timestamptz) to postgres, service_role;

commit;
