-- ============================================================
-- 00002 — Module Tables (admin, compliance, employee, legal, procurement)
-- Additive only: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- Never edits 00001 and never drops or alters an existing column.
--
-- Column names/types/lengths come from the JPA @Table/@Column mappings.
-- Entities extending BaseEntity get the shared audit block (created_at,
-- updated_at, created_by, updated_by, is_deleted, deleted_at,
-- deleted_by); the four admin entities are standalone @Entity classes
-- and only get the fields they declare.
--
-- Timestamp types are deliberate, because Hibernate's schema validator
-- compares JDBC type codes:
--   * BaseEntity uses LocalDateTime  -> timestamp (without time zone)
--   * the admin entities use Instant -> timestamptz (with time zone)
-- Enum fields are @Enumerated(EnumType.STRING) and stored as text.
--
-- Safe to run standalone and safe to re-run: the ALTER sections are
-- guarded on table existence, so this file succeeds even if 00001 has
-- not been applied yet (it just skips those columns and says so).
-- ============================================================

-- ============================================================
-- ADMIN MODULE (standalone entities, Instant timestamps)
-- ============================================================

-- 1. ADMIN NOTIFICATIONS  (AdminNotification)
create table if not exists public.admin_notifications (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       varchar(200) not null,
  message     text,
  type        varchar(30) not null,
  severity    varchar(20) not null,
  read        boolean not null default false,
  expires_at  timestamptz
);

-- 2. BACKUP RECORDS  (BackupRecord)
create table if not exists public.backup_records (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  backup_type      varchar(20) not null,
  status           varchar(20) not null,
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  file_size        bigint,
  file_path        varchar(500),
  integrity_check  varchar(20),
  triggered_by     varchar(255),
  notes            text
);

-- 3. INTEGRATION STATUS  (IntegrationStatus)
create table if not exists public.integration_status (
  id                          uuid primary key default gen_random_uuid(),
  created_at                  timestamptz not null default now(),
  system_name                 varchar(100) not null unique,
  connection_status           varchar(20) not null,
  last_sync_at                timestamptz,
  api_health                  varchar(20),
  response_time_ms            bigint,
  failed_syncs                integer not null default 0,
  last_successful_connection  timestamptz
);

-- 4. SYSTEM CONFIGURATIONS  (SystemConfiguration)
create table if not exists public.system_configurations (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  config_key    varchar(100) not null unique,
  config_value  text,
  description   varchar(255),
  category      varchar(50),
  updated_at    timestamptz not null default now(),
  updated_by    varchar(255)
);

-- ============================================================
-- COMPLIANCE MODULE (BaseEntity, LocalDateTime timestamps)
-- ============================================================

-- 5. COMPLIANCE ALERTS  (ComplianceAlert)
create table if not exists public.compliance_alerts (
  id               uuid primary key default gen_random_uuid(),
  type             text not null,
  severity         text not null,
  title            varchar(255) not null,
  message          text,
  entity_type      varchar(255),
  entity_id        varchar(255),
  status           text not null,
  dedup_key        varchar(255) unique,
  acknowledged_by  varchar(255),
  acknowledged_at  timestamp,
  created_at       timestamp not null default now(),
  updated_at       timestamp,
  created_by       varchar(255),
  updated_by       varchar(255),
  is_deleted       boolean not null default false,
  deleted_at       timestamp,
  deleted_by       varchar(255)
);

-- 6. DISPOSAL REQUESTS  (DisposalRequest)
create table if not exists public.disposal_requests (
  id                     uuid primary key default gen_random_uuid(),
  document_id            uuid not null,
  document_title         varchar(255) not null,
  reason                 text,
  status                 text not null,
  decision_notes         text,
  decided_by             varchar(255),
  decided_at             timestamp,
  retention_policy_name  varchar(255),
  created_at             timestamp not null default now(),
  updated_at             timestamp,
  created_by             varchar(255),
  updated_by             varchar(255),
  is_deleted             boolean not null default false,
  deleted_at             timestamp,
  deleted_by             varchar(255)
);

-- ============================================================
-- EMPLOYEE MODULE (BaseEntity, LocalDateTime timestamps)
-- recipient_id / requester_id are @ManyToOne to the auth User entity.
-- 00001 creates no public.users table, so these stay plain not-null
-- uuid columns; the FK is added below only if users exists.
-- ============================================================

