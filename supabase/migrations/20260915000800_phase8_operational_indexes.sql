-- Phase 8: indexes for authorization predicates and bounded operational lists.
-- These support the highest-frequency owner/host/room scope checks; the broader
-- foreign-key inventory is intentionally not indexed without workload evidence.

create index if not exists idx_reservations_user_created_active
  on public.reservations(user_id, created_at desc)
  where is_deleted = false;

create index if not exists idx_visitors_host_created_active
  on public.visitors(host_id, created_at desc)
  where is_deleted = false;

create index if not exists idx_documents_creator_created_active
  on public.documents(created_by, created_at desc)
  where is_deleted = false;

create index if not exists idx_rooms_facility_active
  on public.rooms(facility_id)
  where is_deleted = false;

create index if not exists idx_maintenance_schedules_room_active
  on public.maintenance_schedules(room_id);

create index if not exists idx_facility_compliance_documents_facility_active
  on public.facility_compliance_documents(facility_id);

create index if not exists idx_facility_compliance_documents_document_active
  on public.facility_compliance_documents(document_id);
