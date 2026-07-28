-- V2: Facilities & Domain Schemas (merged)
-- Facilities, Rooms, Equipment, Reservations, Maintenance,
-- Visitors, Folders, Categories, Tags, Documents, Retention Policies,
-- Legal Cases, Contracts, Contract Clauses

-- ==================== FACILITIES ====================
CREATE TABLE IF NOT EXISTS facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    floor VARCHAR(50),
    building VARCHAR(100),
    timezone VARCHAR(50),
    total_capacity INT,
    capacity INT,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    amenities TEXT[],
    image_url TEXT,
    active BOOLEAN DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_facilities_code ON facilities(code);
CREATE INDEX IF NOT EXISTS idx_facilities_type ON facilities(type);
CREATE INDEX IF NOT EXISTS idx_facilities_status ON facilities(status);

-- ==================== ROOMS ====================
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50) UNIQUE,
    room_number VARCHAR(50),
    description TEXT,
    room_type VARCHAR(50) NOT NULL,
    type VARCHAR(50),
    capacity INT NOT NULL,
    floor_number INT,
    floor VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
    hourly_rate DECIMAL(10,2),
    amenities TEXT[],
    images TEXT[],
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    has_projector BOOLEAN DEFAULT FALSE,
    has_video_conference BOOLEAN DEFAULT FALSE,
    has_whiteboard BOOLEAN DEFAULT FALSE,
    is_available BOOLEAN DEFAULT TRUE,
    maintenance_status VARCHAR(30),
    maintenance_reason TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_rooms_facility ON rooms(facility_id);
CREATE INDEX IF NOT EXISTS idx_rooms_type ON rooms(room_type);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);

-- ==================== EQUIPMENT ====================
CREATE TABLE IF NOT EXISTS equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50) UNIQUE,
    description TEXT,
    category VARCHAR(100),
    brand VARCHAR(100),
    model VARCHAR(100),
    serial_number VARCHAR(100) UNIQUE,
    facility_id UUID REFERENCES facilities(id),
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
    condition VARCHAR(30) DEFAULT 'GOOD',
    purchase_date DATE,
    warranty_expiry DATE,
    daily_rate DECIMAL(10,2),
    last_maintenance_date DATE,
    next_maintenance_date DATE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_equipment_facility ON equipment(facility_id);
CREATE INDEX IF NOT EXISTS idx_equipment_room ON equipment(room_id);
CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category);

-- ==================== RESERVATIONS ====================
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_number VARCHAR(50) UNIQUE NOT NULL,
    requester_id UUID NOT NULL REFERENCES users(id),
    user_id UUID REFERENCES users(id),
    room_id UUID NOT NULL REFERENCES rooms(id),
    equipment_id UUID REFERENCES equipment(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    purpose VARCHAR(255),
    start_datetime TIMESTAMP NOT NULL,
    end_datetime TIMESTAMP NOT NULL,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    attendees_count INT,
    expected_attendees INT,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    approval_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    setup_requirements TEXT,
    special_notes TEXT,
    notes TEXT,
    recurrence_type VARCHAR(30) DEFAULT 'NONE',
    recurrence_end_date DATE,
    parent_reservation_id UUID REFERENCES reservations(id),
    check_in_time TIMESTAMP,
    check_out_time TIMESTAMP,
    employee_name VARCHAR(255),
    employee_department VARCHAR(255),
    employee_email VARCHAR(255),
    employee_id VARCHAR(100),
    qr_code_token VARCHAR(255),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_reservations_requester ON reservations(requester_id);
CREATE INDEX IF NOT EXISTS idx_reservations_room ON reservations(room_id);
CREATE INDEX IF NOT EXISTS idx_reservations_dates ON reservations(start_datetime, end_datetime);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);

-- ==================== MAINTENANCE SCHEDULES ====================
CREATE TABLE IF NOT EXISTS maintenance_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES facilities(id),
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    equipment_id UUID REFERENCES equipment(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'ROUTINE',
    scheduled_date DATE NOT NULL,
    scheduled_time TIME,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    estimated_duration_hours DECIMAL(4,2),
    status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',
    assigned_to VARCHAR(255),
    completed_at TIMESTAMP,
    reason TEXT,
    notes TEXT,
    created_by VARCHAR(255),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    updated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_facility ON maintenance_schedules(facility_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_room ON maintenance_schedules(room_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_schedules(status);

-- ==================== VISITORS ====================
CREATE TABLE IF NOT EXISTS visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    phone VARCHAR(50),
    company VARCHAR(255),
    id_number VARCHAR(100),
    host_id UUID REFERENCES users(id) ON DELETE CASCADE,
    host_employee_id VARCHAR(255),
    purpose_of_visit VARCHAR(255) NOT NULL,
    expected_arrival TIMESTAMP NOT NULL,
    actual_arrival TIMESTAMP,
    actual_departure TIMESTAMP,
    status VARCHAR(50) NOT NULL DEFAULT 'REGISTERED',
    qr_code_token VARCHAR(255) UNIQUE,
    badge_number VARCHAR(100),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_visitors_email ON visitors(email);
CREATE INDEX IF NOT EXISTS idx_visitors_status ON visitors(status);
CREATE INDEX IF NOT EXISTS idx_visitors_host ON visitors(host_id);

-- ==================== FOLDERS ====================
CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    path VARCHAR(500) NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- ==================== CATEGORIES ====================
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- ==================== TAGS ====================
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- ==================== DOCUMENTS ====================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    file_size BIGINT,
    file_path VARCHAR(500),
    supabase_storage_url VARCHAR(500),
    folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    classification_level VARCHAR(50) NOT NULL DEFAULT 'INTERNAL',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    ocr_extracted_text TEXT,
    ai_summary TEXT,
    ai_predicted_category VARCHAR(100),
    ai_classification TEXT,
    confidence_score NUMERIC(5,2),
    extracted_keywords TEXT[],
    version_number INT DEFAULT 1,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_ai_category ON documents(ai_predicted_category);

-- ==================== DOCUMENT TAGS ====================
CREATE TABLE IF NOT EXISTS document_tags (
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (document_id, tag_id)
);

-- ==================== RETENTION POLICIES ====================
CREATE TABLE IF NOT EXISTS retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- ==================== LEGAL CASES ====================
CREATE TABLE IF NOT EXISTS legal_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    court_name VARCHAR(255),
    judge_name VARCHAR(255),
    opposing_party VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    priority VARCHAR(50) NOT NULL DEFAULT 'MEDIUM',
    lead_lawyer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    filing_date DATE,
    expected_resolution_date DATE,
    next_hearing_date DATE,
    lead_counselor VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_legal_cases_status ON legal_cases(status);
CREATE INDEX IF NOT EXISTS idx_legal_cases_lawyer ON legal_cases(lead_lawyer_id);

-- ==================== CONTRACTS ====================
CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_number VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'SERVICE',
    counter_party VARCHAR(255),
    contract_value DECIMAL(15,2),
    start_date DATE,
    end_date DATE,
    renewal_notice_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    ai_assessed_risk_level VARCHAR(50) DEFAULT 'LOW',
    ai_risk_summary TEXT,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_risk ON contracts(ai_assessed_risk_level);

-- ==================== CONTRACT CLAUSES ====================
CREATE TABLE IF NOT EXISTS contract_clauses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX IF NOT EXISTS idx_clauses_contract ON contract_clauses(contract_id);
