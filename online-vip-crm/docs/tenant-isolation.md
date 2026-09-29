# Tenant İzolasyonu

## Model

Her müşteri kurumu bir **Institution** satırıdır. Kullanıcılar `user_institutions` ile bir veya daha fazla kuruma bağlanır. İş verisi her zaman `institution_id` taşır.

## API katmanı

1. JWT’den aktif üyelik / varsayılan kurum çözülür.
2. `InstitutionContext` effective `institutionId` üretir.
3. Platform super-admin: `x-institution-id` veya `?institutionId=` ile kurum seçebilir.
4. Diğer roller: yalnızca kendi üyelikleri; header ile yabancı kurum **reddedilir**.
5. Servis sorguları: `where: { institutionId, ... }` — global findUnique yalnızca id + tenant kontrolü ile.

## Worker katmanı

- Job payload: `institutionId` (biliniyorsa zorunlu alan)
- `outbound-messages`, `email-sync`, `notifications`: `institutionId` yoksa job fail
- `webhook-events`: event satırı tenant ile eşleşmeli; mismatch → hata
- DLQ yazarken `institution_id` korunur

## Veri tabanı

- Foreign key cascade kurum silinince (dikkat: soft-delete tercih)
- Unique constraint’ler kurum scoped: örn. `(institution_id, provider, provider_account_id)`
- `webhook_events.institution_id` nullable olabilir (henüz resolve edilmemiş); resolve sonrası set

## Test beklentisi

- Aynı contact id farklı kurumda görünmez
- Permission guard tenant helper unit testleri (`apps/api/test`)
- Seed’de tek demo kurum; ikinci kurum eklenince izolasyon manuel smoke test

## İhlal senaryoları (kaçınılacak)

| Senaryo | Sonuç |
|---------|--------|
| `findMany` without institutionId | Cross-tenant leak |
| Super-admin header’ını normal role açmak | Privilege escalation |
| Cache key’de institutionId unutmak | Yanlış kurum verisi |
| Public form’da yalnızca global API key | Spoof institution — kurum key tercih |

## Operasyon kuralı

Yeni tablo / endpoint eklerken PR checklist: **“institution_id filtresi var mı?”**
