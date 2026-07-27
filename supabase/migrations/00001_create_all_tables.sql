-- ============================================================
-- Enterprise Management System — Full Database Schema
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/nlzfosfyyqileruosebi/sql/new)
-- ============================================================

-- 1. FACILITIES
create table if not exists public.facilities (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  name            text not null,
  code            text,
  type            text,
  address         text,
  city            text,
  country         text,
  total_capacity  integer,
  active          boolean default true
);

-- 2. ROOMS
create table if not exists public.rooms (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  facility_id           uuid references public.facilities(id) on delete set null,
  room_number           text not null,
  name                  text not null,
  building              text,
  floor                 text,
  capacity              integer not null default 1,
  type                  text,
  status                text default 'AVAILABLE',
  equipment             jsonb default '[]'::jsonb,
  is_available          boolean default true,
  description           text,
  maintenance_status    text,
  maintenance_reason    text,
  image_url             text,
  has_projector         boolean default false,
  has_video_conference  boolean default false,
  hourly_rate           numeric(10,2) default 0
);

-- 3. VISITORS
create table if not exists public.visitors (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  full_name         text not null,
  email             text default '',
  company           text default '',
  phone             text default '',
  purpose_of_visit  text not null,
  expected_arrival  timestamptz,
  actual_arrival    timestamptz,
  actual_departure  timestamptz,
  host_employee_id  text,
  status            text default 'REGISTERED',
  qr_code_token     text
);

-- 4. DOCUMENTS
create table if not exists public.documents (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  title                   text not null,
  file_name               text,
  file_type               text,
  file_size               bigint,
  classification_level    text default 'INTERNAL',
  status                  text default 'ACTIVE',
  ai_predicted_category   text,
  ai_classification       text,
  ai_summary              text,
  ocr_extracted_text      text,
  confidence_score        numeric(5,2),
  extracted_keywords      jsonb default '[]'::jsonb
);

-- 5. CONTRACTS
create table if not exists public.contracts (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  contract_number         text,
  title                   text not null,
  type                    text default 'SERVICE',
  counter_party           text,
  contract_value          numeric(15,2) default 0,
  status                  text default 'ACTIVE',
  ai_assessed_risk_level  text default 'LOW',
  ai_risk_summary         text,
  start_date              date,
  end_date                date
);

-- 6. LEGAL CASES
create table if not exists public.legal_cases (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  case_number       text,
  title             text not null,
  court_name        text,
  priority          text default 'MEDIUM',
  status            text default 'OPEN',
  filed_date        date,
  next_hearing_date date,
  lead_counselor    text
);

-- 7. SECURITY LOGS
create table if not exists public.security_logs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  action      text not null,
  module      text not null,
  full_name   text,
  role        text,
  ip_address  text,
  risk_level  text not null default 'LOW',
  status      text not null default 'SUCCESS',
  reason      text
);

-- 8. ACTIVE SESSIONS
create table if not exists public.active_sessions (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  username        text not null,
  full_name       text,
  role            text,
  ip_address      text,
  country         text,
  browser         text,
  device_name     text,
  login_time      timestamptz,
  last_activity   timestamptz,
  status          text default 'ACTIVE'
);

-- 9. BLOCKED IPS
create table if not exists public.blocked_ips (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  ip_address  text not null,
  reason      text not null,
  blocked_by  text,
  blocked_at  timestamptz default now(),
  expires_at  timestamptz,
  status      text default 'ACTIVE'
);

-- 10. SECURITY ALERTS
create table if not exists public.security_alerts (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  title         text not null,
  description   text,
  alert_type    text,
  severity      text not null,
  target_ip     text,
  status        text default 'OPEN',
  resolved_by   text,
  resolved_at   timestamptz
);

-- 11. IP THREATS (Threat Map)
create table if not exists public.ip_threats (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  ip          text not null,
  country     text,
  city        text,
  latitude    double precision,
  longitude   double precision,
  threat_type text not null,
  severity    text not null,
  requests    integer default 1,
  status      text not null,
  first_seen  timestamptz,
  last_seen   timestamptz,
  asn         text,
  isp         text,
  flag        text
);

