-- Onaylanmış teklifi olan kitapları katalogda görünür yap (tek seferlik düzeltme)
UPDATE commerce_books b
SET
  is_catalog_active = true,
  updated_at = now()
WHERE b.is_catalog_active = false
  AND b.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM commerce_vendor_offers o
    WHERE o.book_id = b.id
      AND o.status = 'approved'
      AND o.deleted_at IS NULL
      AND o.stock_quantity > 0
  );
