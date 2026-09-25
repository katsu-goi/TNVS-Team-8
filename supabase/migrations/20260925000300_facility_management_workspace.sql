-- Facility Management workspace metadata and protected floor-plan storage.
alter table public.facilities
  add column if not exists description text,
  add column if not exists floor_plan_path text,
  add column if not exists floor_plan_file_name text,
  add column if not exists floor_plan_mime_type text,
  add column if not exists floor_plan_size bigint;

-- Preserve paths from the earlier public-URL implementation when possible.
update public.facilities
set floor_plan_path = split_part(floor_plan_url, '/object/public/facility-floorplans/', 2)
where floor_plan_path is null
  and floor_plan_url like '%/object/public/facility-floorplans/%';

update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']::text[]
where id = 'facility-floorplans';

-- The application authenticates custom sessions in the Edge function. Storage
-- access is therefore service-role only; clients receive 15-minute signed URLs.
drop policy if exists "facility_floorplans_read_authenticated" on storage.objects;
drop policy if exists "facility_floorplans_manage_authenticated" on storage.objects;

create index if not exists idx_facilities_active_management
  on public.facilities(active, created_at desc)
  where is_deleted = false;

create or replace function public.enforce_unique_active_facility_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.code := upper(trim(new.code));
  if new.code is null or new.code = '' then
    raise exception using errcode = '23514', message = 'Facility code is required.';
  end if;
  if exists (
    select 1 from public.facilities existing
    where existing.id <> new.id
      and coalesce(existing.is_deleted, false) = false
      and upper(trim(existing.code)) = new.code
  ) then
    raise exception using errcode = '23505', message = 'Facility code already exists.';
  end if;
  return new;
end;
$$;

drop trigger if exists facilities_unique_active_code on public.facilities;
create trigger facilities_unique_active_code
before insert or update of code, is_deleted on public.facilities
for each row
when (coalesce(new.is_deleted, false) = false)
execute function public.enforce_unique_active_facility_code();
