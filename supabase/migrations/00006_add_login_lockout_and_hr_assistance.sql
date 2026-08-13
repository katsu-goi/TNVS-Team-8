-- ============================================================
-- 00006 - Login attempt lockout + HR assistance inbox
--
-- Server-side failed-login protection:
--   users.last_failed_attempt_at - timestamp of the last failed
--     password attempt (the failed_login_attempts counter already
--     exists from 00001).
--   hr_assistance_requests      - HR Department assistance inbox
--     for account-access / password-recovery requests.
--
-- The progressive lockout (1st -> 10s, 2nd -> 30s, 3rd -> locked)
-- is enforced entirely in the backend against the users table, so
-- it cannot be bypassed by refreshing the page, opening another
-- browser, or clearing browser storage.
--
-- Rules (identical to 00001-00005): purely additive, IF NOT EXISTS
-- only, no DROP/TRUNCATE, no FK constraints, BaseEntity columns ->
-- timestamp. Recommended order: 00001 -> ... -> 00006.
--
-- Supabase only. The backend Flyway migration V7 carries the same
-- schema for the local/default profiles.
-- ============================================================

-- 1. USERS - last failed attempt timestamp ---------------------
alter table public.users
  add column if not exists last_failed_attempt_at timestamp;

create index if not exists idx_users_locked_until
  on public.users (locked_until)
  where locked_until is not null;

-- 2. HR ASSISTANCE REQUESTS ------------------------------------
create table if not exists public.hr_assistance_requests (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamp not null default now(),
  updated_at      timestamp,
  created_by      varchar(255),
  updated_by      varchar(255),
  is_deleted      boolean not null default false,
  deleted_at      timestamp,
  deleted_by      varchar(255),

  requester_name  varchar(200) not null,
  requester_email varchar(255) not null,
  subject         varchar(300) not null,
  message         text not null,
  status          varchar(20) not null default 'PENDING',
  priority        varchar(20) not null default 'NORMAL',
  ip_address      varchar(45),
  user_agent      varchar(500)
);

create index if not exists idx_hr_assistance_status
  on public.hr_assistance_requests (status);
create index if not exists idx_hr_assistance_email
  on public.hr_assistance_requests (requester_email);
create index if not exists idx_hr_assistance_created_at
  on public.hr_assistance_requests (created_at);

-- 3. RLS -------------------------------------------------------
alter table public.hr_assistance_requests enable row level security;
