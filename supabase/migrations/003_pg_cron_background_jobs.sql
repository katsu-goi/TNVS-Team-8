-- Migration: 003_pg_cron_background_jobs.sql
-- Enables pg_cron extension and configures automated background scheduled jobs
-- replacing Spring Boot @Scheduled annotations for autonomous serverless execution.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Auto Check-out Overdue Visitors (Runs Daily at Midnight - '0 0 * * *')
CREATE OR REPLACE FUNCTION auto_checkout_overdue_visitors()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE visitors
  SET 
    status = 'CHECKED_OUT',
    actual_departure_time = NOW(),
    remarks = COALESCE(remarks, '') || ' [System Auto-Checkout at End of Day]'
  WHERE status = 'CHECKED_IN'
    AND DATE(expected_arrival_time) < CURRENT_DATE;
END;
$$;

-- 2. Purge Expired Refresh Tokens and Rate Limit Windows (Runs Hourly - '0 * * * *')
CREATE OR REPLACE FUNCTION purge_expired_tokens_and_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Purge expired refresh tokens if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'refresh_tokens') THEN
    DELETE FROM refresh_tokens WHERE expires_at < NOW();
  END IF;

  -- Purge expired rate limit counts (> 1 hour old)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rate_limit_counts') THEN
    DELETE FROM rate_limit_counts WHERE window_start < NOW() - INTERVAL '1 hour';
  END IF;

  -- Purge expired security lockout entries
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'security_lockouts') THEN
    DELETE FROM security_lockouts WHERE locked_until IS NOT NULL AND locked_until < NOW();
  END IF;
END;
$$;

-- 3. Purge Old Security Audit Logs (> 90 Days) (Runs Weekly on Sunday at 2 AM - '0 2 * * 0')
CREATE OR REPLACE FUNCTION purge_old_security_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'security_audit_logs') THEN
    DELETE FROM security_audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
  END IF;
END;
$$;

-- Register Cron Schedules
SELECT cron.schedule(
  'auto-checkout-visitors',
  '0 0 * * *',
  'SELECT auto_checkout_overdue_visitors();'
);

SELECT cron.schedule(
  'purge-tokens-and-rate-limits',
  '0 * * * *',
  'SELECT purge_expired_tokens_and_rate_limits();'
);

SELECT cron.schedule(
  'purge-old-audit-logs',
  '0 2 * * 0',
  'SELECT purge_old_security_audit_logs();'
);
