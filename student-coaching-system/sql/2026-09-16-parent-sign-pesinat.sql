-- Sözleşmede peşinat: ödenen tutar ücretten düşülür, kalan taksitlere bölünür.
-- Üretimde 2026-09-16 tarihinde uygulandı.
ALTER TABLE public.parent_sign_contracts
  ADD COLUMN IF NOT EXISTS pesinat numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.parent_sign_contracts.pesinat IS
  'Veli tarafından peşin ödenen tutar. Taksitler ücretten peşinat düşüldükten sonra kalan tutara göre hesaplanır.';
