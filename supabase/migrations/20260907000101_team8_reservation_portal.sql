create extension if not exists pgcrypto;

alter table public.facilities
  add column if not exists facility_name text,
  add column if not exists capacity integer,
  add column if not exists amenities_json jsonb not null default '[]'::jsonb,
  add column if not exists status text not null default 'AVAILABLE';

update public.facilities
set facility_name = coalesce(facility_name, name),
    capacity = coalesce(capacity, total_capacity),
    status = case when active is false then 'INACTIVE' else coalesce(status, 'AVAILABLE') end
;

create table if not exists public.facility_reservations (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict,
  host_user_id uuid not null references public.users(id) on delete restrict,
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  notes text,
  status text not null default 'CONFIRMED' check (status in ('PENDING', 'CONFIRMED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_reservations_valid_time check (end_time > start_time)
);

create index if not exists facility_reservations_facility_time_idx
  on public.facility_reservations (facility_id, start_time, end_time)
  where status in ('PENDING', 'CONFIRMED');

create index if not exists facility_reservations_host_idx
  on public.facility_reservations (host_user_id, start_time desc);

create table if not exists public.reservation_invitees (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.facility_reservations(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  qr_token_hash text not null unique,
  check_in_status boolean not null default false,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reservation_invitees_email_check check (position('@' in email) > 1),
  constraint reservation_invitees_unique_email unique (reservation_id, email)
);

create index if not exists reservation_invitees_reservation_idx
  on public.reservation_invitees (reservation_id);

create table if not exists public.reservation_email_outbox (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.facility_reservations(id) on delete cascade,
  invitee_id uuid not null references public.reservation_invitees(id) on delete cascade,
  recipient_email text not null,
  subject text not null,
  body text not null,
  delivery_status text not null default 'SIMULATED' check (delivery_status in ('QUEUED', 'SENT', 'SIMULATED', 'FAILED')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists reservation_email_outbox_created_idx
  on public.reservation_email_outbox (created_at desc);

create or replace function public.prevent_facility_reservation_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('PENDING', 'CONFIRMED') then
    perform pg_advisory_xact_lock(hashtextextended(new.facility_id::text, 0));
    if exists (
      select 1
      from public.facility_reservations existing
      where existing.facility_id = new.facility_id
        and existing.id <> new.id
        and existing.status in ('PENDING', 'CONFIRMED')
        and existing.start_time < new.end_time
        and existing.end_time > new.start_time
    ) then
      raise exception using
        errcode = '23P01',
        message = 'The selected facility is already reserved for this time.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists facility_reservation_overlap_guard on public.facility_reservations;
create trigger facility_reservation_overlap_guard
before insert or update of facility_id, start_time, end_time, status
on public.facility_reservations
for each row execute function public.prevent_facility_reservation_overlap();

create or replace function public.touch_facility_reservation_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists facility_reservation_updated_at on public.facility_reservations;
create trigger facility_reservation_updated_at
before update on public.facility_reservations
for each row execute function public.touch_facility_reservation_updated_at();

alter table public.facility_reservations enable row level security;
alter table public.reservation_invitees enable row level security;
alter table public.reservation_email_outbox enable row level security;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.facility_reservations;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;

insert into public.facilities (name, facility_name, code, type, capacity, amenities_json, status, active)
select 'Team 8 Conference Room', 'Team 8 Conference Room', 'T8-CONF', 'MEETING_ROOM', 12,
       '["Projector", "Video conference", "Whiteboard"]'::jsonb, 'AVAILABLE', true
where not exists (select 1 from public.facilities where code = 'T8-CONF');

insert into public.facilities (name, facility_name, code, type, capacity, amenities_json, status, active)
select 'Admin Meeting Space', 'Admin Meeting Space', 'ADMIN-MEET', 'MEETING_ROOM', 8,
       '["Display", "Whiteboard"]'::jsonb, 'AVAILABLE', true
where not exists (select 1 from public.facilities where code = 'ADMIN-MEET');
