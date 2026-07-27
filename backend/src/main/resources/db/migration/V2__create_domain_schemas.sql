-- V2: Domain Schemas Migration for Facilities, Visitors, Documents, Records, Legal, and Contracts

CREATE TABLE IF NOT EXISTS facilities (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    address VARCHAR(255),
    city VARCHAR(100),
    country VARCHAR(100),
    timezone VARCHAR(50),
    total_capacity INT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY,
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    room_number VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    floor_number INT,
    capacity INT,
    has_projector BOOLEAN DEFAULT FALSE,
    has_video_conference BOOLEAN DEFAULT FALSE,
    has_whiteboard BOOLEAN DEFAULT FALSE,
    hourly_rate DECIMAL(10,2),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS equipment (
    id UUID PRIMARY KEY,
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    serial_number VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(100),
    status VARCHAR(50) NOT NULL,
    last_maintenance_date DATE,
    next_maintenance_date DATE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    status VARCHAR(50) NOT NULL,
    expected_attendees INT,
    rejection_reason TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS visitors (
    id UUID PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    company VARCHAR(255),
    id_number VARCHAR(100),
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose_of_visit VARCHAR(255) NOT NULL,
    expected_arrival TIMESTAMP NOT NULL,
    actual_arrival TIMESTAMP,
    actual_departure TIMESTAMP,
    status VARCHAR(50) NOT NULL,
    qr_code_token VARCHAR(255) UNIQUE,
    badge_number VARCHAR(100),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    path VARCHAR(500) NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    file_size BIGINT,
    file_path VARCHAR(500),
    supabase_storage_url VARCHAR(500),
    folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    classification_level VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    ocr_extracted_text TEXT,
    ai_summary TEXT,
    ai_predicted_category VARCHAR(100),
    version_number INT DEFAULT 1,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS document_tags (
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (document_id, tag_id)
);

CREATE TABLE IF NOT EXISTS retention_policies (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    retention_period_days INT NOT NULL,
    action_on_expiry VARCHAR(50) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS legal_cases (
    id UUID PRIMARY KEY,
    case_number VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    court_name VARCHAR(255),
    judge_name VARCHAR(255),
    opposing_party VARCHAR(255),
    status VARCHAR(50) NOT NULL,
    priority VARCHAR(50) NOT NULL,
    lead_lawyer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    filing_date DATE,
    expected_resolution_date DATE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY,
    contract_number VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    counter_party VARCHAR(255),
    contract_value DECIMAL(15,2),
    start_date DATE,
    end_date DATE,
    renewal_notice_date DATE,
    status VARCHAR(50) NOT NULL,
    ai_assessed_risk_level VARCHAR(50),
    ai_risk_summary TEXT,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS contract_clauses (
    id UUID PRIMARY KEY,
    contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    clause_type VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    risk_level VARCHAR(50),
    ai_analysis_notes TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);
