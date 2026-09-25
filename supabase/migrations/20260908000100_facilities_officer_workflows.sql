-- Facilities Officer workflow fields and indexes.
-- The application calculates occupancy from the visitor source of truth;
-- no counter is stored, so check-in and check-out cannot drift apart.

alter table public.visitors
  add column if not exists denial_reason text;

create index if not exists visitors_active_check_in_idx
  on public.visitors (status)
  where status = 'CHECKED_IN' and is_deleted = false;

create index if not exists visitors_denied_idx
  on public.visitors (status, updated_at desc)
  where status = 'DENIED' and is_deleted = false;
