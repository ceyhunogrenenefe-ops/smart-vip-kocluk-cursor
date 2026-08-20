-- Koçluk paneli → onlinevipdershane.com ödeme sayfası sepet aktarımı (kısa ömürlü token)
CREATE TABLE IF NOT EXISTS commerce_checkout_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  user_id text NULL REFERENCES users(id) ON DELETE SET NULL,
  student_id text NULL REFERENCES students(id) ON DELETE SET NULL,
  cart_id uuid NULL,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_checkout_handoffs_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_commerce_checkout_handoffs_expires
  ON commerce_checkout_handoffs (expires_at);

CREATE INDEX IF NOT EXISTS idx_commerce_checkout_handoffs_user
  ON commerce_checkout_handoffs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
