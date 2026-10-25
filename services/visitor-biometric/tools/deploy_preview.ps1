[CmdletBinding()]
param(
    [switch]$Execute,
    [switch]$SelfTest
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

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        # Windows PowerShell can promote a native program's harmless stderr
        # banner to a terminating error when the caller uses Stop globally.
        $ErrorActionPreference = "Continue"
        $result = & $FilePath @Arguments 2>$null
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($exitCode -ne 0) {
        throw $FailureMessage
    }
    return ($result | Out-String).Trim()
}

function Get-OptionalPropertyValue {
    param(
        [Parameter(Mandatory)] [object]$InputObject,
        [Parameter(Mandatory)] [string]$Name
    )

    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }
    return $property.Value
}

function Assert-PreviewDeploymentMetadata {
    param(
        [Parameter(Mandatory)] [object]$Metadata,
        [Parameter(Mandatory)] [string]$ApprovedBranch,
        [Parameter(Mandatory)] [string]$ApprovedCommit
    )

    $apiTarget = Get-OptionalPropertyValue $Metadata "target"
    if ($apiTarget -eq "production") {
        throw "Vercel classified deployment '$($Metadata.id)' as Production. Stop and contact Vercel Support."
    }
    if ($null -ne $apiTarget -and $apiTarget -ne "preview") {
        throw "Vercel returned unexpected target '$apiTarget'. Stop without retrying."
    }

    $oidcClaims = Get-OptionalPropertyValue $Metadata "oidcTokenClaims"
    $deploymentMeta = Get-OptionalPropertyValue $Metadata "meta"
    if ($null -eq $oidcClaims -or $oidcClaims.environment -ne "preview" -or
        $oidcClaims.scope -notmatch "(^|:)environment:preview($|:)") {
        throw "Independent Vercel environment evidence does not confirm Preview. Stop without retrying."
    }
    if ($null -eq $deploymentMeta -or $deploymentMeta.githubCommitRef -ne $ApprovedBranch -or
        $deploymentMeta.githubCommitSha -ne $ApprovedCommit) {
        throw "The submitted deployment source does not match the approved branch and commit."
    }
    if ($Metadata.readyState -ne "READY") {
        throw "Deployment '$($Metadata.id)' is not READY (state: $($Metadata.readyState))."
    }

    return [pscustomobject]@{
        ApiTarget = if ($null -eq $apiTarget) { "null" } else { [string]$apiTarget }
        Environment = [string]$oidcClaims.environment
    }
}

function Invoke-MetadataSelfTest {
    $approvedBranch = "deploy/visitor-biometric-staging"
    $approvedCommit = "0123456789abcdef0123456789abcdef01234567"
    $valid = [pscustomobject]@{
        id = "dpl_test"
        target = $null
        readyState = "READY"
        oidcTokenClaims = [pscustomobject]@{
            environment = "preview"
            scope = "owner:test:project:test:environment:preview"
        }
        meta = [pscustomobject]@{
            githubCommitRef = $approvedBranch
            githubCommitSha = $approvedCommit
        }
    }

    $result = Assert-PreviewDeploymentMetadata $valid $approvedBranch $approvedCommit
    if ($result.ApiTarget -ne "null" -or $result.Environment -ne "preview") {
        throw "Valid target=null Preview metadata did not pass."
    }

    $failureFixtures = @(
        [pscustomobject]@{ Name = "production"; Mutate = { param($item) $item.target = "production" } },
        [pscustomobject]@{ Name = "missing-preview-claim"; Mutate = { param($item) $item.oidcTokenClaims.environment = "production" } },
        [pscustomobject]@{ Name = "wrong-branch"; Mutate = { param($item) $item.meta.githubCommitRef = "main" } },
        [pscustomobject]@{ Name = "not-ready"; Mutate = { param($item) $item.readyState = "ERROR" } }
    )
    foreach ($fixture in $failureFixtures) {
        $copy = $valid | ConvertTo-Json -Depth 6 | ConvertFrom-Json
        & $fixture.Mutate $copy
        $rejected = $false
        try {
            Assert-PreviewDeploymentMetadata $copy $approvedBranch $approvedCommit | Out-Null
        }
        catch {
            $rejected = $true
        }
        if (-not $rejected) {
            throw "Self-test fixture '$($fixture.Name)' was not rejected."
        }
    }

    Write-Output "METADATA_SELF_TEST=PASS"
}

