-- ============================================================
-- 00003 - Reconcile Entity Schema (auth, documents, facilities,
--         records, security) against the JPA entity model
--
-- Task 1b: 00001 only defined 13 tables and omitted several columns
-- even on those. Everything else has been auto-created by
-- ddl-auto:update at runtime. This migration version-controls the
-- rest of the schema.
--
-- Rules:
--   * PURELY ADDITIVE - CREATE TABLE IF NOT EXISTS, ALTER TABLE
--     ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
--   * No DROP, no TRUNCATE, no ALTER of existing columns.
--   * ALTERs are wrapped in DO $$ blocks guarded on table existence
--     so this file succeeds even when 00001 was never applied.
--   * No FOREIGN KEY constraints: relationships are loose uuid
--     columns, consistent with the codebase pattern. FKs would make
--     the file order-dependent and fail on projects where tables
--     already exist without them.
--   * BaseEntity (LocalDateTime) columns -> timestamp.
--     Standalone Instant columns -> timestamptz.
-- ============================================================

-- ============================================================
-- 1. AUTH (users, roles, permissions, refresh_tokens, audit_logs)
-- ============================================================

create table if not exists public.users (
  id                       uuid primary key default gen_random_uuid(),
  created_at               timestamp not null default now(),
  updated_at               timestamp,
  created_by               varchar(255),
  updated_by               varchar(255),
  is_deleted               boolean not null default false,
  deleted_at               timestamp,
  deleted_by               varchar(255),
  employee_id              varchar(50) unique,
  first_name               varchar(100) not null,
  last_name                varchar(100) not null,
  email                    varchar(255) not null unique,
  password_hash            text not null,
  phone_number             varchar(20),
  department               varchar(100),
  position                 varchar(100),
  avatar_url               text,
  status                   varchar(20) not null default 'ACTIVE',
  is_email_verified        boolean not null default false,
  email_verified_at        timestamp,
  last_login_at            timestamp,
  last_login_ip            varchar(45),
  failed_login_attempts    integer not null default 0,
  locked_until             timestamp,
  password_reset_token     text,
  password_reset_expires_at timestamp
);

create index if not exists idx_users_employee_id on public.users(employee_id);

create table if not exists public.roles (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamp not null default now(),
  updated_at     timestamp,
  created_by     varchar(255),
  updated_by     varchar(255),
  is_deleted     boolean not null default false,
  deleted_at     timestamp,
  deleted_by     varchar(255),
  name           varchar(50) not null unique,
  display_name   varchar(100) not null,
  description    varchar(500),
  is_system_role boolean not null default false
);

create table if not exists public.permissions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamp not null default now(),
  updated_at   timestamp,
  created_by   varchar(255),
  updated_by   varchar(255),
  is_deleted   boolean not null default false,
  deleted_at   timestamp,
  deleted_by   varchar(255),
  name         varchar(100) not null unique,
  display_name varchar(150) not null,
  description  varchar(500),
  module       varchar(50) not null,
  resource     varchar(100) not null,
  action       varchar(20) not null
);

create table if not exists public.refresh_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,
  token      varchar(1000) not null unique,
  expires_at timestamp not null,
  is_revoked boolean not null default false,
  revoked_at timestamp,
  ip_address varchar(45),
  user_agent varchar(500),
  created_at timestamp not null default now()
);

create index if not exists idx_refresh_tokens_user on public.refresh_tokens(user_id);

create table if not exists public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid,
  user_email     varchar(255),
  user_full_name varchar(200),
  action         varchar(100) not null,
  entity_type    varchar(100),
  entity_id      varchar(100),
  entity_name    varchar(255),
  module         varchar(50),
  description    varchar(1000),
  old_values     text,
  new_values     text,
  ip_address     varchar(45),
  user_agent     varchar(500),
  severity       varchar(20) default 'INFO',
  status         varchar(20) default 'SUCCESS',
  created_at     timestamp not null default now()
);

create index if not exists idx_audit_logs_user on public.audit_logs(user_id);

