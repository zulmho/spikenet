CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'support', 'market_moderator')),
  granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS user_moderation (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  ban_reason TEXT NOT NULL DEFAULT '',
  banned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  banned_at TIMESTAMP,
  muted_until TIMESTAMP,
  mute_reason TEXT NOT NULL DEFAULT '',
  muted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  muted_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_reports (
  id SERIAL PRIMARY KEY,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolution TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_wallets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 2500,
  locked_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_listings (
  id SERIAL PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'key',
  price NUMERIC(12, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  image_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  sold_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS market_trades (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price NUMERIC(12, 2) NOT NULL,
  trade_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  confirmed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  seller_risk_score_snapshot INTEGER NOT NULL DEFAULT 0,
  seller_flag_snapshot TEXT NOT NULL DEFAULT 'none',
  seller_flag_note_snapshot TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_reviews (
  id SERIAL PRIMARY KEY,
  trade_id INTEGER NOT NULL UNIQUE REFERENCES market_trades(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_disputes (
  id SERIAL PRIMARY KEY,
  trade_id INTEGER NOT NULL UNIQUE REFERENCES market_trades(id) ON DELETE CASCADE,
  opener_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  moderator_note TEXT NOT NULL DEFAULT '',
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  payout_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  payout_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payout_note TEXT NOT NULL DEFAULT '',
  risk_score_snapshot INTEGER NOT NULL DEFAULT 0,
  risk_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS market_dispute_evidence (
  id SERIAL PRIMARY KEY,
  dispute_id INTEGER NOT NULL REFERENCES market_disputes(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'link',
  content TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_dispute_events (
  id SERIAL PRIMARY KEY,
  dispute_id INTEGER NOT NULL REFERENCES market_disputes(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_ledger (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id INTEGER REFERENCES market_trades(id) ON DELETE SET NULL,
  listing_id INTEGER REFERENCES market_listings(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  balance_after NUMERIC(12, 2) NOT NULL DEFAULT 0,
  locked_after NUMERIC(12, 2) NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_watchlist (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS market_moderators (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_seller_flags (
  seller_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  flag TEXT NOT NULL DEFAULT 'none',
  note TEXT NOT NULL DEFAULT '',
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_payment_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  amount NUMERIC(12, 2) NOT NULL,
  provider TEXT NOT NULL DEFAULT 'manual',
  destination TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  user_note TEXT NOT NULL DEFAULT '',
  moderator_note TEXT NOT NULL DEFAULT '',
  processed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_market_listings_status ON market_listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_trades_buyer ON market_trades(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_trades_seller ON market_trades(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_reviews_seller ON market_reviews(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_disputes_status ON market_disputes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_dispute_evidence_dispute ON market_dispute_evidence(dispute_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_dispute_events_dispute ON market_dispute_events(dispute_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_ledger_user ON market_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_watchlist_user ON market_watchlist(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_seller_flags_flag ON market_seller_flags(flag, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_payment_requests_user ON market_payment_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_payment_requests_status ON market_payment_requests(status, created_at DESC);
