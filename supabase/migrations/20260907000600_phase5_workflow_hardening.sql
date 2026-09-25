-- Phase 5 follow-up hardening: insert guards, watchlist severity, operating
-- hours, stronger direct-update guards, and service-only diagnostics.

alter table public.visitor_watchlist
  add column if not exists severity text not null default 'HIGH';
alter table public.visitor_watchlist
  drop constraint if exists chk_visitor_watchlist_severity,
  add constraint chk_visitor_watchlist_severity
    check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

create or replace function public.phase5_guard_visitor_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clearance text;
  v_verification public.visitor_verifications%rowtype;
  v_watchlist_id uuid;
begin
  if old.status = 'REGISTERED'
     and (new.full_name is distinct from old.full_name or new.id_number is distinct from old.id_number) then
    new.current_verification_id := null;
  end if;
  if new.status is distinct from old.status then
    if not (
      (old.status = 'REGISTERED' and new.status in ('CHECKED_IN', 'CANCELLED'))
      or (old.status = 'CHECKED_IN' and new.status = 'CHECKED_OUT')
    ) then
      raise exception using errcode = 'P0001', message = 'VISITOR_INVALID_STATUS_TRANSITION';
    end if;
    if new.status = 'CHECKED_IN' then
      select * into v_verification
      from public.visitor_verifications
      where id = new.current_verification_id and visitor_id = new.id
        and verification_status = 'VERIFIED' and is_deleted = false;
      v_clearance := v_verification.clearance_state;
      if coalesce(v_clearance, '') <> 'CLEAR' then
        raise exception using errcode = 'P0001', message = 'VISITOR_CLEARANCE_REQUIRED';
      end if;
      if new.host_id is null or not exists (
        select 1 from public.users u where u.id = new.host_id and u.status = 'ACTIVE' and u.is_deleted = false
      ) then
        raise exception using errcode = 'P0001', message = 'VISITOR_HOST_REQUIRED';
      end if;
      select id into v_watchlist_id from public.visitor_watchlist
      where status = 'ACTIVE' and is_deleted = false
        and upper(regexp_replace(coalesce(id_number, ''), '[^A-Za-z0-9]', '', 'g')) <> ''
        and upper(regexp_replace(coalesce(id_number, ''), '[^A-Za-z0-9]', '', 'g')) =
            upper(regexp_replace(coalesce(new.id_number, v_verification.id_number, ''), '[^A-Za-z0-9]', '', 'g'))
      limit 1;
      if v_watchlist_id is not null then
        raise exception using errcode = 'P0001', message = 'VISITOR_BLOCKED';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.phase5_guard_visitor_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from 'REGISTERED' then
    raise exception using errcode = 'P0001', message = 'VISITOR_MUST_START_REGISTERED';
  end if;
  if new.actual_arrival is not null or new.actual_departure is not null then
    raise exception using errcode = 'P0001', message = 'VISITOR_INVALID_INITIAL_STATE';
  end if;
  return new;
end;
$$;

create or replace function public.phase5_record_visitor_registration()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.visitor_workflow_events (
    visitor_id, event_type, from_status, to_status, actor_email, actor_role, details
  ) values (
    new.id, 'REGISTRATION', null, new.status, new.created_by,
    case when new.created_by is not null then 'REGISTERING_ACTOR' else 'SYSTEM' end,
    jsonb_build_object('hostAssigned', new.host_id is not null, 'expectedArrivalRecorded', new.expected_arrival is not null)
  );
  return new;
end;
$$;

drop trigger if exists phase5_guard_visitor_insert on public.visitors;
create trigger phase5_guard_visitor_insert before insert on public.visitors
for each row execute function public.phase5_guard_visitor_insert();
drop trigger if exists phase5_record_visitor_registration on public.visitors;
create trigger phase5_record_visitor_registration after insert on public.visitors
for each row execute function public.phase5_record_visitor_registration();

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
  if v_room.open_time is not null and v_room.close_time is not null
     and (p_start::time < v_room.open_time or p_end::time > v_room.close_time) then
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

create or replace function public.phase5_guard_reservation_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status not in ('DRAFT', 'PENDING') then
    raise exception using errcode = 'P0001', message = 'RESERVATION_MUST_START_PENDING';
  end if;
  if new.room_id is null or new.user_id is null or nullif(trim(new.title), '') is null
     or new.start_time is null or new.end_time is null then
    raise exception using errcode = 'P0001', message = 'RESERVATION_REQUIRED_FIELDS';
  end if;
  return new;
end;
$$;

drop trigger if exists phase5_guard_reservation_insert on public.reservations;
create trigger phase5_guard_reservation_insert before insert on public.reservations
for each row execute function public.phase5_guard_reservation_insert();

