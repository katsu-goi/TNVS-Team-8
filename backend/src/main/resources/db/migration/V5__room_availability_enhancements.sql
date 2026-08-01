-- V5: Room availability enhancements
-- Adds building, operating hours and status to rooms, plus amenity
-- and reservation approval tracking.

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS building VARCHAR(150);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS open_time TIME;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS close_time TIME;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'VACANT';

CREATE TABLE IF NOT EXISTS facility_amenities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_facility_amenities_room ON facility_amenities(room_id);

CREATE TABLE IF NOT EXISTS reservation_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    approved_by UUID REFERENCES users(id),
    decision VARCHAR(30) NOT NULL,
    comments TEXT,
    decided_at TIMESTAMP,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_reservation_approvals_reservation ON reservation_approvals(reservation_id);
