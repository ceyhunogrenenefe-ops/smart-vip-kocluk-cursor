# VIP Koçluk — Capacitor (Öğrenci mobil)

Öğrenci odaklı iOS / Android uygulaması. UI mevcut React kodu; API ve cron Vercel’de kalır.

## Gereksinimler

- Node.js 20+
- **Android:** Android Studio + SDK
- **iOS:** macOS + Xcode (yalnızca Mac’te derlenir)

## İlk kurulum

```bash
cd student-coaching-system
npm install
```

`.env.mobile` içinde `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` değerlerini `.env.local` ile aynı yapın.

```bash
npm run build:mobile
npx cap sync
```

## Android (Windows/Mac)

```bash
npx cap open android
```

Android Studio → Run. İlk kez: minSdk 22+, hedef SDK 34+.

## iOS (yalnızca Mac)

```bash
npx cap open ios
```

Xcode → Signing & Capabilities → Team seçin → Run.

## Geliştirme döngüsü

1. React kodunu değiştirin
2. `npm run build:mobile`
3. `npx cap sync`
4. Android Studio / Xcode’da yeniden çalıştırın

Canlı yenileme için (opsiyonel) `capacitor.config.ts` içine geçici:

```ts
server: { url: 'http://BILGISAYAR_IP:5173', cleartext: true }
```

## Mağaza

| | Apple | Google |
|---|--------|--------|
| Hesap | developer.apple.com (~99$/yıl) | play.google.com/console (~25$) |
| Paket | `com.dersonlinevipkocluk.student` | aynı |
| Gizlilik | KVKK URL zorunlu | Data safety formu |

Uygulama ikonları: `resources/` klasörüne 1024 PNG, sonra `@capacitor/assets` ile üretim (ileride).

## Öğrenci mobil UX

- Alt sekme: Plan · Dersler · Merkez · Soru · Profil
- Native’de sidebar gizli
- `VITE_API_BASE_URL` production API’ye işaret etmeli
