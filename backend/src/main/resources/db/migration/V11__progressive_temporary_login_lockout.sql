-- Keep the PostgreSQL schema used by the Spring backend aligned with the
-- Supabase Edge login policy. The Edge Function is the production/non-local
-- authentication path; Spring uses row locking in LoginAttemptService.

CREATE TABLE IF NOT EXISTS rate_limit_counts (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    limit_key     TEXT NOT NULL,
    window_start  BIGINT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limit_counts_key_window
    ON rate_limit_counts(limit_key, window_start);

CREATE OR REPLACE FUNCTION login_lock_seconds(p_attempt INTEGER)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
STRICT
AS $$
    SELECT CASE
        WHEN p_attempt <= 2 THEN 0
        WHEN p_attempt = 3 THEN 30
        WHEN p_attempt = 4 THEN 60
        WHEN p_attempt = 5 THEN 300
        WHEN p_attempt = 6 THEN 900
        WHEN p_attempt = 7 THEN 1800
        ELSE 3600
    END;
$$;
