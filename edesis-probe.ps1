# Edesis External API v1 test

$ErrorActionPreference = 'Stop'

$ProjectRoot = $PSScriptRoot

Set-Location $ProjectRoot



if (-not $env:EDESIS_API_KEY) {

  $key = Read-Host 'Edesis API key (EDESIS_API_KEY)'

  if ($key) { $env:EDESIS_API_KEY = $key.Trim() }

}



if (-not $env:EDESIS_AUTH_MODE) { $env:EDESIS_AUTH_MODE = 'x-api-key' }

if (-not $env:EDESIS_API_BASE_URL) { $env:EDESIS_API_BASE_URL = 'https://onlinevipdershane.api.edesis.com' }



$script = Join-Path $ProjectRoot 'scripts\edesis-probe-once.mjs'

if (-not (Test-Path $script)) {

  Write-Host "Script bulunamadi: $script" -ForegroundColor Red

  exit 1

}



Write-Host "Proje: $ProjectRoot" -ForegroundColor Cyan

Write-Host "API: v1 /api/external/v1/*" -ForegroundColor Cyan

node $script

