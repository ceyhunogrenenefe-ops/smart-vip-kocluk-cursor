-- Ek kalem satırına işlem tarihi
ALTER TABLE teacher_payment_extra_items
  ADD COLUMN IF NOT EXISTS item_date date;

UPDATE teacher_payment_extra_items
SET item_date = COALESCE(item_date, period_from, created_at::date)
WHERE item_date IS NULL;

ALTER TABLE teacher_payment_extra_items
  ALTER COLUMN item_date SET DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_teacher_payment_extra_items_item_date
  ON teacher_payment_extra_items (item_date);

COMMENT ON COLUMN teacher_payment_extra_items.item_date IS
  'Ek kalemin gerçekleştiği tarih (ödeme satırı)';