create or replace function public.phase5_guard_reservation_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_blocker jsonb;
begin
  if new.status is distinct from old.status and not (
    (old.status = 'DRAFT' and new.status in ('PENDING', 'CANCELLED'))
    or (old.status = 'PENDING' and new.status in ('PENDING_MANAGER_APPROVAL', 'CANCELLED'))
    or (old.status = 'PENDING_MANAGER_APPROVAL' and new.status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'))
    or (old.status = 'APPROVED' and new.status in ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'))
    or (old.status = 'CONFIRMED' and new.status in ('PENDING', 'CHECKED_IN', 'COMPLETED', 'CANCELLED'))
    or (old.status = 'CHECKED_IN' and new.status in ('COMPLETED', 'CANCELLED'))
  ) then
    raise exception using errcode = 'P0001', message = 'RESERVATION_INVALID_STATUS_TRANSITION';
  end if;
  if new.status = 'PENDING_MANAGER_APPROVAL' and (
    new.officer_reviewed_by is null or new.officer_reviewed_at is null
    or new.officer_reviewed_schedule_revision is distinct from new.schedule_revision
  ) then
    raise exception using errcode = 'P0001', message = 'RESERVATION_OFFICER_REVIEW_REQUIRED';
  end if;
  if new.status = 'APPROVED' then
    if new.manager_decided_by is null or new.manager_decided_at is null
       or new.officer_reviewed_schedule_revision is distinct from new.schedule_revision then
      raise exception using errcode = 'P0001', message = 'RESERVATION_MANAGER_APPROVAL_REQUIRED';
    end if;
    v_blocker := public.phase5_room_blocker(new.room_id, new.start_time, new.end_time,
      new.expected_attendees, new.id);
    if v_blocker is not null then
      raise exception using errcode = 'P0001', message = coalesce(v_blocker->>'code', 'RESERVATION_BLOCKED');
    end if;
  end if;
  if new.status = 'CONFIRMED' and new.confirmed_at is null then
    raise exception using errcode = 'P0001', message = 'RESERVATION_CONFIRMATION_REQUIRED';
  end if;
  if new.status = 'COMPLETED' and new.completed_at is null then
    raise exception using errcode = 'P0001', message = 'RESERVATION_COMPLETION_REQUIRED';
  end if;
  new.approval_status := case
    when new.status in ('APPROVED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED') then 'APPROVED'
    when new.status = 'REJECTED' then 'REJECTED'
    when new.status = 'CANCELLED' then 'CANCELLED'
    else 'PENDING'
  end;
  return new;
end;
$$;

drop trigger if exists phase5_guard_reservation_update on public.reservations;
create trigger phase5_guard_reservation_update before update on public.reservations
for each row execute function public.phase5_guard_reservation_update();

create or replace function public.phase5_workflow_diagnostics()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'rls', jsonb_build_object(
      'visitors', (select relrowsecurity from pg_class where oid = 'public.visitors'::regclass),
      'verifications', (select relrowsecurity from pg_class where oid = 'public.visitor_verifications'::regclass),
      'reviews', (select relrowsecurity from pg_class where oid = 'public.visitor_clearance_reviews'::regclass),
      'visitorEvents', (select relrowsecurity from pg_class where oid = 'public.visitor_workflow_events'::regclass),
      'reservations', (select relrowsecurity from pg_class where oid = 'public.reservations'::regclass),
      'approvals', (select relrowsecurity from pg_class where oid = 'public.reservation_approvals'::regclass)
    ),
    'constraints', jsonb_build_object(
      'activeOverlapExclusion', exists(select 1 from pg_constraint where conname = 'reservations_no_active_overlap'),
      'reservationStatus', exists(select 1 from pg_constraint where conname = 'chk_phase5_reservation_status'),
      'clearanceState', exists(select 1 from pg_constraint where conname = 'chk_visitor_verification_clearance_state')
    ),
    'triggers', jsonb_build_object(
      'visitorUpdateGuard', exists(select 1 from pg_trigger where tgname = 'phase5_guard_visitor_update' and not tgisinternal),
      'visitorInsertGuard', exists(select 1 from pg_trigger where tgname = 'phase5_guard_visitor_insert' and not tgisinternal),
      'reservationUpdateGuard', exists(select 1 from pg_trigger where tgname = 'phase5_guard_reservation_update' and not tgisinternal),
      'reservationInsertGuard', exists(select 1 from pg_trigger where tgname = 'phase5_guard_reservation_insert' and not tgisinternal)
    ),
    'privileges', jsonb_build_object(
      'anonCanCheckIn', has_function_privilege('anon', 'public.phase5_check_in_visitor(uuid,uuid,text,text,timestamptz)', 'EXECUTE'),
      'authenticatedCanApprove', has_function_privilege('authenticated', 'public.phase5_manager_decide_reservation(uuid,text,text,uuid,text,text)', 'EXECUTE'),
      'serviceCanCheckIn', has_function_privilege('service_role', 'public.phase5_check_in_visitor(uuid,uuid,text,text,timestamptz)', 'EXECUTE'),
      'serviceCanApprove', has_function_privilege('service_role', 'public.phase5_manager_decide_reservation(uuid,text,text,uuid,text,text)', 'EXECUTE')
    )
  );
$$;

do $$
declare
  v_signature regprocedure;
begin
  for v_signature in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'phase5_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to postgres, service_role', v_signature);
  end loop;
end $$;

