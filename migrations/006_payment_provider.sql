ALTER TABLE market_payment_requests ADD COLUMN IF NOT EXISTS provider_payment_id TEXT NOT NULL DEFAULT '';
ALTER TABLE market_payment_requests ADD COLUMN IF NOT EXISTS provider_checkout_url TEXT NOT NULL DEFAULT '';
ALTER TABLE market_payment_requests ADD COLUMN IF NOT EXISTS provider_status TEXT NOT NULL DEFAULT '';
ALTER TABLE market_payment_requests ADD COLUMN IF NOT EXISTS provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_market_payment_requests_provider_payment
  ON market_payment_requests(provider, provider_payment_id)
  WHERE provider_payment_id <> '';
