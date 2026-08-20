# PHASE-0-PRODUCTION-BASELINE

**Supabase Production Baseline - read-only capture**

- **Captured from project ref:** dunijfrvfozwlykpkfhy (ap-southeast-1)
- **Captured at:** 2026-08-18T10:32:02.340Z
- **Method:** read-only PostgreSQL queries via Supabase transaction pooler (6543)
- **No data modified.**

## Summary

- Public base tables: **56**
- Columns: **853**
- Primary keys: **59** (on 56 tables)
- Foreign keys: **37**
- Indexes: **138**
- Sequences: **2**
- RLS enabled: **57** of **56** public base tables; **0 policies** (deny-by-default)
- RLS disabled: **2** (ai_providers, contract_clauses)
- Reconciliation note: `pg_tables` reported 59 rows (56 base tables + 3 duplicate rows); `pg_class relkind='r'` and `information_schema.tables BASE TABLE` both confirm **56 base tables**.
- PostgreSQL functions (public): **0**
- Triggers (public): **0**
- Views (public): **0**
- pg_cron extension/jobs: **none**
- Storage buckets: **0** (0 objects)
- Realtime publications: **supabase_realtime** + **supabase_realtime_messages_publication** (11 tables in supabase_realtime)
- Extensions: pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp

## Table Inventory (columns / PK / FK / indexes)

### active_sessions
- **PK:** id
- **FK:** -
- **Columns (14):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); username character varying NOT NULL; full_name character varying; role character varying; ip_address character varying; country character varying; browser character varying; device_name character varying; login_time timestamp with time zone; last_activity timestamp with time zone; status character varying DEFAULT 'ACTIVE'::text; session_id character varying; user_id character varying
- **Indexes:**
    active_sessions_pkey ON active_sessions_pkey ON public.active_sessions USING btree (id)

### admin_notifications
- **PK:** id
- **FK:** recipient_id -> users.id
- **Columns (11):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); title character varying NOT NULL; message text; type character varying NOT NULL; severity character varying NOT NULL; read boolean NOT NULL DEFAULT false; expires_at timestamp with time zone; related_entity_id character varying; related_entity_type character varying; recipient_id uuid
- **Indexes:**
    admin_notifications_pkey ON admin_notifications_pkey ON public.admin_notifications USING btree (id)

### ai_module_config
- **PK:** id
- **FK:** -
- **Columns (15):** id uuid NOT NULL; created_at timestamp without time zone NOT NULL; created_by character varying; is_deleted boolean NOT NULL; deleted_at timestamp without time zone; deleted_by character varying; updated_at timestamp without time zone; updated_by character varying; enabled boolean NOT NULL; execution_mode character varying NOT NULL; fallback_model character varying; features text; model character varying; module_key character varying NOT NULL; provider_id character varying
- **Indexes:**
    ai_module_config_pkey ON ai_module_config_pkey ON public.ai_module_config USING btree (id)
    idx_ai_module_config_module_key ON idx_ai_module_config_module_key ON public.ai_module_config USING btree (module_key)
    uk7p7835l0uqxdf4th92w1eh59t ON uk7p7835l0uqxdf4th92w1eh59t ON public.ai_module_config USING btree (module_key)

### ai_providers
- **PK:** id
- **FK:** -
- **Columns (15):** id character varying NOT NULL; base_url character varying; capabilities text; created_at timestamp without time zone NOT NULL; default_model character varying; is_deleted boolean NOT NULL; deleted_at timestamp without time zone; enabled boolean NOT NULL; encrypted_api_key text; endpoint character varying; is_default boolean NOT NULL; name character varying NOT NULL; provider_type character varying NOT NULL; status character varying NOT NULL; updated_at timestamp without time zone
- **Indexes:**
    ai_providers_pkey ON ai_providers_pkey ON public.ai_providers USING btree (id)

### api_request_logs
- **PK:** id
- **FK:** -
- **Columns (10):** id uuid NOT NULL DEFAULT gen_random_uuid(); timestamp timestamp with time zone NOT NULL DEFAULT now(); ip_address character varying NOT NULL; url character varying NOT NULL; method character varying NOT NULL; status_code integer NOT NULL; response_time_ms bigint NOT NULL; user_agent text; payload_size_bytes bigint; user_id character varying
- **Indexes:**
    api_request_logs_pkey ON api_request_logs_pkey ON public.api_request_logs USING btree (id)

### audit_logs
- **PK:** id
- **FK:** -
- **Columns (17):** id uuid NOT NULL DEFAULT gen_random_uuid(); user_id uuid; user_email character varying; user_full_name character varying; action character varying NOT NULL; entity_type character varying; entity_id character varying; entity_name character varying; module character varying; description character varying; old_values text; new_values text; ip_address character varying; user_agent character varying; severity character varying DEFAULT 'INFO'::character varying; status character varying DEFAULT 'SUCCESS'::character varying; created_at timestamp without time zone NOT NULL DEFAULT now()
- **Indexes:**
    audit_logs_pkey ON audit_logs_pkey ON public.audit_logs USING btree (id)
    idx_audit_action ON idx_audit_action ON public.audit_logs USING btree (action)
    idx_audit_created_at ON idx_audit_created_at ON public.audit_logs USING btree (created_at)
    idx_audit_entity_type ON idx_audit_entity_type ON public.audit_logs USING btree (entity_type)
    idx_audit_logs_user ON idx_audit_logs_user ON public.audit_logs USING btree (user_id)
    idx_audit_user_id ON idx_audit_user_id ON public.audit_logs USING btree (user_id)

