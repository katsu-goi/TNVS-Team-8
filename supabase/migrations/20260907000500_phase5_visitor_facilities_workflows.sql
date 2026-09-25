-- Phase 5: authoritative Visitor Management and Facilities Reservation workflows.
-- Existing tables remain authoritative. This migration adds decision provenance,
-- append-only workflow history, transactional workflow functions, and database
-- guards so Edge/UI callers cannot bypass clearance or reservation rules.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Visitor clearance and history
-- ---------------------------------------------------------------------------

alter table public.visitors
  add column if not exists current_verification_id uuid;

alter table public.visitor_verifications
  add column if not exists automated_clearance text,
  add column if not exists clearance_state text,
  add column if not exists matched_watchlist_entry_id uuid,
  add column if not exists match_type text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamp,
  add column if not exists review_notes text;

alter table public.visitor_watchlist
  add column if not exists severity text not null default 'HIGH';

alter table public.visitor_watchlist
  drop constraint if exists chk_visitor_watchlist_severity,
  add constraint chk_visitor_watchlist_severity
    check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

update public.visitor_verifications
set automated_clearance = case
      when watchlist_status = 'FLAGGED' then 'REVIEW_REQUIRED'
      when verification_status = 'VERIFIED' then 'CLEAR'
      else 'REVIEW_REQUIRED'
    end,
    clearance_state = case
      when watchlist_status = 'FLAGGED' then 'REVIEW_REQUIRED'
      when verification_status = 'VERIFIED' then 'CLEAR'
      else 'REVIEW_REQUIRED'
    end
where automated_clearance is null or clearance_state is null;

alter table public.visitor_verifications
  alter column automated_clearance set default 'REVIEW_REQUIRED',
  alter column clearance_state set default 'REVIEW_REQUIRED';

alter table public.visitor_verifications
  drop constraint if exists chk_visitor_verification_automated_clearance,
  add constraint chk_visitor_verification_automated_clearance
    check (automated_clearance in ('CLEAR', 'REVIEW_REQUIRED', 'BLOCKED')),
  drop constraint if exists chk_visitor_verification_clearance_state,
  add constraint chk_visitor_verification_clearance_state
    check (clearance_state in ('CLEAR', 'REVIEW_REQUIRED', 'BLOCKED')),
  drop constraint if exists chk_visitor_verification_match_type,
  add constraint chk_visitor_verification_match_type
    check (match_type is null or match_type in ('ID_EXACT', 'NAME_EXACT'));

create table if not exists public.visitor_clearance_reviews (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  verification_id uuid not null,
  original_clearance text not null,
  decision text not null,
  reviewer_id uuid not null,
  reviewer_email varchar(255) not null,
  reviewer_role varchar(100) not null,
  notes text not null,
  reviewed_at timestamptz not null default now(),
  constraint chk_visitor_clearance_review_original
    check (original_clearance in ('REVIEW_REQUIRED', 'BLOCKED')),
  constraint chk_visitor_clearance_review_decision
    check (decision in ('CLEAR', 'BLOCK'))
);

create table if not exists public.visitor_workflow_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  verification_id uuid,
  event_type varchar(100) not null,
  from_status varchar(50),
  to_status varchar(50),
  actor_id uuid,
  actor_email varchar(255),
  actor_role varchar(100),
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_visitor_clearance_reviews_verification
  on public.visitor_clearance_reviews(verification_id, reviewed_at desc);
create index if not exists idx_visitor_workflow_events_visitor
  on public.visitor_workflow_events(visitor_id, occurred_at desc);
create index if not exists idx_visitor_watchlist_active_id_exact
  on public.visitor_watchlist ((upper(regexp_replace(coalesce(id_number, ''), '[^A-Za-z0-9]', '', 'g'))))
  where status = 'ACTIVE' and is_deleted = false;
