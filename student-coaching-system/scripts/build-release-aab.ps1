# Play Store icin imzali surum paketi (AAB) uretir.
#
# Ilk calistirmada yukleme anahtari (upload key) yoksa olusturur; parolayi siz girersiniz,
# hicbir yere yazdirilmaz. Anahtar depo DISINDA saklanir:
#   %USERPROFILE%\.android-keys\onlinevip-upload.jks
# android\keystore.properties .gitignore'dadir, commit edilmez.
#
# Calistirma (student-coaching-system klasorunde):
#   powershell -ExecutionPolicy Bypass -File scripts\build-release-aab.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root 'android'
$jbr = 'C:\Program Files\Android\Android Studio\jbr'
$keytool = Join-Path $jbr 'bin\keytool.exe'
$keyDir = Join-Path $env:USERPROFILE '.android-keys'
$keyFile = Join-Path $keyDir 'onlinevip-upload.jks'
$alias = 'upload'
$props = Join-Path $android 'keystore.properties'

if (-not (Test-Path $keytool)) { throw "Android Studio JDK bulunamadi: $jbr" }
$env:JAVA_HOME = $jbr

# 1) Yukleme anahtari
if (-not (Test-Path $keyFile)) {
  New-Item -ItemType Directory -Force $keyDir | Out-Null
  Write-Host ''
  Write-Host 'Yukleme anahtari olusturuluyor. Parolayi iki kez soracak (en az 6 karakter).' -ForegroundColor Cyan
  Write-Host 'Bu parolayi guvenli bir yere not edin: kaybolursa Play destekten anahtar sifirlama gerekir.' -ForegroundColor Yellow
  & $keytool -genkeypair -v -storetype PKCS12 -keystore $keyFile -alias $alias `
    -keyalg RSA -keysize 2048 -validity 10000 `
    -dname 'CN=Online VIP Dershane, O=Online VIP Dershane, L=Istanbul, C=TR'
  if ($LASTEXITCODE -ne 0) { throw 'Anahtar olusturulamadi.' }
}

# 2) keystore.properties (gitignore'da)
if (-not (Test-Path $props)) {
  $sec = Read-Host 'Anahtar parolasi' -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  $storePath = $keyFile -replace '\\', '/'
  @(
    "storeFile=$storePath",
    "storePassword=$plain",
    "keyAlias=$alias",
    "keyPassword=$plain"
  ) | Set-Content -Encoding ascii $props
  $plain = $null
}

# 3) Web derlemesi + Android senkronu + imzali paket
Push-Location $root
try {
  npm run build:mobile
  if ($LASTEXITCODE -ne 0) { throw 'Web derlemesi basarisiz.' }
  npx cap sync android
  if ($LASTEXITCODE -ne 0) { throw 'cap sync basarisiz.' }
} finally { Pop-Location }

Push-Location $android
try {
  .\gradlew.bat bundleRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { throw 'Gradle derlemesi basarisiz.' }
} finally { Pop-Location }

$aab = Join-Path $android 'app\build\outputs\bundle\release\app-release.aab'
& (Join-Path $jbr 'bin\jarsigner.exe') -verify $aab | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Paket imzali degil — keystore.properties bilgilerini kontrol edin.' }

$ver = (Select-String -Path (Join-Path $android 'app\build.gradle') -Pattern 'versionName "([^"]+)"').Matches[0].Groups[1].Value
$out = Join-Path $env:USERPROFILE "Downloads\OnlineVIP-$ver.aab"
Copy-Item $aab $out -Force
Write-Host ''
Write-Host "HAZIR: $out" -ForegroundColor Green
Write-Host 'Play Console > Test > Kapali test > Yeni surum olustur > bu dosyayi yukleyin.'
Write-Host "ONEMLI: $keyFile dosyasini ve parolasini yedekleyin (USB / guvenli bulut)."
