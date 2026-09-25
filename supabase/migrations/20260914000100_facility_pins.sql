create table if not exists public.facility_pins (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  x numeric(5, 2) not null,
  y numeric(5, 2) not null,
  title text not null,
  description text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_pins_x_range check (x between 0 and 100),
  constraint facility_pins_y_range check (y between 0 and 100),
  constraint facility_pins_title_not_blank check (length(btrim(title)) > 0)
);

create index if not exists facility_pins_facility_id_idx
  on public.facility_pins (facility_id);

create or replace function public.touch_facility_pin_updated_at()
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

drop trigger if exists facility_pin_updated_at on public.facility_pins;
create trigger facility_pin_updated_at
before update on public.facility_pins
for each row execute function public.touch_facility_pin_updated_at();

alter table public.facility_pins enable row level security;

drop policy if exists "facility_pins_select_authenticated" on public.facility_pins;
create policy "facility_pins_select_authenticated"
on public.facility_pins for select
to authenticated
using (true);

drop policy if exists "facility_pins_manage_authenticated" on public.facility_pins;
create policy "facility_pins_manage_authenticated"
on public.facility_pins for all
to authenticated
using (true)
with check (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.facility_pins;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;
