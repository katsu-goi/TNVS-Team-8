# TNVS Live Panel Defense Acceptance Testing Script

| Field | Value |
| --- | --- |
| System | TNVS Facilities and Administrative Management System |
| Purpose | Demonstrate database backup, database recovery, retention scheduling, SoD enforcement, and role-based login |
| Source runbook | `docs/devops-ci-cd-and-disaster-recovery.md` |
| Test environment | Hosted Supabase source project and separate disposable Supabase recovery project |
| Status | Panel-defense execution script |

## 1. Demonstration Outcome

At the end of this script, the panel should be able to observe that:

1. A live PostgreSQL backup is created from the source Supabase project.
2. The backup archive is non-empty, checksummed, and readable by `pg_restore`.
3. The archive is restored into a separate recovery project without changing production.
4. The recovered schema, critical row counts, RLS policies, and Realtime configuration are present.
5. An expired CCTV record is flagged for deletion through the retention policy and is not deleted automatically.
6. The database rejects an attempted assignment of both `SUPER_ADMIN` and `SYSTEM_ADMIN` to one user.
7. Role-specific users are redirected to their authorized dashboards and cannot use unauthorized role routes.

The test is successful only when all required results are observed and recorded. A successful `pg_dump` without a successful restore is not a successful DR test.

## 2. Test Roles and Timebox

| Participant | Activity |
| --- | --- |
| Presenter | Explains the system and runs the commands or browser steps |
| System Administrator | Provides approved connection access and verifies recovery-project identity |
| Application tester | Performs role-based login and authorization checks |
| Observer | Records timestamps, evidence, pass/fail results, and deviations |
| DPO or Legal representative | Confirms that the test copy and screenshots contain no unnecessary personal or privileged data |

**Recommended timebox:** 25-40 minutes, excluding recovery-project creation and tool installation.

## 3. Safety Rules and Preconditions

### 3.1 Mandatory safety rules

- Never restore the archive over the production Supabase project.
- Use a blank or disposable recovery project with a different project reference and hostname.
- Do not display database passwords, service-role keys, government IDs, driver data, visitor identity data, or unredacted records to the panel.
- Store the dump outside the Git repository and delete it securely after the approved evidence-retention period.
- Use non-production login accounts for the browser demonstration. Passwords are entered privately and never placed in this document.
- Stop the test immediately if the source and recovery connection strings identify the same project.

### 3.2 Required prerequisites

Before the panel begins, verify that the operator has:

- A source Supabase project containing the TNVS schema and approved test data.
- A separate recovery Supabase project with the same or compatible PostgreSQL major version and required extensions.
- `psql`, `pg_dump`, and `pg_restore` installed and available on the PATH.
- The source and recovery PostgreSQL connection strings from Supabase **Project Settings > Database > Connect**.
- A local or staging TNVS frontend configured for the recovery project for the login demonstration.
- One test account for each role selected for the demonstration: Super Admin, System Admin, DPO, Records Officer, and one operational role.

## 4. Test Record and Environment Setup

### Step 1: Start the test record

The observer creates `tnvs-dr-acceptance-YYYYMMDD.md` in a private evidence directory and records:

```text
Test date and timezone:
Source project reference:
Recovery project reference:
Source database hostname:
Recovery database hostname:
PostgreSQL source version:
PostgreSQL recovery version:
Presenter:
System Administrator:
Application tester:
Observer:
Target RPO:
Target RTO:
Test start time:
```

Do not copy connection-string passwords into the test record.

### Step 2: Set temporary connection variables

Run this in a PowerShell session that will be closed after the test:

```powershell
$env:SOURCE_DB_URL = Read-Host "Paste source Supabase PostgreSQL connection string"
$env:RECOVERY_DB_URL = Read-Host "Paste recovery Supabase PostgreSQL connection string"
$env:BACKUP_DIR = Join-Path $env:TEMP "tnvs-dr-$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Path $env:BACKUP_DIR -Force | Out-Null

if ($env:SOURCE_DB_URL -eq $env:RECOVERY_DB_URL) {
  throw "FAIL: source and recovery database URLs are identical. Stop the test."
}

Write-Host "PASS: source and recovery URLs are different. Do not print either URL."
```

