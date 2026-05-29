# Mobil build + imzali Play Store AAB (.aab) uretir.
# Oncesi: .\scripts\create-play-keystore.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$androidDir = Join-Path $root 'android'
$propsPath = Join-Path $androidDir 'keystore.properties'
$aabPath = Join-Path $androidDir 'app\build\outputs\bundle\release\app-release.aab'

Write-Host ''
Write-Host '=== VIP Kocluk - Play Store AAB build ===' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path -LiteralPath $propsPath)) {
    Write-Host 'keystore.properties yok. Once calistirin:' -ForegroundColor Red
    Write-Host '  .\scripts\create-play-keystore.ps1' -ForegroundColor Yellow
    exit 1
}

Set-Location -LiteralPath $root
Write-Host '[1/3] npm run build:mobile ...' -ForegroundColor Gray
npm run build:mobile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '[2/3] npx cap sync android ...' -ForegroundColor Gray
npx cap sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$javaHome = 'C:\Program Files\Android\Android Studio\jbr'
if (Test-Path -LiteralPath $javaHome) {
    $env:JAVA_HOME = $javaHome
}

Write-Host '[3/3] gradlew bundleRelease ...' -ForegroundColor Gray
Set-Location -LiteralPath $androidDir
& .\gradlew.bat bundleRelease
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
if (Test-Path -LiteralPath $aabPath) {
    $info = Get-Item -LiteralPath $aabPath
    Write-Host 'BASARILI - Play Store paketi:' -ForegroundColor Green
    Write-Host $aabPath
    Write-Host ("Boyut: {0:N1} MB" -f ($info.Length / 1MB))
    Write-Host ''
    Write-Host 'Play Console -> Uretim -> Yeni surum -> bu AAB dosyasini yukleyin.' -ForegroundColor Cyan
} else {
    Write-Host 'AAB bulunamadi. Gradle ciktisini kontrol edin.' -ForegroundColor Red
    exit 1
}
