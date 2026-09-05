-- Track the last successful server-side provider verification independently
-- from general metadata updates. Credentials remain encrypted in
-- encrypted_api_key and providers default to OFFLINE until verified.

alter table public.ai_providers
  add column if not exists last_verified_at timestamp,
  alter column status set default 'OFFLINE';

comment on column public.ai_providers.last_verified_at is
  'Timestamp of the most recent successful server-side provider connectivity verification.';
