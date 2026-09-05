-- Phase 1 repair for projects where the earlier cron migration has already
-- been recorded as applied. Definitions are repeated intentionally so clean
-- and existing projects converge on the same scheduled behavior.

create extension if not exists pg_cron;

create or replace function public.auto_checkout_overdue_visitors()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.visitors
  set status = 'CHECKED_OUT',
      actual_departure = now()
  where status = 'CHECKED_IN'
    and expected_arrival is not null
    and (expected_arrival at time zone 'UTC')::date
        < (now() at time zone 'UTC')::date;
end;
$$;

create or replace function public.purge_expired_tokens_and_rate_limits()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.refresh_tokens
  where expires_at < (now() at time zone 'UTC');

  delete from public.rate_limit_counts
  where window_start < floor(extract(epoch from (now() - interval '1 hour')))::bigint;
end;
$$;

revoke execute on function public.auto_checkout_overdue_visitors()
  from public, anon, authenticated;
revoke execute on function public.purge_expired_tokens_and_rate_limits()
  from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname in (
  'auto-checkout-visitors',
  'purge-tokens-and-rate-limits',
  'purge-old-audit-logs'
);

select cron.schedule(
  'auto-checkout-visitors',
  '0 0 * * *',
  'select public.auto_checkout_overdue_visitors();'
);

select cron.schedule(
  'purge-tokens-and-rate-limits',
  '0 * * * *',
  'select public.purge_expired_tokens_and_rate_limits();'
);

-- The old purge-old-audit-logs job referenced a nonexistent table and encoded
-- an undocumented 90-day deletion policy. It is deliberately unscheduled.
-- Audit-log retention belongs to the privacy/security policy phase.