-- 7. EMPLOYEE NOTIFICATIONS  (EmployeeNotification)
create table if not exists public.employee_notifications (
  id                   uuid primary key default gen_random_uuid(),
  recipient_id         uuid not null,
  title                varchar(255) not null,
  message              text,
  type                 text not null,
  is_read              boolean not null default false,
  related_entity_type  varchar(255),
  related_entity_id    varchar(255),
  created_at           timestamp not null default now(),
  updated_at           timestamp,
  created_by           varchar(255),
  updated_by           varchar(255),
  is_deleted           boolean not null default false,
  deleted_at           timestamp,
  deleted_by           varchar(255)
);

create index if not exists idx_employee_notifications_recipient
  on public.employee_notifications(recipient_id);

-- 8. EMPLOYEE REQUESTS  (EmployeeRequest)
create table if not exists public.employee_requests (
  id              uuid primary key default gen_random_uuid(),
  requester_id    uuid not null,
  type            text not null,
  title           varchar(255) not null,
  description     text,
  status          text not null,
  decision_notes  text,
  created_at      timestamp not null default now(),
  updated_at      timestamp,
  created_by      varchar(255),
  updated_by      varchar(255),
  is_deleted      boolean not null default false,
  deleted_at      timestamp,
  deleted_by      varchar(255)
);

create index if not exists idx_employee_requests_requester
  on public.employee_requests(requester_id);

-- Attach the two employee FKs only when public.users is present, so
-- this file is safe to run against a project built from 00001 alone
-- (which has no users table).
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'users') then

    if not exists (select 1 from pg_constraint
                   where conname = 'fk_employee_notifications_recipient') then
      alter table public.employee_notifications
        add constraint fk_employee_notifications_recipient
        foreign key (recipient_id) references public.users(id);
    end if;

    if not exists (select 1 from pg_constraint
                   where conname = 'fk_employee_requests_requester') then
      alter table public.employee_requests
        add constraint fk_employee_requests_requester
        foreign key (requester_id) references public.users(id);
    end if;

  else
    raise notice 'public.users not found - employee FKs skipped (columns still created).';
  end if;
end $$;

-- ============================================================
-- LEGAL MODULE (BaseEntity, LocalDateTime timestamps)
-- ============================================================

-- 9. LEGAL NOTICES  (LegalNotice)
create table if not exists public.legal_notices (
  id               uuid primary key default gen_random_uuid(),
  type             text not null,
  severity         text not null,
  title            varchar(255) not null,
  message          text,
  entity_type      varchar(255),
  entity_id        varchar(255),
  status           text not null,
  dedup_key        varchar(255) unique,
  acknowledged_by  varchar(255),
  acknowledged_at  timestamp,
  created_at       timestamp not null default now(),
  updated_at       timestamp,
  created_by       varchar(255),
  updated_by       varchar(255),
  is_deleted       boolean not null default false,
  deleted_at       timestamp,
  deleted_by       varchar(255)
);

-- ============================================================
-- PROCUREMENT MODULE (BaseEntity, LocalDateTime timestamps)
-- vendors is created before vendor_obligations so its FK resolves.
-- ============================================================

-- 10. VENDORS  (Vendor)
create table if not exists public.vendors (
  id                   uuid primary key default gen_random_uuid(),
  vendor_code          varchar(255) not null unique,
  name                 varchar(255) not null,
  category             text,
  contact_name         varchar(255),
  contact_email        varchar(255),
  contact_phone        varchar(255),
  address              text,
  status               text not null,
  performance_score    integer,
  sla_compliance_rate  numeric(38,2),
  notes                text,
  created_at           timestamp not null default now(),
  updated_at           timestamp,
  created_by           varchar(255),
  updated_by           varchar(255),
  is_deleted           boolean not null default false,
  deleted_at           timestamp,
  deleted_by           varchar(255)
);

-- 11. VENDOR OBLIGATIONS  (VendorObligation)
create table if not exists public.vendor_obligations (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references public.vendors(id),
  title        varchar(255) not null,
  description  text,
  due_date     date,
  status       text not null,
  notes        text,
  created_at   timestamp not null default now(),
  updated_at   timestamp,
  created_by   varchar(255),
  updated_by   varchar(255),
  is_deleted   boolean not null default false,
  deleted_at   timestamp,
  deleted_by   varchar(255)
);

create index if not exists idx_vendor_obligations_vendor
  on public.vendor_obligations(vendor_id);

