# USB ile bagli telefona guncel debug APK yukler (build + cap sync + gradle + adb).
# Kullanim: .\scripts\install-mobile-debug.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$android = Join-Path $root 'android'
$apkOut = Join-Path $android 'app\build\outputs\apk\debug\app-debug.apk'
$apkCopy = Join-Path $env:USERPROFILE 'app-debug-fresh.apk'
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'

if (-not (Test-Path -LiteralPath $adb)) {
  Write-Host "adb bulunamadi: $adb" -ForegroundColor Red
  exit 1
}

Write-Host '=== [1/5] build:mobile ===' -ForegroundColor Cyan
Set-Location -LiteralPath $root
npm run build:mobile

Write-Host '=== [2/5] cap sync android ===' -ForegroundColor Cyan
npx cap sync android

Write-Host '=== [3/5] gradlew clean assembleDebug ===' -ForegroundColor Cyan
Set-Location -LiteralPath $android
cmd /c "gradlew.bat clean assembleDebug --no-daemon > $env:USERPROFILE\gradle-build.log 2>&1"
if ($LASTEXITCODE -ne 0) {
  Get-Content "$env:USERPROFILE\gradle-build.log" -Tail 25
  exit $LASTEXITCODE
}

Copy-Item -LiteralPath $apkOut -Destination $apkCopy -Force
Write-Host "APK hazir: $apkCopy" -ForegroundColor Green

Write-Host '=== [4/5] uygulama verisi temizle ===' -ForegroundColor Cyan
& $adb shell pm clear com.dersonlinevipkocluk.student | Out-Null

Write-Host '=== [5/5] adb install ===' -ForegroundColor Cyan
& $adb install $apkCopy
if ($LASTEXITCODE -eq 0) {
  Write-Host 'Tamam. Telefonda uygulamayi acin ve yeniden giris yapin.' -ForegroundColor Green
  Write-Host 'Profil sekmesinde surum: 1.0.1 (2) gorunmeli.' -ForegroundColor Cyan
}
