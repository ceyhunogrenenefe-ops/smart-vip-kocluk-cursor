# Edesis — öğrenci eşleme (sonuç gelmiyorsa)

## Neden sonuç gelmez?

| Durum | Anlam |
|--------|--------|
| `fetched: 0` | API boş veya yanlış endpoint — `EDESIS_EXAMS_PATH` veya JSON import |
| `matched: 0` | Veri geldi ama **hiç öğrenci eşleşmedi** |
| `imported: 0` eşleşme var | Veritabanı hatası — `errors` alanına bakın |

## Öğrenci eşleme sırası (otomatik)

1. **edesis_ogrenci_id** — Smart Koçluk `students` tablosunda Edesis öğrenci ID
2. **email** — birebir aynı (küçük harf)
3. **phone** — öğrenci telefonu (son 10 hane)
4. **parent_phone** — veli telefonu (son 10 hane)
5. **name** — ad soyad birebir aynı

## Supabase: Edesis ID kolonu

SQL Editor’da çalıştırın:

`student-coaching-system/sql/2026-05-38-students-edesis-id.sql`

Sonra her öğrenci için (örnek):

```sql
UPDATE students
SET edesis_ogrenci_id = '12345'
WHERE email = 'ogrenci@ornek.com';
```

Edesis panelinde öğrenci detayındaki ID’yi kopyalayın.

## Pratik kontrol listesi

1. **Öğrenciler** menüsünde kartlarda **e-posta** dolu mu?
2. Edesis’teki e-posta ile **aynı** mı?
3. Ayarlar → Edesis → **Edesis’ten çek** sonrası kutu altında:
   - `studentsInDb` > 0 mı?
   - `unmatchedSample` hangi isim/e-postayı gösteriyor?
4. Eşleşmeyen örnekte `hint: Satırda öğrenci bilgisi yok` → API sınav listesi veriyor, **öğrenci sonuç export** gerekir

## JSON içe aktar örneği

```json
[
  {
    "ogrenciId": "999",
    "ogrenciAdi": "Ahmet Yılmaz",
    "email": "ahmet@ornek.com",
    "sinavAdi": "TYT Deneme 3",
    "sinavTarihi": "2026-05-10",
    "toplamNet": 72.5
  }
]
```

`email` veya `ogrenciAdi` Smart Koçluk’taki öğrenciyle aynı olmalı.