The presenter shows only the PASS message and the two project references, not the URLs.

**Expected result:** The recovery target is demonstrably separate from production.<br>
**Acceptance result:** [ ] Pass  [ ] Fail<br>
**Evidence:** Record project references and the timestamp.

## 5. Database Backup Acceptance Test

### Step 3: Capture the source baseline

```powershell
psql $env:SOURCE_DB_URL -X -v ON_ERROR_STOP=1 -Atc `
  "select current_database(), version();" |
  Tee-Object (Join-Path $env:BACKUP_DIR "source-version.txt")

psql $env:SOURCE_DB_URL -X -v ON_ERROR_STOP=1 -c `
  "select table_schema, table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;" |
  Tee-Object (Join-Path $env:BACKUP_DIR "source-table-inventory.txt")
```

**Expected result:** Both commands exit with code 0 and produce version and table-inventory evidence. The inventory includes the TNVS application areas, including `users`, `roles`, `user_roles`, `facilities`, `documents`, `facility_permits`, `facility_data_logs`, `retention_policies`, and `audit_logs` where present.<br>
**Acceptance result:** [ ] Pass  [ ] Fail<br>
**Evidence:** `source-version.txt` and `source-table-inventory.txt`.

### Step 4: Create the PostgreSQL backup

```powershell
$env:BACKUP_FILE = Join-Path $env:BACKUP_DIR "tnvs-public-$(Get-Date -Format yyyyMMdd-HHmmss).dump"

pg_dump $env:SOURCE_DB_URL `
  --format=custom `
  --schema=public `
  --no-owner `
  --no-acl `
  --file=$env:BACKUP_FILE

if ($LASTEXITCODE -ne 0) { throw "FAIL: pg_dump returned a non-zero exit code." }
if (-not (Test-Path $env:BACKUP_FILE)) { throw "FAIL: backup archive was not created." }
Write-Host "PASS: PostgreSQL backup archive created."
```

**Expected result:** `pg_dump` exits with code 0 and creates a non-empty custom-format archive.<br>
**Acceptance result:** [ ] Pass  [ ] Fail<br>
**Evidence:** Record the archive filename, byte size, source project reference, and backup completion timestamp.

### Step 5: Verify the archive and checksum

```powershell
Get-Item $env:BACKUP_FILE | Select-Object FullName, Length, LastWriteTime
Get-FileHash $env:BACKUP_FILE -Algorithm SHA256 |
  Tee-Object (Join-Path $env:BACKUP_DIR "backup.sha256.txt")

pg_restore --list $env:BACKUP_FILE |
  Tee-Object (Join-Path $env:BACKUP_DIR "backup-contents.txt")

if ($LASTEXITCODE -ne 0) { throw "FAIL: pg_restore could not read the archive." }
Write-Host "PASS: archive is non-empty, checksummed, and readable."
```

**Expected result:** A SHA-256 checksum is recorded and `pg_restore --list` returns database objects without an archive-format error.<br>
**Acceptance result:** [ ] Pass  [ ] Fail<br>
**Evidence:** `backup.sha256.txt`, `backup-contents.txt`, and the displayed file size.

## 6. Database Recovery Acceptance Test

### Step 6: Preflight the recovery database

```powershell
psql $env:RECOVERY_DB_URL -X -v ON_ERROR_STOP=1 -Atc `
  "select current_database(), version();" |
  Tee-Object (Join-Path $env:BACKUP_DIR "recovery-version-before-restore.txt")

psql $env:RECOVERY_DB_URL -X -v ON_ERROR_STOP=1 -c `
  "select table_schema, table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;" |
  Tee-Object (Join-Path $env:BACKUP_DIR "recovery-table-inventory-before-restore.txt")
```

**Expected result:** The database name and hostname identify the disposable recovery project. A blank public schema is preferred.<br>
**Acceptance result:** [ ] Pass  [ ] Fail<br>
**Evidence:** Recovery project reference and `recovery-version-before-restore.txt`.

### Step 7: Restore the archive

```powershell
$restoreStart = Get-Date