### backup_records
- **PK:** id
- **FK:** -
- **Columns (11):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); backup_type character varying NOT NULL; status character varying NOT NULL; started_at timestamp with time zone NOT NULL DEFAULT now(); completed_at timestamp with time zone; file_size bigint; file_path character varying; integrity_check character varying; triggered_by character varying; notes text
- **Indexes:**
    backup_records_pkey ON backup_records_pkey ON public.backup_records USING btree (id)

### blocked_ips
- **PK:** id
- **FK:** -
- **Columns (9):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); ip_address character varying NOT NULL; reason text NOT NULL; blocked_by character varying; blocked_at timestamp with time zone DEFAULT now(); expires_at timestamp with time zone; status character varying DEFAULT 'ACTIVE'::text; attempts_count bigint
- **Indexes:**
    blocked_ips_pkey ON blocked_ips_pkey ON public.blocked_ips USING btree (id)

### categories
- **PK:** id
- **FK:** -
- **Columns (10):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; name character varying NOT NULL; description character varying
- **Indexes:**
    categories_name_key ON categories_name_key ON public.categories USING btree (name)
    categories_pkey ON categories_pkey ON public.categories USING btree (id)

### compliance_alerts
- **PK:** id
- **FK:** -
- **Columns (18):** id uuid NOT NULL DEFAULT gen_random_uuid(); type character varying NOT NULL; severity character varying NOT NULL; title character varying NOT NULL; message text; entity_type character varying; entity_id character varying; status character varying NOT NULL; dedup_key character varying; acknowledged_by character varying; acknowledged_at timestamp without time zone; created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying
- **Indexes:**
    compliance_alerts_dedup_key_key ON compliance_alerts_dedup_key_key ON public.compliance_alerts USING btree (dedup_key)
    compliance_alerts_pkey ON compliance_alerts_pkey ON public.compliance_alerts USING btree (id)

### contract_clauses
- **PK:** id
- **FK:** contract_id -> contracts.id
- **Columns (13):** id uuid NOT NULL; created_at timestamp without time zone NOT NULL; created_by character varying; is_deleted boolean NOT NULL; deleted_at timestamp without time zone; deleted_by character varying; updated_at timestamp without time zone; updated_by character varying; ai_analysis_notes character varying; clause_type character varying NOT NULL; content text NOT NULL; risk_level character varying; contract_id uuid NOT NULL
- **Indexes:**
    contract_clauses_pkey ON contract_clauses_pkey ON public.contract_clauses USING btree (id)

### contracts
- **PK:** id
- **FK:** document_id -> documents.id; owning_department_id -> department_libraries.id
- **Columns (22):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); contract_number character varying; title character varying NOT NULL; type character varying DEFAULT 'SERVICE'::text; counter_party character varying; contract_value numeric DEFAULT 0; status character varying DEFAULT 'ACTIVE'::text; ai_assessed_risk_level character varying DEFAULT 'LOW'::text; ai_risk_summary text; start_date date; end_date date; vendor_id uuid; renewal_notice_date date; document_id uuid; updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; owning_department_id uuid
- **Indexes:**
    contracts_pkey ON contracts_pkey ON public.contracts USING btree (id)
    idx_contracts_deleted ON idx_contracts_deleted ON public.contracts USING btree (is_deleted) WHERE (is_deleted = true)
    idx_contracts_owning_department ON idx_contracts_owning_department ON public.contracts USING btree (owning_department_id)

### department_libraries
- **PK:** id
- **FK:** -
- **Columns (13):** id uuid NOT NULL DEFAULT gen_random_uuid(); department_name character varying NOT NULL; department_key character varying NOT NULL; description character varying; default_owning_module character varying; is_active boolean NOT NULL DEFAULT true; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying
- **Indexes:**
    department_libraries_pkey ON department_libraries_pkey ON public.department_libraries USING btree (id)
    idx_department_libraries_active ON idx_department_libraries_active ON public.department_libraries USING btree (is_active)
    idx_department_libraries_key ON idx_department_libraries_key ON public.department_libraries USING btree (department_key)

### disposal_requests
- **PK:** id
- **FK:** -
- **Columns (16):** id uuid NOT NULL DEFAULT gen_random_uuid(); document_id uuid NOT NULL; document_title character varying NOT NULL; reason text; status character varying NOT NULL; decision_notes text; decided_by character varying; decided_at timestamp without time zone; retention_policy_name character varying; created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying
- **Indexes:**
    disposal_requests_pkey ON disposal_requests_pkey ON public.disposal_requests USING btree (id)

