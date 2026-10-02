-- Full-access Super Admin oversight keeps the actor's authenticated session
-- while authorizing application requests as the selected target account.
-- Compliance Manager shadow sessions remain read-only.

update public.oversight_sessions
set status = 'EXPIRED',
    ended_at = coalesce(ended_at, now()),
    ended_by = coalesce(ended_by, actor_user_id)
where status = 'ACTIVE';

alter table public.oversight_sessions
  drop constraint if exists chk_oversight_read_only,
  drop constraint if exists chk_oversight_duration;

alter table public.oversight_sessions
  alter column expires_at drop not null,
  add column if not exists duration_minutes integer,
  add column if not exists manual_termination_required boolean not null default false,
  add column if not exists ended_reason text;

update public.oversight_sessions
set duration_minutes = greatest(
      1,
      ceil(extract(epoch from (expires_at - started_at)) / 60.0)::integer
    )
where expires_at is not null
  and duration_minutes is null;

alter table public.oversight_sessions
  add constraint chk_oversight_duration_mode check (
    (
      manual_termination_required = true
      and expires_at is null
      and duration_minutes is null
    )
    or
    (
      manual_termination_required = false
      and expires_at is not null
      and duration_minutes between 1 and 30
      and expires_at > started_at
      and expires_at <= started_at + interval '30 minutes'
    )
  ),
  add constraint chk_oversight_end_reason check (
    ended_reason is null
    or ended_reason in ('MANUAL', 'EXPIRED', 'LOGOUT', 'TARGET_UNAVAILABLE', 'AUDIT_FAILURE')
  );

create index if not exists idx_oversight_active_expiry
  on public.oversight_sessions(expires_at)
  where status = 'ACTIVE' and expires_at is not null;

comment on column public.oversight_sessions.read_only is
  'True for compliance shadow mode; false for server-authorized Super Admin full-access oversight.';

comment on column public.oversight_sessions.manual_termination_required is
  'When true, no oversight timeout is applied. Normal authentication expiry and refresh rules still apply.';

comment on table public.oversight_sessions is
  'Audited actor-to-target oversight context. Authentication remains owned by actor_user_id; authorization may use target_user_id.';