create index if not exists idx_visitor_watchlist_active_name_exact
  on public.visitor_watchlist ((lower(regexp_replace(trim(full_name), '\\s+', ' ', 'g'))))
  where status = 'ACTIVE' and is_deleted = false;

alter table public.visitor_clearance_reviews enable row level security;
alter table public.visitor_workflow_events enable row level security;
revoke all on table public.visitor_clearance_reviews from anon, authenticated;
revoke all on table public.visitor_workflow_events from anon, authenticated;

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
    new.id, 'REGISTRATION', null, new.status, new.created_by, 'REGISTRAR',
    jsonb_build_object('hostAssigned', new.host_id is not null, 'expectedArrivalRecorded', new.expected_arrival is not null)
  );
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

drop trigger if exists phase5_guard_visitor_insert on public.visitors;
create trigger phase5_guard_visitor_insert
before insert on public.visitors
for each row execute function public.phase5_guard_visitor_insert();

drop trigger if exists phase5_record_visitor_registration on public.visitors;
create trigger phase5_record_visitor_registration
after insert on public.visitors
for each row execute function public.phase5_record_visitor_registration();

-- ---------------------------------------------------------------------------
-- Reservation workflow and durable decision history
-- ---------------------------------------------------------------------------

alter table public.reservations
  add column if not exists officer_reviewed_by uuid,
  add column if not exists officer_reviewed_at timestamptz,
  add column if not exists officer_review_notes text,
  add column if not exists officer_reviewed_schedule_revision integer,
  add column if not exists manager_decided_by uuid,
  add column if not exists manager_decided_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by uuid,
  add column if not exists cancelled_at timestamptz,
  add column if not exists reschedule_reason text,
  add column if not exists rescheduled_by uuid,
  add column if not exists rescheduled_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists schedule_revision integer not null default 1;

update public.reservations
set status = 'PENDING'
where status = 'PENDING_APPROVAL';

alter table public.reservations
  drop constraint if exists chk_phase5_reservation_status,
  add constraint chk_phase5_reservation_status check (
    status in (
      'DRAFT', 'PENDING', 'PENDING_MANAGER_APPROVAL', 'APPROVED',
      'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'REJECTED', 'CANCELLED'
    )
  ),
  drop constraint if exists chk_phase5_reservation_time_range,
  add constraint chk_phase5_reservation_time_range
    check (start_time is null or end_time is null or start_time < end_time),
  drop constraint if exists chk_phase5_reservation_attendees,
  add constraint chk_phase5_reservation_attendees
    check (expected_attendees is null or expected_attendees > 0),
  drop constraint if exists reservations_no_active_overlap;

alter table public.reservations
  add constraint reservations_no_active_overlap
  exclude using gist (
    room_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  )
  where (
    is_deleted = false
    and status in ('APPROVED', 'CONFIRMED', 'CHECKED_IN')
    and room_id is not null
    and start_time is not null
    and end_time is not null
  );

alter table public.reservation_approvals
  add column if not exists actor_role varchar(100),
  add column if not exists action varchar(100),
  add column if not exists from_status varchar(50),
  add column if not exists to_status varchar(50),
  add column if not exists schedule_revision integer;

create index if not exists idx_reservations_officer_queue
  on public.reservations(status, start_time)
  where is_deleted = false and status = 'PENDING';
create index if not exists idx_reservations_manager_queue
  on public.reservations(status, start_time)
  where is_deleted = false and status = 'PENDING_MANAGER_APPROVAL';
create index if not exists idx_reservations_active_room_time
  on public.reservations(room_id, start_time, end_time)
  where is_deleted = false and status in ('APPROVED', 'CONFIRMED', 'CHECKED_IN');

-- ---------------------------------------------------------------------------
-- Shared helpers (service-only)
-- ---------------------------------------------------------------------------