pg_restore --dbname=$env:RECOVERY_DB_URL `
  --clean `
  --if-exists `
  --no-owner `
  --no-acl `
  --exit-on-error `
  --single-transaction `
  $env:BACKUP_FILE

if ($LASTEXITCODE -ne 0) { throw "FAIL: pg_restore returned a non-zero exit code." }

$restoreEnd = Get-Date
$restoreDuration = $restoreEnd - $restoreStart
Write-Host "PASS: database restore completed in $restoreDuration."
```

**Expected result:** `pg_restore` completes without unexplained errors and the recovery duration is recorded.<br>
**Acceptance result:** [ ] Pass  [ ] Fail<br>
**Evidence:** Restore start/end timestamps and the command output. Do not hide or dismiss errors; record them as deviations.

### Step 8: Compare the restored schema

```powershell
psql $env:RECOVERY_DB_URL -X -v ON_ERROR_STOP=1 -c `
  "select table_schema, table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;" |
  Tee-Object (Join-Path $env:BACKUP_DIR "recovery-table-inventory.txt")

Compare-Object `
  (Get-Content (Join-Path $env:BACKUP_DIR "source-table-inventory.txt")) `
  (Get-Content (Join-Path $env:BACKUP_DIR "recovery-table-inventory.txt"))
```

**Expected result:** No unexplained differences appear for the approved TNVS application schema.<br>
**Acceptance result:** [ ] Pass  [ ] Fail<br>
**Evidence:** `recovery-table-inventory.txt` and the comparison output.

### Step 9: Compare critical row counts

Run this query against both source and recovery and record only counts:

```sql
select 'users' as table_name, count(*) as row_count from public.users
union all select 'roles', count(*) from public.roles
union all select 'user_roles', count(*) from public.user_roles
union all select 'facilities', count(*) from public.facilities
union all select 'documents', count(*) from public.documents
union all select 'facility_permits', count(*) from public.facility_permits
union all select 'facility_data_logs', count(*) from public.facility_data_logs
union all select 'retention_policies', count(*) from public.retention_policies
union all select 'audit_logs', count(*) from public.audit_logs
order by table_name;
```

**Expected result:** Counts match the source at the backup timestamp, or each difference is explained by a post-backup write or an intentional recovery fixture.<br>
**Acceptance result:** [ ] Pass  [ ] Fail<br>
**Evidence:** `row-count-comparison.txt`; no individual records are copied into the panel report.

### Step 10: Verify RLS, SoD, and Realtime objects

Run the following queries against the recovery database. The operator may show the result grid to the panel while masking unnecessary data.

```sql
select schemaname, tablename, rowsecurity
from pg_catalog.pg_tables
where schemaname = 'public'
order by tablename;

select schemaname, tablename, policyname
from pg_catalog.pg_policies
where schemaname = 'public'
order by tablename, policyname;

select tgname
from pg_catalog.pg_trigger
where tgrelid = 'public.user_roles'::regclass
  and not tgisinternal
order by tgname;

select code, active, is_deleted
from public.role_conflicts
where code = 'SOD_SUPER_SYSTEM_ADMIN';

select pubname, schemaname, tablename
from pg_catalog.pg_publication_tables
where schemaname = 'public'
order by tablename;
```

Run the following job query against the **source** Supabase project, or against recovery only after the current infrastructure migrations have been separately provisioned there:

```sql
select jobname, schedule, active
from cron.job
where jobname = 'flag-expired-cctv-for-deletion';
```

**Expected result:** In recovery, RLS and policies are present for protected application tables; trigger `enforce_super_system_admin_sod` is present; `SOD_SUPER_SYSTEM_ADMIN` is active; and applicable Realtime publication entries are present. The source project has an active `flag-expired-cctv-for-deletion` job. If the recovery project has not had infrastructure migrations replayed, record the cron job as a separate control-plane restoration task rather than a database-dump result.<br>
**Acceptance result:** [ ] Pass  [ ] Fail<br>
**Evidence:** `security-checks.txt` containing query results without personal data.

### Step 11: Demonstrate SoD rejection without changing the database

This test uses a random user ID and a transaction that is rolled back. It verifies the database trigger without creating a persistent account or role assignment.

```sql
begin;

