-- Transactional visitor email ledger and token-protected pre-approval status.
-- Raw status tokens are never stored; only SHA-256 hashes are retained.

alter table public.visitors
  add column if not exists status_token_hash varchar(64),
  add column if not exists status_token_issued_at timestamptz,
  add column if not exists status_token_expires_at timestamptz;

create unique index if not exists visitors_status_token_hash_unique
  on public.visitors(status_token_hash) where status_token_hash is not null;

create index if not exists visitors_status_token_expiry
  on public.visitors(status_token_expires_at)
  where status_token_hash is not null and registration_source = 'KIOSK';

create table if not exists public.visitor_email_notifications (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  notification_type varchar(40) not null,
  delivery_status varchar(30) not null default 'NOT_REQUESTED',
  idempotency_key varchar(256) not null,
  provider_id text,
  delivery_error text,
  attempt_count integer not null default 0,
  last_attempted_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitor_email_notification_type_check
    check (notification_type in ('REGISTRATION_ACKNOWLEDGMENT', 'APPROVAL_PASS', 'DECLINE')),
  constraint visitor_email_delivery_status_check
    check (delivery_status in ('NOT_REQUESTED', 'PENDING', 'ACCEPTED', 'FAILED', 'NOT_CONFIGURED')),
  constraint visitor_email_attempt_count_check check (attempt_count >= 0),
  constraint visitor_email_notification_unique unique (visitor_id, notification_type),
  constraint visitor_email_idempotency_key_unique unique (idempotency_key)
);

create index if not exists visitor_email_notifications_status_idx
  on public.visitor_email_notifications(delivery_status, updated_at desc);

alter table public.visitor_email_notifications enable row level security;
revoke all on public.visitor_email_notifications from public, anon, authenticated;
grant all on public.visitor_email_notifications to service_role;

comment on table public.visitor_email_notifications is
  'Service-only delivery ledger for idempotent visitor transactional emails.';
comment on column public.visitors.status_token_hash is
  'SHA-256 hash of the high-entropy visitor status token; the raw token is never persisted.';
