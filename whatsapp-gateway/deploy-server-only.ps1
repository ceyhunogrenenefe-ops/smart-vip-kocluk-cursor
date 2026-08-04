# src/ altini hizli yukle (server.js + message-store.js) — yalnizca server.js YETERLI DEGIL
param(
  [string]$VpsHost = "27.102.134.199",
  [string]$SshUser = "root",
  [int]$SshPort = 22,
  [string]$RemoteDir = "/root/whatsapp-gateway"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$srcDir = Join-Path $here "src"
if (-not (Test-Path $srcDir)) { throw "src yok: $srcDir" }

$files = @(
  "server.js",
  "message-store.js"
)
foreach ($name in $files) {
  $local = Join-Path $srcDir $name
  if (-not (Test-Path $local)) { throw "eksik: $local" }
}

$remoteSrc = "${RemoteDir}/src"
Write-Host ">> src/*.js -> ${SshUser}@${VpsHost}:$remoteSrc" -ForegroundColor Cyan

$scpArgs = @()
if ($SshPort -ne 22) { $scpArgs += @("-P", "$SshPort") }

foreach ($name in $files) {
  $local = Join-Path $srcDir $name
  $remotePath = "${remoteSrc}/${name}"
  Write-Host "   $name" -ForegroundColor DarkCyan
  if ($SshPort -ne 22) {
    scp -P $SshPort $local "${SshUser}@${VpsHost}:${remotePath}"
  } else {
    scp $local "${SshUser}@${VpsHost}:${remotePath}"
  }
}

$healthCmd = "cd '$RemoteDir' && pm2 restart whatsapp-gateway && sleep 2 && curl -s http://127.0.0.1:4010/health"
if ($SshPort -ne 22) {
  ssh -p $SshPort "${SshUser}@${VpsHost}" $healthCmd
} else {
  ssh "${SshUser}@${VpsHost}" $healthCmd
}

Write-Host ""
Write-Host "Tamam. Health'te message_store_version=2026-08-04-root-pending olmali." -ForegroundColor Green
