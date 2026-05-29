# Play Store imzalama anahtari olusturur ve android\keystore.properties yazar.
# Calistirma: .\scripts\create-play-keystore.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$androidDir = Join-Path $root 'android'
$keystorePath = Join-Path $env:USERPROFILE 'vip-kocluk-release.keystore'
$propsPath = Join-Path $androidDir 'keystore.properties'
$examplePath = Join-Path $androidDir 'keystore.properties.example'

Write-Host ''
Write-Host '=== VIP Kocluk — Play Store keystore ===' -ForegroundColor Cyan
Write-Host ''

if (Test-Path -LiteralPath $keystorePath) {
    Write-Host "Keystore zaten var: $keystorePath" -ForegroundColor Yellow
    $reuse = Read-Host 'Mevcut dosyayi kullanip keystore.properties olusturulsun mu? (E/H)'
    if ($reuse -notmatch '^[Ee]') {
        Write-Host 'Iptal.'
        exit 0
    }
} else {
    Write-Host 'Yeni keystore olusturuluyor...' -ForegroundColor Green
    Write-Host 'Asagidaki sorularda sirket/kisisel bilgilerinizi girin.' -ForegroundColor Gray
    Write-Host "Dosya: $keystorePath" -ForegroundColor Gray
    Write-Host ''

    $keytool = 'keytool'
    if (-not (Get-Command keytool -ErrorAction SilentlyContinue)) {
        $studioJbr = 'C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe'
        if (Test-Path -LiteralPath $studioJbr) {
            $keytool = $studioJbr
        } else {
            Write-Host 'keytool bulunamadi. JDK veya Android Studio JBR kurulu olmali.' -ForegroundColor Red
            exit 1
        }
    }

    & $keytool -genkeypair -v -storetype PKCS12 `
        -keystore $keystorePath `
        -alias vip-kocluk `
        -keyalg RSA -keysize 2048 -validity 10000

    if ($LASTEXITCODE -ne 0) {
        Write-Host 'keytool basarisiz.' -ForegroundColor Red
        exit 1
    }
}

Write-Host ''
Write-Host 'keystore.properties icin sifreleri girin (keytool ile ayni olmali):' -ForegroundColor Cyan
$storePass = Read-Host 'storePassword' -AsSecureString
$keyPass = Read-Host 'keyPassword (genelde ayni)' -AsSecureString
$storePlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($storePass)
)
$keyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($keyPass)
)

$storeFileForProps = ($keystorePath -replace '\\', '/')
$content = @"
storeFile=$storeFileForProps
storePassword=$storePlain
keyAlias=vip-kocluk
keyPassword=$keyPlain
"@

Set-Content -LiteralPath $propsPath -Value $content -Encoding UTF8
Write-Host ''
Write-Host "Olusturuldu: $propsPath" -ForegroundColor Green
Write-Host "Keystore yedekleyin: $keystorePath" -ForegroundColor Yellow
Write-Host ''
Write-Host 'Sonraki adim: .\scripts\build-play-release.ps1' -ForegroundColor Cyan