-- 12. MAINTENANCE SCHEDULES
create table if not exists public.maintenance_schedules (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  room_id     uuid references public.rooms(id) on delete set null,
  title       text not null,
  start_time  timestamptz not null,
  end_time    timestamptz not null,
  reason      text,
  created_by  text
);

-- 13. RESERVATIONS
create table if not exists public.reservations (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,
  room_id               uuid references public.rooms(id) on delete set null,
  title                 text,
  purpose               text,
  start_time            timestamptz,
  end_time              timestamptz,
  expected_attendees    integer default 1,
  status                text default 'PENDING_APPROVAL',
  approval_status       text default 'PENDING',
  employee_name         text,
  employee_department   text,
  employee_email        text,
  employee_id           text,
  approved_by           text,
  approved_at           timestamptz,
  notes                 text,
  qr_code_token         text,
  check_in_time         timestamptz,
  check_out_time        timestamptz
);

-- ============================================================
-- Enable Row Level Security (RLS) on all tables
-- ============================================================
alter table public.facilities             enable row level security;
alter table public.rooms                  enable row level security;
alter table public.visitors               enable row level security;
alter table public.documents              enable row level security;
alter table public.contracts              enable row level security;
alter table public.legal_cases            enable row level security;
alter table public.security_logs          enable row level security;
alter table public.active_sessions        enable row level security;
alter table public.blocked_ips            enable row level security;
alter table public.security_alerts        enable row level security;
alter table public.ip_threats             enable row level security;
alter table public.maintenance_schedules  enable row level security;
alter table public.reservations           enable row level security;

-- Permit all operations for anon key (development mode)
-- In production, replace with proper authenticated policies
drop policy if exists "Allow all for anon" on public.facilities;
create policy "Allow all for anon" on public.facilities for all using (true) with check (true);
drop policy if exists "Allow all for anon" on public.rooms;
create policy "Allow all for anon" on public.rooms for all using (true) with check (true);
drop policy if exists "Allow all for anon" on public.visitors;
create policy "Allow all for anon" on public.visitors for all using (true) with check (true);
drop policy if exists "Allow all for anon" on public.documents;
create policy "Allow all for anon" on public.documents for all using (true) with check (true);
drop policy if exists "Allow all for anon" on public.contracts;
create policy "Allow all for anon" on public.contracts for all using (true) with check (true);
drop policy if exists "Allow all for anon" on public.legal_cases;
create policy "Allow all for anon" on public.legal_cases for all using (true) with check (true);
drop policy if exists "Allow all for anon" on public.security_logs;
create policy "Allow all for anon" on public.security_logs for all using (true) with check (true);
drop policy if exists "Allow all for anon" on public.active_sessions;
create policy "Allow all for anon" on public.active_sessions for all using (true) with check (true);
drop policy if exists "Allow all for anon" on public.blocked_ips;
create policy "Allow all for anon" on public.blocked_ips for all using (true) with check (true);
drop policy if exists "Allow all for anon" on public.security_alerts;
create policy "Allow all for anon" on public.security_alerts for all using (true) with check (true);
drop policy if exists "Allow all for anon" on public.ip_threats;
create policy "Allow all for anon" on public.ip_threats for all using (true) with check (true);
drop policy if exists "Allow all for anon" on public.maintenance_schedules;
create policy "Allow all for anon" on public.maintenance_schedules for all using (true) with check (true);
drop policy if exists "Allow all for anon" on public.reservations;
create policy "Allow all for anon" on public.reservations for all using (true) with check (true);

-- ============================================================
-- Enable Realtime for live-updating features
-- Uses DO block to safely add tables without syntax errors
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'facilities') then
    alter publication supabase_realtime add table public.facilities;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'reservations') then
    alter publication supabase_realtime add table public.reservations;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'maintenance_schedules') then
    alter publication supabase_realtime add table public.maintenance_schedules;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'security_logs') then
    alter publication supabase_realtime add table public.security_logs;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'security_alerts') then
    alter publication supabase_realtime add table public.security_alerts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ip_threats') then
    alter publication supabase_realtime add table public.ip_threats;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'visitors') then
    alter publication supabase_realtime add table public.visitors;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'documents') then
    alter publication supabase_realtime add table public.documents;
  end if;
end $$;
