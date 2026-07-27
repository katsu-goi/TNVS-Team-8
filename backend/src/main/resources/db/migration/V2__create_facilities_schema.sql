-- V2: Facilities Reservation Schema

-- Facilities (buildings/areas)
CREATE TABLE IF NOT EXISTS facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50) UNIQUE,
    description TEXT,
    address TEXT,
    floor VARCHAR(50),
    building VARCHAR(100),
    capacity INT,
    type VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    amenities TEXT[],
    image_url TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES facilities(id),
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50) UNIQUE,
    description TEXT,
    room_type VARCHAR(50) NOT NULL,
    capacity INT NOT NULL,
    floor VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
    hourly_rate DECIMAL(10,2),
    amenities TEXT[],
    images TEXT[],
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- Equipment
CREATE TABLE IF NOT EXISTS equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50) UNIQUE,
    description TEXT,
    category VARCHAR(100),
    brand VARCHAR(100),
    model VARCHAR(100),
    serial_number VARCHAR(100),
    facility_id UUID REFERENCES facilities(id),
    room_id UUID REFERENCES rooms(id),
    status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
    condition VARCHAR(30) DEFAULT 'GOOD',
    purchase_date DATE,
    warranty_expiry DATE,
    daily_rate DECIMAL(10,2),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- Reservations
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_number VARCHAR(50) UNIQUE NOT NULL,
    requester_id UUID NOT NULL REFERENCES users(id),
    room_id UUID REFERENCES rooms(id),
    equipment_id UUID REFERENCES equipment(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_datetime TIMESTAMP NOT NULL,
    end_datetime TIMESTAMP NOT NULL,
    attendees_count INT,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    approval_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    setup_requirements TEXT,
    special_notes TEXT,
    recurrence_type VARCHAR(30) DEFAULT 'NONE',
    recurrence_end_date DATE,
    parent_reservation_id UUID REFERENCES reservations(id),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- Maintenance Schedules
CREATE TABLE IF NOT EXISTS maintenance_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES facilities(id),
    room_id UUID REFERENCES rooms(id),
    equipment_id UUID REFERENCES equipment(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'ROUTINE',
    scheduled_date DATE NOT NULL,
    scheduled_time TIME,
    estimated_duration_hours DECIMAL(4,2),
    status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',
    assigned_to VARCHAR(255),
    completed_at TIMESTAMP,
    notes TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reservations_requester ON reservations(requester_id);
CREATE INDEX IF NOT EXISTS idx_reservations_room ON reservations(room_id);
CREATE INDEX IF NOT EXISTS idx_reservations_dates ON reservations(start_datetime, end_datetime);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_rooms_facility ON rooms(facility_id);
CREATE INDEX IF NOT EXISTS idx_equipment_facility ON equipment(facility_id);
