-- Özel ders ücretlerine ek kalemler: rehberlik, deneme, kaynak vb.
-- Supabase SQL Editor'da çalıştırın. Mevcut veriye dokunmaz, kolon yalnızca eklenir.
--
-- Öğrenci yalnız özel ders almıyor; rehberlik görüşmesi, deneme sınavı,
-- kitap/kaynak gibi kalemler de aynı veli faturasına giriyordu ve bunlar
-- "ders saati x birim ücret" hesabına sığmıyordu. Her satırın kendi ek
-- kalemleri jsonb olarak tutulur:
--   [{ "id": "...", "kind": "rehberlik", "label": "Rehberlik",
--      "quantity": 4, "unit_price_tl": 200, "amount_tl": 800 }]
-- Satırın toplamı = (ders saati x birim ücret) + ek kalemlerin toplamı.

ALTER TABLE public.private_lesson_monthly_fees
  ADD COLUMN IF NOT EXISTS extra_items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Yanlışlıkla nesne/metin yazılmasın: her zaman dizi olmalı
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'private_lesson_monthly_fees_extra_items_array_chk'
  ) THEN
    ALTER TABLE public.private_lesson_monthly_fees
      ADD CONSTRAINT private_lesson_monthly_fees_extra_items_array_chk
      CHECK (jsonb_typeof(extra_items) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN public.private_lesson_monthly_fees.extra_items IS
  'Ders dışı ücret kalemleri (rehberlik, deneme, kaynak vb.) — dizi: {id, kind, label, quantity, unit_price_tl, amount_tl}.';

NOTIFY pgrst, 'reload schema';