-- 12. PROCUREMENT NOTICES  (ProcurementNotice)
create table if not exists public.procurement_notices (
  id               uuid primary key default gen_random_uuid(),
  type             text,
  severity         text,
  title            varchar(255) not null,
  message          text,
  entity_type      varchar(255),
  entity_id        varchar(255),
  status           text not null,
  dedup_key        varchar(255) unique,
  acknowledged_by  varchar(255),
  acknowledged_at  timestamp,
  created_at       timestamp not null default now(),
  updated_at       timestamp,
  created_by       varchar(255),
  updated_by       varchar(255),
  is_deleted       boolean not null default false,
  deleted_at       timestamp,
  deleted_by       varchar(255)
);

-- ============================================================
-- ADDITIVE COLUMNS ON EXISTING TABLES
--
-- Guarded on table existence. The Supabase SQL editor runs a script as
-- one transaction, so an unguarded ALTER against a missing table would
-- roll back every CREATE above it. If a table is absent the block
-- raises a notice and the run still succeeds — apply 00001, then
-- re-run this file to backfill (ADD COLUMN IF NOT EXISTS makes the
-- re-run a no-op for anything already present).
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'contracts') then
    raise notice 'public.contracts not found - its columns were skipped. Apply 00001, then re-run 00002.';
  else

    -- Optional link to a procurement Vendor (Contract.vendorId).
    -- Plain column by design - no JPA association, so no FK.
    alter table public.contracts add column if not exists vendor_id uuid;

    -- Beyond the 4 columns named in the task: Contract also declares
    -- renewalNoticeDate and associatedDocument, and extends BaseEntity.
    alter table public.contracts add column if not exists renewal_notice_date  date;
    alter table public.contracts add column if not exists document_id          uuid;
    alter table public.contracts add column if not exists updated_at           timestamp;
    alter table public.contracts add column if not exists created_by           varchar(255);
    alter table public.contracts add column if not exists updated_by           varchar(255);
    alter table public.contracts add column if not exists is_deleted           boolean not null default false;
    alter table public.contracts add column if not exists deleted_at           timestamp;
    alter table public.contracts add column if not exists deleted_by           varchar(255);

  end if;
end $$;

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'legal_cases') then
    raise notice 'public.legal_cases not found - its columns were skipped. Apply 00001, then re-run 00002.';
  else

    -- The 3 legal_cases columns named in the task.
    alter table public.legal_cases add column if not exists case_type         text;
    alter table public.legal_cases add column if not exists closed_date       date;
    alter table public.legal_cases add column if not exists resolution_notes  text;

    -- Beyond those: LegalCase also declares description, judgeName,
    -- opposingParty, leadLawyer, filingDate, expectedResolutionDate,
    -- and extends BaseEntity.
    alter table public.legal_cases add column if not exists description               text;
    alter table public.legal_cases add column if not exists judge_name                varchar(255);
    alter table public.legal_cases add column if not exists opposing_party            varchar(255);
    alter table public.legal_cases add column if not exists lead_lawyer_id            uuid;
    alter table public.legal_cases add column if not exists filing_date               date;
    alter table public.legal_cases add column if not exists expected_resolution_date  date;
    alter table public.legal_cases add column if not exists updated_at                timestamp;
    alter table public.legal_cases add column if not exists created_by                varchar(255);
    alter table public.legal_cases add column if not exists updated_by                varchar(255);
    alter table public.legal_cases add column if not exists is_deleted                boolean not null default false;
    alter table public.legal_cases add column if not exists deleted_at                timestamp;
    alter table public.legal_cases add column if not exists deleted_by                varchar(255);

  end if;
end $$;

-- ============================================================
-- Row Level Security
-- RLS on with no policy: the backend connects as the `postgres` role
-- and bypasses RLS, while the anon/publishable key is denied by
-- default. None of these tables are read from the browser (the
-- frontend only subscribes to user_activity_events), so unlike 00001
-- no permissive anon policy is created here.
-- ============================================================
alter table public.admin_notifications     enable row level security;
alter table public.backup_records          enable row level security;
alter table public.integration_status      enable row level security;
alter table public.system_configurations   enable row level security;
alter table public.compliance_alerts       enable row level security;
alter table public.disposal_requests       enable row level security;
alter table public.employee_notifications  enable row level security;
alter table public.employee_requests       enable row level security;
alter table public.legal_notices           enable row level security;
alter table public.vendors                 enable row level security;
alter table public.vendor_obligations      enable row level security;
alter table public.procurement_notices     enable row level security;
