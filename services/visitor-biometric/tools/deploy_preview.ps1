[CmdletBinding()]
param(
    [switch]$Execute
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$expectedProject = "hirna-visitor-biometric"
$expectedScope = "katsus-projects-6016e7ec"
$expectedProjectId = "prj_njNhQQwHNU3jkVZZQJYriZB9KVmG"
$expectedOrgId = "team_ZlFhGxVSBjEcScdb9LNlvlgd"
$expectedBranch = "deploy/visitor-biometric-staging"
$requestedTarget = "preview"
$vercelCliPackage = "vercel@65.2.0"
$serviceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repositoryRoot = (Resolve-Path (Join-Path $serviceRoot "..\..")).Path

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)] [string]$FilePath,
        [Parameter(Mandatory)] [string[]]$Arguments,
        [Parameter(Mandatory)] [string]$FailureMessage
    )

    $result = & $FilePath @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
    return ($result | Out-String).Trim()
}

$branch = Invoke-CheckedCommand git @("-C", $repositoryRoot, "branch", "--show-current") "Unable to read the Git branch."
if ($branch -ne $expectedBranch) {
    throw "Refusing deployment from branch '$branch'; expected '$expectedBranch'."
}

$head = Invoke-CheckedCommand git @("-C", $repositoryRoot, "rev-parse", "HEAD") "Unable to read the local commit."
$remoteHead = Invoke-CheckedCommand git @("-C", $repositoryRoot, "rev-parse", "origin/$expectedBranch") "The staging branch has not been pushed."
if ($head -ne $remoteHead) {
    throw "Refusing deployment because local HEAD does not match origin/$expectedBranch."
}

$serviceChanges = Invoke-CheckedCommand git @(
    "-C", $repositoryRoot, "status", "--porcelain", "--",
    "services/visitor-biometric", ":(exclude)services/visitor-biometric/.gitignore"
) "Unable to inspect service changes."
if ($serviceChanges) {
    throw "Refusing deployment while services/visitor-biometric has uncommitted changes."
}

$linkPath = Join-Path $serviceRoot ".vercel\project.json"
if (-not (Test-Path -LiteralPath $linkPath)) {
    throw "The biometric service is not linked to a Vercel project."
}
$link = Get-Content -LiteralPath $linkPath -Raw | ConvertFrom-Json
if ($link.projectId -ne $expectedProjectId -or $link.orgId -ne $expectedOrgId) {
    throw "The local Vercel link does not identify the approved biometric project and team."
}

$vercel = (Get-Command npx.cmd -ErrorAction Stop).Source
$vercelVersion = Invoke-CheckedCommand $vercel @($vercelCliPackage, "--version") "Unable to inspect the Vercel CLI version."
if (($vercelVersion -split "`r?`n")[-1].Trim() -ne "65.2.0") {
    throw "The reviewed Vercel CLI version 65.2.0 is required."
}
$projectJson = Invoke-CheckedCommand $vercel @(
    $vercelCliPackage, "api", "/v9/projects/$expectedProject",
    "--scope", $expectedScope, "--raw"
) "Unable to inspect the linked Vercel project."
$project = $projectJson | ConvertFrom-Json
if ($project.id -ne $expectedProjectId -or $project.accountId -ne $expectedOrgId) {
    throw "The remote Vercel project identity does not match the approved target."
}

# Vercel documents that a new project's first deployment is always classified
# as Production, even when Preview is requested. A failed first deployment still
# counts. This check avoids the known first-deployment path, but cannot guarantee
# that Vercel will not misclassify a later request server-side.
$knownDeployments = @($project.latestDeployments)
if ($knownDeployments.Count -lt 1) {
    throw "No prior Vercel deployment exists. Contact Vercel Support before attempting a Preview deployment."
}

if ($requestedTarget -ne "preview") {
    throw "Only an explicit Preview deployment is permitted by this staging script."
}

Write-Output "PREFLIGHT=PASS"
Write-Output "PROJECT=$expectedProject"
Write-Output "TEAM=$expectedScope"
Write-Output "BRANCH=$branch"
Write-Output "COMMIT=$head"
Write-Output "REQUESTED_TARGET=$requestedTarget"
Write-Output "WARNING=Vercel server-side target classification cannot be guaranteed locally."

if (-not $Execute) {
    Write-Output "DEPLOYMENT=NOT_REQUESTED"
    exit 0
}

$deploymentJson = & $vercel $vercelCliPackage deploy $serviceRoot `
    --environment preview `
    --project $expectedProject `
    --scope $expectedScope `
    --yes `
    --json
if ($LASTEXITCODE -ne 0) {
    throw "Vercel deployment failed."
}

$deployment = ($deploymentJson | Out-String) | ConvertFrom-Json
if ($deployment.target -ne "preview") {
    throw "Vercel created an unexpected '$($deployment.target)' deployment. Stop and contact Vercel Support."
}
Write-Output "DEPLOYMENT_TARGET_VERIFIED=preview"
