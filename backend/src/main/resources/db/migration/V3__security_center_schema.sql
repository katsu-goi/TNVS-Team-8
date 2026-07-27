-- V3__security_center_schema.sql
-- Security Center tables and indexes

-- security_logs
CREATE TABLE IF NOT EXISTS security_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(100) NOT NULL,
    module VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address INET NOT NULL,
    browser VARCHAR(200),
    os VARCHAR(200),
    device VARCHAR(200),
    session_id UUID,
    api_endpoint VARCHAR(255),
    http_method VARCHAR(10),
    affected_record VARCHAR(255),
    previous_value JSONB,
    new_value JSONB,
    risk_level VARCHAR(20),
    status VARCHAR(20)
);
CREATE INDEX idx_security_logs_user_id ON security_logs(user_id);
CREATE INDEX idx_security_logs_ip_address ON security_logs(ip_address);
CREATE INDEX idx_security_logs_timestamp ON security_logs(timestamp);
CREATE INDEX idx_security_logs_module ON security_logs(module);
CREATE INDEX idx_security_logs_action ON security_logs(action);
CREATE INDEX idx_security_logs_risk_level ON security_logs(risk_level);

-- login_history
CREATE TABLE IF NOT EXISTS login_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address INET NOT NULL,
    success BOOLEAN NOT NULL,
    failure_reason VARCHAR(255),
    mfa_verified BOOLEAN,
    device VARCHAR(200),
    browser VARCHAR(200),
    os VARCHAR(200)
);
CREATE INDEX idx_login_history_user_id ON login_history(user_id);
CREATE INDEX idx_login_history_ip_address ON login_history(ip_address);
CREATE INDEX idx_login_history_timestamp ON login_history(timestamp);

-- active_sessions
CREATE TABLE IF NOT EXISTS active_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    username VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    login_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
    device VARCHAR(200),
    browser VARCHAR(200),
    os VARCHAR(200)
);
CREATE INDEX idx_active_sessions_user_id ON active_sessions(user_id);
CREATE INDEX idx_active_sessions_ip_address ON active_sessions(ip_address);

-- blocked_ips
CREATE TABLE IF NOT EXISTS blocked_ips (
    ip_address INET PRIMARY KEY,
    reason VARCHAR(255) NOT NULL,
    blocked_by UUID,
    blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'BLOCKED'
);
CREATE INDEX idx_blocked_ips_status ON blocked_ips(status);

-- security_alerts
CREATE TABLE IF NOT EXISTS security_alerts (
    id BIGSERIAL PRIMARY KEY,
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    module VARCHAR(100),
    description TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    ip_address INET,
    user_id UUID
);
CREATE INDEX idx_security_alerts_severity ON security_alerts(severity);
CREATE INDEX idx_security_alerts_status ON security_alerts(status);

-- api_request_logs
CREATE TABLE IF NOT EXISTS api_request_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID,
    endpoint VARCHAR(255) NOT NULL,
    http_method VARCHAR(10) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address INET NOT NULL,
    request_body JSONB,
    response_status INT,
    response_body JSONB,
    risk_level VARCHAR(20)
);
CREATE INDEX idx_api_request_logs_user_id ON api_request_logs(user_id);
CREATE INDEX idx_api_request_logs_endpoint ON api_request_logs(endpoint);
CREATE INDEX idx_api_request_logs_timestamp ON api_request_logs(timestamp);