### document_grants
- **PK:** id
- **FK:** -
- **Columns (13):** id uuid NOT NULL; created_at timestamp without time zone NOT NULL; created_by character varying; is_deleted boolean NOT NULL; deleted_at timestamp without time zone; deleted_by character varying; updated_at timestamp without time zone; updated_by character varying; access_level character varying NOT NULL; document_id uuid NOT NULL; grantee_key character varying NOT NULL; grantee_type character varying NOT NULL; reason character varying
- **Indexes:**
    document_grants_pkey ON document_grants_pkey ON public.document_grants USING btree (id)
    idx_document_grants_document ON idx_document_grants_document ON public.document_grants USING btree (document_id)
    uk_document_grants_doc_grantee ON uk_document_grants_doc_grantee ON public.document_grants USING btree (document_id, grantee_type, grantee_key)

### document_permissions
- **PK:** id
- **FK:** document_id -> documents.id; grantee_department_id -> department_libraries.id; grantee_role_id -> roles.id; grantee_user_id -> users.id
- **Columns (19):** id uuid NOT NULL DEFAULT gen_random_uuid(); document_id uuid NOT NULL; permission_type character varying NOT NULL; grantee_type character varying NOT NULL; grantee_user_id uuid; grantee_department_id uuid; grantee_role_id uuid; is_active boolean NOT NULL DEFAULT true; granted_by character varying; granted_at timestamp without time zone; expires_at timestamp without time zone; reason character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying
- **Indexes:**
    document_permissions_pkey ON document_permissions_pkey ON public.document_permissions USING btree (id)
    idx_document_permissions_active ON idx_document_permissions_active ON public.document_permissions USING btree (is_active)
    idx_document_permissions_department ON idx_document_permissions_department ON public.document_permissions USING btree (grantee_department_id)
    idx_document_permissions_document ON idx_document_permissions_document ON public.document_permissions USING btree (document_id)
    idx_document_permissions_lookup ON idx_document_permissions_lookup ON public.document_permissions USING btree (document_id, permission_type, is_active)
    idx_document_permissions_role ON idx_document_permissions_role ON public.document_permissions USING btree (grantee_role_id)
    idx_document_permissions_user ON idx_document_permissions_user ON public.document_permissions USING btree (grantee_user_id)
    uq_document_permissions_department ON uq_document_permissions_department ON public.document_permissions USING btree (document_id, grantee_department_id, permission_type) WHERE (grantee_department_id IS NOT NULL)
    uq_document_permissions_role ON uq_document_permissions_role ON public.document_permissions USING btree (document_id, grantee_role_id, permission_type) WHERE (grantee_role_id IS NOT NULL)
    uq_document_permissions_user ON uq_document_permissions_user ON public.document_permissions USING btree (document_id, grantee_user_id, permission_type) WHERE (grantee_user_id IS NOT NULL)

### document_tags
- **PK:** document_id, tag_id
- **FK:** document_id -> documents.id; tag_id -> tags.id
- **Columns (2):** document_id uuid NOT NULL; tag_id uuid NOT NULL
- **Indexes:**
    document_tags_pkey ON document_tags_pkey ON public.document_tags USING btree (document_id, tag_id)

### document_versions
- **PK:** id
- **FK:** document_id -> documents.id
- **Columns (31):** id uuid NOT NULL DEFAULT gen_random_uuid(); document_id uuid NOT NULL; version_number integer NOT NULL; title character varying; folder_id uuid; category_id uuid; classification_level character varying; file_path character varying; file_name character varying; file_type character varying; file_size bigint; supabase_storage_url character varying; status character varying; ai_summary text; ai_predicted_category character varying; confidence_score numeric; department_library_id uuid; owning_module character varying; retention_policy_id uuid; retention_expires_at timestamp without time zone; snapshot_reason character varying NOT NULL; change_note character varying; captured_by character varying; captured_at timestamp without time zone; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying
- **Indexes:**
    document_versions_pkey ON document_versions_pkey ON public.document_versions USING btree (id)
    idx_document_versions_captured_at ON idx_document_versions_captured_at ON public.document_versions USING btree (captured_at)
    idx_document_versions_document ON idx_document_versions_document ON public.document_versions USING btree (document_id)
    idx_document_versions_document_number ON idx_document_versions_document_number ON public.document_versions USING btree (document_id, version_number)
    uq_document_versions_document_number ON uq_document_versions_document_number ON public.document_versions USING btree (document_id, version_number) WHERE (is_deleted = false)

