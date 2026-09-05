# TNVS DevOps CI/CD and Disaster Recovery Runbook

| Field | Value |
| --- | --- |
| Project | TNVS Facilities and Administrative Management System |
| Audience | Capstone evaluators, developers, System Administrators, and database custodians |
| Status | Draft for review |
| Related workflow | `.github/workflows/ci-cd.yml` |

## 1. Continuous Integration and Build Automation

The repository workflow runs on pull requests, pushes to any branch, and manual dispatches. It performs these checks in parallel:

| Component | Runtime | Checks | Output |
| --- | --- | --- | --- |
| React/Vite frontend | Node.js 20 | `npm ci`, TypeScript check, and Vite production build | `tnvs-frontend-dist` artifact |
| Spring Boot backend | Java 21, Maven | Unit/integration tests and `mvn verify` package lifecycle | `tnvs-backend-jar` artifact |

The workflow validates and packages the system but does not deploy to production. The frontend currently exposes an `npm run lint` script without an installed ESLint dependency/configuration, so CI uses `npm run build`, which performs the TypeScript check and Vite production build. A deployment job should be added only after the hosting provider, target environment, approval gate, rollback method, and required secrets are agreed. No database password, Supabase service-role key, or deployment token belongs in the repository or in a client-visible `VITE_*` variable.

## 2. Disaster Recovery Test

### 2.1 Purpose

This procedure verifies that a PostgreSQL backup of the hosted Supabase project can be restored into a separate recovery project and that the restored TNVS data remains usable. It is a restore test, not a production migration. Never restore over the production project during this exercise.

### 2.2 Roles

| Role | Responsibility |
| --- | --- |
| System Administrator | Coordinates the test, creates the recovery project, runs backup/restore commands, and records timings |
| Database custodian | Provides the approved database connection details and verifies the backup file and checksum |
| DPO / Legal Counsel | Confirms that the backup and test copy are handled under retention, privacy, and legal-hold rules |
| Application tester | Runs the post-restore smoke tests using a non-production account |
| Observer | Independently records evidence, failures, and corrective actions |

### 2.3 Preconditions and safety controls

1. Obtain written approval for the test window and identify the source project and separate recovery project.
2. Use a disposable or dedicated non-production Supabase project for recovery. The recovery project must have the same or a compatible PostgreSQL major version and required extensions as production.
3. Take the backup from the Supabase Dashboard **Connect** dialog or the Supabase CLI. Use a direct database connection or Session Pooler connection. Do not use the transaction pooler for administrative dump/restore work.
4. Install the PostgreSQL client tools that match the server major version: `pg_dump`, `pg_restore`, and `psql`. Install the Supabase CLI if the project also needs migration or project-link commands.
5. Create a private local backup directory outside the repository. Do not place dumps in `frontend`, `backend`, `supabase`, or `docs`, and do not commit them.
6. Protect the database password using an approved secret manager or a temporary environment variable. Do not put it in source code, shell history, tickets, screenshots, or GitHub Actions logs.
7. Record the test start time, source project reference, recovery project reference, PostgreSQL versions, operator, and intended RPO/RTO before starting.

### 2.4 Prepare the connection variables

Use the connection string from Supabase **Project Settings > Database > Connect**. Prefer the direct connection when the workstation supports IPv6; otherwise use the Session Pooler connection shown by Supabase. Replace the placeholders locally and never commit this file with real values.

PowerShell example:

```powershell
$env:SOURCE_DB_URL = Read-Host "Paste the source Supabase PostgreSQL connection string"
$env:RECOVERY_DB_URL = Read-Host "Paste the recovery Supabase PostgreSQL connection string"
$env:BACKUP_DIR = Join-Path $env:TEMP "tnvs-dr-$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Path $env:BACKUP_DIR -Force | Out-Null
```

The URLs must contain `sslmode=require`. Before using them, verify that the source and recovery hostnames/project references are different:

```powershell
if ($env:SOURCE_DB_URL -eq $env:RECOVERY_DB_URL) {
  throw "Source and recovery database URLs must be different."
}
```

For non-interactive automation, store the URL in a protected GitHub Actions secret such as `SUPABASE_DB_URL` and restrict the workflow to a private repository and approved environment. Do not print the URL because it may contain credentials.

## 3. Create and Verify the Backup

### Step 1: Capture the source baseline

Record the PostgreSQL version and the application table inventory before the dump. These results are used for comparison after restore.

```powershell
psql $env:SOURCE_DB_URL -X -v ON_ERROR_STOP=1 -Atc "select current_database(), version();" |
  Tee-Object (Join-Path $env:BACKUP_DIR "source-version.txt")

psql $env:SOURCE_DB_URL -X -v ON_ERROR_STOP=1 -c `
  "select table_schema, table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;" |
  Tee-Object (Join-Path $env:BACKUP_DIR "source-table-inventory.txt")
