param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$StagingProjectRef,

  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$productionRef = 'dunijfrvfozwlykpkfhy'
if ($StagingProjectRef -eq $productionRef) {
  throw 'ABORT: production project ref is forbidden.'
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$supabaseRoot = Split-Path -Parent $scriptRoot
$source = Join-Path $supabaseRoot 'migrations'
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
$resolvedSource = [System.IO.Path]::GetFullPath($source)
if ($resolvedOutput.StartsWith($resolvedSource, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'OutputDirectory must not be the production migration directory.'
}
if (Test-Path -LiteralPath $resolvedOutput) {
  throw 'OutputDirectory already exists. Choose a new disposable directory.'
}

New-Item -ItemType Directory -Path $resolvedOutput | Out-Null
Get-ChildItem -LiteralPath $source -Filter '*.sql' | Copy-Item -Destination $resolvedOutput

$accountSafe00013 = @'
-- STAGING REPLACEMENT: role structure only; no accounts or password hashes.
insert into public.roles (name, display_name, description, dashboard_key, is_system_role, created_at)
values
  ('SYSTEM_ADMIN', 'System Administrator', 'Operates staging infrastructure and configuration.', 'system-admin', true, now()),
  ('COMPLIANCE_MANAGER', 'Compliance Manager', 'Supervises staging compliance operations.', 'compliance-manager', true, now()),
  ('LEGAL_OFFICER', 'Legal Officer', 'Manages staging legal operations.', 'legal', true, now())
on conflict (name) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  dashboard_key = excluded.dashboard_key,
  is_system_role = true,
  is_deleted = false,
  updated_at = now();

insert into public.role_hierarchy (senior_role_id, junior_role_id)
select senior.id, junior.id
from public.roles senior
join public.roles junior on junior.name = 'COMPLIANCE_MANAGER'
where senior.name = 'DEPARTMENT_HEAD'
on conflict do nothing;
'@
Set-Content -LiteralPath (Join-Path $resolvedOutput '00013_canonical_admin_and_role_accounts.sql') -Value $accountSafe00013 -Encoding utf8

$source00014 = Get-Content -LiteralPath (Join-Path $source '00014_role_workspace_live_data.sql')
$unsafeSeedStart = [Array]::FindIndex($source00014, [Predicate[string]] { param($line) $line -match '^insert into public\.hub_inventory_assets' })
if ($unsafeSeedStart -lt 1) { throw 'Could not locate the unsafe 00014 operational seed boundary.' }
$safe00014 = @($source00014[0..($unsafeSeedStart - 1)])
$safe00014 += '-- STAGING REPLACEMENT: production-like operational seed rows intentionally omitted.'
Set-Content -LiteralPath (Join-Path $resolvedOutput '00014_role_workspace_live_data.sql') -Value $safe00014 -Encoding utf8

$adminRepairSafe = @'
-- STAGING REPLACEMENT: restore the role catalog only; account provisioning is separate.
insert into public.roles (name, display_name, description, dashboard_key, is_system_role, created_at)
values ('SYSTEM_ADMIN', 'System Administrator', 'Operates staging infrastructure and configuration.', 'system-admin', true, now())
on conflict (name) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  dashboard_key = excluded.dashboard_key,
  is_system_role = true,
  is_deleted = false,
  updated_at = now();
'@
Set-Content -LiteralPath (Join-Path $resolvedOutput '20260902000200_repair_admin_role_separation.sql') -Value $adminRepairSafe -Encoding utf8
Set-Content -LiteralPath (Join-Path $resolvedOutput '20260902000300_rotate_system_admin_password.sql') -Value '-- STAGING REPLACEMENT: no default account and no reusable password hash.' -Encoding utf8

$phase7Path = Join-Path $resolvedOutput '20260915000500_phase7_backup_recovery.sql'
$phase7 = (Get-Content -Raw -LiteralPath $phase7Path).Replace($productionRef, $StagingProjectRef)
Set-Content -LiteralPath $phase7Path -Value $phase7 -Encoding utf8

Get-ChildItem -LiteralPath $resolvedOutput -Filter '*.sql' | ForEach-Object {
  $body = (Get-Content -Raw -LiteralPath $_.FullName).Replace($productionRef, $StagingProjectRef)
  Set-Content -LiteralPath $_.FullName -Value $body -Encoding utf8
  if ($body -match [regex]::Escape($productionRef)) { throw "Production ref remains in $($_.Name)" }
  if ($body -match '\$2[aby]\$[0-9]{2}\$') { throw "Reusable BCrypt hash remains in $($_.Name)" }
}

$count = (Get-ChildItem -LiteralPath $resolvedOutput -Filter '*.sql').Count
if ($count -ne 51) { throw "Expected 51 prepared migrations, found $count." }
Write-Host 'Target environment: STAGING'
Write-Host "Target project: $StagingProjectRef"
Write-Host "Prepared $count staging-safe migrations at $resolvedOutput"