### documents
- **PK:** id
- **FK:** category_id -> categories.id; department_library_id -> department_libraries.id; folder_id -> folders.id
- **Columns (34):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); title character varying NOT NULL; file_name character varying; file_type character varying; file_size bigint; classification_level character varying DEFAULT 'INTERNAL'::text; status character varying DEFAULT 'ACTIVE'::text; ai_predicted_category character varying; ai_classification text; ai_summary text; ocr_extracted_text text; confidence_score numeric; extracted_keywords jsonb DEFAULT '[]'::jsonb; file_path character varying; supabase_storage_url character varying; folder_id uuid; category_id uuid; version_number integer; updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; retention_policy_id uuid; retention_expires_at timestamp without time zone; department_library_id uuid; owning_module character varying; department character varying; owner_email character varying; retention_archived_at timestamp without time zone; retention_archived_from_status character varying; retention_run_id uuid
- **Indexes:**
    documents_pkey ON documents_pkey ON public.documents USING btree (id)
    idx_documents_category ON idx_documents_category ON public.documents USING btree (category_id)
    idx_documents_department_library ON idx_documents_department_library ON public.documents USING btree (department_library_id)
    idx_documents_folder ON idx_documents_folder ON public.documents USING btree (folder_id)
    idx_documents_owning_module ON idx_documents_owning_module ON public.documents USING btree (owning_module)
    idx_documents_retention_expires ON idx_documents_retention_expires ON public.documents USING btree (retention_expires_at)
    idx_documents_retention_expires_at ON idx_documents_retention_expires_at ON public.documents USING btree (retention_expires_at) WHERE (retention_expires_at IS NOT NULL)
    idx_documents_retention_run ON idx_documents_retention_run ON public.documents USING btree (retention_run_id)

### employee_notifications
- **PK:** id
- **FK:** recipient_id -> users.id
- **Columns (15):** id uuid NOT NULL DEFAULT gen_random_uuid(); recipient_id uuid NOT NULL; title character varying NOT NULL; message text; type character varying NOT NULL; is_read boolean NOT NULL DEFAULT false; related_entity_type character varying; related_entity_id character varying; created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying
- **Indexes:**
    employee_notifications_pkey ON employee_notifications_pkey ON public.employee_notifications USING btree (id)
    idx_employee_notifications_recipient ON idx_employee_notifications_recipient ON public.employee_notifications USING btree (recipient_id)

### employee_requests
- **PK:** id
- **FK:** requester_id -> users.id
- **Columns (14):** id uuid NOT NULL DEFAULT gen_random_uuid(); requester_id uuid NOT NULL; type character varying NOT NULL; title character varying NOT NULL; description text; status character varying NOT NULL; decision_notes text; created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying
- **Indexes:**
    employee_requests_pkey ON employee_requests_pkey ON public.employee_requests USING btree (id)
    idx_employee_requests_requester ON idx_employee_requests_requester ON public.employee_requests USING btree (requester_id)

### equipment
- **PK:** id
- **FK:** room_id -> rooms.id
- **Columns (15):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; room_id uuid; name character varying NOT NULL; serial_number character varying NOT NULL; category character varying; status character varying NOT NULL; last_maintenance_date date; next_maintenance_date date
- **Indexes:**
    equipment_pkey ON equipment_pkey ON public.equipment USING btree (id)
    equipment_serial_number_key ON equipment_serial_number_key ON public.equipment USING btree (serial_number)
    idx_equipment_room ON idx_equipment_room ON public.equipment USING btree (room_id)

### facilities
- **PK:** id
- **FK:** -
- **Columns (17):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); name character varying NOT NULL; code character varying; type character varying; address character varying; city character varying; country character varying; total_capacity integer; active boolean DEFAULT true; timezone character varying; updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying
- **Indexes:**
    facilities_pkey ON facilities_pkey ON public.facilities USING btree (id)
    ux_facilities_name ON ux_facilities_name ON public.facilities USING btree (name)

### facility_amenities
- **PK:** id
- **FK:** room_id -> rooms.id
- **Columns (11):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; room_id uuid NOT NULL; name character varying NOT NULL; description character varying
- **Indexes:**
    facility_amenities_pkey ON facility_amenities_pkey ON public.facility_amenities USING btree (id)
    idx_facility_amenities_room ON idx_facility_amenities_room ON public.facility_amenities USING btree (room_id)

### folders
- **PK:** id
- **FK:** parent_id -> folders.id
- **Columns (11):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; name character varying NOT NULL; parent_id uuid; path character varying NOT NULL
- **Indexes:**
    folders_pkey ON folders_pkey ON public.folders USING btree (id)
    idx_folders_parent ON idx_folders_parent ON public.folders USING btree (parent_id)

### hr_assistance_requests
- **PK:** id
- **FK:** -
- **Columns (16):** id uuid NOT NULL; created_at timestamp without time zone NOT NULL; created_by character varying; is_deleted boolean NOT NULL; deleted_at timestamp without time zone; deleted_by character varying; updated_at timestamp without time zone; updated_by character varying; ip_address character varying; message text NOT NULL; priority character varying; requester_email character varying NOT NULL; requester_name character varying NOT NULL; status character varying NOT NULL; subject character varying NOT NULL; user_agent character varying
- **Indexes:**
    hr_assistance_requests_pkey ON hr_assistance_requests_pkey ON public.hr_assistance_requests USING btree (id)
    idx_hr_assistance_created_at ON idx_hr_assistance_created_at ON public.hr_assistance_requests USING btree (created_at)
    idx_hr_assistance_email ON idx_hr_assistance_email ON public.hr_assistance_requests USING btree (requester_email)
    idx_hr_assistance_status ON idx_hr_assistance_status ON public.hr_assistance_requests USING btree (status)