if ($SelfTest) {
    if ($Execute) {
        throw "SelfTest and Execute cannot be used together."
    }
    Invoke-MetadataSelfTest
    exit 0
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
if ($project.ssoProtection.deploymentType -ne "all_except_custom_domains") {
    throw "Vercel Authentication is not enabled for protected Preview deployments."
}

$environmentJson = Invoke-CheckedCommand $vercel @(
    $vercelCliPackage, "api", "/v10/projects/$expectedProjectId/env",
    "--scope", $expectedScope, "--raw"
) "Unable to inspect the Vercel environment metadata."
$environmentResponse = $environmentJson | ConvertFrom-Json
$environmentVariables = @($environmentResponse.envs)
$requiredPreviewVariables = @(
    "VISITOR_BIOMETRIC_SERVICE_KEY",
    "VERCEL_SUPPORT_LARGE_FUNCTIONS",
    "DEEPFACE_REQUESTS_PER_MINUTE",
    "DEEPFACE_REQUEST_TIMEOUT_SECONDS",
    "DEEPFACE_MAX_CONCURRENCY",
    "DEEPFACE_ANTI_SPOOFING",
    "DEEPFACE_MODEL_PROFILE",
    "VISITOR_BIOMETRIC_STORAGE_BUCKET",
    "VISITOR_BIOMETRIC_STORAGE_ORIGIN",
    "VISITOR_BIOMETRIC_REQUIRE_STORAGE_REFERENCES",
    "DEEPFACE_DETECTOR",
    "DEEPFACE_MODEL",
    "VISITOR_BIOMETRIC_ENABLED"
)

foreach ($requiredName in $requiredPreviewVariables) {
    $matches = @($environmentVariables | Where-Object { $_.key -eq $requiredName })
    if ($matches.Count -ne 1) {
        throw "Expected exactly one '$requiredName' environment variable."
    }
    $targets = @($matches[0].target)
    $gitBranch = Get-OptionalPropertyValue $matches[0] "gitBranch"
    if ($targets.Count -ne 1 -or $targets[0] -ne "preview" -or $gitBranch) {
        throw "Environment variable '$requiredName' must be Preview-only and unscoped to a Git branch."
    }
}

$serviceKeyVariable = @($environmentVariables | Where-Object {
    $_.key -eq "VISITOR_BIOMETRIC_SERVICE_KEY"
})[0]
if ($serviceKeyVariable.type -ne "sensitive") {
    throw "VISITOR_BIOMETRIC_SERVICE_KEY must be stored as a Vercel Secret."
}

$enabledVariable = @($environmentVariables | Where-Object {
    $_.key -eq "VISITOR_BIOMETRIC_ENABLED"
})[0]
$enabledJson = Invoke-CheckedCommand $vercel @(
    $vercelCliPackage, "api",
    "/v10/projects/$expectedProjectId/env/$($enabledVariable.id)?decrypt=true",
    "--scope", $expectedScope, "--raw"
) "Unable to verify the biometric feature flag."
$enabledSetting = $enabledJson | ConvertFrom-Json
if ([string]$enabledSetting.value -cne "false") {
    throw "VISITOR_BIOMETRIC_ENABLED must remain exactly 'false'."
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
Write-Output "PREVIEW_VARIABLES=$($requiredPreviewVariables.Count)"
Write-Output "VERCEL_AUTHENTICATION=enabled"
Write-Output "VISITOR_BIOMETRIC_ENABLED=false"
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
$deploymentId = Get-OptionalPropertyValue $deployment "id"
if (-not $deploymentId) {
    throw "Vercel did not return a deployment ID; target classification cannot be verified."
}

# The CLI's compact deployment response does not consistently contain a target
# field. Query the authoritative deployment API instead. For Preview deployments
# Vercel currently returns target=null, so independent OIDC claims must also say
# preview. A Production target always fails closed.
$deploymentMetadataJson = Invoke-CheckedCommand $vercel @(
    $vercelCliPackage, "api", "/v13/deployments/$deploymentId",
    "--scope", $expectedScope, "--raw"
) "Unable to inspect the submitted deployment. Stop without retrying."
$deploymentMetadata = $deploymentMetadataJson | ConvertFrom-Json
$classification = Assert-PreviewDeploymentMetadata $deploymentMetadata $expectedBranch $head
Write-Output "DEPLOYMENT_ID=$deploymentId"
Write-Output "DEPLOYMENT_URL=https://$($deploymentMetadata.url)"
Write-Output "DEPLOYMENT_API_TARGET=$($classification.ApiTarget)"
Write-Output "DEPLOYMENT_ENVIRONMENT=$($classification.Environment)"
Write-Output "DEPLOYMENT_TARGET_VERIFIED=preview"
