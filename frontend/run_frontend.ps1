$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host 'Starting Vite at http://127.0.0.1:5173'
& npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
exit $LASTEXITCODE