### integration_status
- **PK:** id
- **FK:** -
- **Columns (9):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); system_name character varying NOT NULL; connection_status character varying NOT NULL; last_sync_at timestamp with time zone; api_health character varying; response_time_ms bigint; failed_syncs integer NOT NULL DEFAULT 0; last_successful_connection timestamp with time zone
- **Indexes:**
    integration_status_pkey ON integration_status_pkey ON public.integration_status USING btree (id)
    integration_status_system_name_key ON integration_status_system_name_key ON public.integration_status USING btree (system_name)

### ip_threats
- **PK:** id
- **FK:** -
- **Columns (16):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); ip text NOT NULL; country text; city text; latitude double precision; longitude double precision; threat_type text NOT NULL; severity text NOT NULL; requests integer DEFAULT 1; status text NOT NULL; first_seen timestamp with time zone; last_seen timestamp with time zone; asn text; isp text; flag text
- **Indexes:**
    ip_threats_pkey ON ip_threats_pkey ON public.ip_threats USING btree (id)

### legal_cases
- **PK:** id
- **FK:** lead_lawyer_id -> users.id; owning_department_id -> department_libraries.id
- **Columns (26):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); case_number character varying; title character varying NOT NULL; court_name character varying; priority character varying DEFAULT 'MEDIUM'::text; status character varying DEFAULT 'OPEN'::text; filed_date date; next_hearing_date date; lead_counselor text; case_type character varying; closed_date date; resolution_notes text; description text; judge_name character varying; opposing_party character varying; lead_lawyer_id uuid; filing_date date; expected_resolution_date date; updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; owning_department_id uuid
- **Indexes:**
    idx_legal_cases_deleted ON idx_legal_cases_deleted ON public.legal_cases USING btree (is_deleted) WHERE (is_deleted = true)
    idx_legal_cases_owning_department ON idx_legal_cases_owning_department ON public.legal_cases USING btree (owning_department_id)
    legal_cases_pkey ON legal_cases_pkey ON public.legal_cases USING btree (id)

### legal_holds
- **PK:** id
- **FK:** -
- **Columns (16):** id uuid NOT NULL DEFAULT gen_random_uuid(); document_id uuid NOT NULL; case_reference character varying; reason character varying NOT NULL; placed_by character varying NOT NULL; placed_at timestamp without time zone NOT NULL DEFAULT now(); lifted_at timestamp without time zone; lifted_by character varying; lift_reason character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying
- **Indexes:**
    idx_legal_holds_active ON idx_legal_holds_active ON public.legal_holds USING btree (document_id, lifted_at)
    idx_legal_holds_document ON idx_legal_holds_document ON public.legal_holds USING btree (document_id)
    legal_holds_pkey ON legal_holds_pkey ON public.legal_holds USING btree (id)
    uq_legal_holds_active_case ON uq_legal_holds_active_case ON public.legal_holds USING btree (document_id, case_reference) WHERE ((lifted_at IS NULL) AND (case_reference IS NOT NULL))

### legal_notices
- **PK:** id
- **FK:** -
- **Columns (18):** id uuid NOT NULL DEFAULT gen_random_uuid(); type character varying NOT NULL; severity character varying NOT NULL; title character varying NOT NULL; message text; entity_type character varying; entity_id character varying; status character varying NOT NULL; dedup_key character varying; acknowledged_by character varying; acknowledged_at timestamp without time zone; created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying
- **Indexes:**
    legal_notices_dedup_key_key ON legal_notices_dedup_key_key ON public.legal_notices USING btree (dedup_key)
    legal_notices_pkey ON legal_notices_pkey ON public.legal_notices USING btree (id)

### login_history
- **PK:** id
- **FK:** -
- **Columns (10):** id uuid NOT NULL DEFAULT gen_random_uuid(); timestamp timestamp with time zone NOT NULL DEFAULT now(); username character varying NOT NULL; user_id character varying; ip_address character varying NOT NULL; user_agent text; status character varying NOT NULL; failure_reason character varying; device_fingerprint character varying; location character varying
- **Indexes:**
    login_history_pkey ON login_history_pkey ON public.login_history USING btree (id)

### maintenance_schedules
- **PK:** id
- **FK:** room_id -> rooms.id
- **Columns (17):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); room_id uuid; title character varying NOT NULL; start_time timestamp with time zone NOT NULL; end_time timestamp with time zone NOT NULL; reason text; created_by character varying; description character varying; status character varying; assigned_to character varying; notes character varying; updated_at timestamp without time zone; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying
- **Indexes:**
    maintenance_schedules_pkey ON maintenance_schedules_pkey ON public.maintenance_schedules USING btree (id)

### online_users
- **PK:** id
- **FK:** -
- **Columns (9):** id bigint NOT NULL DEFAULT nextval('online_users_id_seq'::regclass); username text NOT NULL; user_id text; full_name text; role text; ip text; device text; browser text; last_activity timestamp with time zone NOT NULL DEFAULT now()
- **Indexes:**
    online_users_pkey ON online_users_pkey ON public.online_users USING btree (id)
    online_users_username_key ON online_users_username_key ON public.online_users USING btree (username)

