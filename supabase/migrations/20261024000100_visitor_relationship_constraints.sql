-- Make the visitor clearance workflow's implicit relationships enforceable.
-- Preserve workflow and audit rows on parent deletion by using the default NO ACTION behavior.

do $$
begin
  if exists (
    select 1 from public.visitor_verifications child
    left join public.visitors parent on parent.id = child.visitor_id
    where parent.id is null
  ) then raise exception 'visitor relationship migration aborted: visitor_verifications.visitor_id contains orphan rows';
  end if;
  if exists (
    select 1 from public.visitors child
    left join public.visitor_verifications parent on parent.id = child.current_verification_id
    where child.current_verification_id is not null and parent.id is null
  ) then raise exception 'visitor relationship migration aborted: visitors.current_verification_id contains orphan rows';
  end if;
  if exists (
    select 1 from public.visitor_verifications child
    left join public.visitor_watchlist parent on parent.id = child.matched_watchlist_entry_id
    where child.matched_watchlist_entry_id is not null and parent.id is null
  ) then raise exception 'visitor relationship migration aborted: visitor_verifications.matched_watchlist_entry_id contains orphan rows';
  end if;
  if exists (
    select 1 from public.visitor_verifications child
    left join public.users parent on parent.id = child.reviewed_by
    where child.reviewed_by is not null and parent.id is null
  ) then raise exception 'visitor relationship migration aborted: visitor_verifications.reviewed_by contains orphan rows';
  end if;
  if exists (
    select 1 from public.visitor_clearance_reviews child
    left join public.visitors parent on parent.id = child.visitor_id
    where parent.id is null
  ) then raise exception 'visitor relationship migration aborted: visitor_clearance_reviews.visitor_id contains orphan rows';
  end if;
  if exists (
    select 1 from public.visitor_clearance_reviews child
    left join public.visitor_verifications parent on parent.id = child.verification_id
    where parent.id is null
  ) then raise exception 'visitor relationship migration aborted: visitor_clearance_reviews.verification_id contains orphan rows';
  end if;
  if exists (
    select 1 from public.visitor_clearance_reviews child
    left join public.users parent on parent.id = child.reviewer_id
    where parent.id is null
  ) then raise exception 'visitor relationship migration aborted: visitor_clearance_reviews.reviewer_id contains orphan rows';
  end if;
  if exists (
    select 1 from public.visitor_workflow_events child
    left join public.visitors parent on parent.id = child.visitor_id
    where parent.id is null
  ) then raise exception 'visitor relationship migration aborted: visitor_workflow_events.visitor_id contains orphan rows';
  end if;
  if exists (
    select 1 from public.visitor_workflow_events child
    left join public.visitor_verifications parent on parent.id = child.verification_id
    where child.verification_id is not null and parent.id is null
  ) then raise exception 'visitor relationship migration aborted: visitor_workflow_events.verification_id contains orphan rows';
  end if;
  if exists (
    select 1 from public.visitor_workflow_events child
    left join public.users parent on parent.id = child.actor_id
    where child.actor_id is not null and parent.id is null
  ) then raise exception 'visitor relationship migration aborted: visitor_workflow_events.actor_id contains orphan rows';
  end if;
end
$$;

create index if not exists idx_visitors_current_verification_id
  on public.visitors (current_verification_id);
create index if not exists idx_visitor_verifications_watchlist_entry
  on public.visitor_verifications (matched_watchlist_entry_id);
create index if not exists idx_visitor_verifications_reviewed_by
  on public.visitor_verifications (reviewed_by);
create index if not exists idx_visitor_clearance_reviews_visitor_id
  on public.visitor_clearance_reviews (visitor_id);
create index if not exists idx_visitor_clearance_reviews_reviewer_id
  on public.visitor_clearance_reviews (reviewer_id);
create index if not exists idx_visitor_workflow_events_verification_id
  on public.visitor_workflow_events (verification_id);
create index if not exists idx_visitor_workflow_events_actor_id
  on public.visitor_workflow_events (actor_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_visitor_verifications_visitor' and conrelid = 'public.visitor_verifications'::regclass) then
    alter table public.visitor_verifications add constraint fk_visitor_verifications_visitor
      foreign key (visitor_id) references public.visitors(id) not valid;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_visitors_current_verification' and conrelid = 'public.visitors'::regclass) then
    alter table public.visitors add constraint fk_visitors_current_verification
      foreign key (current_verification_id) references public.visitor_verifications(id) not valid;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_visitor_verifications_watchlist' and conrelid = 'public.visitor_verifications'::regclass) then
    alter table public.visitor_verifications add constraint fk_visitor_verifications_watchlist
      foreign key (matched_watchlist_entry_id) references public.visitor_watchlist(id) not valid;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_visitor_verifications_reviewer' and conrelid = 'public.visitor_verifications'::regclass) then
    alter table public.visitor_verifications add constraint fk_visitor_verifications_reviewer
      foreign key (reviewed_by) references public.users(id) not valid;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_visitor_clearance_reviews_visitor' and conrelid = 'public.visitor_clearance_reviews'::regclass) then
    alter table public.visitor_clearance_reviews add constraint fk_visitor_clearance_reviews_visitor
      foreign key (visitor_id) references public.visitors(id) not valid;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_visitor_clearance_reviews_verification' and conrelid = 'public.visitor_clearance_reviews'::regclass) then
    alter table public.visitor_clearance_reviews add constraint fk_visitor_clearance_reviews_verification
      foreign key (verification_id) references public.visitor_verifications(id) not valid;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_visitor_clearance_reviews_reviewer' and conrelid = 'public.visitor_clearance_reviews'::regclass) then
    alter table public.visitor_clearance_reviews add constraint fk_visitor_clearance_reviews_reviewer
      foreign key (reviewer_id) references public.users(id) not valid;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_visitor_workflow_events_visitor' and conrelid = 'public.visitor_workflow_events'::regclass) then
    alter table public.visitor_workflow_events add constraint fk_visitor_workflow_events_visitor
      foreign key (visitor_id) references public.visitors(id) not valid;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_visitor_workflow_events_verification' and conrelid = 'public.visitor_workflow_events'::regclass) then
    alter table public.visitor_workflow_events add constraint fk_visitor_workflow_events_verification
      foreign key (verification_id) references public.visitor_verifications(id) not valid;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_visitor_workflow_events_actor' and conrelid = 'public.visitor_workflow_events'::regclass) then
    alter table public.visitor_workflow_events add constraint fk_visitor_workflow_events_actor
      foreign key (actor_id) references public.users(id) not valid;
  end if;
end $$;

alter table public.visitor_verifications validate constraint fk_visitor_verifications_visitor;
alter table public.visitors validate constraint fk_visitors_current_verification;
alter table public.visitor_verifications validate constraint fk_visitor_verifications_watchlist;
alter table public.visitor_verifications validate constraint fk_visitor_verifications_reviewer;
alter table public.visitor_clearance_reviews validate constraint fk_visitor_clearance_reviews_visitor;
alter table public.visitor_clearance_reviews validate constraint fk_visitor_clearance_reviews_verification;
alter table public.visitor_clearance_reviews validate constraint fk_visitor_clearance_reviews_reviewer;
alter table public.visitor_workflow_events validate constraint fk_visitor_workflow_events_visitor;
alter table public.visitor_workflow_events validate constraint fk_visitor_workflow_events_verification;
alter table public.visitor_workflow_events validate constraint fk_visitor_workflow_events_actor;
