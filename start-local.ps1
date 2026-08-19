$ErrorActionPreference = 'Stop'
$workspace = $PSScriptRoot
$backendDirectory = Join-Path $workspace 'backend'
$frontendDirectory = Join-Path $workspace 'frontend'
$healthUrl = 'http://127.0.0.1:8080/api/actuator/health'
$frontendUrl = 'http://127.0.0.1:5173/'

function Test-BackendHealth {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Test-FrontendHealth {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $frontendUrl -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

if (-not (Test-BackendHealth)) {
    $stdout = Join-Path $backendDirectory 'logs\backend-stdout.log'
    $stderr = Join-Path $backendDirectory 'logs\backend-stderr.log'
    New-Item -ItemType Directory -Force -Path (Split-Path $stdout) | Out-Null

    $backendScript = Join-Path $backendDirectory 'run_backend.ps1'
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$backendScript`""
    $backendProcess = Start-Process -FilePath 'powershell.exe' `
        -ArgumentList $arguments `
        -WorkingDirectory $backendDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -PassThru

    Write-Host 'Starting the backend and waiting for its health check...'
    $ready = $false
    for ($attempt = 0; $attempt -lt 180; $attempt++) {
        if (Test-BackendHealth) {
            $ready = $true
            break
        }
        if ($backendProcess.HasExited) {
            break
        }
        Start-Sleep -Seconds 1
    }

    if (-not $ready) {
        Write-Host 'The backend did not start. Recent output:' -ForegroundColor Red
        if (Test-Path -LiteralPath $stdout) { Get-Content -LiteralPath $stdout -Tail 40 }
        if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr -Tail 40 }
        exit 1
    }
}

Write-Host 'Backend is healthy at http://127.0.0.1:8080/api' -ForegroundColor Green
if (Test-FrontendHealth) {
    Write-Host "Frontend is already running at $frontendUrl" -ForegroundColor Green
    exit 0
}

Write-Host 'Starting the Vite frontend...'
& (Join-Path $frontendDirectory 'run_frontend.ps1')
exit $LASTEXITCODE
