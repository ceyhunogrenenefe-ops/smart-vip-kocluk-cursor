# Yalnizca server.js yukle (hizli guncelleme)
param(
  [string]$VpsHost = "27.102.134.199",
  [string]$SshUser = "root",
  [int]$SshPort = 22,
  [string]$RemoteDir = "/root/whatsapp-gateway"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverJs = Join-Path $here "src\server.js"
if (-not (Test-Path $serverJs)) { throw "server.js yok: $serverJs" }

$remotePath = "${RemoteDir}/src/server.js"
Write-Host ">> $serverJs -> ${SshUser}@${VpsHost}:$remotePath" -ForegroundColor Cyan

if ($SshPort -ne 22) {
  scp -P $SshPort $serverJs "${SshUser}@${VpsHost}:${remotePath}"
  ssh -p $SshPort "${SshUser}@${VpsHost}" "cd '$RemoteDir' && pm2 restart whatsapp-gateway && curl -s http://127.0.0.1:4010/health"
} else {
  scp $serverJs "${SshUser}@${VpsHost}:${remotePath}"
  ssh "${SshUser}@${VpsHost}" "cd '$RemoteDir' && pm2 restart whatsapp-gateway && curl -s http://127.0.0.1:4010/health"
}

Write-Host "Tamam." -ForegroundColor Green