create table if not exists public.user_roles (
  user_id uuid not null,
  role_id uuid not null,
  primary key (user_id, role_id)
);

create table if not exists public.role_permissions (
  role_id       uuid not null,
  permission_id uuid not null,
  primary key (role_id, permission_id)
);

-- ============================================================
-- 2. DOCUMENTS (folders, categories, tags, document_tags)
-- ============================================================

create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamp not null default now(),
  updated_at timestamp,
  created_by varchar(255),
  updated_by varchar(255),
  is_deleted boolean not null default false,
  deleted_at timestamp,
  deleted_by varchar(255),
  name       text not null,
  parent_id  uuid,
  path       text not null
);

create index if not exists idx_folders_parent on public.folders(parent_id);

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamp not null default now(),
  updated_at  timestamp,
  created_by  varchar(255),
  updated_by  varchar(255),
  is_deleted  boolean not null default false,
  deleted_at  timestamp,
  deleted_by  varchar(255),
  name        text not null unique,
  description text
);

create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamp not null default now(),
  updated_at timestamp,
  created_by varchar(255),
  updated_by varchar(255),
  is_deleted boolean not null default false,
  deleted_at timestamp,
  deleted_by varchar(255),
  name       text not null unique
);

create table if not exists public.document_tags (
  document_id uuid not null,
  tag_id      uuid not null,
  primary key (document_id, tag_id)
);

-- ============================================================
-- 3. FACILITIES (equipment, facility_amenities, reservation_approvals)
-- ============================================================

create table if not exists public.equipment (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamp not null default now(),
  updated_at            timestamp,
  created_by            varchar(255),
  updated_by            varchar(255),
  is_deleted            boolean not null default false,
  deleted_at            timestamp,
  deleted_by            varchar(255),
  room_id               uuid,
  name                  text not null,
  serial_number         text not null unique,
  category              text,
  status                text not null,
  last_maintenance_date date,
  next_maintenance_date date
);

create index if not exists idx_equipment_room on public.equipment(room_id);

create table if not exists public.facility_amenities (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamp not null default now(),
  updated_at  timestamp,
  created_by  varchar(255),
  updated_by  varchar(255),
  is_deleted  boolean not null default false,
  deleted_at  timestamp,
  deleted_by  varchar(255),
  room_id     uuid not null,
  name        text not null,
  description text
);

create index if not exists idx_facility_amenities_room on public.facility_amenities(room_id);

create table if not exists public.reservation_approvals (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamp not null default now(),
  updated_at     timestamp,
  created_by     varchar(255),
  updated_by     varchar(255),
  is_deleted     boolean not null default false,
  deleted_at     timestamp,
  deleted_by     varchar(255),
  reservation_id uuid not null,
  approved_by    uuid,
  decision       text not null,
  comments       text,
  decided_at     timestamp
);

create index if not exists idx_reservation_approvals_reservation on public.reservation_approvals(reservation_id);

-- ============================================================
-- 4. RECORDS (retention_policies)
-- ============================================================

create table if not exists public.retention_policies (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamp not null default now(),
  updated_at            timestamp,
  created_by            varchar(255),
  updated_by            varchar(255),
  is_deleted            boolean not null default false,
  deleted_at            timestamp,
  deleted_by            varchar(255),
  name                  text not null unique,
  description           text,
  retention_period_days integer not null,
  action_on_expiry      text not null,
  active                boolean default true
);

-- ============================================================
-- 5. SECURITY (login_history, api_request_logs)
-- ============================================================

create table if not exists public.login_history (
  id                 uuid primary key default gen_random_uuid(),
  timestamp          timestamptz not null default now(),
  username           text not null,
  user_id            text,
  ip_address         varchar(45) not null,
  user_agent         text,
  status             text not null,
  failure_reason     text,
  device_fingerprint text,
  location           text
);

create table if not exists public.api_request_logs (
  id                 uuid primary key default gen_random_uuid(),
  timestamp          timestamptz not null default now(),
  ip_address         varchar(45) not null,
  url                text not null,
  method             varchar(10) not null,
  status_code        integer not null,
  response_time_ms   bigint not null,
  user_agent         text,
  payload_size_bytes bigint,
  user_id            text
);

