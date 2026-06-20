CREATE TABLE IF NOT EXISTS client_events (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  app TEXT NOT NULL DEFAULT 'spikenet',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  url TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_errors (
  id SERIAL PRIMARY KEY,
  app TEXT NOT NULL DEFAULT 'spikenet',
  release TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  url TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_feedback (
  id SERIAL PRIMARY KEY,
  project TEXT NOT NULL DEFAULT 'spikenet',
  email TEXT NOT NULL DEFAULT '',
  rating TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  page TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_events_created ON client_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_feedback_created ON client_feedback(created_at DESC);
