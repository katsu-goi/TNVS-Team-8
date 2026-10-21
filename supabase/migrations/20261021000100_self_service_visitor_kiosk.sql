-- Self-service visitor kiosk: approval, identity-review, pass delivery and
-- private identity-artifact storage. The existing visitors table remains the
-- source of truth; no parallel visitor system is introduced.

alter table public.visitors
  add column if not exists reference_number varchar(32),
  add column if not exists registration_source varchar(20) not null default 'STAFF',
  add column if not exists purpose_category varchar(80),
  add column if not exists other_purpose text,
  add column if not exists receiving_department varchar(100),
  add column if not exists id_type varchar(50),
  add column if not exists id_number_last4 varchar(4),
  add column if not exists privacy_notice_version varchar(50),
  add column if not exists privacy_acknowledged_at timestamptz,
  add column if not exists identity_verification_status varchar(40) not null default 'LEGACY_REVIEW',
  add column if not exists identity_verification_provider varchar(80),
  add column if not exists approval_status varchar(30) not null default 'NOT_REQUIRED',
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists declined_by uuid,
  add column if not exists declined_at timestamptz,
  add column if not exists approval_reason text,
  add column if not exists access_status varchar(30) not null default 'NOT_AUTHORIZED',
  add column if not exists qr_token_hash varchar(64),
  add column if not exists qr_issued_at timestamptz,
  add column if not exists qr_expires_at timestamptz,
  add column if not exists qr_revoked_at timestamptz,
  add column if not exists email_delivery_status varchar(30) not null default 'NOT_REQUESTED',
  add column if not exists email_provider_id text,
  add column if not exists email_delivery_error text,
  add column if not exists email_attempted_at timestamptz,
  add column if not exists submission_key_hash varchar(64);

alter table public.visitors
  drop constraint if exists visitors_registration_source_check,
  add constraint visitors_registration_source_check
    check (registration_source in ('STAFF', 'EMPLOYEE', 'KIOSK')),
  drop constraint if exists visitors_identity_verification_status_check,
  add constraint visitors_identity_verification_status_check
    check (identity_verification_status in (
      'LEGACY_REVIEW', 'PROVIDER_NOT_CONFIGURED', 'PENDING', 'VERIFIED',
      'NEEDS_MANUAL_REVIEW', 'MANUAL_REVIEW_APPROVED', 'FAILED', 'UNAVAILABLE'
    )),
  drop constraint if exists visitors_approval_status_check,
  add constraint visitors_approval_status_check
    check (approval_status in ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'DECLINED', 'CANCELLED')),
  drop constraint if exists visitors_access_status_check,
  add constraint visitors_access_status_check
    check (access_status in ('NOT_AUTHORIZED', 'AUTHORIZED', 'REVOKED', 'EXPIRED')),
  drop constraint if exists visitors_email_delivery_status_check,
  add constraint visitors_email_delivery_status_check
    check (email_delivery_status in ('NOT_REQUESTED', 'PENDING', 'ACCEPTED', 'FAILED', 'NOT_CONFIGURED')),
  drop constraint if exists visitors_other_purpose_check,
  add constraint visitors_other_purpose_check
    check (purpose_category <> 'OTHER' or length(trim(coalesce(other_purpose, ''))) between 3 and 500),
  drop constraint if exists visitors_kiosk_privacy_check,
  add constraint visitors_kiosk_privacy_check
    check (registration_source <> 'KIOSK' or (privacy_acknowledged_at is not null and privacy_notice_version is not null)),
  drop constraint if exists visitors_kiosk_approval_check,
  add constraint visitors_kiosk_approval_check
    check (registration_source <> 'KIOSK' or approval_status <> 'NOT_REQUIRED');

create unique index if not exists visitors_reference_number_unique
  on public.visitors(reference_number) where reference_number is not null;
create unique index if not exists visitors_qr_token_hash_unique
  on public.visitors(qr_token_hash) where qr_token_hash is not null;
create unique index if not exists visitors_submission_key_hash_unique
  on public.visitors(submission_key_hash) where submission_key_hash is not null;