```

For the TNVS application, include the critical business areas in the evidence: authentication and RBAC records, facilities, documents, permits, compliance incidents, audit logs, retention policies, and backup records. Do not put personal data or a full row export in the capstone report.

### Step 2: Take a custom-format PostgreSQL dump

The custom format is compressed and can be restored selectively with `pg_restore`. The `public` schema contains the TNVS application data. Managed Supabase schemas and project configuration are handled separately by Supabase and are not assumed to be captured by this application-data dump.

```powershell
$env:BACKUP_FILE = Join-Path $env:BACKUP_DIR "tnvs-public-$(Get-Date -Format yyyyMMdd-HHmmss).dump"

pg_dump $env:SOURCE_DB_URL `
  --format=custom `
  --schema=public `
  --no-owner `
  --no-acl `
  --file=$env:BACKUP_FILE

if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }
if (-not (Test-Path $env:BACKUP_FILE)) { throw "Backup file was not created." }
```

`--no-owner` and `--no-acl` avoid replaying production ownership and grants into the recovery project. Do not use `--clean` against the source database. The dump is read-only against the source database, but it must still be scheduled during an approved window.

### Step 3: Verify backup integrity

```powershell
Get-Item $env:BACKUP_FILE | Select-Object FullName, Length, LastWriteTime
Get-FileHash $env:BACKUP_FILE -Algorithm SHA256 |
  Tee-Object (Join-Path $env:BACKUP_DIR "backup.sha256.txt")

pg_restore --list $env:BACKUP_FILE |
  Tee-Object (Join-Path $env:BACKUP_DIR "backup-contents.txt")
```

The backup is acceptable for the test only when `pg_dump` exits with code 0, the file is non-empty, the SHA-256 checksum is recorded, and `pg_restore --list` can read the archive. A checksum proves file integrity after creation; it does not prove that the data can be restored.

## 4. Restore into the Recovery Project

### Step 4: Preflight the empty recovery database

Confirm the recovery URL points to the disposable project, not production. Check the server version and current public table list:

```powershell
psql $env:RECOVERY_DB_URL -X -v ON_ERROR_STOP=1 -Atc "select current_database(), version();"
psql $env:RECOVERY_DB_URL -X -v ON_ERROR_STOP=1 -c `
  "select table_schema, table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;"
```

If the recovery project contains test data, recreate it or remove only that data using the approved disposable-environment procedure. Do not run an unreviewed `DROP SCHEMA` command. A blank recovery project is preferred.

### Step 5: Restore the custom-format dump

```powershell
pg_restore --dbname=$env:RECOVERY_DB_URL `
  --clean `
  --if-exists `
  --no-owner `
  --no-acl `
  --exit-on-error `
  --single-transaction `
  $env:BACKUP_FILE

if ($LASTEXITCODE -ne 0) { throw "pg_restore failed." }
```

If the dump was created in plain SQL format instead, use `psql` with `ON_ERROR_STOP`:

```powershell
psql $env:RECOVERY_DB_URL -X -v ON_ERROR_STOP=1 -f $env:BACKUP_FILE
if ($LASTEXITCODE -ne 0) { throw "Plain SQL restore failed." }
```

Some Supabase-managed objects, extensions, owners, or permissions may not be restorable by an application-schema dump. Record any such messages. They are a gap to investigate, not a reason to restore into production or to ignore a failed command.

## 5. Validate the Recovery

### Step 6: Compare schema and critical records

Save the recovered table inventory and compare it with `source-table-inventory.txt`:

```powershell
psql $env:RECOVERY_DB_URL -X -v ON_ERROR_STOP=1 -c `
  "select table_schema, table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;" |
  Tee-Object (Join-Path $env:BACKUP_DIR "recovery-table-inventory.txt")

Compare-Object `
  (Get-Content (Join-Path $env:BACKUP_DIR "source-table-inventory.txt")) `
  (Get-Content (Join-Path $env:BACKUP_DIR "recovery-table-inventory.txt"))
```

Run a row-count comparison for the critical TNVS tables that exist in the source project. Store counts in the test evidence, but redact individual records:

```powershell
$criticalTables = @(
  "users", "roles", "permissions", "facilities", "documents",
  "facility_permits", "compliance_incidents", "audit_logs",
  "retention_policies", "backup_records"
)