create or replace function public.phase5_notify_user(
  p_recipient_id uuid,
  p_dedup_key text,
  p_title text,
  p_message text,
  p_type text,
  p_entity_type text,
  p_entity_id text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_recipient_id is null then
    return;
  end if;
  insert into public.employee_notifications (
    recipient_id, title, message, type, related_entity_type, related_entity_id,
    dedup_key, is_read, is_deleted, created_at, created_by
  ) values (
    p_recipient_id, left(p_title, 255), p_message, p_type,
    p_entity_type, p_entity_id, left(p_dedup_key, 500),
    false, false, timezone('UTC', now()), 'PHASE5_WORKFLOW'
  ) on conflict (recipient_id, dedup_key) where dedup_key is not null do nothing;
end;
$$;

create or replace function public.phase5_notify_roles(
  p_roles text[],
  p_dedup_key text,
  p_title text,
  p_message text,
  p_type text,
  p_entity_type text,
  p_entity_id text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.employee_notifications (
    recipient_id, title, message, type, related_entity_type, related_entity_id,
    dedup_key, is_read, is_deleted, created_at, created_by
  )
  select distinct u.id, left(p_title, 255), p_message, p_type,
         p_entity_type, p_entity_id,
         left(p_dedup_key || ':' || u.id::text, 500),
         false, false, timezone('UTC', now()), 'PHASE5_WORKFLOW'
  from public.users u
  join public.user_roles ur on ur.user_id = u.id
  join public.roles r on r.id = ur.role_id
  where r.name = any(p_roles)
    and u.status = 'ACTIVE'
    and u.is_deleted = false
  on conflict (recipient_id, dedup_key) where dedup_key is not null do nothing;
end;
$$;

create or replace function public.phase5_audit(
  p_actor_id uuid,
  p_actor_email text,
  p_action text,
  p_module text,
  p_entity_type text,
  p_entity_id uuid,
  p_description text,
  p_severity text default 'INFO'
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (
    user_id, user_email, action, entity_type, entity_id, module,
    description, severity, status, created_at
  ) values (
    p_actor_id, left(p_actor_email, 255), left(p_action, 100), left(p_entity_type, 100),
    p_entity_id::text, left(p_module, 50), left(p_description, 1000),
    left(p_severity, 20), 'SUCCESS', timezone('UTC', now())
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Visitor operations
-- ---------------------------------------------------------------------------

create or replace function public.phase5_verify_visitor(
  p_visitor_id uuid,
  p_id_type text,
  p_id_number text,
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visitor public.visitors%rowtype;
  v_verification public.visitor_verifications%rowtype;
  v_watchlist public.visitor_watchlist%rowtype;
  v_id_type text := case when upper(coalesce(p_id_type, 'OTHER')) in
    ('DRIVERS_LICENSE', 'UMID', 'PASSPORT', 'NATIONAL_ID', 'OTHER')
    then upper(coalesce(p_id_type, 'OTHER')) else 'OTHER' end;
  v_presented text;
  v_normalized_id text;
  v_normalized_name text;
  v_format_valid boolean;
  v_clearance text;
  v_watchlist_status text := 'CLEAR';
  v_match_type text;
  v_score numeric(5,2);
  v_notes text;
begin
  select * into v_visitor from public.visitors
  where id = p_visitor_id and is_deleted = false
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_NOT_FOUND', 'message', 'Visitor was not found.');
  end if;
  if v_visitor.status <> 'REGISTERED' then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_INVALID_STATUS', 'message', 'Only a registered visitor can be verified.');
  end if;

  v_presented := coalesce(nullif(trim(p_id_number), ''), v_visitor.id_number, '');
  v_normalized_id := upper(regexp_replace(v_presented, '[^A-Za-z0-9]', '', 'g'));
  v_normalized_name := lower(regexp_replace(trim(v_visitor.full_name), '\s+', ' ', 'g'));
  v_format_valid := case
    when v_normalized_id = '' then false
    when v_id_type = 'DRIVERS_LICENSE' then v_normalized_id ~ '^[A-Z][0-9]{9,10}$'
    else v_normalized_id ~ '^[A-Z0-9]{6,}$'
  end;

  select * into v_watchlist
  from public.visitor_watchlist
  where status = 'ACTIVE' and is_deleted = false
    and v_normalized_id <> ''
    and upper(regexp_replace(coalesce(id_number, ''), '[^A-Za-z0-9]', '', 'g')) = v_normalized_id
  order by created_at desc
  limit 1;

  if found then
    v_clearance := 'BLOCKED';
    v_watchlist_status := 'FLAGGED';
    v_match_type := 'ID_EXACT';
    v_score := 0.99;
    v_notes := 'Active watchlist ID match. Entry requires authorized security resolution before any new verification.';
  else
    select * into v_watchlist
    from public.visitor_watchlist
    where status = 'ACTIVE' and is_deleted = false
      and lower(regexp_replace(trim(full_name), '\s+', ' ', 'g')) = v_normalized_name
    order by created_at desc
    limit 1;
    if found then
      v_clearance := 'REVIEW_REQUIRED';
      v_watchlist_status := 'FLAGGED';
      v_match_type := 'NAME_EXACT';
      v_score := 0.80;
      v_notes := 'Exact normalized-name watchlist match. Identity must be reviewed manually.';
    elsif not v_format_valid then
      v_clearance := 'REVIEW_REQUIRED';
      v_score := 0.40;
      v_notes := 'No watchlist match, but the presented ID is missing or does not satisfy the selected ID format.';
    else
      v_clearance := 'CLEAR';
      v_score := 0.70;
      v_notes := 'No exact active watchlist match and the presented ID satisfies the selected format.';
    end if;
  end if;

  insert into public.visitor_verifications (
    visitor_id, id_type, id_number, extracted_fields, match_score,
    watchlist_status, verification_status, automated_clearance, clearance_state,
    matched_watchlist_entry_id, match_type, verified_at, verified_by, notes,
    created_at, updated_at, created_by
  ) values (
    v_visitor.id, v_id_type, v_presented,
    jsonb_build_object(
      'idType', v_id_type,
      'normalizedIdNumber', v_normalized_id,
      'formatValid', v_format_valid,
      'detectedFormat', case when v_format_valid then 'ALPHANUMERIC' else 'UNRECOGNIZED' end,
      'source', 'DETERMINISTIC_EXACT_MATCH'
    ),
    v_score, v_watchlist_status, 'VERIFIED', v_clearance, v_clearance,
    v_watchlist.id, v_match_type, timezone('UTC', now()), left(p_actor_email, 255),
    v_notes, timezone('UTC', now()), timezone('UTC', now()), left(p_actor_email, 255)
  ) returning * into v_verification;

  update public.visitors
  set current_verification_id = v_verification.id,
      updated_at = timezone('UTC', now()),
      updated_by = left(p_actor_email, 255)
  where id = v_visitor.id;

  insert into public.visitor_workflow_events (
    visitor_id, verification_id, event_type, from_status, to_status,
    actor_id, actor_email, actor_role, details
  ) values (
    v_visitor.id, v_verification.id, 'VERIFICATION_COMPLETED', v_visitor.status, v_visitor.status,
    p_actor_id, left(p_actor_email, 255), left(p_actor_role, 100),
    jsonb_build_object('clearance', v_clearance, 'watchlistOutcome', v_watchlist_status, 'matchType', v_match_type)
  );

  if v_watchlist_status = 'FLAGGED' then
    insert into public.security_alerts(title, description, severity, alert_type, target_ip, status)
    values (
      'Visitor verification requires attention',
      'A visitor verification produced an active watchlist signal. Review the protected visitor record.',
      case when v_clearance = 'BLOCKED' then 'CRITICAL' else 'HIGH' end,
      'VISITOR_WATCHLIST', '', 'UNRESOLVED'
    );
  end if;

  perform public.phase5_audit(p_actor_id, p_actor_email, 'VERIFY_VISITOR', 'VISITOR', 'Visitor',
    v_visitor.id, 'Visitor identity and watchlist verification completed with clearance ' || v_clearance || '.');

  return jsonb_build_object('ok', true, 'data', to_jsonb(v_verification));
end;
$$;

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
  if p_actor_role <> 'FACILITIES_OFFICER' then
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
  if p_actor_role <> 'FACILITIES_OFFICER' then
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
  if p_actor_role <> 'FACILITIES_OFFICER' then
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

-- Invalidate a clearance when identity data changes and reject illegal direct
-- transitions even for privileged application code.
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
    case when new.host_id is not null and new.created_by is not null then 'REGISTERING_ACTOR' else 'SYSTEM' end,
    jsonb_build_object('hostAssigned', new.host_id is not null, 'expectedArrivalRecorded', new.expected_arrival is not null)
  );
  return new;
end;
$$;

drop trigger if exists phase5_record_visitor_registration on public.visitors;
create trigger phase5_record_visitor_registration
after insert on public.visitors
for each row execute function public.phase5_record_visitor_registration();

drop trigger if exists phase5_guard_visitor_update on public.visitors;
create trigger phase5_guard_visitor_update
before update on public.visitors
for each row execute function public.phase5_guard_visitor_update();

-- ---------------------------------------------------------------------------
-- Reservation operations
-- ---------------------------------------------------------------------------

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

create or replace function public.phase5_record_reservation_action(
  p_reservation_id uuid,
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text,
  p_action text,
  p_decision text,
  p_from_status text,
  p_to_status text,
  p_notes text,
  p_schedule_revision integer
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.reservation_approvals (
    reservation_id, approved_by, decision, comments, decided_at, created_by,
    actor_role, action, from_status, to_status, schedule_revision
  ) values (
    p_reservation_id, p_actor_id, p_decision, p_notes, timezone('UTC', now()),
    left(p_actor_email, 255), left(p_actor_role, 100), left(p_action, 100),
    p_from_status, p_to_status, p_schedule_revision
  );
end;
$$;

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
  if p_actor_role <> 'FACILITIES_OFFICER' then
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
  if p_actor_role <> 'FACILITIES_MANAGER' then
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
  if p_actor_role not in ('EMPLOYEE', 'FACILITIES_OFFICER', 'FACILITIES_MANAGER') then
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
  if p_actor_role not in ('EMPLOYEE', 'FACILITIES_OFFICER', 'FACILITIES_MANAGER') then
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
  if p_actor_role <> 'FACILITIES_OFFICER' then
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
  if p_actor_role not in ('FACILITIES_OFFICER', 'FACILITIES_MANAGER') then
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
create trigger phase5_guard_reservation_insert
before insert on public.reservations
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
    new.officer_reviewed_by is null
    or new.officer_reviewed_at is null
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
create trigger phase5_guard_reservation_update
before update on public.reservations
for each row execute function public.phase5_guard_reservation_update();

-- Sanitized Realtime markers for the two append-only history streams.
drop trigger if exists emit_realtime_event on public.visitor_clearance_reviews;
create trigger emit_realtime_event
after insert on public.visitor_clearance_reviews
for each row execute function public.emit_realtime_event();
drop trigger if exists emit_realtime_event on public.visitor_workflow_events;
create trigger emit_realtime_event
after insert on public.visitor_workflow_events
for each row execute function public.emit_realtime_event();
drop trigger if exists emit_realtime_event on public.reservation_approvals;
create trigger emit_realtime_event
after insert on public.reservation_approvals
for each row execute function public.emit_realtime_event();

-- All workflow functions are invoked only by trusted Edge Functions.
do $$
declare
  v_signature regprocedure;
begin
  for v_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'phase5_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to postgres, service_role', v_signature);
  end loop;
end $$;