create index if not exists visitors_kiosk_review_queue
  on public.visitors(approval_status, created_at desc)
  where registration_source = 'KIOSK' and is_deleted = false;
create index if not exists visitors_pass_expiry
  on public.visitors(qr_expires_at)
  where qr_token_hash is not null and access_status = 'AUTHORIZED';

create table if not exists public.visitor_identity_artifacts (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  artifact_type varchar(30) not null,
  storage_path text not null unique,
  mime_type varchar(80) not null,
  byte_size integer not null,
  captured_at timestamptz not null default now(),
  delete_after timestamptz,
  deleted_at timestamptz,
  constraint visitor_identity_artifact_type_check
    check (artifact_type in ('ID_FRONT', 'ID_BACK', 'FACE_CAPTURE')),
  constraint visitor_identity_artifact_size_check
    check (byte_size > 0 and byte_size <= 5242880)
);

create index if not exists visitor_identity_artifacts_visitor_idx
  on public.visitor_identity_artifacts(visitor_id, captured_at desc);

alter table public.visitor_identity_artifacts enable row level security;
revoke all on public.visitor_identity_artifacts from public, anon, authenticated;
grant all on public.visitor_identity_artifacts to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visitor-identity-private',
  'visitor-identity-private',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Allow all for anon" on public.visitors;
revoke all on public.visitors from anon, authenticated;
grant all on public.visitors to service_role;

-- Kiosk visitors may enter only after a separate identity review, visit
-- approval, and pass authorization. Legacy staff-created visitor behavior is
-- retained, but cannot bypass the kiosk-specific checks.
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
      (old.status = 'REGISTERED' and new.status in ('CHECKED_IN', 'CANCELLED', 'DENIED'))
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
      if new.host_id is null and nullif(trim(coalesce(new.receiving_department, '')), '') is null then
        raise exception using errcode = 'P0001', message = 'VISITOR_DESTINATION_REQUIRED';
      end if;
      if new.host_id is not null and not exists (
        select 1 from public.users u where u.id = new.host_id and u.status = 'ACTIVE' and u.is_deleted = false
      ) then
        raise exception using errcode = 'P0001', message = 'VISITOR_HOST_REQUIRED';
      end if;
      if new.registration_source = 'KIOSK' and (
        new.approval_status <> 'APPROVED'
        or new.access_status <> 'AUTHORIZED'
        or new.qr_token_hash is null
        or new.qr_expires_at is null
        or new.qr_expires_at <= now()
        or new.qr_revoked_at is not null
      ) then
        raise exception using errcode = 'P0001', message = 'VISITOR_ENTRY_NOT_AUTHORIZED';
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
  select * into v_visitor from public.visitors where id = p_visitor_id and is_deleted = false for update;
  if not found then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_NOT_FOUND', 'message', 'Visitor was not found.');
  end if;
  if v_visitor.status = 'CHECKED_IN' then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_ALREADY_CHECKED_IN', 'message', 'Visitor is already checked in.');
  end if;
  if v_visitor.status <> 'REGISTERED' then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_INVALID_STATUS', 'message', 'This visit cannot be checked in from its current status.');
  end if;
  if v_visitor.host_id is not null and not exists (
    select 1 from public.users u where u.id = v_visitor.host_id and u.status = 'ACTIVE' and u.is_deleted = false
  ) then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_HOST_REQUIRED', 'message', 'The assigned host is not active.');
  end if;
  if v_visitor.host_id is null and nullif(trim(coalesce(v_visitor.receiving_department, '')), '') is null then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_DESTINATION_REQUIRED', 'message', 'A valid host or receiving department is required.');
  end if;
  if v_visitor.registration_source = 'KIOSK' then
    if v_visitor.approval_status <> 'APPROVED'
       or v_visitor.identity_verification_status not in ('VERIFIED', 'MANUAL_REVIEW_APPROVED')
       or v_visitor.access_status <> 'AUTHORIZED'
       or v_visitor.qr_token_hash is null
       or v_visitor.qr_revoked_at is not null
       or v_visitor.qr_expires_at is null
       or p_occurred_at > v_visitor.qr_expires_at then
      return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_ENTRY_NOT_AUTHORIZED', 'message', 'The kiosk visit is not fully cleared or its pass is inactive.');
    end if;
  elsif v_visitor.expected_arrival is not null and (
    p_occurred_at < v_visitor.expected_arrival - interval '4 hours'
    or p_occurred_at > v_visitor.expected_arrival + interval '24 hours'
  ) then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_OUTSIDE_VISIT_WINDOW', 'message', 'Check-in is outside the allowed legacy visit window.');
  end if;
  if v_visitor.current_verification_id is null then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_VERIFICATION_REQUIRED', 'message', 'Visitor verification is required before check-in.');
  end if;
  select * into v_verification from public.visitor_verifications
   where id = v_visitor.current_verification_id and visitor_id = v_visitor.id
     and is_deleted = false and verification_status = 'VERIFIED';
  if not found or v_verification.clearance_state <> 'CLEAR' then
    return jsonb_build_object('ok', false, 'errorCode',
      case when v_verification.clearance_state = 'BLOCKED' then 'VISITOR_BLOCKED' else 'VISITOR_REVIEW_REQUIRED' end,
      'message', 'A current clear identity review is required before check-in.');
  end if;
  v_normalized_id := upper(regexp_replace(coalesce(v_visitor.id_number, v_verification.id_number, ''), '[^A-Za-z0-9]', '', 'g'));
  v_normalized_name := lower(regexp_replace(trim(v_visitor.full_name), '\s+', ' ', 'g'));
  select * into v_watchlist from public.visitor_watchlist
   where status = 'ACTIVE' and is_deleted = false and v_normalized_id <> ''
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
    and v_verification.clearance_state = 'CLEAR'
    and v_verification.reviewed_at is not null
  ) then
    return jsonb_build_object('ok', false, 'errorCode', 'VISITOR_REVIEW_REQUIRED', 'message', 'A current watchlist signal requires security review.');
  end if;
  update public.visitors
     set status = 'CHECKED_IN', actual_arrival = p_occurred_at,
         updated_at = timezone('UTC', now()), updated_by = left(p_actor_email, 255)
   where id = p_visitor_id returning * into v_visitor;
  insert into public.visitor_workflow_events (
    visitor_id, verification_id, event_type, from_status, to_status, actor_id, actor_email, actor_role
  ) values (
    p_visitor_id, v_verification.id, 'CHECK_IN', 'REGISTERED', 'CHECKED_IN',
    p_actor_id, left(p_actor_email, 255), p_actor_role
  );
  perform public.phase5_audit(p_actor_id, p_actor_email, 'CHECK_IN_VISITOR', 'VISITOR', 'Visitor',
    p_visitor_id, 'Cleared visitor checked in.');
  return jsonb_build_object('ok', true, 'data', to_jsonb(v_visitor));