-- ============================================================
-- 6. ADDITIVE COLUMNS ON EXISTING 00001 TABLES
--    (guarded on table existence - safe even if 00001 was never
--     applied; re-run this file after 00001 to backfill)
-- ============================================================

-- facilities: timezone + BaseEntity audit block
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'facilities') then
    raise notice 'public.facilities not found - columns skipped.';
  else
    alter table public.facilities add column if not exists timezone     text;
    alter table public.facilities add column if not exists updated_at   timestamp;
    alter table public.facilities add column if not exists created_by   varchar(255);
    alter table public.facilities add column if not exists updated_by   varchar(255);
    alter table public.facilities add column if not exists is_deleted   boolean not null default false;
    alter table public.facilities add column if not exists deleted_at   timestamp;
    alter table public.facilities add column if not exists deleted_by   varchar(255);
    create unique index if not exists ux_facilities_name on public.facilities(name);
  end if;
end $$;

-- rooms: floor_number, open/close time, has_whiteboard, active + audit block
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'rooms') then
    raise notice 'public.rooms not found - columns skipped.';
  else
    alter table public.rooms add column if not exists floor_number    integer;
    alter table public.rooms add column if not exists open_time       time;
    alter table public.rooms add column if not exists close_time      time;
    alter table public.rooms add column if not exists has_whiteboard  boolean not null default false;
    alter table public.rooms add column if not exists active          boolean not null default true;
    alter table public.rooms add column if not exists updated_at      timestamp;
    alter table public.rooms add column if not exists created_by      varchar(255);
    alter table public.rooms add column if not exists updated_by      varchar(255);
    alter table public.rooms add column if not exists is_deleted      boolean not null default false;
    alter table public.rooms add column if not exists deleted_at      timestamp;
    alter table public.rooms add column if not exists deleted_by      varchar(255);
  end if;
end $$;

-- reservations: user_id, description, rejection_reason + remaining audit block
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'reservations') then
    raise notice 'public.reservations not found - columns skipped.';
  else
    alter table public.reservations add column if not exists user_id           uuid;
    alter table public.reservations add column if not exists description       text;
    alter table public.reservations add column if not exists rejection_reason  text;
    alter table public.reservations add column if not exists created_by        varchar(255);
    alter table public.reservations add column if not exists updated_by        varchar(255);
    alter table public.reservations add column if not exists is_deleted        boolean not null default false;
    alter table public.reservations add column if not exists deleted_at        timestamp;
    alter table public.reservations add column if not exists deleted_by        varchar(255);
  end if;
end $$;

-- maintenance_schedules: description, status, assigned_to, notes + remaining audit block
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'maintenance_schedules') then
    raise notice 'public.maintenance_schedules not found - columns skipped.';
  else
    alter table public.maintenance_schedules add column if not exists description text;
    alter table public.maintenance_schedules add column if not exists status      text;
    alter table public.maintenance_schedules add column if not exists assigned_to text;
    alter table public.maintenance_schedules add column if not exists notes       text;
    alter table public.maintenance_schedules add column if not exists updated_at  timestamp;
    alter table public.maintenance_schedules add column if not exists updated_by  varchar(255);
    alter table public.maintenance_schedules add column if not exists is_deleted  boolean not null default false;
    alter table public.maintenance_schedules add column if not exists deleted_at  timestamp;
    alter table public.maintenance_schedules add column if not exists deleted_by  varchar(255);
  end if;
end $$;

-- visitors: phone_number, id_number, host_id, badge_number + audit block
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'visitors') then
    raise notice 'public.visitors not found - columns skipped.';
  else
    alter table public.visitors add column if not exists phone_number text;
    alter table public.visitors add column if not exists id_number    text;
    alter table public.visitors add column if not exists host_id      uuid;
    alter table public.visitors add column if not exists badge_number text;
    alter table public.visitors add column if not exists updated_at   timestamp;
    alter table public.visitors add column if not exists created_by   varchar(255);
    alter table public.visitors add column if not exists updated_by   varchar(255);
    alter table public.visitors add column if not exists is_deleted   boolean not null default false;
    alter table public.visitors add column if not exists deleted_at   timestamp;
    alter table public.visitors add column if not exists deleted_by   varchar(255);
  end if;
