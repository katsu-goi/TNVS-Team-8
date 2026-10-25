-- Durable deletion ledger for short-lived visitor selfie objects. This table
-- stores object paths and operational deletion state only; it never stores
-- image bytes, signed URLs, embeddings, or screening results.

create table if not exists public.visitor_biometric_temporary_objects (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  delete_after timestamptz not null default (now() + interval '15 minutes'),
  deleted_at timestamptz,
  deletion_attempts integer not null default 0,
  last_deletion_attempt_at timestamptz,
  last_error_code text,
  constraint visitor_biometric_temporary_path_check
    check (storage_path ~ '^[0-9a-f-]{36}/face-capture-[0-9a-f-]{36}\.(jpg|png|webp)$'),
  constraint visitor_biometric_temporary_attempts_check
    check (deletion_attempts >= 0),
  constraint visitor_biometric_temporary_error_check
    check (last_error_code is null or last_error_code in ('STORAGE_DELETE_FAILED'))
);

create index if not exists visitor_biometric_temporary_objects_due_idx
  on public.visitor_biometric_temporary_objects(delete_after, created_at)
  where deleted_at is null;

alter table public.visitor_biometric_temporary_objects enable row level security;
revoke all on public.visitor_biometric_temporary_objects from public, anon, authenticated;
grant all on public.visitor_biometric_temporary_objects to service_role;

comment on table public.visitor_biometric_temporary_objects is
  'Service-only deletion ledger for transient biometric selfie objects. Due rows must be retried by the authenticated visitor cleanup endpoint.';

comment on column public.visitor_biometric_temporary_objects.delete_after is
  'Hard cleanup deadline used to recover objects left behind by process termination or a failed immediate delete.';
