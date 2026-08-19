param(
    [switch]$BuildOnly
)

$ErrorActionPreference = 'Stop'
$backendDirectory = $PSScriptRoot
$jarPath = Join-Path $backendDirectory 'target\facilities-management-1.0.0.jar'

Set-Location $backendDirectory

function Find-Java {
    if ($env:JAVA_HOME) {
        $candidate = Join-Path $env:JAVA_HOME 'bin\java.exe'
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    $command = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    throw 'Java 21 was not found. Install a JDK or set JAVA_HOME.'
}

function Find-Maven {
    $command = Get-Command mvn.cmd -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $wrapperRoot = Join-Path $env:USERPROFILE '.m2\wrapper\dists'
    if (Test-Path -LiteralPath $wrapperRoot) {
        $candidate = Get-ChildItem -Path $wrapperRoot -Filter mvn.cmd -Recurse -File -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($candidate) {
            return $candidate.FullName
        }
    }

    throw 'Maven was not found. Install Maven or add mvn.cmd to PATH.'
}

function Test-RebuildRequired {
    if (-not (Test-Path -LiteralPath $jarPath)) {
        return $true
    }

    $jarTime = (Get-Item -LiteralPath $jarPath).LastWriteTimeUtc
    $newerInput = Get-ChildItem -Path (Join-Path $backendDirectory 'src') -Recurse -File |
        Where-Object { $_.LastWriteTimeUtc -gt $jarTime } |
        Select-Object -First 1
    if ($newerInput) {
        return $true
    }

    return (Get-Item -LiteralPath (Join-Path $backendDirectory 'pom.xml')).LastWriteTimeUtc -gt $jarTime
}

$java = Find-Java
if (Test-RebuildRequired) {
    $maven = Find-Maven
    Write-Host 'Building the local backend...'
    & $maven '-Dmaven.test.skip=true' package
    if ($LASTEXITCODE -ne 0) {
        throw "Backend build failed with exit code $LASTEXITCODE."
    }
}

if ($BuildOnly) {
    Write-Host "Backend build ready: $jarPath"
    exit 0
}

New-Item -ItemType Directory -Force -Path (Join-Path $backendDirectory 'logs') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backendDirectory 'data') | Out-Null

Write-Host 'Starting local backend at http://127.0.0.1:8080/api'
& $java -jar $jarPath '--spring.profiles.active=dev'
exit $LASTEXITCODE
