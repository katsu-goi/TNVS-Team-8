-- Audit-log authorization hardening.
--
-- Edge Functions use service_role and therefore bypass RLS. Endpoint row
-- scoping is enforced in application code; this migration keeps direct
-- browser access denied and makes the two historical audit tables immutable.

alter table public.audit_logs enable row level security;
alter table public.admin_audit_logs enable row level security;

revoke all privileges on table public.audit_logs from anon, authenticated;
revoke all privileges on table public.admin_audit_logs from anon, authenticated;

create or replace function public.reject_immutable_audit_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'audit logs are immutable';
end;
$$;

revoke all on function public.reject_immutable_audit_change() from public;

drop trigger if exists protect_audit_logs on public.audit_logs;
create trigger protect_audit_logs
before update or delete on public.audit_logs
for each row execute function public.reject_immutable_audit_change();

create index if not exists idx_audit_logs_user_time
  on public.audit_logs(user_id, created_at desc);

create index if not exists idx_audit_logs_module_time
  on public.audit_logs(module, created_at desc);

comment on table public.audit_logs is
  'Immutable application audit history. Reads must be authorized and scoped by the server-side API.';

comment on table public.admin_audit_logs is
  'Immutable administrative oversight history. Reads must be authorized by the server-side API.';