### permissions
- **PK:** id
- **FK:** -
- **Columns (14):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; name character varying NOT NULL; display_name character varying NOT NULL; description character varying; module character varying NOT NULL; resource character varying NOT NULL; action character varying NOT NULL
- **Indexes:**
    permissions_name_key ON permissions_name_key ON public.permissions USING btree (name)
    permissions_pkey ON permissions_pkey ON public.permissions USING btree (id)

### procurement_notices
- **PK:** id
- **FK:** -
- **Columns (18):** id uuid NOT NULL DEFAULT gen_random_uuid(); type character varying; severity character varying; title character varying NOT NULL; message text; entity_type character varying; entity_id character varying; status character varying NOT NULL; dedup_key character varying; acknowledged_by character varying; acknowledged_at timestamp without time zone; created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying
- **Indexes:**
    procurement_notices_dedup_key_key ON procurement_notices_dedup_key_key ON public.procurement_notices USING btree (dedup_key)
    procurement_notices_pkey ON procurement_notices_pkey ON public.procurement_notices USING btree (id)

### refresh_tokens
- **PK:** id
- **FK:** user_id -> users.id
- **Columns (9):** id uuid NOT NULL DEFAULT gen_random_uuid(); user_id uuid; token character varying NOT NULL; expires_at timestamp without time zone NOT NULL; is_revoked boolean NOT NULL DEFAULT false; revoked_at timestamp without time zone; ip_address character varying; user_agent character varying; created_at timestamp without time zone NOT NULL DEFAULT now()
- **Indexes:**
    idx_refresh_token ON idx_refresh_token ON public.refresh_tokens USING btree (token)
    idx_refresh_tokens_user ON idx_refresh_tokens_user ON public.refresh_tokens USING btree (user_id)
    idx_refresh_user_id ON idx_refresh_user_id ON public.refresh_tokens USING btree (user_id)
    refresh_tokens_pkey ON refresh_tokens_pkey ON public.refresh_tokens USING btree (id)
    refresh_tokens_token_key ON refresh_tokens_token_key ON public.refresh_tokens USING btree (token)

### reservation_approvals
- **PK:** id
- **FK:** approved_by -> users.id; reservation_id -> reservations.id
- **Columns (13):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; reservation_id uuid NOT NULL; approved_by uuid; decision character varying NOT NULL; comments character varying; decided_at timestamp without time zone
- **Indexes:**
    idx_reservation_approvals_reservation ON idx_reservation_approvals_reservation ON public.reservation_approvals USING btree (reservation_id)
    reservation_approvals_pkey ON reservation_approvals_pkey ON public.reservation_approvals USING btree (id)

### reservations
- **PK:** id
- **FK:** room_id -> rooms.id; user_id -> users.id
- **Columns (29):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); updated_at timestamp with time zone; room_id uuid; title character varying; purpose text; start_time timestamp with time zone; end_time timestamp with time zone; expected_attendees integer DEFAULT 1; status character varying DEFAULT 'PENDING_APPROVAL'::text; approval_status text DEFAULT 'PENDING'::text; employee_name text; employee_department text; employee_email text; employee_id text; approved_by text; approved_at timestamp with time zone; notes text; qr_code_token text; check_in_time timestamp with time zone; check_out_time timestamp with time zone; user_id uuid; description character varying; rejection_reason character varying; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying
- **Indexes:**
    reservations_pkey ON reservations_pkey ON public.reservations USING btree (id)

### resource_permissions
- **PK:** id
- **FK:** grantee_department_id -> department_libraries.id; grantee_role_id -> roles.id; grantee_user_id -> users.id
- **Columns (20):** id uuid NOT NULL DEFAULT gen_random_uuid(); resource_type character varying NOT NULL; resource_id uuid NOT NULL; permission_type character varying NOT NULL; grantee_type character varying NOT NULL; grantee_user_id uuid; grantee_department_id uuid; grantee_role_id uuid; is_active boolean NOT NULL DEFAULT true; granted_by character varying; granted_at timestamp without time zone; expires_at timestamp without time zone; reason character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying
- **Indexes:**
    idx_resource_permissions_active ON idx_resource_permissions_active ON public.resource_permissions USING btree (is_active)
    idx_resource_permissions_department ON idx_resource_permissions_department ON public.resource_permissions USING btree (grantee_department_id)
    idx_resource_permissions_lookup ON idx_resource_permissions_lookup ON public.resource_permissions USING btree (resource_type, resource_id, permission_type, is_active)
    idx_resource_permissions_resource ON idx_resource_permissions_resource ON public.resource_permissions USING btree (resource_type, resource_id)
    idx_resource_permissions_role ON idx_resource_permissions_role ON public.resource_permissions USING btree (grantee_role_id)
    idx_resource_permissions_user ON idx_resource_permissions_user ON public.resource_permissions USING btree (grantee_user_id)
    resource_permissions_pkey ON resource_permissions_pkey ON public.resource_permissions USING btree (id)
    uq_resource_permissions_department ON uq_resource_permissions_department ON public.resource_permissions USING btree (resource_type, resource_id, grantee_department_id, permission_type) WHERE (grantee_department_id IS NOT NULL)
    uq_resource_permissions_role ON uq_resource_permissions_role ON public.resource_permissions USING btree (resource_type, resource_id, grantee_role_id, permission_type) WHERE (grantee_role_id IS NOT NULL)
    uq_resource_permissions_user ON uq_resource_permissions_user ON public.resource_permissions USING btree (resource_type, resource_id, grantee_user_id, permission_type) WHERE (grantee_user_id IS NOT NULL)