end;
$$;

-- Cleanup is intentionally policy-driven. The scheduler should invoke this
-- service-only function after VISITOR_IDENTITY_RETENTION_DAYS has been
-- approved and translated into delete_after values by the application.
create or replace function public.purge_due_visitor_identity_artifacts()
returns table(storage_path text)
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.visitor_identity_artifacts
     set deleted_at = now()
   where deleted_at is null and delete_after is not null and delete_after <= now()
  returning visitor_identity_artifacts.storage_path;
$$;
revoke execute on function public.purge_due_visitor_identity_artifacts()
  from public, anon, authenticated;
grant execute on function public.purge_due_visitor_identity_artifacts()
  to service_role;

comment on table public.visitor_identity_artifacts is
  'Private visitor identity-image metadata. Objects are stored in visitor-identity-private and must be deleted using the approved retention policy.';
comment on column public.visitors.identity_verification_status is
  'Identity result, independent from approval_status and access_status.';
comment on column public.visitors.approval_status is
  'Host/department visit decision, independent from identity verification.';
comment on column public.visitors.submission_key_hash is
  'SHA-256 of the client idempotency key; the raw key is never stored.';

-- Rollback guidance (manual, only after confirming no kiosk data remains):
-- remove the kiosk indexes/table/bucket and the columns added above, then
-- restore the preceding phase5_guard_visitor_update definition. Do not drop
-- the shared visitors table.
