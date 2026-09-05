-- Phase 1 lint cleanup: the earlier cron migration created this function for
-- a table and retention policy that do not exist. The Phase 1 cron repair has
-- already unscheduled its job, so retain no broken callable behind it.

drop function if exists public.purge_old_security_audit_logs();
