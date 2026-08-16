-- V7: Login attempt lockout and HR assistance requests
-- Server-side failed-login counters, lock timestamps, and the HR assistance
-- inbox. The lockout state lives entirely in the database so it cannot be
-- bypassed by refreshing the page or clearing browser storage.

-- Track the timestamp of the last failed password attempt (in addition to the
-- existing failed_login_attempts counter) for security auditing.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_failed_attempt_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_locked_until
    ON users(locked_until) WHERE locked_until IS NOT NULL;

-- HR Department assistance inbox (account access / password recovery requests)
CREATE TABLE IF NOT EXISTS hr_assistance_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_name VARCHAR(200) NOT NULL,
    requester_email VARCHAR(255) NOT NULL,
    subject VARCHAR(300) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_hr_assistance_status
    ON hr_assistance_requests(status);
CREATE INDEX IF NOT EXISTS idx_hr_assistance_email
    ON hr_assistance_requests(requester_email);
CREATE INDEX IF NOT EXISTS idx_hr_assistance_created_at
    ON hr_assistance_requests(created_at);
