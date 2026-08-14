# Edesis External API v1.5 — Kurulum

Resmi rehber: `edesis-external-api-v1.5-rehber.pdf` (4 Temmuz 2026)

## Sizin yapılandırmanızda yapılan hatalar (düzeltildi)

| Yanlış (eski) | Doğru (v1 rehber) |
|---------------|-------------------|
| `/api/external/sinav-sonuclari` | `/api/external/v1/exams/results` |
| `/api/external/sinavs` | `/api/external/v1/exams` |
| `KurumKodu` header | **Sadece** `X-API-Key` (key kuruma özel) |
| `kurumKodu=...` query | Gerekmez |
| Base URL + path karışık | Base: `https://onlinevipdershane.api.edesis.com` |
| `?replace=true` query | **Yok sayılır** — `replace` gövde alanıdır |

## Vercel ortam değişkenleri

```env
EDESIS_API_KEY=edesis_...          # Edesis panelden
EDESIS_API_BASE_URL=https://onlinevipdershane.api.edesis.com
EDESIS_AUTH_MODE=x-api-key
```

**Kaldırın / boş bırakın (artık kullanılmıyor):**
- `EDESIS_RESULTS_PATH`
- `EDESIS_EXAMS_PATH`
- `EDESIS_INSTITUTION_CODE`

Redeploy sonrası Ayarlar → Edesis → **Bağlantıyı test et**.

## API key paketi (scope)

Sınav **okuma** için key paketi şunlardan biri olmalı:
- **exams** — sınav + sonuç + analiz
- **student_dashboard** — sınav, ödev, program, karne
- **full_read** — tüm okuma

`basic` paketi sınav sonucu **vermez** → 403.

Ham optik **gönderimi** (öğrencinin panelden sınava girmesi) için ayrıca:
- **admin** paketi veya **custom** key + `exam_results:write`
- Salt okuma key ile `POST /exams/{id}/results` → 403

`students:read_pii` (TC No düz metin) hiçbir hazır pakette yoktur; custom + KVKK onayı gerekir.

## v1.5 endpoint'ler

| Veri | Method | Path |
|------|--------|------|
| Öğrenciler | GET | `/api/external/v1/students` — filtre: `TermId`, `StudentState`, `ClassroomId`, `IsActive`, `ModifiedAfter` |
| Sınavlar | GET | `/api/external/v1/exams` — artımlı: `resultsUpdatedAfter` |
| Sınav yapısı (kitapçık×ders) | GET | `/api/external/v1/exams/{id}/structure` |
| Konu listesi | GET | `/api/external/v1/exams/{id}/subjects` |
| Tüm sonuçlar | GET | `/api/external/v1/exams/results?StartDate=&EndDate=` — artımlı: `updatedAfter` |
| Öğrenci bazlı sonuç | GET | `/api/external/v1/exams/results?StudentId={edesisId}` |
| Ders kırılımı | GET | `/api/external/v1/exams/{id}/results/lessons` (sayfa max 100) |
| Konu kırılımı | GET | `/api/external/v1/exams/{id}/results/subjects` |
| Ham cevap gönder | POST | `/api/external/v1/exams/{id}/results` — gövde `{ replace, results }` → **202 + jobId** |
| Değerlendirme durumu | GET | `/api/external/v1/exams/{id}/results/status?jobId=` — geçersiz job: **200 + state NotFound** (404 değil) |
| PDF karne | POST | `/api/external/v1/reports/exam-report` (reportCodes: 102) |

Senkron sırasında toplu sonuçta ders/konu yoksa sistem otomatik olarak **öğrenci bazlı sonuç** ve **analytics** endpoint'lerini dener.

Sayfalama: `MaxResultCount` (liste max 1000, kırılım max 100), `SkipCount`

## Öğrencinin panelden sınava girmesi

1. Koç **Edesis** sayfasından öğrenciyi `edesis_ogrenci_id` ile bağlar.
2. Öğrenci menü: **Edesis sınavlarım** (`/student-edesis`) → **Sınava gir**.
3. Kitapçık seçilir, her ders için optik işaretlenir (`cevaplar` uzunluğu = `questionCount`).
4. Sistem `ogrenciId` + `kitapcikTuru` + tüm `dersCevaplari` ile POST eder (`replace` gövdede).
5. `jobId` ile durum izlenir (`Pending` / `Running` / `Completed` / `Failed` / `NotFound`).
6. Bittiğinde **Sonuçlarım** ve karne PDF açılır.

Mevcut sonuç varken tekrar gönderim: gövdede `"replace": true`. Query `?replace=true` **yok sayılır** ve 409 döner.

Bilinen Edesis sınırı: soru numarası 1’den başlamayan dersler (ör. seçmeli 21–25) UI optik import ile aynı şekilde 0/0/0 kalabilir.

## Edesis Analiz (uygulama)

Menü: **Edesis Analiz** (`/edesis-analiz`)

- **Ders analizi** — tüm denemelerde ders bazlı ortalama, trend grafiği
- **Karne** — seçili denemede D/Y/B/net (konu varsa alt satır)
- **Hata karnesi** — yanlış/boş odaklı özet
- **Tüm denemeler** — deneme × ders matrisi

Ders detayı gelmiyorsa: deneme seç → **Edesis detayını çek** (sınav bazlı `/exams/{id}/results`).

## Öğrenci eşleme sırası

1. `edesis_ogrenci_id` = Edesis `studentId` / `id`
2. **email**
3. **phone** / veli telefonu
4. **ad soyad** (`studentName` veya firstName+lastName)

## Supabase: Edesis ID

`student-coaching-system/sql/2026-05-38-students-edesis-id.sql`

```sql
UPDATE students SET edesis_ogrenci_id = '7105077' WHERE email = 'ogrenci@ornek.com';
```

Edesis `GET /students` yanıtındaki `id` alanı.

## Bağlantı testi (Windows)

```cmd
cd /d "C:\Users\ceyhu\Downloads\student-coaching-system (12)"
edesis-probe.cmd
```

PowerShell:
```powershell
$env:EDESIS_API_KEY = "KEY_BURAYA"
$env:EDESIS_API_BASE_URL = "https://onlinevipdershane.api.edesis.com"
$env:EDESIS_AUTH_MODE = "x-api-key"
node .\scripts\edesis-probe-once.mjs
```

## JSON içe aktar (API yedek)

v1 alanları veya eski Türkçe alanlar desteklenir:

```json
[
  {
    "studentId": "7203743",
    "studentName": "BAYKAL SELEN",
    "email": "ornek@mail.com",
    "examName": "TYT Deneme 5",
    "examDate": "2026-04-10",
    "score": 30.75,
    "correctCount": 45,
    "wrongCount": 15,
    "emptyCount": 60
  }
]
```

Koç **Sınav gönderimi** sekmesinden ham cevap JSON’u da gönderebilir (`ogrenciId` sayısal olmalı).

## Teşhis

| HTTP | Anlam |
|------|--------|
| 202 | Ingest kabul — `jobId` ile poll edin |
| 401 | Key yok/geçersiz |
| 403 | Scope yetersiz — okuma: exams; yazma: `exam_results:write` |
| 409 | Mevcut sonuç var ve `replace` gövdede false |
| 422 | Hiçbir satır kabul edilmedi — `rejected[]` |
| 200 + JSON `items:[]` | Bağlantı OK, sonuç yok |
| 200 + `state: NotFound` | Geçersiz/süresi dolmuş ingest `jobId` (404 değil) |
| 200 + HTML 404 | **Eski path** kullanılıyor — v1'e geçin |

Destek: bilgi@sinavza.com
