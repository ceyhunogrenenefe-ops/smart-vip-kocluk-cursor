# VIP Koçluk — emülatörde test (production API: dersonlinevipkocluk.com)
# Kullanım: PowerShell'de bu dosyayı çalıştırın (Android Studio emülatörü AÇIK olmalı)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$JavaHome = "C:\Program Files\Android\Android Studio\jbr"
$Sdk = "$env:LOCALAPPDATA\Android\Sdk"
$Adb = "$Sdk\platform-tools\adb.exe"
$Apk = "android\app\build\outputs\apk\debug\app-debug.apk"
$Package = "com.dersonlinevipkocluk.student"

Write-Host "1/4 Mobil build + cap sync..." -ForegroundColor Cyan
npm run cap:sync

Write-Host "2/4 APK derleniyor..." -ForegroundColor Cyan
cmd /c "set JAVA_HOME=$JavaHome&& cd android && gradlew.bat assembleDebug"
if (-not (Test-Path $Apk)) { throw "APK bulunamadi: $Apk" }

Write-Host "3/4 Cihaz kontrolu..." -ForegroundColor Cyan
$devices = & $Adb devices | Select-String "device$"
if (-not $devices) {
  Write-Host ""
  Write-Host "HATA: Bagli emülatör/telefon yok." -ForegroundColor Red
  Write-Host "Android Studio -> Device Manager -> emülatörü Start edin, sonra bu scripti tekrar calistirin."
  Write-Host "Veya: Android Studio'da Run (yesil ok) ile dogrudan calistirin."
  exit 1
}

Write-Host "4/4 APK yukleniyor ve aciliyor..." -ForegroundColor Cyan
& $Adb install -r $Apk
& $Adb shell am start -n "$Package/.MainActivity"

Write-Host ""
Write-Host "Tamam! VIP Koçluk emülatörde acildi." -ForegroundColor Green
Write-Host "API: https://www.dersonlinevipkocluk.com"
Write-Host "Ogrenci hesabi ile giris yapip test edin."
