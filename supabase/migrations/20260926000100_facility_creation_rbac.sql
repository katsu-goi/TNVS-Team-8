-- Complete the Facilities Manager creation contract and keep direct Data API
-- access closed. Custom application sessions are authorized in the Edge API.

alter table public.facilities
  add column if not exists floor_level text,
  add column if not exists max_booking_duration_hours smallint not null default 4,
  add column if not exists requires_admin_approval boolean not null default true;

alter table public.facilities
  drop constraint if exists facilities_max_booking_duration_hours_check;

alter table public.facilities
  add constraint facilities_max_booking_duration_hours_check
  check (max_booking_duration_hours between 1 and 168);

alter table public.facilities enable row level security;
drop policy if exists "Allow all for anon" on public.facilities;
revoke all privileges on table public.facilities from anon, authenticated;
grant select, insert, update, delete on table public.facilities to service_role;

create or replace function public.enforce_canonical_facility_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.type := upper(trim(new.type));
  if new.type is null or new.type not in (
    'HEADQUARTERS', 'REGIONAL_OFFICE', 'OPERATIONS_HUB', 'OFFICE',
    'DRIVER_SUPPORT_HUB', 'TRAINING_CENTER', 'CUSTOMER_SUPPORT_CENTER',
    'MAINTENANCE_DEPOT', 'LOGISTICS_CENTER', 'MEETING_ROOM', 'DESK',
    'CONFERENCE_HALL', 'TRAINING_ROOM', 'EVENT_SPACE', 'OTHER'
  ) then
    raise exception using errcode = '23514', message = 'Invalid facility type.';
  end if;
  return new;
end;
$$;

comment on column public.facilities.floor_level is
  'Human-readable floor or level for the bookable facility.';
comment on column public.facilities.max_booking_duration_hours is
  'Maximum continuous reservation length accepted for the facility.';
comment on column public.facilities.requires_admin_approval is
  'Whether a reservation must complete the administrator approval workflow.';
