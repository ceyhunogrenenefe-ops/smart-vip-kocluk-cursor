# Edesis External API v1.2 — Kurulum

Resmi rehber: `edesis-external-api-v1.pdf`

## Sizin yapılandırmanızda yapılan hatalar (düzeltildi)

| Yanlış (eski) | Doğru (v1 rehber) |
|---------------|-------------------|
| `/api/external/sinav-sonuclari` | `/api/external/v1/exams/results` |
| `/api/external/sinavs` | `/api/external/v1/exams` |
| `KurumKodu` header | **Sadece** `X-API-Key` (key kuruma özel) |
| `kurumKodu=...` query | Gerekmez |
| Base URL + path karışık | Base: `https://onlinevipdershane.api.edesis.com` |

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

Sınav sonuçları için key paketi şunlardan biri olmalı:
- **exams** — sınav + sonuç + analiz
- **student_dashboard** — sınav, ödev, program, karne
- **full_read** — tüm okuma

`basic` paketi sınav sonucu **vermez** → 403.

## v1 endpoint'ler

| Veri | GET |
|------|-----|
| Öğrenciler | `/api/external/v1/students` |
| Sınavlar | `/api/external/v1/exams` |
| Tüm sonuçlar | `/api/external/v1/exams/results?StartDate=&EndDate=` |
| Öğrenci bazlı (ders detayı) | `/api/external/v1/exams/results?StudentId={edesisId}` |
| Analiz raporları | `/api/external/v1/analytics/reports/student/{studentId}` |
| Sınav sonucu | `/api/external/v1/exams/{examId}/results` |
| PDF karne | `POST /api/external/v1/reports/exam-report` (reportCodes: 102) |

Senkron sırasında toplu sonuçta ders/konu yoksa sistem otomatik olarak **öğrenci bazlı sonuç** ve **analytics** endpoint'lerini dener (Türkçe, Matematik vb. D/Y/B + konu kırılımı).

Sayfalama: `MaxResultCount` (max 1000), `SkipCount`

## Edesis Analiz (uygulama)

Menü: **Edesis Analiz** (`/edesis-analiz`)

- **Ders analizi** — tüm denemelerde ders bazlı ortalama, trend grafiği
- **Karne** — seçili denemede D/Y/B/net (konu varsa alt satır)
- **Hata karnesi** — yanlış/boş odaklı özet
- **Tüm denemeler** — deneme × ders matrisi

Ders detayı gelmiyorsa: deneme seç → **Edesis detayını çek** (sınav bazlı `/exams/{id}/results`).

## Öğrenci eşleme sırası

1. `edesis_ogrenci_id` = Edesis `studentId`
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

## Teşhis

| HTTP | Anlam |
|------|--------|
| 401 | Key yok/geçersiz |
| 403 | Scope yetersiz — exams paketi gerekli |
| 200 + JSON `items:[]` | Bağlantı OK, sonuç yok |
| 200 + HTML 404 | **Eski path** kullanılıyor — v1'e geçin |

Destek: bilgi@sinavza.com