end $$;

-- documents: file_path, storage URL, folder/category links, version + audit block
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'documents') then
    raise notice 'public.documents not found - columns skipped.';
  else
    alter table public.documents add column if not exists file_path             text;
    alter table public.documents add column if not exists supabase_storage_url  text;
    alter table public.documents add column if not exists folder_id             uuid;
    alter table public.documents add column if not exists category_id           uuid;
    alter table public.documents add column if not exists version_number        integer;
    alter table public.documents add column if not exists updated_at            timestamp;
    alter table public.documents add column if not exists created_by            varchar(255);
    alter table public.documents add column if not exists updated_by            varchar(255);
    alter table public.documents add column if not exists is_deleted            boolean not null default false;
    alter table public.documents add column if not exists deleted_at            timestamp;
    alter table public.documents add column if not exists deleted_by            varchar(255);
    create index if not exists idx_documents_folder   on public.documents(folder_id);
    create index if not exists idx_documents_category on public.documents(category_id);
  end if;
end $$;

-- security_logs: columns required by the SecurityLog entity
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'security_logs') then
    raise notice 'public.security_logs not found - columns skipped.';
  else
    alter table public.security_logs add column if not exists timestamp         timestamptz;
    alter table public.security_logs add column if not exists user_id           text;
    alter table public.security_logs add column if not exists department        text;
    alter table public.security_logs add column if not exists device_name       text;
    alter table public.security_logs add column if not exists browser           text;
    alter table public.security_logs add column if not exists operating_system  text;
    alter table public.security_logs add column if not exists session_id        text;
    alter table public.security_logs add column if not exists request_id        text;
    alter table public.security_logs add column if not exists api_endpoint      text;
    alter table public.security_logs add column if not exists http_method       text;
    alter table public.security_logs add column if not exists affected_record   text;
    alter table public.security_logs add column if not exists previous_value    text;
    alter table public.security_logs add column if not exists new_value         text;
    alter table public.security_logs add column if not exists geo_location      text;
  end if;
end $$;

-- active_sessions: session_id, user_id
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'active_sessions') then
    raise notice 'public.active_sessions not found - columns skipped.';
  else
    alter table public.active_sessions add column if not exists session_id text;
    alter table public.active_sessions add column if not exists user_id    text;
  end if;
end $$;

-- blocked_ips: attempts_count
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'blocked_ips') then
    raise notice 'public.blocked_ips not found - columns skipped.';
  else
    alter table public.blocked_ips add column if not exists attempts_count bigint;
  end if;
end $$;

-- security_alerts: target_user_id
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'security_alerts') then
    raise notice 'public.security_alerts not found - columns skipped.';
  else
    alter table public.security_alerts add column if not exists target_user_id text;
  end if;
end $$;

-- ============================================================
-- 7. ROW LEVEL SECURITY
--    Backend connects as the postgres role and bypasses RLS;
--    frontend anon key is denied by default (no policies), which is
--    the secure default. Same approach as 00002.
-- ============================================================
alter table public.users               enable row level security;
alter table public.roles               enable row level security;
alter table public.permissions         enable row level security;
alter table public.refresh_tokens      enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.user_roles          enable row level security;
alter table public.role_permissions    enable row level security;
alter table public.folders             enable row level security;
alter table public.categories          enable row level security;
alter table public.tags                enable row level security;
alter table public.document_tags       enable row level security;
alter table public.equipment           enable row level security;
alter table public.facility_amenities  enable row level security;
alter table public.reservation_approvals enable row level security;
alter table public.retention_policies  enable row level security;
alter table public.login_history       enable row level security;
alter table public.api_request_logs    enable row level security;