### retention_policies
- **PK:** id
- **FK:** -
- **Columns (13):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; name character varying NOT NULL; description character varying; retention_period_days integer NOT NULL; action_on_expiry character varying NOT NULL; active boolean DEFAULT true
- **Indexes:**
    retention_policies_name_key ON retention_policies_name_key ON public.retention_policies USING btree (name)
    retention_policies_pkey ON retention_policies_pkey ON public.retention_policies USING btree (id)

### role_permissions
- **PK:** role_id, permission_id
- **FK:** permission_id -> permissions.id; role_id -> roles.id
- **Columns (2):** role_id uuid NOT NULL; permission_id uuid NOT NULL
- **Indexes:**
    role_permissions_pkey ON role_permissions_pkey ON public.role_permissions USING btree (role_id, permission_id)

### roles
- **PK:** id
- **FK:** -
- **Columns (12):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; name character varying NOT NULL; display_name character varying NOT NULL; description character varying; is_system_role boolean NOT NULL DEFAULT false
- **Indexes:**
    roles_name_key ON roles_name_key ON public.roles USING btree (name)
    roles_pkey ON roles_pkey ON public.roles USING btree (id)

### rooms
- **PK:** id
- **FK:** facility_id -> facilities.id
- **Columns (30):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); facility_id uuid; room_number character varying NOT NULL; name character varying NOT NULL; building character varying; floor text; capacity integer NOT NULL DEFAULT 1; type character varying; status character varying DEFAULT 'AVAILABLE'::text; equipment jsonb DEFAULT '[]'::jsonb; is_available boolean DEFAULT true; description text; maintenance_status text; maintenance_reason text; image_url text; has_projector boolean DEFAULT false; has_video_conference boolean DEFAULT false; hourly_rate numeric DEFAULT 0; floor_number integer; open_time time without time zone; close_time time without time zone; has_whiteboard boolean NOT NULL DEFAULT false; active boolean NOT NULL DEFAULT true; updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying
- **Indexes:**
    rooms_pkey ON rooms_pkey ON public.rooms USING btree (id)

### security_alerts
- **PK:** id
- **FK:** -
- **Columns (11):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); title character varying NOT NULL; description text; alert_type character varying; severity character varying NOT NULL; target_ip character varying; status character varying DEFAULT 'OPEN'::text; resolved_by character varying; resolved_at timestamp with time zone; target_user_id character varying
- **Indexes:**
    security_alerts_pkey ON security_alerts_pkey ON public.security_alerts USING btree (id)

### security_logs
- **PK:** id
- **FK:** -
- **Columns (25):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); action character varying NOT NULL; module character varying NOT NULL; full_name character varying; role character varying; ip_address character varying; risk_level character varying NOT NULL DEFAULT 'LOW'::text; status character varying NOT NULL DEFAULT 'SUCCESS'::text; reason text; timestamp timestamp with time zone; user_id character varying; department character varying; device_name character varying; browser character varying; operating_system character varying; session_id character varying; request_id character varying; api_endpoint character varying; http_method character varying; affected_record character varying; previous_value text; new_value text; geo_location character varying; username character varying
- **Indexes:**
    security_logs_pkey ON security_logs_pkey ON public.security_logs USING btree (id)

### system_configurations
- **PK:** id
- **FK:** -
- **Columns (8):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); config_key character varying NOT NULL; config_value text; description character varying; category character varying; updated_at timestamp with time zone NOT NULL DEFAULT now(); updated_by character varying
- **Indexes:**
    system_configurations_config_key_key ON system_configurations_config_key_key ON public.system_configurations USING btree (config_key)
    system_configurations_pkey ON system_configurations_pkey ON public.system_configurations USING btree (id)

### tags
- **PK:** id
- **FK:** -
- **Columns (9):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; name character varying NOT NULL
- **Indexes:**
    tags_name_key ON tags_name_key ON public.tags USING btree (name)
    tags_pkey ON tags_pkey ON public.tags USING btree (id)

### user_activity_events
- **PK:** id
- **FK:** -
- **Columns (12):** id bigint NOT NULL DEFAULT nextval('user_activity_events_id_seq'::regclass); event_type text NOT NULL; user_id text; username text NOT NULL; full_name text; email text; role text; action text; ip text; device text; browser text; created_at timestamp with time zone NOT NULL DEFAULT now()
- **Indexes:**
    user_activity_events_created_at_idx ON user_activity_events_created_at_idx ON public.user_activity_events USING btree (created_at DESC)
    user_activity_events_pkey ON user_activity_events_pkey ON public.user_activity_events USING btree (id)

### user_roles
- **PK:** user_id, role_id
- **FK:** role_id -> roles.id; user_id -> users.id
- **Columns (2):** user_id uuid NOT NULL; role_id uuid NOT NULL
- **Indexes:**
    user_roles_pkey ON user_roles_pkey ON public.user_roles USING btree (user_id, role_id)