do $$
declare
  test_user_id uuid := gen_random_uuid();
  super_admin_id uuid;
  system_admin_id uuid;
begin
  select id into super_admin_id
  from public.roles
  where name = 'SUPER_ADMIN';

  select id into system_admin_id
  from public.roles
  where name = 'SYSTEM_ADMIN';

  insert into public.user_roles (user_id, role_id)
  values (test_user_id, super_admin_id);

  begin
    insert into public.user_roles (user_id, role_id)
    values (test_user_id, system_admin_id);
    raise exception 'FAIL: both administrator roles were accepted';
  exception when check_violation then
    raise notice 'PASS: database rejected the conflicting administrator role';
  end;
end;
$$;

rollback;
```

**Expected result:** The SQL output contains `PASS: database rejected the conflicting administrator role`, and the transaction rollback leaves no test assignment.<br>
**Acceptance result:** [ ] Pass  [ ] Fail<br>
**Evidence:** Save the SQL output and the post-test count of the two roles' assignments.

### Step 12: Demonstrate CCTV retention flagging without deleting data

This test inserts one disposable CCTV metadata record older than the active retention period, runs the function immediately, verifies the queue flag, and rolls back the entire transaction. It does not expose or permanently store a real person's information.

```sql
begin;

do $$
declare
  test_record_id uuid;
  flagged_count integer;
  flagged_status text;
begin
  insert into public.facility_data_logs (
    external_reference,
    data_category,
    raw_pii_json,
    status,
    created_at
  ) values (
    'DR-TEST-CCTV-' || gen_random_uuid()::text,
    'CCTV_FOOTAGE',
    '{"subject":"DISPOSABLE_DR_TEST"}'::jsonb,
    'ACTIVE',
    (current_timestamp - interval '31 days')::timestamp
  )
  returning id into test_record_id;

  flagged_count := public.flag_expired_cctv_for_deletion();

  select retention_status
    into flagged_status
  from public.facility_data_logs
  where id = test_record_id;

  if flagged_count <> 1 or flagged_status <> 'PENDING_DELETION' then
    raise exception 'FAIL: CCTV retention flag was not created';
  end if;

  if not exists (
    select 1
    from public.retention_disposal_queue
    where source_record_id = test_record_id
      and status = 'PENDING_DELETION'
  ) then
    raise exception 'FAIL: CCTV disposal queue entry was not created';
  end if;

  raise notice 'PASS: expired CCTV was flagged for reviewed deletion';
end;
$$;

