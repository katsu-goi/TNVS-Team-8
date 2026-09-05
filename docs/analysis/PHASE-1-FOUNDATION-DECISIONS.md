# Phase 1 Foundation Decisions

## Runtime architecture

The active application runtime is React/Vite plus Supabase PostgreSQL, Edge
Functions, Storage, and Realtime. Spring Boot and STOMP are legacy source and
are not an active frontend transport or fallback.

## System administrator authority

- Canonical machine role: `SUPER_ADMIN`
- Human-facing title: **System Administrator**
- Dashboard key: `admin`
- JWT role authority: `ROLE_SUPER_ADMIN`

`SYSTEM_ADMIN` is not a second active role. The Phase 1 consolidation migration
moves any historical assignments and direct permissions to `SUPER_ADMIN`,
remaps hierarchy links, revokes affected refresh sessions, deactivates legacy
role conflicts, and soft-retires the alias for history.

System administration covers account/RBAC administration, security and audit
monitoring, integrations, AI configuration, backup status, system configuration,
and health monitoring. Facilities, visitor, compliance, legal, contract, and
procurement operations remain assigned to their business roles; this phase does
not broaden the administrator into their routine operational workflows.

Frontend route guards and Edge Function role guards both require the canonical
`SUPER_ADMIN` authority for system-administrator-only surfaces. Permission-based
governance routes continue to use their explicit permissions.

## Authoritative database chain

`supabase/migrations/` is the authoritative schema for the serverless runtime.
Phase 1 adds the active Edge Function dependencies that previously existed only
in legacy Flyway migrations: `document_grants`, `contract_clauses`,
`ai_providers`, and `ai_module_config`. It also adds the document ownership
columns used by document access control. These internal tables have RLS enabled
and no browser policies; Edge Functions access them with the server-only service
role.

## Scheduled jobs

Phase 1 retains two autonomous maintenance jobs:

- daily checkout of visitors left checked in from an earlier UTC date;
- hourly removal of expired refresh tokens and epoch-based rate-limit windows.

The invalid audit-log purge is unscheduled because its target table did not
exist and no approved 90-day deletion policy was documented. Compliance alert
generation and retention automation remain deferred to their dedicated phase.

## Required server configuration

Every Edge Function requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a
non-placeholder `JWT_SECRET` of at least 32 bytes. HTTP Supabase URLs are allowed
only for recognized local-development hosts. AI provider credential operations
additionally require `AI_API_KEY_ENCRYPTION_KEY` as base64 that decodes to exactly
32 bytes. Secret values must never use a `VITE_*` frontend variable.

## Phase 1.6 closure decisions

- A cryptographically random, base64-encoded 32-byte
  `AI_API_KEY_ENCRYPTION_KEY` is configured only as a Supabase Edge Function
  secret. The active AI function has no JWT-secret or hardcoded fallback.
- Two preserved historical AI ciphertexts could not be decrypted with any
  legitimate key available from current configuration or repository history.
  They must not be overwritten or deleted. The affected active provider is
  reported as offline until an administrator securely re-enters its API key.
- Six historical document rows have no storage path and are retained as
  metadata-only records. Two rows contain absolute paths from the retired local
  filesystem backend and are invalid Supabase Storage paths. The API returns
  explicit 404 results for both cases; it does not claim that a Storage object
  exists.
- The `documents` bucket remains private. New uploads use generated object names,
  persist metadata, support authenticated/signed download, and were verified with
  a disposable file that was removed after the runtime test.