### users
- **PK:** id
- **FK:** -
- **Columns (27):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; employee_id character varying; first_name character varying NOT NULL; last_name character varying NOT NULL; email character varying NOT NULL; password_hash character varying NOT NULL; phone_number character varying; department character varying; position character varying; avatar_url character varying; status character varying NOT NULL DEFAULT 'ACTIVE'::character varying; is_email_verified boolean NOT NULL DEFAULT false; email_verified_at timestamp without time zone; last_login_at timestamp without time zone; last_login_ip character varying; failed_login_attempts integer NOT NULL DEFAULT 0; locked_until timestamp without time zone; password_reset_token character varying; password_reset_expires_at timestamp without time zone; last_failed_attempt_at timestamp without time zone
- **Indexes:**
    idx_users_email ON idx_users_email ON public.users USING btree (email)
    idx_users_employee_id ON idx_users_employee_id ON public.users USING btree (employee_id)
    idx_users_locked_until ON idx_users_locked_until ON public.users USING btree (locked_until) WHERE (locked_until IS NOT NULL)
    users_email_key ON users_email_key ON public.users USING btree (email)
    users_employee_id_key ON users_employee_id_key ON public.users USING btree (employee_id)
    users_pkey ON users_pkey ON public.users USING btree (id)

### vendor_obligations
- **PK:** id
- **FK:** vendor_id -> vendors.id
- **Columns (14):** id uuid NOT NULL DEFAULT gen_random_uuid(); vendor_id uuid NOT NULL; title character varying NOT NULL; description text; due_date date; status character varying NOT NULL; notes text; created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying
- **Indexes:**
    idx_vendor_obligations_vendor ON idx_vendor_obligations_vendor ON public.vendor_obligations USING btree (vendor_id)
    vendor_obligations_pkey ON vendor_obligations_pkey ON public.vendor_obligations USING btree (id)

### vendors
- **PK:** id
- **FK:** -
- **Columns (19):** id uuid NOT NULL DEFAULT gen_random_uuid(); vendor_code character varying NOT NULL; name character varying NOT NULL; category character varying; contact_name character varying; contact_email character varying; contact_phone character varying; address text; status character varying NOT NULL; performance_score integer; sla_compliance_rate numeric; notes text; created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying
- **Indexes:**
    vendors_pkey ON vendors_pkey ON public.vendors USING btree (id)
    vendors_vendor_code_key ON vendors_vendor_code_key ON public.vendors USING btree (vendor_code)

### visitor_verifications
- **PK:** id
- **FK:** -
- **Columns (18):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; visitor_id uuid NOT NULL; id_type character varying; id_number character varying; extracted_fields jsonb DEFAULT '{}'::jsonb; match_score numeric; watchlist_status character varying NOT NULL DEFAULT 'CLEAR'::text; verification_status character varying NOT NULL DEFAULT 'PENDING'::text; verified_at timestamp without time zone; verified_by character varying; notes text
- **Indexes:**
    idx_visitor_verifications_visitor ON idx_visitor_verifications_visitor ON public.visitor_verifications USING btree (visitor_id)
    visitor_verifications_pkey ON visitor_verifications_pkey ON public.visitor_verifications USING btree (id)

### visitor_watchlist
- **PK:** id
- **FK:** -
- **Columns (12):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp without time zone NOT NULL DEFAULT now(); updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying; full_name character varying NOT NULL; id_number character varying; reason text; status character varying NOT NULL DEFAULT 'ACTIVE'::text
- **Indexes:**
    visitor_watchlist_pkey ON visitor_watchlist_pkey ON public.visitor_watchlist USING btree (id)

### visitors
- **PK:** id
- **FK:** host_id -> users.id
- **Columns (23):** id uuid NOT NULL DEFAULT gen_random_uuid(); created_at timestamp with time zone NOT NULL DEFAULT now(); full_name character varying NOT NULL; email character varying DEFAULT ''::text; company character varying DEFAULT ''::text; phone text DEFAULT ''::text; purpose_of_visit character varying NOT NULL; expected_arrival timestamp with time zone; actual_arrival timestamp with time zone; actual_departure timestamp with time zone; host_employee_id text; status character varying DEFAULT 'REGISTERED'::text; qr_code_token character varying; phone_number character varying; id_number character varying; host_id uuid; badge_number character varying; updated_at timestamp without time zone; created_by character varying; updated_by character varying; is_deleted boolean NOT NULL DEFAULT false; deleted_at timestamp without time zone; deleted_by character varying
- **Indexes:**
    visitors_pkey ON visitors_pkey ON public.visitors USING btree (id)

## Sequences
- online_users_id_seq (start 1)
- user_activity_events_id_seq (start 1)

## RLS Status (deny-by-default)
All 56 tables have rowsecurity enabled except: ai_providers, contract_clauses. No policies exist on any table (pg_policy = 0 rows), so anon/authenticated roles receive empty results (verified: anon REST SELECT returns 200 [] on users/security_logs/documents/etc.).