rollback;
```

**Expected result:** The SQL output contains `PASS: expired CCTV was flagged for reviewed deletion`. The record is marked `PENDING_DELETION` inside the transaction, no physical deletion occurs, and the final rollback removes the disposable test data.<br>
**Acceptance result:** [ ] Pass  [ ] Fail<br>
**Evidence:** Save the function output and cron-job query result.

## 7. Role-Based Login Acceptance Test

### Step 13: Prepare isolated browser sessions

Use a private browser window or clear the existing application session before each role test. The application must be pointed at the recovery environment, not production. Confirm that the displayed Supabase project reference or environment indicator corresponds to the recovery project if the application provides one.

Use test credentials supplied privately by the System Administrator. Do not write passwords in this script, screenshots, screen recordings, or the panel report.

### Step 14: Execute the role-login matrix

Perform each row in a separate browser session. For each account, enter the email and password, submit the login form, wait for the dashboard to load, and record the route and visible role label.

**Table 1. Role-based login acceptance matrix**

| Test account role | Expected landing route | Authorized demonstration | Unauthorized-route check |
| --- | --- | --- | --- |
| Super Admin | `/super-admin` | Open RBAC administration at `/admin/rbac`; verify role catalogue, hierarchy, and SoD controls are available | Open `/admin/backup`; the user is denied or redirected because infrastructure operations belong to System Admin |
| System Admin | `/system-admin` | Open `/admin/backup`; verify backup operations, system health, sessions, and account-lockout tools are available | Open `/admin/rbac`; the user is denied or redirected because RBAC governance belongs to Super Admin |
| Data Protection Officer | `/privacy/dashboard` | Open `/privacy/cctv`, `/privacy/dsr`, or `/privacy/retention`; verify privacy dashboard and surveillance/retention review functions | Open `/security-operations`; the user cannot operate physical-security incidents |
| Records Officer | `/records/dashboard` | Open `/records/disposal` and verify records lifecycle and disposal-review functions | Open `/admin/rbac`; the user cannot administer RBAC |
| Facilities Officer | `/facilities-officer/dashboard` | Create or view a disposable facilities operation within the test scope | Open `/admin/backup` or another manager-only approval route; the user is denied or redirected |

For each row, complete the following sequence:

1. Confirm the login succeeds and the dashboard loads without a second login prompt.
2. Confirm the URL matches the expected role landing route.
3. Confirm the sidebar contains role-specific sections rather than the Super Admin or System Admin menu.
4. Open one authorized page and verify that live data loads from the recovery environment.
5. Navigate directly to the unauthorized route. Confirm the application redirects to the role dashboard or displays an authorization failure.
6. Where possible, inspect the browser network response and record an HTTP `403` or equivalent backend denial. A hidden menu alone is not sufficient evidence of authorization.
7. Log out and confirm that protected pages return to `/login`.

**Acceptance result:** [ ] All selected role tests pass  [ ] One or more role tests fail<br>
**Evidence:** Record the role, successful landing route, authorized screen, unauthorized-route result, and logout result. Use redacted screenshots only.

### Step 15: Verify session isolation

After logging out of one role, sign in as another role in a fresh session. Confirm that the prior user's dashboard, role label, permissions, and cached data are not displayed. Refresh the page and repeat the check.

**Expected result:** Each session contains only the current user's authorized role and data scope.<br>
**Acceptance result:** [ ] Pass  [ ] Fail<br>
**Evidence:** Session-isolation observations in `application-smoke-test.md`.

## 8. Final Acceptance Decision

The observer records the final decision only after reviewing every required result:

| Acceptance area | Pass condition | Result |
| --- | --- | --- |
| Backup creation | Non-empty custom-format archive created with exit code 0 | [ ] Pass [ ] Fail |
| Backup integrity | SHA-256 recorded and `pg_restore --list` succeeds | [ ] Pass [ ] Fail |
| Recovery | Restore completes in a different Supabase project with no unexplained errors | [ ] Pass [ ] Fail |
| Data verification | Schema inventory and critical row counts match or differences are explained | [ ] Pass [ ] Fail |
| Database security | RLS, policies, SoD trigger, active conflict, Realtime, and cron job are verified | [ ] Pass [ ] Fail |
| SoD behavior | Second administrator role is rejected and transaction is rolled back | [ ] Pass [ ] Fail |
| CCTV retention | Expired CCTV is queued as `PENDING_DELETION` and not physically deleted | [ ] Pass [ ] Fail |
| Role-based login | Selected roles land on distinct dashboards and unauthorized routes are denied | [ ] Pass [ ] Fail |
| Session isolation | Logout and role switching do not leak prior session data | [ ] Pass [ ] Fail |

**Overall decision:** [ ] ACCEPTED  [ ] ACCEPTED WITH DOCUMENTED DEVIATIONS  [ ] NOT ACCEPTED

**Observer notes:**

```text
Backup completion time:
Restore completion time:
Measured restore duration:
Observed RPO evidence:
Observed RTO evidence:
Failures or deviations:
Corrective-action owner:
Target remediation date:
Observer signature/date:
```

## 9. Cleanup After the Demonstration

1. Stop any local or staging frontend/backend process pointed at the recovery project.
2. Delete disposable test records and confirm the SoD and CCTV test transactions were rolled back.
3. Remove the recovery Supabase project only after the DPO, database custodian, and observer approve the evidence, or retain it under the approved test-retention period.
4. Securely delete the local dump after the approved evidence-retention period, or encrypt it and restrict access if retention is required.
5. Rotate or revoke temporary database credentials and service tokens.
6. Close all private browser sessions and clear temporary environment variables.
7. Record every failed step as a remediation item. The final result must not be marked accepted solely because the backup command succeeded.