foreach ($table in $criticalTables) {
  $exists = psql $env:RECOVERY_DB_URL -X -Atc `
    "select to_regclass('public.$table') is not null;"
  if ($exists.Trim() -eq "t") {
    psql $env:RECOVERY_DB_URL -X -v ON_ERROR_STOP=1 -Atc `
      "select '$table', count(*) from public.`"$table`";"
  }
}
```

Repeat the same count query against the source database and record the expected differences. A difference is acceptable only when it is explained by writes that occurred after the backup timestamp or by an intentional test fixture.

### Step 7: Verify security controls

Check that row-level security and the important database objects are present:

```powershell
psql $env:RECOVERY_DB_URL -X -v ON_ERROR_STOP=1 -c `
  "select schemaname, tablename, rowsecurity from pg_catalog.pg_tables where schemaname = 'public' order by tablename;"

psql $env:RECOVERY_DB_URL -X -v ON_ERROR_STOP=1 -c `
  "select schemaname, tablename, policyname from pg_catalog.pg_policies where schemaname = 'public' order by tablename, policyname;"

psql $env:RECOVERY_DB_URL -X -v ON_ERROR_STOP=1 -c `
  "select pubname, schemaname, tablename from pg_catalog.pg_publication_tables where schemaname = 'public' order by tablename;"
```

Confirm that the restored project has the expected RLS policies, functions, triggers, indexes, and Realtime publication entries. Database restoration does not automatically prove that Supabase Auth settings, Storage objects, Edge Function deployments, secrets, SMTP, OAuth, or project-level network settings were recovered.

### Step 8: Run an application smoke test

Point a local or staging frontend at the recovery project only. Use a non-production test account and test data. Do not reuse production credentials in screenshots or capstone evidence.

1. Sign in and confirm the session is created.
2. Confirm each role sees only its permitted dashboard and navigation.
3. Read a representative facilities, document, compliance, permit, and audit record.
4. Create and update one disposable test record, then verify the change is visible after a refresh.
5. Confirm an unauthorized role is denied by the backend and by RLS, not merely hidden in the UI.
6. Confirm a permitted Realtime change is delivered and that a deleted or restricted record is not disclosed.
7. Remove all test records after the evidence is captured.

## 6. Pass Criteria and Evidence

The restore test passes only when all of the following are recorded:

- Source dump exits successfully, is non-empty, has a SHA-256 checksum, and can be listed by `pg_restore`.
- Restore exits successfully into the separate recovery project with no unexplained errors.
- Source and recovery table inventories match for the approved application schema.
- Critical table counts match or every difference has a documented explanation.
- RLS policies, required functions/triggers, indexes, and Realtime publication settings are present.
- Application login, role restrictions, representative CRUD operations, and Realtime behavior pass in the recovery environment.
- No command changes production data, and the recovery project is clearly identified in the evidence.
- Recovery duration and the timestamp of the backup are recorded so the team can compare actual RTO and RPO with the capstone target.

Suggested evidence bundle, stored privately:

```text
tnvs-dr-test-YYYYMMDD/
  test-record.md
  source-version.txt
  source-table-inventory.txt
  recovery-table-inventory.txt
  backup-contents.txt
  backup.sha256.txt
  row-count-comparison.txt
  security-checks.txt
  application-smoke-test.md
```

Do not include the database dump, passwords, tokens, government IDs, driver identity data, visitor identity data, or unredacted screenshots in the capstone repository.

## 7. Cleanup and Follow-up

1. Stop the frontend and backend processes configured for the recovery project.
2. Remove the disposable recovery project after the DPO, database custodian, and observer approve the evidence, or retain it only under an approved test-retention period.
3. Securely delete the local dump when the approved evidence-retention period ends. If it must be retained, encrypt it and restrict access.
4. Revoke or rotate any temporary database credentials and service tokens used for the test.
5. Record failures as remediation tasks. A failed restore is a failed DR test even when the backup command succeeded.
6. Repeat the exercise after major migrations, RLS/RBAC changes, provider changes, or material data-model changes, and at least on the schedule approved by management.

## 8. Scope and Limitations

This runbook tests restoration of the TNVS PostgreSQL application schema and data. A complete Supabase disaster-recovery plan must also define independent recovery procedures for:

- Supabase Auth users, providers, MFA settings, email templates, and configuration.
- Supabase Storage objects and bucket policies.
- Edge Function source, deployments, environment secrets, and scheduled jobs.
- Realtime configuration, database publication membership, and project-level settings.
- DNS, frontend hosting, backend hosting, monitoring, alerting, and third-party integrations.

The team must define the final Recovery Point Objective (maximum acceptable data loss) and Recovery Time Objective (maximum acceptable service restoration time) with management. The measured backup timestamp and restore duration from this exercise provide evidence for those targets; they do not establish targets by themselves.
