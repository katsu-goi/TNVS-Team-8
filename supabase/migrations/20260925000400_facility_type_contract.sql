-- Canonical facility and room/space type enforcement for forward writes.
-- The Edge and React contract is defined in frontend/src/contracts/facilityTypes.ts
-- and re-exported to functions through functions/_shared/facility-types.ts.
-- Existing legacy facility rows are intentionally preserved until their correct
-- parent-site mapping is confirmed. Unrelated updates remain possible because
-- the triggers run only when the type column is inserted or changed.

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
    'MAINTENANCE_DEPOT', 'LOGISTICS_CENTER', 'OTHER'
  ) then
    raise exception using errcode = '23514', message = 'Invalid facility type.';
  end if;
  return new;
end;
$$;

drop trigger if exists facilities_canonical_type on public.facilities;
create trigger facilities_canonical_type
before insert or update of type on public.facilities
for each row execute function public.enforce_canonical_facility_type();

create or replace function public.enforce_canonical_room_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.type := upper(trim(new.type));
  if new.type is null or new.type not in (
    'MEETING_ROOM', 'CONFERENCE_ROOM', 'BOARD_ROOM', 'TRAINING_ROOM',
    'COLLABORATION_ROOM', 'OFFICE_ROOM', 'WAITING_AREA',
    'MULTIPURPOSE_ROOM', 'EVENT_HALL', 'WAREHOUSE', 'OTHER'
  ) then
    raise exception using errcode = '23514', message = 'Invalid room or space type.';
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_canonical_type on public.rooms;
create trigger rooms_canonical_type
before insert or update of type on public.rooms
for each row execute function public.enforce_canonical_room_type();
