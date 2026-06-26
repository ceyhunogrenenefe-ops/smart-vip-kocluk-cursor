# WhatsApp gateway server.js → VPS yükle ve pm2 restart
# Kullanım (PowerShell):
#   cd "C:\...\student-coaching-system (12)\whatsapp-gateway"
#   .\deploy-server-to-vps.ps1
#   .\deploy-server-to-vps.ps1 -VpsHost "27.102.134.199" -SshUser root

param(
  [string]$VpsHost = "27.102.134.199",
  [string]$SshUser = "root",
  [int]$SshPort = 22,
  [string]$RemoteDir = "/root/whatsapp-gateway"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $here
$zipPath = Join-Path $repoRoot "whatsapp-gateway-vps.zip"

Write-Host ">> VPS zip olusturuluyor..." -ForegroundColor Cyan
python (Join-Path $here "make-vps-zip.py")
if (-not (Test-Path $zipPath)) {
  throw "Zip olusmadi: $zipPath"
}

$remoteZip = "/root/whatsapp-gateway-vps.zip"
$scpTarget = "${SshUser}@${VpsHost}:${remoteZip}"

Write-Host ">> Yukleniyor: $zipPath -> $scpTarget" -ForegroundColor Cyan
if ($SshPort -ne 22) {
  scp -P $SshPort $zipPath $scpTarget
} else {
  scp $zipPath $scpTarget
}

$remoteScript = @"
set -e
mkdir -p '$RemoteDir'
cd '$RemoteDir'
unzip -o '$remoteZip'
npm install --omit=dev 2>/dev/null || npm install
pm2 restart whatsapp-gateway 2>/dev/null || pm2 start ecosystem.config.cjs
pm2 save
echo '--- health ---'
curl -s http://127.0.0.1:4010/health || true
echo ''
"@

Write-Host ">> VPS'te kurulum + pm2 restart..." -ForegroundColor Cyan
if ($SshPort -ne 22) {
  $remoteScript | ssh -p $SshPort "${SshUser}@${VpsHost}" "bash -s"
} else {
  $remoteScript | ssh "${SshUser}@${VpsHost}" "bash -s"
}

Write-Host ""
Write-Host "Tamam. Panelden Koç WhatsApp -> Saglik testi yapin." -ForegroundColor Green
Write-Host "Vercel: WHATSAPP_GATEWAY_UPSTREAM=http://${VpsHost}:4010" -ForegroundColor Yellow
